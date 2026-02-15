'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const LOG_PATH = path.join(__dirname, '..', 'logs', 'discord-notifications.log');

/**
 * Discord Notifier
 * Sends notifications to Discord for errors, healing events, and daily summaries
 */
class DiscordNotifier {
  constructor(config) {
    this.config = config;
    this.webhookUrl = config?.discord?.webhookUrl || null;
    this.channelId = config?.discord?.channelId || '1471769660948086785'; // #秘書さんの部屋
    this.notificationHistory = [];
  }

  /**
   * Log notification locally
   */
  logNotification(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logLine = data
      ? `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`
      : `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    try {
      fs.appendFileSync(LOG_PATH, logLine + '\n');
    } catch (err) {
      // Silently ignore file write errors during logging
    }

    console.log(`[DiscordNotifier] ${logLine}`);
  }

  /**
   * Send Discord webhook notification
   */
  async sendEmbed(embed) {
    if (!this.webhookUrl) {
      this.logNotification('warn', 'Discord webhook not configured, skipping notification');
      return null;
    }

    try {
      const response = await axios.post(this.webhookUrl, {
        embeds: [embed]
      });

      this.logNotification('info', 'Discord notification sent', { title: embed.title });
      return response.data;
    } catch (err) {
      this.logNotification('error', `Discord notification failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Notify error detected
   */
  async notifyErrorDetected(errorInfo) {
    const color = this.getSeverityColor(errorInfo.severity);

    const embed = {
      title: '🚨 API Error Detected',
      color,
      fields: [
        { name: 'Platform', value: errorInfo.platform, inline: true },
        { name: 'Type', value: errorInfo.type, inline: true },
        { name: 'Severity', value: errorInfo.severity, inline: true },
        { name: 'Message', value: errorInfo.message, inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    if (errorInfo.repo) {
      embed.fields.push({ name: 'Repository', value: errorInfo.repo, inline: true });
    }

    if (errorInfo.raw && errorInfo.raw.length < 1000) {
      embed.fields.push({ name: 'Raw Error', value: `\`\`\`\n${errorInfo.raw}\n\`\`\``, inline: false });
    }

    await this.sendEmbed(embed);
  }

  /**
   * Notify healing started
   */
  async notifyHealingStarted(errorInfo) {
    const embed = {
      title: '🔧 Healing Started',
      color: 0xffaa00,
      fields: [
        { name: 'Platform', value: errorInfo.platform, inline: true },
        { name: 'Repository', value: errorInfo.repo || 'N/A', inline: true },
        { name: 'Error Type', value: errorInfo.type || 'N/A', inline: true },
        { name: 'Message', value: errorInfo.message.substring(0, 200), inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendEmbed(embed);
  }

  /**
   * Notify healing success
   */
  async notifyHealingSuccess(result) {
    const embed = {
      title: '✅ Healing Successful',
      color: 0x00ff00,
      fields: [
        { name: 'Platform', value: result.platform, inline: true },
        { name: 'Repository', value: result.repo || 'N/A', inline: true },
        { name: 'Strategy', value: result.strategy || 'N/A', inline: true },
        { name: 'Duration', value: `${(result.duration / 1000).toFixed(1)}s`, inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    if (result.prUrl) {
      embed.fields.push({ name: 'PR', value: result.prUrl, inline: false });
    }

    if (result.issueUrl) {
      embed.fields.push({ name: 'Issue', value: result.issueUrl, inline: false });
    }

    await this.sendEmbed(embed);
  }

  /**
   * Notify healing failed
   */
  async notifyHealingFailed(result) {
    const embed = {
      title: '❌ Healing Failed',
      color: 0xff0000,
      fields: [
        { name: 'Platform', value: result.platform, inline: true },
        { name: 'Repository', value: result.repo || 'N/A', inline: true },
        { name: 'Error', value: result.error?.substring(0, 200) || 'Unknown error', inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendEmbed(embed);
  }

  /**
   * Notify issue created
   */
  async notifyIssueCreated(errorInfo, issueUrl) {
    const embed = {
      title: '📝 Issue Created',
      color: 0x3498db,
      fields: [
        { name: 'Platform', value: errorInfo.platform, inline: true },
        { name: 'Repository', value: errorInfo.repo || 'N/A', inline: true },
        { name: 'Issue', value: issueUrl, inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendEmbed(embed);
  }

  /**
   * Notify PR created
   */
  async notifyPrCreated(errorInfo, prUrl) {
    const embed = {
      title: '🔃 Pull Request Created',
      color: 0x9b59b6,
      fields: [
        { name: 'Platform', value: errorInfo.platform, inline: true },
        { name: 'Repository', value: errorInfo.repo || 'N/A', inline: true },
        { name: 'PR', value: prUrl, inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendEmbed(embed);
  }

  /**
   * Send daily summary at 8 AM
   */
  async sendDailySummary(errorStats, healingStats) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

    const embed = {
      title: `📊 Error Auto-Healer Daily Summary - ${dateStr}`,
      color: 0x2ecc71,
      fields: [],
      timestamp: new Date().toISOString()
    };

    // Error Statistics
    if (errorStats && (errorStats.gmail || errorStats.github)) {
      embed.fields.push({ name: '🚨 API Errors Detected', value: '━'.repeat(20), inline: false });

      if (errorStats.gmail) {
        const gmail = errorStats.gmail;
        embed.fields.push({
          name: 'Gmail API',
          value: `Total: ${gmail.total}\nType: ${this.formatObject(gmail.byType)}\nSeverity: ${this.formatObject(gmail.bySeverity)}`,
          inline: true
        });
      }

      if (errorStats.github) {
        const github = errorStats.github;
        embed.fields.push({
          name: 'GitHub API',
          value: `Total: ${github.total}\nType: ${this.formatObject(github.byType)}\nSeverity: ${this.formatObject(github.bySeverity)}`,
          inline: true
        });
      }
    }

    // Healing Statistics
    if (healingStats) {
      embed.fields.push({ name: '\n🔧 Healing Results', value: '━'.repeat(20), inline: false });

      const successRate = healingStats.total > 0
        ? ((healingStats.healed / healingStats.total) * 100).toFixed(1)
        : 0;

      embed.fields.push({
        name: 'Summary',
        value: `Total: ${healingStats.total}\n✅ Healed: ${healingStats.healed}\n❌ Failed: ${healingStats.failed}\n⏭️ Skipped: ${healingStats.skipped}\n\nSuccess Rate: ${successRate}%`,
        inline: false
      });

      if (healingStats.recentErrors && healingStats.recentErrors.length > 0) {
        const topErrors = healingStats.recentErrors.slice(0, 5).map(e =>
          `- ${e.repo || e.platform}: ${e.message.substring(0, 50)}`
        ).join('\n');

        embed.fields.push({
          name: 'Recent Errors',
          value: topErrors || 'No recent errors',
          inline: false
        });
      }
    }

    // Footer
    embed.fields.push({
      name: '🕐 Report Time',
      value: now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      inline: true
    });

    await this.sendEmbed(embed);
  }

  /**
   * Format object to readable string
   */
  formatObject(obj) {
    if (!obj || Object.keys(obj).length === 0) {
      return 'None';
    }

    return Object.entries(obj)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  /**
   * Get color based on severity
   */
  getSeverityColor(severity) {
    const colors = {
      critical: 0xff0000, // Red
      warning: 0xffaa00, // Orange
      info: 0x3498db, // Blue
      debug: 0x95a5a6  // Gray
    };
    return colors[severity] || 0x95a5a6;
  }

  /**
   * Check if it's time for daily summary (8 AM JST)
   */
  isDailySummaryTime() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 8:00-8:05 AM JST window
    return hour === 8 && minute >= 0 && minute < 5;
  }

  /**
   * Get notification history
   */
  getHistory(limit = 20) {
    return this.notificationHistory.slice(-limit);
  }

  /**
   * Clear old notification history
   */
  clearOldHistory() {
    const now = Date.now();
    this.notificationHistory = this.notificationHistory.filter(n =>
      now - new Date(n.timestamp).getTime() < 86400000 // 24 hours
    );
  }
}

module.exports = DiscordNotifier;
