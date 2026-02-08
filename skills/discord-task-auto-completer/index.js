/**
 * Discord Task Auto-Completer - メインロジック
 * Discordのログを解析し、タスクを自動抽出・管理・完了する
 */

const fs = require('fs').promises;
const path = require('path');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const TASKS_PATH = path.join(BASE_DIR, 'tasks.json');

// メモリストア
class TaskStore {
  constructor(baseDir) {
    this.tasksPath = path.join(baseDir, 'tasks.json');
    this.learnedDataPath = path.join(base_DIR, 'learned.json');
  }

  async loadTasks() {
    try {
      const data = await fs.readFile(this.tasksPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return {
        tasks: [],
        lastScan: null,
        stats: {
          total: 0,
          completed: 0,
          pending: 0,
          inProgress: 0
        }
      };
    }
  }

  async saveTasks(data) {
    await fs.writeFile(this.tasksPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`💾 Saved ${data.tasks.length} tasks`);
  }

  async loadLearnedData() {
    try {
      const data = await fs.readFile(this.learnedDataPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return {
        customKeywords: [],
        userPatterns: {},
        preferences: {}
      };
    }
  }

  async saveLearnedData(data) {
    await fs.writeFile(this.learnedDataPath, JSON.stringify(data, null, 2), 'utf8');
  }
}

// 設定ロード
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {
      analysis: {
        lookbackDays: 7,
        taskKeywords: ['やる', 'タスク', '実装', '作る', '修正']
      },
      autoComplete: {
        enabled: true,
        confidenceThreshold: 0.7
      }
    };
  }
}

// タスク抽出
function extractTask(message, config) {
  const keywords = config.analysis.taskKeywords || [];
  const completionKeywords = config.analysis.completionKeywords || [];
  const priorityKeywords = config.analysis.priorityKeywords || {};

  const lowerMessage = message.content.toLowerCase();
  const matchesKeyword = keywords.some(kw => lowerMessage.includes(kw));
  const isCompletion = completionKeywords.some(kw => lowerMessage.includes(kw));

  // キーワードを含まない場合は無視
  if (!matchesKeyword && !isCompletion) {
    return null;
  }

  // 優先度判定
  let priority = 'medium';
  for (const [level, levelKeywords] of Object.entries(priorityKeywords)) {
    if (levelKeywords.some(kw => lowerMessage.includes(kw))) {
      priority = level;
      break;
    }
  }

  // ステータス判定
  let status = 'pending';
  if (isCompletion) {
    status = 'completed';
  }

  return {
    id: generateTaskId(),
    title: extractTaskTitle(message.content),
    description: message.content,
    priority: priority,
    status: status,
    assignedTo: message.author?.username || 'unknown',
    createdAt: message.timestamp || new Date().toISOString(),
    messageId: message.id,
    channelId: message.channelId,
    progress: status === 'completed' ? 100 : 0,
    completedAt: status === 'completed' ? message.timestamp : null
  };
}

// タスクID生成
function generateTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// タスクタイトル抽出
function extractTaskTitle(content) {
  // 最初の50文字までをタイトルとする
  let title = content.substring(0, 50);

  // タスクキーワード以降を抽出
  const taskKeywords = ['タスク', 'todo', 'やること', '実装', '作る'];
  for (const kw of taskKeywords) {
    const index = title.indexOf(kw);
    if (index !== -1) {
      title = title.substring(index + kw.length).trim();
      break;
    }
  }

  // 句点で区切る
  title = title.split(/[。！？\n]/)[0].trim();

  return title || 'タスク';
}

// 自動完了判定
function shouldAutoComplete(task, newMessage, config) {
  const autoComplete = config.autoComplete || {};
  if (!autoComplete.enabled) {
    return { shouldComplete: false, reason: 'disabled' };
  }

  const lowerMessage = newMessage.content.toLowerCase();
  const confidence = calculateCompletionConfidence(task, newMessage, autoComplete);

  if (confidence >= (autoComplete.confidenceThreshold || 0.7)) {
    return {
      shouldComplete: true,
      reason: determineCompletionReason(task, newMessage),
      confidence: confidence
    };
  }

  return { shouldComplete: false, reason: 'low_confidence', confidence };
}

// 完了信頼度計算
function calculateCompletionConfidence(task, newMessage, autoComplete) {
  let confidence = 0;

  const lowerMessage = newMessage.content.toLowerCase();

  // 完了キーワードチェック
  const completionKeywords = config.analysis.completionKeywords || [];
  if (completionKeywords.some(kw => lowerMessage.includes(kw))) {
    confidence += 0.4;
  }

  // 絵文字チェック
  const emojis = autoComplete.completionEmojis || ['✅', '🎉', '🙌'];
  if (emojis.some(emoji => newMessage.content.includes(emoji))) {
    confidence += 0.3;
  }

  // 時間経過チェック
  if (task.lastActivity) {
    const hoursSinceLastActivity = (new Date() - new Date(task.lastActivity)) / (1000 * 60 * 60);
    const threshold = parseDuration(autoComplete.inactivityThreshold || '24h');
    if (hoursSinceLastActivity >= threshold) {
      confidence += 0.2;
    }
  }

  return Math.min(confidence, 1.0);
}

// 期間パース
function parseDuration(durationStr) {
  const match = durationStr.match(/(\d+)([hmd])/i);
  if (!match) return 24; // デフォルト24時間

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'h': return value;
    case 'm': return value / 60;
    case 'd': return value * 24;
    default: return 24;
  }
}

