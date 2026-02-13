/**
 * Notifications Module
 */

const https = require('https');

/**
 * Send Discord webhook notification
 */
function sendDiscordWebhook(webhookUrl, title, description, color, fields = []) {
  return new Promise((resolve, reject) => {
    if (!webhookUrl) {
      resolve({ success: true, skipped: true });
      return;
    }

    try {
      const url = new URL(webhookUrl);
      const payload = JSON.stringify({
        embeds: [
          {
            title,
            description,
            color: color || 0x3498db,
            timestamp: new Date().toISOString(),
            fields: fields.length > 0 ? fields : undefined
          }
        ]
      });

      const options = {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true });
          } else {
            resolve({ success: false, statusCode: res.statusCode });
          }
        });
      });

      req.on('error', (error) => {
        console.error('Discord webhook error:', error.message);
        resolve({ success: false, error: error.message });
      });

      req.write(payload);
      req.end();
    } catch (error) {
      console.error('Discord webhook error:', error.message);
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * Notify task started
 */
function notifyTaskStarted(config, task, branchName) {
  const webhookUrl = config.notifications?.discordWebhookUrl;
  if (!webhookUrl) {
    return Promise.resolve({ success: true, skipped: true });
  }

  return sendDiscordWebhook(
    webhookUrl,
    '🚀 Task Started',
    `**Task:** ${task.description}\n**Branch:** ${branchName}\n**Source:** ${task.sourceFile}`,
    0x3498db,
    [
      { name: 'Task ID', value: task.id, inline: true },
      { name: 'Section', value: task.section || 'N/A', inline: true }
    ]
  );
}

/**
 * Notify task completed
 */
function notifyTaskCompleted(config, task, branchName, duration = null) {
  const webhookUrl = config.notifications?.discordWebhookUrl;
  if (!webhookUrl) {
    return Promise.resolve({ success: true, skipped: true });
  }

  const durationText = duration
    ? `Duration: ${Math.round(duration / 1000)}s`
    : '';

  return sendDiscordWebhook(
    webhookUrl,
    '✅ Task Completed',
    `**Task:** ${task.description}\n**Branch:** ${branchName}\n${durationText}`,
    0x2ecc71,
    [
      { name: 'Task ID', value: task.id, inline: true },
      { name: 'Section', value: task.section || 'N/A', inline: true }
    ]
  );
}

/**
 * Notify task failed
 */
function notifyTaskFailed(config, task, branchName, error) {
  const webhookUrl = config.notifications?.discordWebhookUrl;
  if (!webhookUrl) {
    return Promise.resolve({ success: true, skipped: true });
  }

  return sendDiscordWebhook(
    webhookUrl,
    '❌ Task Failed',
    `**Task:** ${task.description}\n**Branch:** ${branchName}\n**Error:** ${error}`,
    0xe74c3c,
    [
      { name: 'Task ID', value: task.id, inline: true },
      { name: 'Section', value: task.section || 'N/A', inline: true }
    ]
  );
}

/**
 * Notify branch created
 */
function notifyBranchCreated(config, branchName, taskDescription) {
  const webhookUrl = config.notifications?.discordWebhookUrl;
  if (!webhookUrl) {
    return Promise.resolve({ success: true, skipped: true });
  }

  return sendDiscordWebhook(
    webhookUrl,
    '🌿 Branch Created',
    `**Branch:** \`${branchName}\`\n**For:** ${taskDescription}`,
    0x9b59b6
  );
}

/**
 * Notify summary report
 */
function notifySummaryReport(config, statistics) {
  const webhookUrl = config.notifications?.discordWebhookUrl;
  if (!webhookUrl) {
    return Promise.resolve({ success: true, skipped: true });
  }

  const fields = [
    { name: 'Total Tasks', value: statistics.totalTasks.toString(), inline: true },
    { name: 'Completed', value: statistics.completedTasks.toString(), inline: true },
    { name: 'Failed', value: statistics.failedTasks.toString(), inline: true },
    { name: 'Running', value: statistics.runningTasks.toString(), inline: true },
    { name: 'Queued', value: statistics.queuedTasks.toString(), inline: true }
  ];

  if (statistics.averageExecutionTime) {
    fields.push({
      name: 'Avg Time',
      value: `${Math.round(statistics.averageExecutionTime / 1000)}s`,
      inline: true
    });
  }

  return sendDiscordWebhook(
    webhookUrl,
    '📊 Task Brancher Summary',
    'Daily task execution report',
    0x1abc9c,
    fields
  );
}

module.exports = {
  sendDiscordWebhook,
  notifyTaskStarted,
  notifyTaskCompleted,
  notifyTaskFailed,
  notifyBranchCreated,
  notifySummaryReport
};
