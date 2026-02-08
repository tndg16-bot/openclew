/**
 * Self-Learning Agent - メインロジック
 * ユーザーの行動パターンを学習し、自己進化する
 */

const fs = require('fs').promises;
const path = require('path');
const LearningStore = require('./store');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const store = new LearningStore(BASE_DIR);

// 設定読み込み
async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {
            learning: {
                enabled: true,
                patternThreshold: 3,
                confidenceMinimum: 0.7
            },
            memory: {
                maxFacts: 100,
                maxPatterns: 50
            },
            triggers: {
                keywords: ['学習', 'パターン', '傾向', '好み', '私の']
            }
        };
    }
}

// 会話履歴からパターン検出
async function detectPatterns(conversations) {
    const patterns = {
        timePatterns: {},
        topicPatterns: {},
        requestPatterns: {}
    };

    for (const conv of conversations) {
        // 時間帯パターン
        const hour = new Date(conv.timestamp).getHours();
        const timeSlot = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
        patterns.timePatterns[timeSlot] = (patterns.timePatterns[timeSlot] || 0) + 1;

        // トピックパターン
        const topics = extractTopics(conv.message);
        topics.forEach(topic => {
            patterns.topicPatterns[topic] = (patterns.topicPatterns[topic] || 0) + 1;
        });

        // リクエストタイプ
        const requestType = classifyRequest(conv.message);
        patterns.requestPatterns[requestType] = (patterns.requestPatterns[requestType] || 0) + 1;
    }

    return patterns;
}

// トピック抽出
function extractTopics(message) {
    const topics = [];
    const keywords = {
        'code': ['コード', 'プログラム', '実装', '開発', 'code', 'program'],
        'email': ['メール', 'gmail', 'mail'],
        'calendar': ['予定', 'カレンダー', 'スケジュール', 'calendar'],
        'task': ['タスク', 'todo', 'やること', 'task'],
        'learning': ['学習', '学ぶ', '覚える', 'learn'],
        'automation': ['自動', '自動化', 'automation', 'auto']
    };

    const lowerMsg = message.toLowerCase();
    for (const [topic, words] of Object.entries(keywords)) {
        if (words.some(w => lowerMsg.includes(w))) {
            topics.push(topic);
        }
    }

    return topics.length > 0 ? topics : ['general'];
}

// リクエスト分類
function classifyRequest(message) {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('?') || lowerMsg.includes('教えて') || lowerMsg.includes('what')) {
        return 'question';
    }
    if (lowerMsg.includes('作って') || lowerMsg.includes('実装') || lowerMsg.includes('create')) {
        return 'creation';
    }
    if (lowerMsg.includes('修正') || lowerMsg.includes('直して') || lowerMsg.includes('fix')) {
        return 'fix';
    }
    if (lowerMsg.includes('確認') || lowerMsg.includes('チェック') || lowerMsg.includes('check')) {
        return 'verification';
    }
    return 'other';
}

// パターン分析レポート生成
async function generateAnalysisReport() {
    const patterns = await store.loadPatterns();
    const profile = await store.loadProfile();

    let report = `🧠 自己学習レポート\n\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    // パターン数
    report += `📊 検出パターン: ${patterns.patterns?.length || 0}件\n`;
    report += `📝 学習済み事実: ${profile.learnedFacts?.length || 0}件\n\n`;

    // 主なパターン
    if (patterns.patterns && patterns.patterns.length > 0) {
        report += `🔍 主なパターン\n`;
        patterns.patterns.slice(0, 5).forEach((p, i) => {
            report += `${i + 1}. ${p.name}: ${p.description || ''} (信頼度: ${Math.round((p.confidence || 0.5) * 100)}%)\n`;
        });
        report += '\n';
    }

    // ユーザー設定
    if (profile.preferences) {
        report += `👤 ユーザープロフィール\n`;
        report += `• コミュニケーションスタイル: ${profile.preferences.communicationStyle || '標準'}\n`;
        report += `• 通知頻度: ${profile.preferences.notificationFrequency || '中'}\n`;
    }

    return report;
}

// 新しいパターンを学習
async function learnNewPattern(name, type, description, confidence = 0.8) {
    const pattern = {
        name,
        type,
        description,
        confidence,
        learnedAt: new Date().toISOString()
    };

    await store.savePattern(pattern);
    console.log(`📚 New pattern learned: ${name}`);
    return pattern;
}

// コンテキスト更新
async function updateConversationContext(topic, message) {
    const context = await store.loadContext();

    // アクティブトピック更新
    if (!context.activeTopics.includes(topic)) {
        context.activeTopics.push(topic);
        if (context.activeTopics.length > 10) {
            context.activeTopics.shift();
        }
    }

    context.lastConversation = {
        topic,
        message: message.slice(0, 200),
        timestamp: new Date().toISOString()
    };

    await store.updateContext(context);
    return context;
}

// 提案生成
async function generateSuggestions() {
    const patterns = await store.loadPatterns();
    const context = await store.loadContext();
    const suggestions = [];

    // 頻出パターンに基づく提案
    const frequentPatterns = (patterns.patterns || [])
        .filter(p => (p.count || 0) >= 3)
        .sort((a, b) => (b.count || 0) - (a.count || 0));

    if (frequentPatterns.length > 0) {
        suggestions.push({
            type: 'automation',
            text: `「${frequentPatterns[0].name}」が頻出しています。自動化を検討しましょう。`
        });
    }

    // アクティブトピックに基づく提案
    if (context.activeTopics && context.activeTopics.length > 0) {
        const mainTopic = context.activeTopics[context.activeTopics.length - 1];
        suggestions.push({
            type: 'context',
            text: `最近「${mainTopic}」関連の作業が多いです。関連リソースをまとめましょう。`
        });
    }

    return suggestions;
}

// メイン実行
async function run(context, command = 'analyze') {
    console.log('🧠 Self-Learning Agent starting...');

    const config = await loadConfig();

    switch (command) {
        case 'analyze':
            const report = await generateAnalysisReport();
            if (context?.channels?.send) {
                await context.channels.send('discord', report);
            } else {
                console.log('\n--- Analysis Report ---\n');
                console.log(report);
            }
            return { success: true, report };

        case 'suggest':
            const suggestions = await generateSuggestions();
            const suggestionText = suggestions.map(s => `• ${s.text}`).join('\n') || 'まだ提案はありません。';
            if (context?.channels?.send) {
                await context.channels.send('discord', `💡 学習に基づく提案\n\n${suggestionText}`);
            } else {
                console.log(`💡 Suggestions:\n${suggestionText}`);
            }
            return { success: true, suggestions };

        case 'learn':
            // 手動で事実を学習（引数が必要）
            console.log('Use learnFact() to add new facts');
            return { success: true };

        default:
            console.log('Available commands: analyze, suggest, learn');
            return { success: false };
    }
}

// CLI実行対応
if (require.main === module) {
    const command = process.argv[2] || 'analyze';
    run(null, command).then(() => {
        console.log('\n✅ Self-Learning Agent completed');
    }).catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
    });
}

module.exports = {
    run,
    learnNewPattern,
    updateConversationContext,
    generateSuggestions,
    detectPatterns,
    extractTopics
};
