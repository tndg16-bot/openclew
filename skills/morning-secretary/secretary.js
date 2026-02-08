/**
 * Morning Secretary - メインロジック
 * 毎朝7時にGmail/カレンダーを取得・要約してDiscordに通知
 */

const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const MorningStore = require('./store');

const BASE_DIR = __dirname;
const CREDENTIALS_PATH = path.join(BASE_DIR, 'credentials.json');
const TOKEN_PATH = path.join(BASE_DIR, 'token.json');

const store = new MorningStore(BASE_DIR);

// OAuth2クライアント生成
async function getOAuth2Client() {
    let credentials;
    try {
        const data = await fs.readFile(CREDENTIALS_PATH, 'utf8');
        credentials = JSON.parse(data);
    } catch (e) {
        console.error('credentials.json not found. Please set up Google OAuth.');
        return null;
    }

    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    try {
        const token = await fs.readFile(TOKEN_PATH, 'utf8');
        oAuth2Client.setCredentials(JSON.parse(token));
        return oAuth2Client;
    } catch (e) {
        console.error('token.json not found. Run authorization flow first.');
        return null;
    }
}

// Gmail未読メール取得
async function fetchUnreadEmails(auth, maxResults = 10) {
    const gmail = google.gmail({ version: 'v1', auth });

    try {
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread -category:promotions -category:social',
            maxResults
        });

        const messages = res.data.messages || [];
        const emails = [];

        for (const msg of messages.slice(0, maxResults)) {
            const detail = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date']
            });

            const headers = detail.data.payload.headers;
            const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

            emails.push({
                id: msg.id,
                from: getHeader('From'),
                subject: getHeader('Subject'),
                date: getHeader('Date'),
                snippet: detail.data.snippet
            });
        }

        return emails;
    } catch (e) {
        console.error('Gmail fetch error:', e.message);
        return [];
    }
}

// カレンダー今日の予定取得
async function fetchTodayEvents(auth) {
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    try {
        const res = await calendar.events.list({
            calendarId: 'primary',
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
        });

        return (res.data.items || []).map(event => ({
            id: event.id,
            summary: event.summary || '(タイトルなし)',
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            location: event.location || '',
            isAllDay: !event.start.dateTime
        }));
    } catch (e) {
        console.error('Calendar fetch error:', e.message);
        return [];
    }
}

// 時刻フォーマット
function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// メール要約生成（シンプル版）
function summarizeEmail(email) {
    const snippet = (email.snippet || '').slice(0, 100);
    return snippet + (email.snippet?.length > 100 ? '...' : '');
}

// 返信が必要か判定
function needsReply(email) {
    const subject = (email.subject || '').toLowerCase();
    const from = (email.from || '').toLowerCase();

    // 自動メールは除外
    if (from.includes('noreply') || from.includes('no-reply') || from.includes('notification')) {
        return false;
    }
    // 質問を含む場合
    if (subject.includes('?') || subject.includes('確認') || subject.includes('お願い')) {
        return true;
    }
    return false;
}

/**
 * メール優先度判定
 * 仮説: 以下を高優先度とみなす
 * - 返信が必要（needsReply = true）
 * - 件名に緊急系キーワード（急ぎ、至急、重要、URGENT）
 * - 既知の重要な送信者（後でカスタマイズ可能）
 * - 直接宛てのメール（自動送信でない）
 */
function isHighPriority(email) {
    const subject = (email.subject || '').toLowerCase();
    const from = (email.from || '').toLowerCase();

    // 低優先度フィルタ（バルクメール、通知系）
    const lowPriorityPatterns = [
        'noreply', 'no-reply', 'notification', 'newsletter',
        'digest', 'weekly', 'daily', 'automated', 'auto-',
        'marketing', 'promo', 'unsubscribe', 'github.com',
        'amazonses', 'sendgrid', 'mailchimp'
    ];
    if (lowPriorityPatterns.some(p => from.includes(p) || subject.includes(p))) {
        return false;
    }

    // 高優先度キーワード
    const urgentKeywords = ['急ぎ', '至急', '重要', '緊急', 'urgent', 'important', 'asap', '今日中'];
    if (urgentKeywords.some(k => subject.includes(k))) {
        return true;
    }

    // 返信が必要
    if (needsReply(email)) {
        return true;
    }

    // 件名が短い＆個人からのメール → たぶん重要
    if (subject.length < 30 && !from.includes('.com>') && !from.includes('notification')) {
        return true;
    }

    return false;
}

/**
 * 予定優先度判定
 * 仮説: 以下を高優先度とみなす
 * - 次の3時間以内に開始
 * - 終日でない通常予定
 * - ミーティング関連キーワード
 */
