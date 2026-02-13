/**
 * Task Tracker - メインロジック
 * タスクリスト・進捗を表示・管理する
 */

const fs = require('fs').promises;
const path = require('path');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const TASKS_PATH = path.join(BASE_DIR, 'tasks.json');

// 設定ロード
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {
      display: {
        showCompleted: true,
        sortOrder: 'priority'
      },
      filters: {
        defaultStatus: 'all'
      },
      colors: {
        high: '🔴',
        medium: '🟡',
        low: '🟢',
        completed: '✅'
      }
    };
  }
}

// タスクロード
async function loadTasks() {
  try {
    const data = await fs.readFile(TASKS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {
      tasks: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

// タスク保存
async function saveTasks(data) {
  await fs.writeFile(TASKS_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`💾 Saved ${data.tasks.length} tasks`);
}

// タスク一覧表示
function displayTaskList(tasks, config) {
  const colors = config.colors || {};

  // サマリー
  const summary = generateSummary(tasks);
  let output = `${summary}\n`;

  // 優先度別にグループ化
  const grouped = groupByPriority(tasks, config.priorities);

  for (const [priority, tasks] of Object.entries(grouped)) {
    const emoji = getPriorityEmoji(priority, config.colors);
    output += `${emoji} ${priority.toUpperCase()}優先度 (${tasks.length}件)\n`;
    output += `━━━━━━━━━━━━━━━━━━━━\n`;

    for (const task of tasks) {
      output += formatTask(task, colors, config.display);
    }

    output += '\n';
  }

  return output;
}

// サマリー生成
function generateSummary(tasks) {
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'pending').length
  };

  let summary = `📝 タスク一覧\n\n`;
  summary += `📊 サマリー\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n`;
  summary += `全タスク: ${stats.total}件 | 完了: ${stats.completed}件 | 進行中: ${stats.inProgress}件 | 待機: ${stats.pending}件\n\n`;

  return summary;
}

// タスクフォーマット
function formatTask(task, colors, displayConfig) {
  const statusEmoji = getStatusEmoji(task.status, colors);
  const progressBar = displayConfig.progressBar ? generateProgressBar(task.progress, displayConfig.progress) : '';

  const output = `${statusEmoji} ${task.title} (${task.progress}%)`;
  output += `\n  作成日: ${formatDate(task.createdAt)} | 期限: ${formatDate(task.dueDate)} | アサイン: ${task.assignedTo}`;

  if (progressBar) {
    output += `\n  進捗: ${progressBar} ${task.progress}%`;
  }

  return output;
}

// 進捗バー生成
function generateProgressBar(progress, progressConfig) {
  const length = progressConfig?.barLength || 20;
  const filled = Math.floor(progress / 100 * length);
  const empty = length - filled;

  return '█'.repeat(filled) + '░'.repeat(empty);
}

// 優先度別グループ化
function groupByPriority(tasks, priorities) {
  const grouped = {
    high: [],
    medium: [],
    low: []
  };

  for (const task of tasks) {
    if (task.status === 'completed' && !displayConfig.showCompleted) continue;

    const priorityNum = priorities[task.priority] || 2;
    if (priorityNum === 3) {
      grouped.high.push(task);
    } else if (priorityNum === 2) {
      grouped.medium.push(task);
    } else {
      grouped.low.push(task);
    }
  }

  return grouped;
}

// 優先度絵文字取得
function getPriorityEmoji(priority, colors) {
  const color = colors[priority.toLowerCase()] || '';
  if (colors.high.includes(color)) return '🔴';
  if (colors.medium.includes(color)) return '🟡';
  return '🟢';
}

// ステータス絵文字取得
function getStatusEmoji(status, colors) {
  const statusMap = {
    'pending': colors.pending || '⏳',
    'in_progress': colors.inProgress || '🔄',
    'completed': colors.completed || '✅',
    'paused': colors.paused || '⏸'
  };
  return statusMap[status] || '⏳';
}

// 日付フォーマット
function formatDate(dateStr) {
  if (!dateStr) return '未設定';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', {
    month: '2-digit',
    day: '2-digit'
  });
}

// タスク完了
async function completeTask(taskId, tasks) {
  const task = tasks.find(t => t.id === taskId);

  if (task) {
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = new Date().toISOString();

    await saveTasks({ tasks });
    return { success: true, task };
  }

  return { success: false, error: 'Task not found' };
}

// 進捗更新
async function updateProgress(taskId, progress, tasks) {
  const task = tasks.find(t => t.id === taskId);

  if (task) {
    task.progress = Math.min(100, Math.max(0, progress));

    if (task.progress >= 100) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
    } else if (task.progress > 0) {
      task.status = 'in_progress';
    }

    await saveTasks({ tasks });
    return { success: true, task };
  }

  return { success: false, error: 'Task not found' };
}

