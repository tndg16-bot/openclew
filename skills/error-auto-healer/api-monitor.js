/**
 * API Error Monitor - Event-Driven Error Detection System
 *
 * Monitors Gmail API and GitHub API for errors in an event-driven manner.
 * Sends immediate notifications on error detection and daily summaries at 8 AM.
 *
 * Usage:
 *   node api-monitor.js start        Start continuous monitoring
 *   node api-monitor.js once         Run a single check cycle
 *   node api-monitor.js summary      Send daily summary now
 *   node api-monitor.js status       Show current status
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const HISTORY_PATH = path.join(__dirname, 'logs', 'api-errors.json');
const DB_PATH = path.join(__dirname, 'logs', 'api-errors.db');
const LOG_PATH = path.join(__dirname, 'logs', 'api-monitor.log');

const GmailApiMonitor = require('./lib/gmail-api-monitor');
const GitHubApiMonitor = require('./lib/github-api-monitor');
const DiscordNotifier = require('./lib/discord-notifier');

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  monitoring: {
    intervalMinutes: 5,
    dailySummaryHour: 8, // 8 AM JST
    dailySummaryMinute: 0
  },
  discord: {
    webhookUrl: '',
    channelId: '1471769660948086785' // #秘書さんの部屋
  },
  gmail: {
    enabled: true,
    credentialsPath: './gmail-credentials.json',
    tokenPath: './gmail-token.json'
  },
  github: {
    enabled: true,
    token: ''
  },
  logging: {
    level: 'info',
    logToFile: true,
    logDir: './logs',
    retentionDays: 30
  }
};

// ---------------------------------------------------------------------------
// ApiErrorMonitor Class
// ---------------------------------------------------------------------------

class ApiErrorMonitor {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.history = [];
    this.isRunning = false;
    this.startTime = null;
    this.totalErrors = 0;
    this.gmailMonitor = null;
    this.githubMonitor = null;
    this.discordNotifier = null;
    this.db = null;
    this.intervalHandle = null;
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  async init() {
    this.log('info', 'Initializing API Error Monitor...');

    // Ensure directories exist
    await fs.ensureDir(path.join(__dirname, 'logs'));

    // Load configuration
    await this.loadConfig();

    // Load history
    await this.loadHistory();

    // Initialize database
    this.initDatabase();

    // Initialize monitors
    if (this.config.gmail.enabled) {
      this.gmailMonitor = new GmailApiMonitor(this.config);
      await this.gmailMonitor.init();
      this.log('info', 'Gmail API monitor initialized');
    }

    if (this.config.github.enabled) {
      this.githubMonitor = new GitHubApiMonitor(this.config);
      await this.githubMonitor.init();
      this.log('info', 'GitHub API monitor initialized');
    }

    // Initialize Discord notifier
    this.discordNotifier = new DiscordNotifier(this.config);
    this.log('info', 'Discord notifier initialized');

    this.startTime = new Date();
    this.log('info', 'API Error Monitor initialized successfully');
  }

  // =========================================================================
  // Configuration
  // =========================================================================

  async loadConfig() {
    try {
      if (await fs.pathExists(CONFIG_PATH)) {
        const fileConfig = await fs.readJson(CONFIG_PATH);
        this.config = this.deepMerge(DEFAULT_CONFIG, fileConfig);
        this.log('info', `Configuration loaded from ${CONFIG_PATH}`);
      } else {
        this.config = { ...DEFAULT_CONFIG };
        await fs.writeJson(CONFIG_PATH, DEFAULT_CONFIG, { spaces: 2 });
        this.log('info', `Default configuration created at ${CONFIG_PATH}`);
      }
    } catch (err) {
      this.log('error', `Failed to load config: ${err.message}`);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // =========================================================================
  // Logging
  // =========================================================================

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const logLine = data
      ? `${prefix} ${message} ${JSON.stringify(data)}`
      : `${prefix} ${message}`;

    // Console output with color
    const colors = {
      info: '\x1b[36m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      success: '\x1b[32m',
      debug: '\x1b[90m'
    };
    const color = colors[level] || '\x1b[0m';
    console.log(`${color}${logLine}\x1b[0m`);

    // File output
    if (this.config.logging.logToFile) {
      try {
        fs.appendFileSync(LOG_PATH, logLine + '\n');
      } catch (err) {
        // Silently ignore file write errors during logging
      }
    }
  }

  // =========================================================================
  // History (JSON file)
  // =========================================================================

  async loadHistory() {
    try {
      if (await fs.pathExists(HISTORY_PATH)) {
        this.history = await fs.readJson(HISTORY_PATH);
        this.log('info', `Loaded ${this.history.length} history entries`);
      } else {
        this.history = [];
      }
    } catch (err) {
      this.log('warn', `Failed to load history: ${err.message}`);
      this.history = [];
    }
  }

  async saveHistory() {
    try {
      await fs.writeJson(HISTORY_PATH, this.history, { spaces: 2 });
    } catch (err) {
      this.log('error', `Failed to save history: ${err.message}`);
    }
  }

  async recordError(error) {
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      platform: error.platform,
      type: error.type,
      severity: error.severity,
      message: error.message,
      repo: error.repo || null,
      raw: error.raw || null,
      signature: error.signature
    };

    this.history.push(record);
    this.totalErrors++;

    await this.saveHistory();
    await this.saveToDatabase(record);

    return record;
  }

  // =========================================================================
  // Database (SQLite)
  // =========================================================================

  initDatabase() {
    try {
      const Database = require('better-sqlite3');
      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS api_errors (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          platform TEXT NOT NULL,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT,
          repo TEXT,
          raw TEXT,
          signature TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_api_timestamp ON api_errors(timestamp);
        CREATE INDEX IF NOT EXISTS idx_api_platform ON api_errors(platform);
        CREATE INDEX IF NOT EXISTS idx_api_type ON api_errors(type);
        CREATE INDEX IF NOT EXISTS idx_api_severity ON api_errors(severity);
        CREATE INDEX IF NOT EXISTS idx_api_signature ON api_errors(signature);
      `);

      this.log('info', 'SQLite database initialized');
    } catch (err) {
      this.log('warn', `SQLite not available, using JSON only: ${err.message}`);
      this.db = null;
    }
  }

  async saveToDatabase(record) {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO api_errors
          (id, timestamp, platform, type, severity, message, repo, raw, signature)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        record.id,
        record.timestamp,
        record.platform,
        record.type,
        record.severity,
        record.message,
        record.repo,
        record.raw,
        record.signature
      );
    } catch (err) {
      this.log('error', `Failed to save to database: ${err.message}`);
    }
  }

  // =========================================================================
  // Monitoring
  // =========================================================================

  async checkOnce() {
    this.log('info', 'Running API error check cycle...');

    const allErrors = [];

    // Check Gmail API
    if (this.gmailMonitor) {
      try {
        const gmailErrors = await this.gmailMonitor.monitor();
        this.log('info', `Gmail API: ${gmailErrors.length} error(s)`);
        allErrors.push(...gmailErrors);
      } catch (err) {
        this.log('error', `Gmail API check failed: ${err.message}`);
      }
    }

    // Check GitHub API
    if (this.githubMonitor) {
      try {
        const githubErrors = await this.githubMonitor.monitor();
        this.log('info', `GitHub API: ${githubErrors.length} error(s)`);
        allErrors.push(...githubErrors);
      } catch (err) {
        this.log('error', `GitHub API check failed: ${err.message}`);
      }
    }

    // Process errors
    for (const error of allErrors) {
      await this.recordError(error);

      // Send immediate notification for critical errors
      if (error.severity === 'critical') {
        await this.discordNotifier.notifyErrorDetected(error);
      }
    }

    // Check if it's time for daily summary
    if (this.discordNotifier.isDailySummaryTime()) {
      await this.sendDailySummary();
    }

    return allErrors;
  }

  async start() {
    if (this.isRunning) {
      this.log('warn', 'Already running');
      return;
    }

    this.isRunning = true;
    const intervalMinutes = this.config.monitoring.intervalMinutes;
    const intervalMs = intervalMinutes * 60 * 1000;

    this.log('info', `Starting API error monitor (interval: ${intervalMinutes} min)...`);

    // Initial check
    await this.checkOnce();

    // Schedule recurring checks
    this.intervalHandle = setInterval(() => {
      this.checkOnce().catch(err => {
        this.log('error', `Monitoring cycle error: ${err.message}`);
      });
    }, intervalMs);

    this.log('info', 'Monitor started. Press Ctrl+C to stop.');
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    this.log('info', 'Monitor stopped');

    if (this.db) {
      try {
        this.db.close();
      } catch (err) {
        // Ignore close errors
      }
    }
  }

  // =========================================================================
  // Daily Summary
  // =========================================================================

  async sendDailySummary() {
    this.log('info', 'Sending daily summary...');

    // Get statistics from monitors
    const errorStats = {};

    if (this.gmailMonitor) {
      errorStats.gmail = this.gmailMonitor.getStats();
    }

    if (this.githubMonitor) {
      errorStats.github = this.githubMonitor.getStats();
    }

    // Get healing statistics from main healer
    const healingStats = {
      total: 0,
      healed: 0,
      failed: 0,
      skipped: 0,
      recentErrors: []
    };

    try {
      // Try to read healer history
      const healerHistoryPath = path.join(__dirname, 'logs', 'heal-history.json');
      if (await fs.pathExists(healerHistoryPath)) {
        const healerHistory = await fs.readJson(healerHistoryPath);
        const now = Date.now();
        const dayAgo = now - 86400000;

        const recentHeals = healerHistory.filter(h =>
          new Date(h.timestamp).getTime() > dayAgo
        );

        healingStats.total = recentHeals.length;
        healingStats.healed = recentHeals.filter(h => h.status === 'success').length;
        healingStats.failed = recentHeals.filter(h => h.status === 'failed').length;
        healingStats.skipped = recentHeals.length - healingStats.healed - healingStats.failed;

        // Get recent errors for summary
        const recentApiErrors = this.history.filter(e =>
          new Date(e.timestamp).getTime() > dayAgo
        ).slice(0, 10);

        healingStats.recentErrors = recentApiErrors;
      }
    } catch (err) {
      this.log('warn', `Failed to read healer history: ${err.message}`);
    }

    // Send summary via Discord
    await this.discordNotifier.sendDailySummary(errorStats, healingStats);

    this.log('info', 'Daily summary sent');
  }

  // =========================================================================
  // CLI Commands
  // =========================================================================

  async showStatus() {
    const uptime = this.startTime
      ? Math.floor((Date.now() - this.startTime.getTime()) / 1000)
      : 0;

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

    console.log('\n==========================================');
    console.log('  API Error Monitor - Status');
    console.log('==========================================\n');
    console.log(`  Running:            ${this.isRunning ? 'Yes' : 'No'}`);
    console.log(`  Uptime:             ${uptimeStr}`);
    console.log(`  Total errors:       ${this.totalErrors}`);
    console.log(`  History entries:    ${this.history.length}`);
    console.log('');
    console.log('  Monitors:');
    console.log(`    Gmail API:        ${this.gmailMonitor ? '✓' : '✗'}`);
    console.log(`    GitHub API:       ${this.githubMonitor ? '✓' : '✗'}`);
    console.log(`    Discord:          ${this.discordNotifier ? '✓' : '✗'}`);
    console.log('');
    console.log('  Configuration:');
    console.log(`    Check interval:   ${this.config.monitoring.intervalMinutes} min`);
    console.log(`    Daily summary:    ${this.config.monitoring.dailySummaryHour}:00 JST`);
    console.log(`    Gmail enabled:    ${this.config.gmail.enabled}`);
    console.log(`    GitHub enabled:   ${this.config.github.enabled}`);
    console.log(`    Discord webhook:  ${this.config.discord.webhookUrl ? '✓' : '✗'}`);
    console.log('\n==========================================\n');

    // Show error statistics
    if (this.gmailMonitor) {
      const gmailStats = this.gmailMonitor.getStats();
      console.log('  Gmail API Statistics:');
      console.log(`    Total (24h):      ${gmailStats.total}`);
      console.log(`    By type:          ${JSON.stringify(gmailStats.byType)}`);
      console.log(`    By severity:      ${JSON.stringify(gmailStats.bySeverity)}`);
      console.log('');
    }

    if (this.githubMonitor) {
      const githubStats = this.githubMonitor.getStats();
      console.log('  GitHub API Statistics:');
      console.log(`    Total (24h):      ${githubStats.total}`);
      console.log(`    By type:          ${JSON.stringify(githubStats.byType)}`);
      console.log(`    By severity:      ${JSON.stringify(githubStats.bySeverity)}`);
      console.log('');
    }
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===========================================================================
// CLI Entry Point
// ===========================================================================

function printUsage() {
  console.log('');
  console.log('API Error Monitor - Event-Driven Error Detection System');
  console.log('');
  console.log('Usage: node api-monitor.js <command>');
  console.log('');
  console.log('Commands:');
  console.log('  start      Start continuous monitoring for API errors');
  console.log('  once       Run a single check cycle');
  console.log('  summary    Send daily summary now');
  console.log('  status     Show current monitor status and statistics');
  console.log('');
  console.log('Configuration:');
  console.log(`  Config file: ${CONFIG_PATH}`);
  console.log(`  History:     ${HISTORY_PATH}`);
  console.log(`  Database:    ${DB_PATH}`);
  console.log(`  Logs:        ${LOG_PATH}`);
  console.log('');
  console.log('Examples:');
  console.log('  node api-monitor.js start');
  console.log('  node api-monitor.js once');
  console.log('  node api-monitor.js summary');
  console.log('  node api-monitor.js status');
  console.log('');
}

async function main() {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const monitor = new ApiErrorMonitor();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Shutting down gracefully...');
    monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM. Shutting down gracefully...');
    monitor.stop();
    process.exit(0);
  });

  try {
    await monitor.init();

    switch (command) {
      case 'start':
        await monitor.start();
        break;

      case 'once':
        await monitor.checkOnce();
        break;

      case 'summary':
        await monitor.sendDailySummary();
        break;

      case 'status':
        await monitor.showStatus();
        break;

      default:
        console.log(`Unknown command: ${command}`);
        printUsage();
        break;
    }
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Export class for programmatic use
module.exports = { ApiErrorMonitor };

// Run if executed directly
if (require.main === module) {
  main();
}