function isHighPriorityEvent(event) {
    // 終日予定は低優先度（リマインダー程度）
    if (event.isAllDay) {
        return false;
    }

    const now = new Date();
    const eventStart = new Date(event.start);
    const hoursUntilStart = (eventStart - now) / (1000 * 60 * 60);

    // 次の3時間以内なら高優先度
    if (hoursUntilStart >= 0 && hoursUntilStart <= 3) {
        return true;
    }

    // ミーティング関連キーワード
    const summary = (event.summary || '').toLowerCase();
    const meetingKeywords = ['meeting', 'ミーティング', '会議', '打ち合わせ', '面談', 'call', '1on1'];
    if (meetingKeywords.some(k => summary.includes(k))) {
        return true;
    }

    return false;
}

// 高優先度のみフィルタリング
function filterHighPriority(emails, events) {
    const highPriorityEmails = emails.filter(e => isHighPriority(e));
    const highPriorityEvents = events.filter(e => isHighPriorityEvent(e));

    return {
        emails: highPriorityEmails,
        events: highPriorityEvents,
        filtered: {
            emailsTotal: emails.length,
            emailsShown: highPriorityEmails.length,
            eventsTotal: events.length,
            eventsShown: highPriorityEvents.length
        }
    };
}

// レポート生成
function generateReport(emails, events, config, filterInfo = null) {
    const today = new Date();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${weekdays[today.getDay()]}）`;

    let report = `🌅 朝のサマリー - ${dateStr}\n`;

    if (filterInfo) {
        report += `(高優先度のみ表示)\n\n`;
    } else {
        report += `\n`;
    }

    // メールセクション
    const emailLabel = filterInfo
        ? `📧 重要メール（${emails.length}/${filterInfo.emailsTotal}件）`
        : `📧 メール（${emails.length}件）`;
    report += `${emailLabel}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (emails.length === 0) {
        report += '未読メールはありません。\n\n';
    } else {
        emails.slice(0, 5).forEach((email, i) => {
            const replyMark = needsReply(email) ? ' 📩' : '';
            report += `${i + 1}. ${email.subject.slice(0, 40)}${replyMark}\n`;
            report += `   差出人: ${email.from.split('<')[0].trim()}\n`;
            report += `   ${summarizeEmail(email)}\n\n`;
        });
    }

    // カレンダーセクション
    const eventLabel = filterInfo
        ? `🗓️ 直近の予定（${events.length}/${filterInfo.eventsTotal}件）`
        : `🗓️ 今日の予定（${events.length}件）`;
    report += `${eventLabel}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (events.length === 0) {
        report += '予定はありません。\n\n';
    } else {
        events.forEach(event => {
            if (event.isAllDay) {
                report += `• 終日 〜 ${event.summary}\n`;
            } else {
                report += `• ${formatTime(event.start)} 〜 ${event.summary}\n`;
            }
            if (event.location) {
                report += `  📍 ${event.location}\n`;
            }
        });
        report += '\n';
    }

    // ヒント
    const hints = [];
    if (events.length >= 5) {
        hints.push('予定が多い日です。移動時間も考慮しましょう。');
    }
    if (emails.filter(e => needsReply(e)).length > 0) {
        hints.push('返信が必要なメールがあります（📩マーク）。');
    }

    if (hints.length > 0) {
        report += `💡 今日のヒント\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        hints.forEach(h => report += `• ${h}\n`);
    }

    report += `\n良い一日を！ ☀️`;

    return report;
}

// メイン実行
async function run(context) {
    console.log('🌅 Morning Secretary starting...');

    const config = await store.loadConfig();
    const auth = await getOAuth2Client();

    let emails = [];
    let events = [];

    if (auth) {
        emails = await fetchUnreadEmails(auth, config.gmail?.maxResults || 10);
        events = await fetchTodayEvents(auth);
        console.log(`📧 Emails: ${emails.length}, 🗓️ Events: ${events.length}`);
    } else {
        console.log('⚠️ Google認証なし - デモモードで実行');
        // デモデータ
        emails = [
            { subject: '[デモ] おはようございます', from: 'demo@example.com', snippet: 'これはデモメールです。' }
        ];
        events = [
            { summary: '[デモ] チームミーティング', start: new Date().toISOString(), isAllDay: false }
        ];
    }

    // 優先度フィルタリング
    const filtered = filterHighPriority(emails, events);
    console.log(`🔍 High priority: ${filtered.filtered.emailsShown}/${filtered.filtered.emailsTotal} emails, ${filtered.filtered.eventsShown}/${filtered.filtered.eventsTotal} events`);

    const report = generateReport(filtered.emails, filtered.events, config, filtered.filtered);
    const today = new Date().toISOString().split('T')[0];

    // レポート保存
    await store.saveReport(today, {
        emails: { total: emails.length, needsReply: emails.filter(e => needsReply(e)).length },
        calendar: { events: events.length }
    });

    // 通知送信
    if (context?.channels?.send) {
        await context.channels.send('discord', report);
        console.log('📤 Sent to Discord');
    } else {
        console.log('\n--- Report ---\n');
        console.log(report);
    }

    return { success: true, report };
}

// CLI実行対応
if (require.main === module) {
    run(null).then(result => {
        console.log('\n✅ Morning Secretary completed');
    }).catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
    });
}

module.exports = { run };
