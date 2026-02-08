/**
 * Productivity Advisor - メインロジック
 * 毎日1回、ユーザーの作業パターンを分析し効率化提案を生成
 */

const fs = require('fs').promises;
const path = require('path');

// 設定読み込み
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {};

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        config = JSON.parse(data);
    } catch (e) {
        console.error('Config load error:', e.message);
        config = {
            analysis: { lookbackDays: 7 },
            obsidian: {
                vaultRoot: 'C:\\Users\\chatg\\Obsidian Vault\\papa-notes',
                dailyNotesPath: 'Notes/daily',
                outputPath: 'Notes/productivity-tips'
            },
            tips: { maxPerDay: 3 }
        };
    }
}

/**
 * Obsidianデイリーノートをスキャン
 */
async function scanObsidianNotes(days) {
    const notes = [];
    const dailyDir = path.join(config.obsidian.vaultRoot, config.obsidian.dailyNotesPath);

    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const notePath = path.join(dailyDir, `${dateStr}.md`);

        try {
            const content = await fs.readFile(notePath, 'utf-8');
            notes.push({
                date: dateStr,
                content,
                tasks: extractTasks(content),
                sections: extractSections(content)
            });
        } catch (e) {
            // ファイルが存在しない場合はスキップ
        }
    }

    return notes;
}

/**
 * タスク抽出（チェックボックス形式）
 */
function extractTasks(content) {
    const tasks = { completed: [], pending: [] };
    const lines = content.split('\n');

    for (const line of lines) {
        const completedMatch = line.match(/- \[x\] (.+)/i);
        const pendingMatch = line.match(/- \[ \] (.+)/);

        if (completedMatch) {
            tasks.completed.push(completedMatch[1].trim());
        } else if (pendingMatch) {
            tasks.pending.push(pendingMatch[1].trim());
        }
    }

    return tasks;
}

/**
 * セクション抽出
 */
function extractSections(content) {
    const sections = {};
    const sectionRegex = /^##?\s+(.+)$/gm;
    let match;

    while ((match = sectionRegex.exec(content)) !== null) {
        sections[match[1]] = true;
    }

    return Object.keys(sections);
}

/**
 * パターン分析
 */
function analyzePatterns(notes) {
    const analysis = {
        totalTasks: { completed: 0, pending: 0 },
        completionRate: 0,
        frequentKeywords: {},
        daysWithNotes: notes.length,
        repeatedPatterns: []
    };

    // タスク集計
    for (const note of notes) {
        analysis.totalTasks.completed += note.tasks.completed.length;
        analysis.totalTasks.pending += note.tasks.pending.length;

        // キーワード抽出
        const allTasks = [...note.tasks.completed, ...note.tasks.pending];
        for (const task of allTasks) {
            const words = task.toLowerCase().split(/\s+/);
            for (const word of words) {
                if (word.length > 2) {
                    analysis.frequentKeywords[word] = (analysis.frequentKeywords[word] || 0) + 1;
                }
            }
        }
    }

    // 完了率計算
    const total = analysis.totalTasks.completed + analysis.totalTasks.pending;
    analysis.completionRate = total > 0
        ? Math.round((analysis.totalTasks.completed / total) * 100)
        : 0;

    // 頻出パターン検出（3回以上出現）
    const sortedKeywords = Object.entries(analysis.frequentKeywords)
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    analysis.repeatedPatterns = sortedKeywords.map(([word, count]) => ({
        keyword: word,
        count
    }));

    return analysis;
}

/**
 * 提案生成
 */
