/**
 * Progress Tracking Module
 */

const fs = require('fs');
const path = require('path');

/**
 * Initialize task state
 */
function initializeTaskState(task) {
  return {
    id: task.id,
    description: task.description,
    sourceFile: task.sourceFile,
    lineIndex: task.lineIndex,
    section: task.section,
    branch: null,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    progress: {
      steps: [],
      currentStep: 0,
      totalSteps: 0
    },
    attempts: 0,
    lastAttemptAt: null
  };
}

/**
 * Update task status
 */
function updateTaskStatus(taskState, status, error = null) {
  taskState.status = status;
  taskState.updatedAt = new Date().toISOString();

  if (status === 'running' && !taskState.startedAt) {
    taskState.startedAt = new Date().toISOString();
  }

  if (status === 'done' || status === 'failed') {
    taskState.completedAt = new Date().toISOString();
  }

  if (error) {
    taskState.error = error;
  }

  return taskState;
}

/**
 * Add progress step
 */
function addProgressStep(taskState, step) {
  if (!taskState.progress) {
    taskState.progress = {
      steps: [],
      currentStep: 0,
      totalSteps: 0
    };
  }

  taskState.progress.steps.push({
    step,
    timestamp: new Date().toISOString()
  });

  taskState.progress.currentStep = taskState.progress.steps.length;
  taskState.updatedAt = new Date().toISOString();

  return taskState;
}

/**
 * Increment task attempts
 */
function incrementAttempts(taskState) {
  taskState.attempts = (taskState.attempts || 0) + 1;
  taskState.lastAttemptAt = new Date().toISOString();
  taskState.updatedAt = new Date().toISOString();
  return taskState;
}

/**
 * Calculate statistics from state
 */
function calculateStatistics(state) {
  const tasks = Object.values(state.tasks || {});

  const stats = {
    totalTasks: tasks.length,
    queuedTasks: 0,
    runningTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    skippedTasks: 0,
    averageExecutionTime: null
  };

  let totalTime = 0;
  let completedWithTime = 0;

  for (const task of tasks) {
    switch (task.status) {
      case 'queued':
        stats.queuedTasks++;
        break;
      case 'running':
        stats.runningTasks++;
        break;
      case 'done':
        stats.completedTasks++;
        if (task.startedAt && task.completedAt) {
          totalTime += new Date(task.completedAt) - new Date(task.startedAt);
          completedWithTime++;
        }
        break;
      case 'failed':
        stats.failedTasks++;
        break;
      case 'skipped':
        stats.skippedTasks++;
        break;
    }
  }

  if (completedWithTime > 0) {
    stats.averageExecutionTime = totalTime / completedWithTime;
  }

  return stats;
}

/**
 * Update task in note file
 */
function updateTaskInNote(filePath, taskId, status, message = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    let updated = false;

    // Find and update the task
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match the task line
      const match = line.match(/^(\s*)-\s*\[(x|\.|\!|\/|\s*)\]\s*(.+)$/);
      if (!match) {
        continue;
      }

      const indent = match[1];
      const checkboxStatus = match[2].trim();
      const description = match[3];

      // Generate task ID for comparison
      const crypto = require('crypto');
      const tempId = crypto.createHash('sha256')
        .update(`${filePath}:${i}:${description}`)
        .digest('hex')
        .slice(0, 16);

      if (tempId !== taskId) {
        continue;
      }

      // Update the checkbox based on status
      let newCheckbox = '[ ]';
      let statusText = '';

      switch (status) {
        case 'running':
          newCheckbox = '[/]';
          statusText = '(Running...)';
          break;
        case 'done':
          newCheckbox = '[x]';
          statusText = '(Completed)';
          break;
        case 'failed':
          newCheckbox = '[!]';
          statusText = '(Failed)';
          break;
        default:
          newCheckbox = '[ ]';
          break;
      }

      // Update the line
      lines[i] = `${indent}- ${newCheckbox} ${description} ${statusText}`.trim();

      // Add message line if provided
      if (message && status !== 'queued') {
        const messageLine = `${indent}  - ${message}`;
        lines.splice(i + 1, 0, messageLine);
      }

      updated = true;
      break;
    }

    if (updated) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Failed to update task in note ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Ensure log section exists in note
 */
function ensureLogSection(filePath, logSectionName) {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    // Check if log section exists
    const normalizedHeader = logSectionName.toLowerCase();
    const exists = lines.some(line => line.trim().toLowerCase() === normalizedHeader);

    if (exists) {
      return false;
    }

    // Add log section
    lines.push('');
    lines.push(logSectionName);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return true;
  } catch (error) {
    console.error(`Failed to ensure log section in ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Append log entry to note
 */
function appendLogEntry(filePath, taskId, status, message) {
  try {
    ensureLogSection(filePath, '## Task Brancher Log');

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    // Find log section
    const logIndex = lines.findIndex(line => line.trim().toLowerCase() === '## task brancher log');
    if (logIndex === -1) {
      return false;
    }

    // Add log entry
    const timestamp = new Date().toISOString();
    const logLine = `- [${status}] ${message} (id: ${taskId}, ${timestamp})`;
    lines.splice(logIndex + 1, 0, logLine);

    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return true;
  } catch (error) {
    console.error(`Failed to append log entry to ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Clean up old progress entries
 */
function cleanupOldProgress(state, maxEntries = 50) {
  if (!state.progressHistory) {
    return state;
  }

  // Sort by timestamp and keep only the most recent entries
  state.progressHistory = state.progressHistory
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, maxEntries);

  return state;
}

module.exports = {
  initializeTaskState,
  updateTaskStatus,
  addProgressStep,
  incrementAttempts,
  calculateStatistics,
  updateTaskInNote,
  ensureLogSection,
  appendLogEntry,
  cleanupOldProgress
};