// タスク追加
async function addTask(title, options = {}, tasks) {
  const newTask = {
    id: generateTaskId(),
    title: title,
    description: options.description || '',
    priority: options.priority || 'medium',
    status: 'pending',
    progress: 0,
    assignedTo: options.assignedTo || 'unassigned',
    createdAt: new Date().toISOString(),
    dueDate: options.dueDate || null
  };

  tasks.push(newTask);
  await saveTasks({ tasks });

  return { success: true, task: newTask };
}

// タスクID生成
function generateTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// メイン実行
async function run(context, command = 'list') {
  console.log('📝 Task Tracker starting...');

  const config = await loadConfig();
  const tasksData = await loadTasks();
  const tasks = tasksData.tasks || [];

  switch (command) {
    case 'list':
      const output = displayTaskList(tasks, config);
      if (context?.channels?.send) {
        await context.channels.send('discord', output);
      } else {
        console.log('\n--- Task List ---\n');
        console.log(output);
      }
      return { success: true, taskCount: tasks.length };

    case 'complete':
      const taskId = context.args?.[0];
      if (!taskId) {
        return { success: false, error: 'Task ID required' };
      }

      const completeResult = await completeTask(taskId, tasks);
      if (completeResult.success) {
        const msg = `✅ タスク「${completeResult.task.title}」を完了しました！`;
        if (context?.channels?.send) {
          await context.channels.send('discord', msg);
        }
        return { success: true, task: completeResult.task };
      }

      return completeResult;

    case 'update':
      const updateTaskId = context.args?.[0];
      const progress = parseInt(context.args?.[1]);

      if (!updateTaskId || isNaN(progress)) {
        return { success: false, error: 'Task ID and progress required' };
      }

      const updateResult = await updateProgress(updateTaskId, progress, tasks);
      if (updateResult.success) {
        const msg = `🔄 タスク「${updateResult.task.title}」の進捗を${progress}%に更新しました`;
        if (context?.channels?.send) {
          await context.channels.send('discord', msg);
        }
        return { success: true, task: updateResult.task };
      }

      return updateResult;

    case 'add':
      const title = context.args?.[0];
      if (!title) {
        return { success: false, error: 'Task title required' };
      }

      const addResult = await addTask(title, { priority: 'medium' }, tasks);
      if (addResult.success) {
        const msg = `✅ タスク「${addResult.task.title}」を追加しました！`;
        if (context?.channels?.send) {
          await context.channels.send('discord', msg);
        }
        return { success: true, task: addResult.task };
      }

      return addResult;

    default:
      console.log('Available commands: list, complete, update, add');
      return { success: false };
  }
}

// CLI実行対応
if (require.main === module) {
  const command = process.argv[2] || 'list';
  run(null, command).then(() => {
    console.log('\n✅ Task Tracker completed');
  }).catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}

function getDailyNotePath() {
  const config = loadConfigSync();
  const vaultPath = config.obsidian?.vaultPath || process.env.OBSIDIAN_VAULT_PATH || '';
  const dailyNotesFolder = config.obsidian?.dailyNotesFolder || 'Daily Notes';
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  return path.join(vaultPath, dailyNotesFolder, `${dateStr}.md`);
}

function loadConfigSync() {
  try {
    const data = require('fs').readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

async function logToObsidian(task) {
  const config = await loadConfig();
  if (!config.obsidian?.autoLog) {
    return { success: false, error: 'Auto-log to Obsidian disabled' };
  }

  const dailyNotePath = getDailyNotePath();
  const fsPromises = require('fs').promises;
  
  const taskLog = `\n## ✅ Completed Task\n- **${task.title}** - ${new Date().toLocaleTimeString('ja-JP')}\n  - Priority: ${task.priority}\n  - Status: ${task.status}\n`;

  try {
    await fsPromises.mkdir(path.dirname(dailyNotePath), { recursive: true });
    
    let existingContent = '';
    try {
      existingContent = await fsPromises.readFile(dailyNotePath, 'utf8');
    } catch (e) {
      existingContent = `# ${new Date().toISOString().split('T')[0]}\n\n`;
    }

    const updatedContent = existingContent + taskLog;
    await fsPromises.writeFile(dailyNotePath, updatedContent, 'utf8');
    
    console.log(`📝 Logged task to Obsidian: ${dailyNotePath}`);
    return { success: true, path: dailyNotePath };
  } catch (e) {
    console.error('❌ Failed to log to Obsidian:', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = {
  run,
  displayTaskList,
  completeTask,
  updateProgress,
  addTask,
  getDailyNotePath,
  logToObsidian
};