// 完了理由の判定
function determineCompletionReason(task, message) {
  const lowerMessage = message.content.toLowerCase();

  if (config.analysis.completionKeywords.some(kw => lowerMessage.includes(kw))) {
    return 'keyword';
  }

  const emojis = config.autoComplete.completionEmojis || ['✅', '🎉', '🙌'];
  if (emojis.some(emoji => message.content.includes(emoji))) {
    return 'emoji';
  }

  return 'inactivity';
}

// レポート生成
function generateReport(tasksData, config) {
  const tasks = tasksData.tasks || [];
  const stats = tasksData.stats || {};

  let report = `✅ タスク自動管理レポート\n\n`;
  report += `📊 現在のタスク状況\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `全タスク: ${stats.total || tasks.length}件\n`;
  report += `✅ 完了済み: ${stats.completed || 0}件\n`;
  report += `🔄 進行中: ${stats.inProgress || 0}件\n`;
  report += `⏳ 待機中: ${stats.pending || 0}件\n\n`;

  // 優先度別タスク
  const highPriority = tasks.filter(t => t.priority === 'high' && t.status !== 'completed');
  if (highPriority.length > 0) {
    report += `🔥 高優先度タスク (${highPriority.length}件)\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    highPriority.slice(0, 3).forEach((task, i) => {
      const progress = task.progress || 0;
      const progressBar = '█'.repeat(Math.floor(progress / 20)) + '░'.repeat(5 - Math.floor(progress / 20));
      report += `${i + 1}. ${task.title}\n`;
      report += `   ステータス: ${formatStatus(task.status)} | 進捗: ${progress}%\n`;
      report += `   プログレス: [${progressBar}]\n`;
      report += `   作成日: ${formatDate(task.createdAt)}\n\n`;
    });
  }

  // 最近のアクティビティ
  const recentTasks = tasks
    .filter(t => t.lastActivity)
    .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
    .slice(0, 5);

  if (recentTasks.length > 0) {
    report += `💬 最近のアクティビティ\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    recentTasks.forEach((task, i) => {
      const timeSince = timeAgo(new Date(task.lastActivity));
      report += `${i + 1}. ${task.title} (${timeSince})\n`;
    });
  }

  report += `\n💬 詳問や詳細は返信してください！`;

  return report;
}

// ステータスフォーマット
function formatStatus(status) {
  const statusMap = {
    'pending': '待機中',
    'in_progress': '進行中',
    'completed': '完了済み',
    'paused': '保留'
  };
  return statusMap[status] || status;
}

// 日付フォーマット
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', {
    month: '2-digit',
    day: '2-digit'
  });
}

// 相対時間
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return `${seconds}秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}時間前`;
  return `${Math.floor(seconds / 86400)}日前`;
}

// メイン実行
async function run(context, command = 'scan') {
  console.log('✅ Discord Task Auto-Completer starting...');

  const config = await loadConfig();
  const store = new TaskStore(BASE_DIR);
  const tasksData = await store.loadTasks();

  switch (command) {
    case 'scan':
      // Discordメッセージのスキャン
      const newTasks = await scanDiscordMessages(config);
      tasksData.tasks = [...tasksData.tasks, ...newTasks];
      await store.saveTasks(tasksData);
      console.log(`📝 Found ${newTasks.length} new tasks`);
      return { success: true, newTasksCount: newTasks.length };

    case 'report':
      // レポート生成
      const report = generateReport(tasksData, config);
      if (context?.channels?.send) {
        await context.channels.send('discord', report);
      } else {
        console.log('\n--- Task Report ---\n');
        console.log(report);
      }
      return { success: true, report };

    case 'autocomplete':
      // 自動完了チェック
      const completedTasks = [];
      for (const task of tasksData.tasks.filter(t => t.status !== 'completed')) {
        const newMessage = await getLatestMessage(task);
        if (newMessage) {
          const result = shouldAutoComplete(task, newMessage, config);
          if (result.shouldComplete) {
            task.status = 'completed';
            task.completedAt = newMessage.timestamp;
            task.progress = 100;
            task.completionReason = result.reason;
            task.completionConfidence = result.confidence;
            completedTasks.push(task);
          }
          task.lastActivity = newMessage.timestamp;
        }
      }
      await store.saveTasks(tasksData);
      console.log(`✅ Auto-completed ${completedTasks.length} tasks`);
      return { success: true, completedTasks };

    case 'list':
      // タスク一覧表示
      const taskList = tasksData.tasks.map(t =>
        `- [${t.status === 'completed' ? 'x' : ' '}] ${t.title} (${t.priority})`
      ).join('\n');
      console.log(taskList);
      return { success: true, tasks: tasksData.tasks };

    default:
      console.log('Available commands: scan, report, autocomplete, list');
      return { success: false };
  }
}

// Discordメッセージのスキャン（モック）
async function scanDiscordMessages(config) {
  // 実際の実装ではClawdbotのDiscord APIを使用
  // ここではモックデータを返す
  return [
    {
      id: generateTaskId(),
      title: 'サンプルタスク',
      description: 'テスト用タスク',
      priority: 'medium',
      status: 'pending'
    }
  ];
}

// 最新メッセージの取得（モック）
async function getLatestMessage(task) {
  // 実際の実装ではClawdbotのDiscord APIを使用
  return null;
}

// CLI実行対応
if (require.main === module) {
  const command = process.argv[2] || 'scan';
  run(null, command).then(() => {
    console.log('\n✅ Discord Task Auto-Completer completed');
  }).catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}

module.exports = {
  run,
  extractTask,
  shouldAutoComplete,
  generateReport,
  TaskStore
};