function generateSuggestions(analysis) {
    const suggestions = [];

    // 1. 完了率に基づく提案
    if (analysis.completionRate < 50) {
        suggestions.push({
            category: 'タスク管理',
            tip: `タスク完了率が${analysis.completionRate}%です。タスクを小さく分割するか、優先順位を見直してみましょう。`
        });
    } else if (analysis.completionRate >= 80) {
        suggestions.push({
            category: '素晴らしい！',
            tip: `タスク完了率${analysis.completionRate}%を維持できています。この調子で継続しましょう！`
        });
    }

    // 2. 未完了タスクの提案
    if (analysis.totalTasks.pending > 5) {
        suggestions.push({
            category: '整理整頓',
            tip: `未完了タスクが${analysis.totalTasks.pending}件あります。「今週やらないもの」を明確にしてリストを整理しましょう。`
        });
    }

    // 3. 繰り返しパターンの自動化提案
    if (analysis.repeatedPatterns.length > 0) {
        const topPattern = analysis.repeatedPatterns[0];
        suggestions.push({
            category: '自動化候補',
            tip: `「${topPattern.keyword}」関連のタスクが${topPattern.count}回出現しています。自動化やテンプレート化を検討してみてください。`
        });
    }

    // 4. ノート作成習慣
    if (analysis.daysWithNotes < 5) {
        suggestions.push({
            category: '習慣化',
            tip: `過去7日間でデイリーノートは${analysis.daysWithNotes}日分です。毎日の振り返り習慣を作ると生産性が向上します。`
        });
    }

    // 5. 一般的なヒント（追加）
    const generalTips = [
        { category: '集中力', tip: '重要なタスクは午前中に取り組むと効率が上がります。' },
        { category: '休憩', tip: '90分ごとに5分の休憩を入れると集中力が持続します。' },
        { category: 'レビュー', tip: '週末に1週間の振り返りをすると、次週の計画が立てやすくなります。' }
    ];

    // 提案が少ない場合は一般的なヒントを追加
    while (suggestions.length < 3 && generalTips.length > 0) {
        const randomTip = generalTips.splice(Math.floor(Math.random() * generalTips.length), 1)[0];
        suggestions.push(randomTip);
    }

    return suggestions.slice(0, config.tips?.maxPerDay || 3);
}

/**
 * レポートフォーマット
 */
function formatReport(analysis, suggestions) {
    const today = new Date();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${weekdays[today.getDay()]}）`;

    let report = `💡 今日の効率化提案 - ${dateStr}\n\n`;
    report += `📊 分析結果（過去${config.analysis?.lookbackDays || 7}日間）\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `• ノート作成日数: ${analysis.daysWithNotes}日\n`;
    report += `• 完了タスク: ${analysis.totalTasks.completed}件\n`;
    report += `• 未完了タスク: ${analysis.totalTasks.pending}件\n`;
    report += `• タスク完了率: ${analysis.completionRate}%\n\n`;

    report += `🚀 今日のヒント\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    suggestions.forEach((s, i) => {
        report += `${i + 1}. 【${s.category}】${s.tip}\n\n`;
    });

    report += `💬 質問や詳細は返信してください！`;

    return report;
}

/**
 * Obsidianに保存
 */
async function saveToObsidian(report) {
    const outputDir = path.join(config.obsidian.vaultRoot, config.obsidian.outputPath);
    const today = new Date().toISOString().split('T')[0];
    const outputPath = path.join(outputDir, `${today}-tips.md`);

    try {
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(outputPath, `# 効率化提案 - ${today}\n\n${report}`, 'utf-8');
        console.log(`Saved to: ${outputPath}`);
    } catch (e) {
        console.error('Save error:', e.message);
    }
}

/**
 * メイン実行
 */
async function run(context) {
    console.log('🔄 Productivity Advisor starting...');

    await loadConfig();

    // 1. データ収集
    const notes = await scanObsidianNotes(config.analysis?.lookbackDays || 7);
    console.log(`📚 Scanned ${notes.length} daily notes`);

    // 2. パターン分析
    const analysis = analyzePatterns(notes);
    console.log(`📊 Analysis complete: ${analysis.completionRate}% completion rate`);

    // 3. 提案生成
    const suggestions = generateSuggestions(analysis);
    console.log(`💡 Generated ${suggestions.length} suggestions`);

    // 4. レポート作成
    const report = formatReport(analysis, suggestions);

    // 5. 通知送信（Clawdbotコンテキストがある場合）
    if (context?.channels?.send) {
        if (!report || typeof report !== 'string' || report.trim().length === 0) {
            console.error('❌ Report is invalid or empty, skipping Discord notification');
            return { success: false, error: 'Invalid report' };
        }

        try {
            await context.channels.send('discord', report);
            console.log('📤 Sent to Discord');
        } catch (e) {
            console.error('❌ Discord send failed:', e.message);
            // エラーをスローせず、ログに残して終了
        }
    } else {
        // テスト実行時はコンソール出力
        console.log('\n--- Report ---\n');
        console.log(report);
    }

    // 6. Obsidianに保存
    if (config.notifications?.obsidian) {
        await saveToObsidian(report);
    }

    return { success: true, report };
}

// CLIからの直接実行対応
if (require.main === module) {
    const isTest = process.argv.includes('--test');
    const forceDiscord = process.argv.includes('--force-discord');

    const mockContext = forceDiscord ? {
        channels: {
            send: async (channel, message) => {
                console.log(`[Mock Discord] Sending to ${channel}:`);
                console.log(message);
            }
        }
    } : null;

    run(mockContext).then(result => {
        if (isTest) {
            console.log('\n✅ Test completed successfully');
        }
    }).catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
    });
}

module.exports = { run };
