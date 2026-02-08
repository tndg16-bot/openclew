/**
 * Error Auto-Healer - Main Engine
 *
 * Monitors for CI/CD errors (GitHub Actions, Vercel) via email notifications,
 * automatically diagnoses issues, generates fixes using OpenClaw agents,
 * creates pull requests, and optionally auto-merges them.
 *
 * Features:
 *   - Email-based error detection (GitHub Actions & Vercel)
 *   - Automated error diagnosis and fix generation via OpenClaw
 *   - GitHub Issue auto-creation for detected errors
 *   - Pull request creation with detailed analysis
 *   - PR auto-merge with CI status checks
 *   - Vercel auto-redeploy after fixes
 *   - Error log scraping from GitHub Actions and Vercel
 *   - Advanced error history analysis with SQLite
 *   - Discord webhook notifications
 *   - Cooldown and rate-limiting safety mechanisms
 *
 * Usage:
 *   node healer.js start        Start monitoring (continuous)
 *   node healer.js once         Run a single check cycle
 *   node healer.js status       Show current healer status
 *   node healer.js history      Show healing history
 *   node healer.js analyze      Analyze error history for patterns
 *   node healer.js test         Run a test with sample error data
 *   node healer.js reset        Reset healing history and cooldowns
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const simpleGit = require('simple-git');
const cheerio = require('cheerio');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.join(__dirname, 'config.json');
const HISTORY_PATH = path.join(__dirname, 'logs', 'heal-history.json');
const DB_PATH = path.join(__dirname, 'logs', 'history.db');
const LOG_PATH = path.join(__dirname, 'logs', 'healer.log');
const WORK_DIR = path.join(__dirname, 'workdir');

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  polling: {
    intervalMs: 60000,
    gmailQuery: 'is:unread subject:(failed OR error OR failure) newer_than:1d'
  },
  healing: {
    cooldownMs: 300000,
    maxAttemptsPerError: 3,
    maxConcurrentHeals: 2,
    createPullRequest: true,
    autoCommit: true,
    branchPrefix: 'auto-fix/',
    workDir: WORK_DIR
  },
  github: {
    token: '',
    autoCreateIssue: true,
    autoMerge: false,
    mergeMethod: 'squash',
    reviewers: [],
    issueLabels: ['bug', 'auto-detected'],
    prLabels: ['auto-fix', 'bot']
  },
  vercel: {
    token: '',
    teamId: '',
    autoRedeploy: false
  },
  discord: {
    webhookUrl: ''
  },
  openClaw: {
    endpoint: 'http://localhost:3000',
    agentId: 'coder-agent'
  }
};

// ---------------------------------------------------------------------------
// ErrorAutoHealer Class
// ---------------------------------------------------------------------------

class ErrorAutoHealer {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.history = [];
    this.recentHeals = new Map();
    this.activeHeals = 0;
    this.isRunning = false;
    this.startTime = null;
    this.totalProcessed = 0;
    this.totalHealed = 0;
    this.totalFailed = 0;
    this.octokit = null;
    this.db = null;
    this.monitor = null;
    this.githubClient = null;
    this.openClawIntegration = null;
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  async init() {
    this.log('info', 'Initializing Error Auto-Healer...');

    // Ensure directories exist
    await fs.ensureDir(path.join(__dirname, 'logs'));
    await fs.ensureDir(WORK_DIR);

    // Load configuration
    await this.loadConfig();

    // Load history
    await this.loadHistory();

    // Initialize database
    this.initDatabase();

    // Initialize Octokit if token is available
    if (this.config.github.token) {
      this.octokit = new Octokit({ auth: this.config.github.token });
      this.log('info', 'GitHub API client initialized');
    } else {
      this.log('warn', 'No GitHub token configured. GitHub API features disabled.');
    }

    // Try to load optional modules
    try {
      const GmailMonitor = require('./monitor');
      this.monitor = new GmailMonitor(this.config);
      this.log('info', 'Gmail monitor loaded');
    } catch (err) {
      this.log('warn', `Gmail monitor not available: ${err.message}`);
    }

    try {
      const GitHubClient = require('./lib/github-client');
      this.githubClient = new GitHubClient(this.config);
      this.log('info', 'GitHub client loaded');
    } catch (err) {
      this.log('warn', `GitHub client not available: ${err.message}`);
    }

    try {
      const OpenClawIntegration = require('./lib/openclaw-integration');
      this.openClawIntegration = new OpenClawIntegration(this.config);
      this.log('info', 'OpenClaw integration loaded');
    } catch (err) {
      this.log('warn', `OpenClaw integration not available: ${err.message}`);
    }

    this.startTime = new Date();
    this.log('info', 'Error Auto-Healer initialized successfully');
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
    try {
      fs.appendFileSync(LOG_PATH, logLine + '\n');
    } catch (err) {
      // Silently ignore file write errors during logging
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

  async hasRecentHeal(errorSignature) {
    const cooldown = this.config.healing.cooldownMs;
    const lastHeal = this.recentHeals.get(errorSignature);
    if (lastHeal && Date.now() - lastHeal < cooldown) {
      return true;
    }

    // Also check history for max attempts
    const recentAttempts = this.history.filter(
      (h) =>
        h.signature === errorSignature &&
        Date.now() - new Date(h.timestamp).getTime() < 86400000 // 24 hours
    );

    if (recentAttempts.length >= this.config.healing.maxAttemptsPerError) {
      return true;
    }

    return false;
  }

  async recordHeal(errorInfo, result) {
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      signature: errorInfo.signature,
      platform: errorInfo.platform,
      repo: errorInfo.repo || 'unknown',
      branch: errorInfo.branch || 'unknown',
      workflow: errorInfo.workflow || 'unknown',
      errorMessage: errorInfo.errorMessage || '',
      status: result.success ? 'success' : 'failed',
      healingStrategy: result.strategy || 'unknown',
      filesChanged: result.filesChanged || [],
      prUrl: result.prUrl || null,
      issueUrl: result.issueUrl || null,
      duration: result.duration || 0,
      error: result.error || null
    };

    this.history.push(record);
    this.recentHeals.set(errorInfo.signature, Date.now());

    if (result.success) {
      this.totalHealed++;
    } else {
      this.totalFailed++;
    }
    this.totalProcessed++;

    await this.saveHistory();
    await this.saveToDatabase(record);
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
        CREATE TABLE IF NOT EXISTS heal_history (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          signature TEXT NOT NULL,
          platform TEXT,
          repo TEXT,
          branch TEXT,
          workflow TEXT,
          error_message TEXT,
          status TEXT NOT NULL,
          healing_strategy TEXT,
          files_changed TEXT,
          pr_url TEXT,
          issue_url TEXT,
          duration INTEGER DEFAULT 0,
          error TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_heal_signature ON heal_history(signature);
        CREATE INDEX IF NOT EXISTS idx_heal_timestamp ON heal_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_heal_repo ON heal_history(repo);
        CREATE INDEX IF NOT EXISTS idx_heal_status ON heal_history(status);
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
        INSERT OR REPLACE INTO heal_history
          (id, timestamp, signature, platform, repo, branch, workflow,
           error_message, status, healing_strategy, files_changed,
           pr_url, issue_url, duration, error)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        record.id,
        record.timestamp,
        record.signature,
        record.platform,
        record.repo,
        record.branch,
        record.workflow,
        record.errorMessage,
        record.status,
        record.healingStrategy,
        JSON.stringify(record.filesChanged),
        record.prUrl,
        record.issueUrl,
        record.duration,
        record.error
      );
    } catch (err) {
      this.log('error', `Failed to save to database: ${err.message}`);
    }
  }

  // =========================================================================
  // Error Parsing
  // =========================================================================

  parseError(emailData) {
    if (!emailData || !emailData.subject) {
      return null;
    }

    const subject = emailData.subject || '';
    const body = emailData.body || '';
    const from = (emailData.from || '').toLowerCase();

    // Detect GitHub Actions errors
    if (
      from.includes('github.com') ||
      from.includes('noreply@github.com') ||
      subject.toLowerCase().includes('github actions') ||
      subject.toLowerCase().includes('workflow') ||
      subject.match(/run\s+failed/i) ||
      subject.match(/\bfailed\b.*\bactions?\b/i)
    ) {
      const ghError = this.parseGitHubError(subject, body);
      if (ghError) {
        ghError.emailId = emailData.id || null;
        ghError.rawSubject = subject;
        ghError.rawBody = body.substring(0, 5000);
        return ghError;
      }
    }

    // Detect Vercel errors
    if (
      from.includes('vercel.com') ||
      from.includes('zeit.co') ||
      subject.toLowerCase().includes('vercel') ||
      subject.toLowerCase().includes('deployment failed') ||
      subject.match(/deploy.*fail/i)
    ) {
      const vercelError = this.parseVercelError(subject, body);
      if (vercelError) {
        vercelError.emailId = emailData.id || null;
        vercelError.rawSubject = subject;
        vercelError.rawBody = body.substring(0, 5000);
        return vercelError;
      }
    }

    return null;
  }

  parseGitHubError(subject, body) {
    const errorInfo = {
      platform: 'github-actions',
      repo: null,
      owner: null,
      branch: null,
      workflow: null,
      runId: null,
      errorMessage: '',
      errorType: 'build',
      signature: null,
      detectedAt: new Date().toISOString()
    };

    // Extract repository from subject/body
    // Patterns: "owner/repo", "Run failed: owner/repo"
    const repoMatch =
      subject.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/) ||
      body.match(/repository[:\s]+([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);
    if (repoMatch) {
      errorInfo.repo = repoMatch[1];
      const parts = repoMatch[1].split('/');
      errorInfo.owner = parts[0];
    }

    // Extract branch
    const branchMatch =
      body.match(/branch[:\s]+([a-zA-Z0-9_.\-\/]+)/i) ||
      subject.match(/branch[:\s]+([a-zA-Z0-9_.\-\/]+)/i) ||
      body.match(/ref[:\s]+refs\/heads\/([a-zA-Z0-9_.\-\/]+)/i);
    if (branchMatch) {
      errorInfo.branch = branchMatch[1].trim();
    } else {
      errorInfo.branch = 'main';
    }

    // Extract workflow name
    const workflowMatch =
      body.match(/workflow[:\s]+["']?([^"'\n]+)["']?/i) ||
      subject.match(/workflow[:\s]+["']?([^"'\n]+)["']?/i) ||
      body.match(/action[:\s]+["']?([^"'\n]+)["']?/i);
    if (workflowMatch) {
      errorInfo.workflow = workflowMatch[1].trim();
    }

    // Extract run ID
    const runIdMatch =
      body.match(/runs\/(\d+)/i) ||
      body.match(/run[_\s]?id[:\s]+(\d+)/i);
    if (runIdMatch) {
      errorInfo.runId = runIdMatch[1];
    }

    // Extract error message
    const errorMsgMatch =
      body.match(/error[:\s]+(.+?)(?:\n|$)/i) ||
      body.match(/failed[:\s]+(.+?)(?:\n|$)/i) ||
      body.match(/exit\s+code\s+\d+[:\s]*(.+?)(?:\n|$)/i);
    if (errorMsgMatch) {
      errorInfo.errorMessage = errorMsgMatch[1].trim().substring(0, 500);
    } else {
      errorInfo.errorMessage = subject;
    }

    // Classify error type
    const bodyLower = body.toLowerCase();
    if (bodyLower.includes('npm test') || bodyLower.includes('jest') || bodyLower.includes('test fail')) {
      errorInfo.errorType = 'test';
    } else if (bodyLower.includes('eslint') || bodyLower.includes('lint')) {
      errorInfo.errorType = 'lint';
    } else if (bodyLower.includes('type') && bodyLower.includes('error')) {
      errorInfo.errorType = 'typecheck';
    } else if (bodyLower.includes('npm install') || bodyLower.includes('dependency')) {
      errorInfo.errorType = 'dependency';
    } else if (bodyLower.includes('deploy')) {
      errorInfo.errorType = 'deploy';
    }

    // Create signature
    const sigSource = `${errorInfo.platform}:${errorInfo.repo}:${errorInfo.workflow}:${errorInfo.errorType}:${errorInfo.errorMessage.substring(0, 100)}`;
    errorInfo.signature = this.hashString(sigSource);

    return errorInfo;
  }

  parseVercelError(subject, body) {
    const errorInfo = {
      platform: 'vercel',
      repo: null,
      owner: null,
      branch: null,
      projectName: null,
      deploymentId: null,
      deploymentUrl: null,
      errorMessage: '',
      errorType: 'deploy',
      signature: null,
      detectedAt: new Date().toISOString()
    };

    // Extract project name
    const projectMatch =
      body.match(/project[:\s]+["']?([a-zA-Z0-9_.-]+)["']?/i) ||
      subject.match(/(?:project|deployment)\s+["']?([a-zA-Z0-9_.-]+)["']?/i);
    if (projectMatch) {
      errorInfo.projectName = projectMatch[1].trim();
    }

    // Extract repository
    const repoMatch =
      body.match(/repository[:\s]+([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i) ||
      body.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
    if (repoMatch) {
      errorInfo.repo = repoMatch[1];
      const parts = repoMatch[1].split('/');
      errorInfo.owner = parts[0];
    }

    // Extract branch
    const branchMatch =
      body.match(/branch[:\s]+([a-zA-Z0-9_.\-\/]+)/i) ||
      body.match(/git\s+ref[:\s]+([a-zA-Z0-9_.\-\/]+)/i);
    if (branchMatch) {
      errorInfo.branch = branchMatch[1].trim();
    } else {
      errorInfo.branch = 'main';
    }

    // Extract deployment ID
    const deployIdMatch =
      body.match(/deployment[:\s]+([a-zA-Z0-9_-]+)/i) ||
      body.match(/dpl_([a-zA-Z0-9]+)/);
    if (deployIdMatch) {
      errorInfo.deploymentId = deployIdMatch[1];
    }

    // Extract deployment URL
    const urlMatch = body.match(/(https?:\/\/[a-zA-Z0-9_.-]+\.vercel\.app[^\s]*)/i);
    if (urlMatch) {
      errorInfo.deploymentUrl = urlMatch[1];
    }

    // Extract error message
    const errorMsgMatch =
      body.match(/error[:\s]+(.+?)(?:\n|$)/i) ||
      body.match(/build\s+failed[:\s]*(.+?)(?:\n|$)/i) ||
      body.match(/deployment\s+failed[:\s]*(.+?)(?:\n|$)/i);
    if (errorMsgMatch) {
      errorInfo.errorMessage = errorMsgMatch[1].trim().substring(0, 500);
    } else {
      errorInfo.errorMessage = subject;
    }

    // Classify error type
    const bodyLower = body.toLowerCase();
    if (bodyLower.includes('build')) {
      errorInfo.errorType = 'build';
    } else if (bodyLower.includes('serverless') || bodyLower.includes('function')) {
      errorInfo.errorType = 'serverless';
    } else if (bodyLower.includes('timeout')) {
      errorInfo.errorType = 'timeout';
    }

    // Create signature
    const sigSource = `${errorInfo.platform}:${errorInfo.projectName || errorInfo.repo}:${errorInfo.errorType}:${errorInfo.errorMessage.substring(0, 100)}`;
    errorInfo.signature = this.hashString(sigSource);

    return errorInfo;
  }

  hashString(str) {
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  }

  // =========================================================================
  // Discord Notifications
  // =========================================================================

  async notifyDiscord(embed) {
    const webhookUrl = this.config.discord.webhookUrl;
    if (!webhookUrl) {
      this.log('debug', 'Discord webhook not configured, skipping notification');
      return;
    }

    try {
      await axios.post(webhookUrl, {
        embeds: [embed]
      });
      this.log('debug', 'Discord notification sent');
    } catch (err) {
      this.log('error', `Discord notification failed: ${err.message}`);
    }
  }

  // =========================================================================
  // GitHub Issue Auto-Creation
  // =========================================================================

  async createGitHubIssue(errorInfo) {
    if (!this.config.github.autoCreateIssue) {
      this.log('debug', 'Auto issue creation disabled');
      return null;
    }

    if (!this.octokit) {
      this.log('warn', 'Cannot create GitHub issue: Octokit not initialized');
      return null;
    }

    const { owner, repo } = this.parseRepo(errorInfo.repo);
    if (!owner || !repo) {
      this.log('warn', `Cannot create issue: invalid repo format "${errorInfo.repo}"`);
      return null;
    }

    const title = `[Auto-Detected] ${errorInfo.platform}: ${(errorInfo.errorMessage || 'Unknown error').substring(0, 80)}`;

    const rawLogExcerpt = (errorInfo.rawBody || '')
      .substring(0, 2000)
      .replace(/```/g, '` ` `');

    const body = [
      '## Auto-Detected Error',
      '',
      `**Platform:** ${errorInfo.platform}`,
      `**Repository:** ${errorInfo.repo}`,
      `**Branch:** ${errorInfo.branch || 'N/A'}`,
      `**Workflow:** ${errorInfo.workflow || 'N/A'}`,
      `**Error Type:** ${errorInfo.errorType || 'N/A'}`,
      `**Detected At:** ${errorInfo.detectedAt}`,
      `**Signature:** \`${errorInfo.signature}\``,
      '',
      '### Error Message',
      '',
      '```',
      errorInfo.errorMessage || 'No error message extracted',
      '```',
      '',
      '### Raw Log Excerpt',
      '',
      '<details>',
      '<summary>Click to expand</summary>',
      '',
      '```',
      rawLogExcerpt || 'No raw log available',
      '```',
      '',
      '</details>',
      '',
      '---',
      '*This issue was automatically created by Error Auto-Healer.*'
    ].join('\n');

    try {
      const response = await this.octokit.issues.create({
        owner,
        repo,
        title,
        body,
        labels: this.config.github.issueLabels
      });

      const issueUrl = response.data.html_url;
      this.log('success', `GitHub issue created: ${issueUrl}`);
      return issueUrl;
    } catch (err) {
      this.log('error', `Failed to create GitHub issue: ${err.message}`);
      return null;
    }
  }

  // =========================================================================
  // PR Auto-Merge
  // =========================================================================

  async autoMergePullRequest(owner, repo, prNumber) {
    if (!this.config.github.autoMerge) {
      this.log('debug', 'Auto-merge disabled');
      return false;
    }

    if (!this.octokit) {
      this.log('warn', 'Cannot auto-merge: Octokit not initialized');
      return false;
    }

    try {
      // Wait briefly for CI checks to register
      this.log('info', `Waiting for CI checks on PR #${prNumber}...`);
      await this.sleep(10000);

      // Check CI status before merging
      const checksReady = await this.waitForChecks(owner, repo, prNumber, 300000);
      if (!checksReady) {
        this.log('warn', `CI checks not passing for PR #${prNumber}, skipping auto-merge`);
        return false;
      }

      // Try to enable auto-merge via GraphQL (preferred approach)
      try {
        const prData = await this.octokit.pulls.get({ owner, repo, pull_number: prNumber });
        const nodeId = prData.data.node_id;

        await this.octokit.graphql(`
          mutation($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
            enablePullRequestAutoMerge(input: {
              pullRequestId: $pullRequestId,
              mergeMethod: $mergeMethod
            }) {
              pullRequest {
                autoMergeRequest {
                  enabledAt
                }
              }
            }
          }
        `, {
          pullRequestId: nodeId,
          mergeMethod: this.config.github.mergeMethod.toUpperCase()
        });

        this.log('success', `Auto-merge enabled for PR #${prNumber}`);
        return true;
      } catch (graphqlErr) {
        this.log('debug', `GraphQL auto-merge not available: ${graphqlErr.message}`);
      }

      // Fallback: direct merge
      const mergeMethod = this.config.github.mergeMethod || 'squash';
      await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: mergeMethod
      });

      this.log('success', `PR #${prNumber} merged via ${mergeMethod}`);
      return true;
    } catch (err) {
      this.log('error', `Failed to auto-merge PR #${prNumber}: ${err.message}`);
      return false;
    }
  }

  async waitForChecks(owner, repo, prNumber, timeoutMs) {
    const startTime = Date.now();
    const pollInterval = 15000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const pr = await this.octokit.pulls.get({
          owner,
          repo,
          pull_number: prNumber
        });

        const sha = pr.data.head.sha;

        const { data: checkRuns } = await this.octokit.checks.listForRef({
          owner,
          repo,
          ref: sha
        });

        if (checkRuns.total_count === 0) {
          // No checks registered yet, wait
          await this.sleep(pollInterval);
          continue;
        }

        const allCompleted = checkRuns.check_runs.every(
          (run) => run.status === 'completed'
        );
        const allPassing = checkRuns.check_runs.every(
          (run) => run.conclusion === 'success' || run.conclusion === 'skipped'
        );

        if (allCompleted && allPassing) {
          return true;
        }

        if (allCompleted && !allPassing) {
          this.log('warn', 'Some CI checks failed');
          return false;
        }

        // Still running, wait
        await this.sleep(pollInterval);
      } catch (err) {
        this.log('error', `Error checking CI status: ${err.message}`);
        return false;
      }
    }

    this.log('warn', 'Timeout waiting for CI checks');
    return false;
  }

  // =========================================================================
  // Vercel Auto-Redeploy
  // =========================================================================

  async triggerVercelRedeploy(errorInfo) {
    if (!this.config.vercel.autoRedeploy) {
      this.log('debug', 'Vercel auto-redeploy disabled');
      return null;
    }

    const vercelToken = this.config.vercel.token;
    if (!vercelToken) {
      this.log('warn', 'Cannot redeploy: Vercel token not configured');
      return null;
    }

    const projectName = errorInfo.projectName;
    if (!projectName) {
      this.log('warn', 'Cannot redeploy: no project name in error info');
      return null;
    }

    try {
      const headers = {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json'
      };

      const payload = {
        name: projectName,
        target: errorInfo.branch === 'main' || errorInfo.branch === 'master'
          ? 'production'
          : 'preview'
      };

      if (this.config.vercel.teamId) {
        payload.teamId = this.config.vercel.teamId;
      }

      // Retrieve the project's git repo info for redeployment
      if (errorInfo.repo) {
        payload.gitSource = {
          type: 'github',
          repo: errorInfo.repo,
          ref: errorInfo.branch || 'main'
        };
      }

      const response = await axios.post(
        'https://api.vercel.com/v13/deployments',
        payload,
        { headers }
      );

      const deploymentId = response.data.id;
      const deploymentUrl = response.data.url;

      this.log('success', `Vercel redeploy triggered: ${deploymentUrl} (ID: ${deploymentId})`);

      return {
        deploymentId,
        url: deploymentUrl
      };
    } catch (err) {
      const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
      this.log('error', `Vercel redeploy failed: ${errMsg}`);
      return null;
    }
  }

  async checkVercelDeployment(deploymentId) {
    const vercelToken = this.config.vercel.token;
    if (!vercelToken || !deploymentId) {
      return null;
    }

    try {
      const headers = {
        Authorization: `Bearer ${vercelToken}`
      };

      const params = {};
      if (this.config.vercel.teamId) {
        params.teamId = this.config.vercel.teamId;
      }

      const response = await axios.get(
        `https://api.vercel.com/v13/deployments/${deploymentId}`,
        { headers, params }
      );

      const status = response.data.readyState || response.data.state;
      const url = response.data.url;

      this.log('info', `Vercel deployment ${deploymentId}: ${status}`);

      return {
        id: deploymentId,
        status,
        url,
        ready: status === 'READY',
        error: status === 'ERROR' ? response.data.errorMessage : null
      };
    } catch (err) {
      this.log('error', `Failed to check Vercel deployment: ${err.message}`);
      return null;
    }
  }

  // =========================================================================
  // Error Log Scraping
  // =========================================================================

  async scrapeErrorLogs(errorInfo) {
    this.log('info', `Scraping error logs for ${errorInfo.platform}...`);

    try {
      if (errorInfo.platform === 'github-actions' && errorInfo.runId) {
        const { owner, repo } = this.parseRepo(errorInfo.repo);
        if (owner && repo) {
          const logs = await this.getGitHubActionsLogs(owner, repo, errorInfo.runId);
          if (logs) {
            errorInfo.scrapedLogs = logs;
            this.log('info', `Scraped ${logs.length} chars of GitHub Actions logs`);
            return logs;
          }
        }
      }

      if (errorInfo.platform === 'vercel' && errorInfo.deploymentUrl) {
        const logs = await this.scrapeVercelPage(errorInfo.deploymentUrl);
        if (logs) {
          errorInfo.scrapedLogs = logs;
          this.log('info', `Scraped ${logs.length} chars of Vercel logs`);
          return logs;
        }
      }

      // Fallback: try to fetch any URL found in the error body
      if (errorInfo.rawBody) {
        const urlMatch = errorInfo.rawBody.match(
          /https?:\/\/github\.com\/[^\s]+\/actions\/runs\/\d+/
        );
        if (urlMatch) {
          const logs = await this.scrapeGenericPage(urlMatch[0]);
          if (logs) {
            errorInfo.scrapedLogs = logs;
            return logs;
          }
        }
      }
    } catch (err) {
      this.log('warn', `Log scraping failed: ${err.message}`);
    }

    return null;
  }

  async getGitHubActionsLogs(owner, repo, runId) {
    if (!this.octokit) {
      this.log('warn', 'Cannot fetch GitHub Actions logs: Octokit not initialized');
      return null;
    }

    try {
      // Get workflow run jobs
      const { data: jobsData } = await this.octokit.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: parseInt(runId, 10)
      });

      const failedJobs = jobsData.jobs.filter(
        (job) => job.conclusion === 'failure'
      );

      const logParts = [];

      for (const job of failedJobs) {
        try {
          // Download job logs
          const logsResponse = await this.octokit.actions.downloadJobLogsForWorkflowRun({
            owner,
            repo,
            job_id: job.id
          });

          const logText =
            typeof logsResponse.data === 'string'
              ? logsResponse.data
              : logsResponse.data.toString();

          // Extract the most relevant parts (error lines)
          const lines = logText.split('\n');
          const errorLines = lines.filter(
            (line) =>
              line.toLowerCase().includes('error') ||
              line.toLowerCase().includes('failed') ||
              line.toLowerCase().includes('exception') ||
              line.toLowerCase().includes('fatal') ||
              line.includes('##[error]')
          );

          logParts.push(
            `=== Job: ${job.name} ===\n` +
            errorLines.slice(0, 50).join('\n')
          );
        } catch (jobErr) {
          logParts.push(`=== Job: ${job.name} === (logs unavailable: ${jobErr.message})`);
        }
      }

      return logParts.join('\n\n') || null;
    } catch (err) {
      this.log('error', `Failed to fetch GitHub Actions logs: ${err.message}`);

      // Fallback: try downloading the full run log archive
      try {
        const logsUrl = await this.octokit.actions.downloadWorkflowRunLogs({
          owner,
          repo,
          run_id: parseInt(runId, 10)
        });
        this.log('debug', 'Full run logs archive available but requires zip extraction');
      } catch (archiveErr) {
        // Ignore archive errors
      }

      return null;
    }
  }

  async scrapeVercelPage(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'ErrorAutoHealer/1.0'
        }
      });

      const $ = cheerio.load(response.data);

      // Extract error content from Vercel error pages
      const errorText = [];

      $('pre, code, .error, .stack-trace, [class*="error"], [class*="log"]').each(
        (i, el) => {
          const text = $(el).text().trim();
          if (text.length > 10) {
            errorText.push(text);
          }
        }
      );

      return errorText.join('\n\n').substring(0, 10000) || null;
    } catch (err) {
      this.log('debug', `Vercel page scrape failed: ${err.message}`);
      return null;
    }
  }

  async scrapeGenericPage(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'ErrorAutoHealer/1.0'
        }
      });

      const $ = cheerio.load(response.data);

      const errorText = [];
      $('pre, code, .error, .log-body, .js-log-output').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 10) {
          errorText.push(text);
        }
      });

      return errorText.join('\n\n').substring(0, 10000) || null;
    } catch (err) {
      this.log('debug', `Generic page scrape failed: ${err.message}`);
      return null;
    }
  }

  // =========================================================================
  // History Analysis
  // =========================================================================

  async analyzeHistory() {
    const records = this.db
      ? this.getRecordsFromDb()
      : this.history;

    if (!records || records.length === 0) {
      console.log('\n  No healing history found. Nothing to analyze.\n');
      return;
    }

    console.log('\n==========================================');
    console.log('  Error Auto-Healer - History Analysis');
    console.log('==========================================\n');

    // Overall stats
    const total = records.length;
    const successes = records.filter((r) => r.status === 'success').length;
    const failures = records.filter((r) => r.status === 'failed').length;
    const successRate = total > 0 ? ((successes / total) * 100).toFixed(1) : 0;

    console.log('--- Overall Statistics ---');
    console.log(`  Total healing attempts:  ${total}`);
    console.log(`  Successful:              ${successes}`);
    console.log(`  Failed:                  ${failures}`);
    console.log(`  Success rate:            ${successRate}%`);
    console.log('');

    // Average duration
    const durations = records
      .filter((r) => r.duration && r.duration > 0)
      .map((r) => r.duration);
    if (durations.length > 0) {
      const avgDuration = (durations.reduce((a, b) => a + b, 0) / durations.length / 1000).toFixed(1);
      const minDuration = (Math.min(...durations) / 1000).toFixed(1);
      const maxDuration = (Math.max(...durations) / 1000).toFixed(1);
      console.log('--- Healing Time ---');
      console.log(`  Average:  ${avgDuration}s`);
      console.log(`  Fastest:  ${minDuration}s`);
      console.log(`  Slowest:  ${maxDuration}s`);
      console.log('');
    }

    // Group by repository
    const byRepo = {};
    for (const r of records) {
      const repo = r.repo || 'unknown';
      if (!byRepo[repo]) {
        byRepo[repo] = { total: 0, success: 0, failed: 0 };
      }
      byRepo[repo].total++;
      if (r.status === 'success') byRepo[repo].success++;
      else byRepo[repo].failed++;
    }

    console.log('--- By Repository ---');
    for (const [repo, stats] of Object.entries(byRepo)) {
      const rate = ((stats.success / stats.total) * 100).toFixed(0);
      console.log(`  ${repo}: ${stats.total} attempts (${rate}% success)`);
    }
    console.log('');

    // Group by platform
    const byPlatform = {};
    for (const r of records) {
      const platform = r.platform || 'unknown';
      if (!byPlatform[platform]) {
        byPlatform[platform] = { total: 0, success: 0 };
      }
      byPlatform[platform].total++;
      if (r.status === 'success') byPlatform[platform].success++;
    }

    console.log('--- By Platform ---');
    for (const [platform, stats] of Object.entries(byPlatform)) {
      const rate = ((stats.success / stats.total) * 100).toFixed(0);
      console.log(`  ${platform}: ${stats.total} attempts (${rate}% success)`);
    }
    console.log('');

    // Group by error type
    const byType = {};
    for (const r of records) {
      const strategy = r.healingStrategy || r.healing_strategy || 'unknown';
      if (!byType[strategy]) {
        byType[strategy] = 0;
      }
      byType[strategy]++;
    }

    if (Object.keys(byType).length > 0) {
      console.log('--- By Healing Strategy ---');
      for (const [strategy, count] of Object.entries(byType)) {
        console.log(`  ${strategy}: ${count}`);
      }
      console.log('');
    }

    // Identify recurring errors (same signature failing multiple times)
    const bySig = {};
    for (const r of records) {
      const sig = r.signature;
      if (!bySig[sig]) {
        bySig[sig] = {
          count: 0,
          repo: r.repo,
          platform: r.platform,
          errorMessage: r.errorMessage || r.error_message || '',
          lastSeen: r.timestamp
        };
      }
      bySig[sig].count++;
      if (r.timestamp > bySig[sig].lastSeen) {
        bySig[sig].lastSeen = r.timestamp;
      }
    }

    const recurring = Object.entries(bySig)
      .filter(([, info]) => info.count >= 2)
      .sort(([, a], [, b]) => b.count - a.count);

    if (recurring.length > 0) {
      console.log('--- Recurring Errors ---');
      for (const [sig, info] of recurring) {
        console.log(`  [${sig}] ${info.repo || 'unknown'} (${info.platform}): ${info.count} occurrences`);
        console.log(`    Message: ${(info.errorMessage || '').substring(0, 80)}`);
        console.log(`    Last seen: ${info.lastSeen}`);
      }
      console.log('');
    }

    // Recommendations
    console.log('--- Recommendations ---');
    let hasRecommendations = false;

    // Repos failing repeatedly in 24h
    const now = Date.now();
    for (const [repo, stats] of Object.entries(byRepo)) {
      const recent24h = records.filter(
        (r) =>
          (r.repo === repo) &&
          (now - new Date(r.timestamp).getTime() < 86400000) &&
          r.status === 'failed'
      );
      if (recent24h.length >= 5) {
        console.log(`  ! Repository "${repo}" has failed ${recent24h.length} times in the last 24 hours.`);
        console.log('    Consider manual review of the root cause.');
        hasRecommendations = true;
      }
    }

    // Low success rate repos
    for (const [repo, stats] of Object.entries(byRepo)) {
      if (stats.total >= 3 && stats.success / stats.total < 0.3) {
        console.log(`  ! Repository "${repo}" has a low success rate (${((stats.success / stats.total) * 100).toFixed(0)}%).`);
        console.log('    The errors may require manual intervention.');
        hasRecommendations = true;
      }
    }

    // Recurring unresolved errors
    for (const [sig, info] of recurring) {
      if (info.count >= 5) {
        console.log(`  ! Error "${(info.errorMessage || '').substring(0, 60)}" has recurred ${info.count} times.`);
        console.log('    This may indicate a systemic issue that auto-healing cannot fix.');
        hasRecommendations = true;
      }
    }

    if (!hasRecommendations) {
      console.log('  No critical issues detected. System is operating normally.');
    }

    console.log('\n==========================================\n');
  }

  getRecordsFromDb() {
    if (!this.db) return this.history;

    try {
      const stmt = this.db.prepare('SELECT * FROM heal_history ORDER BY timestamp DESC');
      return stmt.all();
    } catch (err) {
      this.log('warn', `Failed to read from database: ${err.message}`);
      return this.history;
    }
  }

  // =========================================================================
  // Healing Workflow
  // =========================================================================

  buildHealingRequest(errorInfo) {
    return {
      action: 'diagnose-and-fix',
      platform: errorInfo.platform,
      repo: errorInfo.repo,
      branch: errorInfo.branch,
      workflow: errorInfo.workflow,
      errorMessage: errorInfo.errorMessage,
      errorType: errorInfo.errorType,
      scrapedLogs: errorInfo.scrapedLogs || null,
      context: {
        signature: errorInfo.signature,
        detectedAt: errorInfo.detectedAt,
        runId: errorInfo.runId || null,
        deploymentId: errorInfo.deploymentId || null
      }
    };
  }

  parseRepo(repoString) {
    if (!repoString) {
      return { owner: null, repo: null };
    }

    const parts = repoString.split('/');
    if (parts.length === 2) {
      return { owner: parts[0], repo: parts[1] };
    }

    return { owner: null, repo: repoString };
  }

  async executeHealing(errorInfo, customWorkDir = null, agentId = null) {
    const startTime = Date.now();
    const workDir = customWorkDir || path.join(this.config.healing.workDir, `heal-${Date.now()}`);
    const branchName = `${this.config.healing.branchPrefix}${errorInfo.signature}-${Date.now()}`;

    const result = {
      success: false,
      strategy: 'unknown',
      filesChanged: [],
      prUrl: null,
      issueUrl: null,
      duration: 0,
      error: null
    };

    try {
      await fs.ensureDir(workDir);

      // Step 1: Create GitHub issue if enabled
      result.issueUrl = await this.createGitHubIssue(errorInfo);

      // Step 2: Scrape additional error logs
      await this.scrapeErrorLogs(errorInfo);

      // Step 3: Clone repo
      const { owner, repo } = this.parseRepo(errorInfo.repo);
      if (!owner || !repo) {
        throw new Error(`Invalid repository format: ${errorInfo.repo}`);
      }

      const repoUrl = `https://github.com/${owner}/${repo}.git`;
      this.log('info', `Cloning ${repoUrl} into ${workDir}...`);

      const git = simpleGit();
      await git.clone(repoUrl, workDir);

      const repoGit = simpleGit(workDir);
      await repoGit.checkout(errorInfo.branch || 'main');

      // Step 4: Create fix branch
      await repoGit.checkoutLocalBranch(branchName);
      this.log('info', `Created branch: ${branchName}`);

      // Step 5: Build and send healing request to OpenClaw
      const healingRequest = this.buildHealingRequest(errorInfo);
      let healingResponse = null;

      if (this.openClawIntegration) {
        healingResponse = await this.openClawIntegration.requestHealing(
          healingRequest,
          workDir,
          agentId || this.config.openClaw.agentId
        );
      } else {
        // Direct API call to OpenClaw endpoint
        try {
          const apiResponse = await axios.post(
            `${this.config.openClaw.endpoint}/api/heal`,
            {
              ...healingRequest,
              workDir
            },
            { timeout: 120000 }
          );
          healingResponse = apiResponse.data;
        } catch (apiErr) {
          this.log('warn', `OpenClaw API call failed: ${apiErr.message}`);
          // Use a fallback strategy: attempt simple fixes based on error type
          healingResponse = this.generateFallbackFix(errorInfo, workDir);
        }
      }

      if (healingResponse) {
        result.strategy = healingResponse.strategy || errorInfo.errorType;
        result.filesChanged = healingResponse.filesChanged || [];
      }

      // Step 6: Check if there are actual changes to commit
      const statusResult = await repoGit.status();
      const hasChanges =
        statusResult.modified.length > 0 ||
        statusResult.created.length > 0 ||
        statusResult.deleted.length > 0;

      if (!hasChanges) {
        this.log('warn', 'No changes produced by healing attempt');
        result.error = 'No changes generated';
        result.duration = Date.now() - startTime;
        return result;
      }

      result.filesChanged = [
        ...statusResult.modified,
        ...statusResult.created,
        ...statusResult.deleted
      ];

      // Step 7: Commit changes
      if (this.config.healing.autoCommit) {
        await repoGit.add('.');
        const commitMessage = [
          `fix: auto-heal ${errorInfo.errorType} error in ${errorInfo.workflow || errorInfo.platform}`,
          '',
          `Error: ${errorInfo.errorMessage.substring(0, 200)}`,
          `Platform: ${errorInfo.platform}`,
          `Signature: ${errorInfo.signature}`,
          '',
          'This commit was automatically generated by Error Auto-Healer.'
        ].join('\n');

        await repoGit.commit(commitMessage);
        this.log('info', 'Changes committed');
      }

      // Step 8: Push branch
      await repoGit.push('origin', branchName);
      this.log('info', `Branch ${branchName} pushed`);

      // Step 9: Create pull request
      if (this.config.healing.createPullRequest && this.octokit) {
        const prTitle = `[Auto-Fix] ${errorInfo.errorType}: ${errorInfo.errorMessage.substring(0, 60)}`;

        const filesChangedList = result.filesChanged
          .map((f) => `- \`${f}\``)
          .join('\n');

        const prBody = [
          '## Automated Error Fix',
          '',
          '### Error Details',
          '',
          `| Field | Value |`,
          `|-------|-------|`,
          `| **Platform** | ${errorInfo.platform} |`,
          `| **Repository** | ${errorInfo.repo} |`,
          `| **Branch** | ${errorInfo.branch || 'N/A'} |`,
          `| **Workflow** | ${errorInfo.workflow || 'N/A'} |`,
          `| **Error Type** | ${errorInfo.errorType || 'N/A'} |`,
          `| **Healing Strategy** | ${result.strategy} |`,
          `| **Signature** | \`${errorInfo.signature}\` |`,
          '',
          '### Error Message',
          '',
          '```',
          errorInfo.errorMessage.substring(0, 500),
          '```',
          '',
          '### Files Changed',
          '',
          filesChangedList || 'No files listed',
          '',
          '### Analysis',
          '',
          healingResponse && healingResponse.analysis
            ? healingResponse.analysis
            : 'Automatic fix applied based on error pattern matching.',
          '',
          result.issueUrl ? `### Related Issue\n\n${result.issueUrl}\n` : '',
          '---',
          '*This pull request was automatically created by Error Auto-Healer.*',
          '*Please review the changes carefully before merging.*'
        ].join('\n');

        try {
          const prResponse = await this.octokit.pulls.create({
            owner,
            repo,
            title: prTitle,
            body: prBody,
            head: branchName,
            base: errorInfo.branch || 'main'
          });

          result.prUrl = prResponse.data.html_url;
          const prNumber = prResponse.data.number;
          this.log('success', `Pull request created: ${result.prUrl}`);

          // Add labels
          try {
            await this.octokit.issues.addLabels({
              owner,
              repo,
              issue_number: prNumber,
              labels: this.config.github.prLabels
            });
          } catch (labelErr) {
            this.log('debug', `Failed to add PR labels: ${labelErr.message}`);
          }

          // Request reviewers
          if (this.config.github.reviewers.length > 0) {
            try {
              await this.octokit.pulls.requestReviewers({
                owner,
                repo,
                pull_number: prNumber,
                reviewers: this.config.github.reviewers
              });
              this.log('info', `Reviewers requested: ${this.config.github.reviewers.join(', ')}`);
            } catch (reviewErr) {
              this.log('debug', `Failed to request reviewers: ${reviewErr.message}`);
            }
          }

          // Step 10: Auto-merge if enabled
          await this.autoMergePullRequest(owner, repo, prNumber);
        } catch (prErr) {
          this.log('error', `Failed to create PR: ${prErr.message}`);
          result.error = `PR creation failed: ${prErr.message}`;
        }
      }

      // Step 11: Retry workflow if GitHub Actions
      if (errorInfo.platform === 'github-actions' && errorInfo.runId && this.octokit) {
        try {
          await this.octokit.actions.reRunWorkflow({
            owner,
            repo,
            run_id: parseInt(errorInfo.runId, 10)
          });
          this.log('info', `Workflow re-run triggered for run ${errorInfo.runId}`);
        } catch (rerunErr) {
          this.log('debug', `Failed to re-run workflow: ${rerunErr.message}`);
        }
      }

      // Step 12: Trigger Vercel redeploy if applicable
      if (errorInfo.platform === 'vercel') {
        const deploy = await this.triggerVercelRedeploy(errorInfo);
        if (deploy) {
          this.log('info', `Vercel redeploy triggered: ${deploy.url}`);
        }
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      // Notify Discord
      await this.notifyDiscord({
        title: 'Healing Successful',
        color: 0x00ff00,
        fields: [
          { name: 'Repository', value: errorInfo.repo || 'N/A', inline: true },
          { name: 'Platform', value: errorInfo.platform, inline: true },
          { name: 'Strategy', value: result.strategy, inline: true },
          { name: 'PR', value: result.prUrl || 'N/A', inline: false },
          { name: 'Duration', value: `${(result.duration / 1000).toFixed(1)}s`, inline: true }
        ],
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      result.success = false;
      result.error = err.message;
      result.duration = Date.now() - startTime;

      this.log('error', `Healing failed: ${err.message}`);

      await this.notifyDiscord({
        title: 'Healing Failed',
        color: 0xff0000,
        fields: [
          { name: 'Repository', value: errorInfo.repo || 'N/A', inline: true },
          { name: 'Platform', value: errorInfo.platform, inline: true },
          { name: 'Error', value: err.message.substring(0, 200), inline: false }
        ],
        timestamp: new Date().toISOString()
      });
    } finally {
      // Clean up work directory
      try {
        if (await fs.pathExists(workDir)) {
          await fs.remove(workDir);
          this.log('debug', `Cleaned up work directory: ${workDir}`);
        }
      } catch (cleanupErr) {
        this.log('warn', `Failed to clean up work dir: ${cleanupErr.message}`);
      }
    }

    return result;
  }

  generateFallbackFix(errorInfo, workDir) {
    // Simple fallback when OpenClaw is unavailable
    return {
      strategy: `fallback-${errorInfo.errorType}`,
      filesChanged: [],
      analysis: 'Fallback strategy applied. OpenClaw agent was unavailable.'
    };
  }

  // =========================================================================
  // Main Processing Workflow
  // =========================================================================

  async processError(errorInfo) {
    if (!errorInfo || !errorInfo.signature) {
      this.log('warn', 'Invalid error info received, skipping');
      return null;
    }

    this.log('info', `Processing error: ${errorInfo.platform} - ${errorInfo.errorMessage.substring(0, 80)}`);

    // Safety check: cooldown
    if (await this.hasRecentHeal(errorInfo.signature)) {
      this.log('warn', `Error ${errorInfo.signature} is in cooldown or max attempts reached. Skipping.`);
      return null;
    }

    // Safety check: concurrency limit
    if (this.activeHeals >= this.config.healing.maxConcurrentHeals) {
      this.log('warn', `Max concurrent heals reached (${this.activeHeals}). Queuing.`);
      return null;
    }

    this.activeHeals++;

    try {
      // Notify Discord that healing started
      await this.notifyDiscord({
        title: 'Healing Started',
        color: 0xffaa00,
        fields: [
          { name: 'Repository', value: errorInfo.repo || 'N/A', inline: true },
          { name: 'Platform', value: errorInfo.platform, inline: true },
          { name: 'Error Type', value: errorInfo.errorType || 'N/A', inline: true },
          { name: 'Message', value: errorInfo.errorMessage.substring(0, 200), inline: false }
        ],
        timestamp: new Date().toISOString()
      });

      // Execute healing
      const result = await this.executeHealing(errorInfo);

      // Record result
      await this.recordHeal(errorInfo, result);

      return result;
    } catch (err) {
      this.log('error', `processError failed: ${err.message}`);

      await this.recordHeal(errorInfo, {
        success: false,
        error: err.message,
        duration: 0
      });

      return null;
    } finally {
      this.activeHeals--;
    }
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
    console.log('  Error Auto-Healer - Status');
    console.log('==========================================\n');
    console.log(`  Running:            ${this.isRunning ? 'Yes' : 'No'}`);
    console.log(`  Uptime:             ${uptimeStr}`);
    console.log(`  Active heals:       ${this.activeHeals}`);
    console.log(`  Total processed:    ${this.totalProcessed}`);
    console.log(`  Total healed:       ${this.totalHealed}`);
    console.log(`  Total failed:       ${this.totalFailed}`);
    console.log(`  History entries:    ${this.history.length}`);
    console.log(`  Cooldowns active:   ${this.recentHeals.size}`);
    console.log('');
    console.log('  Configuration:');
    console.log(`    Polling interval:   ${this.config.polling.intervalMs}ms`);
    console.log(`    Cooldown:           ${this.config.healing.cooldownMs}ms`);
    console.log(`    Max attempts/error: ${this.config.healing.maxAttemptsPerError}`);
    console.log(`    Max concurrent:     ${this.config.healing.maxConcurrentHeals}`);
    console.log(`    Auto PR:            ${this.config.healing.createPullRequest}`);
    console.log(`    Auto issue:         ${this.config.github.autoCreateIssue}`);
    console.log(`    Auto merge:         ${this.config.github.autoMerge}`);
    console.log(`    Vercel redeploy:    ${this.config.vercel.autoRedeploy}`);
    console.log(`    Discord webhook:    ${this.config.discord.webhookUrl ? 'Configured' : 'Not set'}`);
    console.log(`    GitHub token:       ${this.config.github.token ? 'Configured' : 'Not set'}`);
    console.log(`    Vercel token:       ${this.config.vercel.token ? 'Configured' : 'Not set'}`);
    console.log('\n==========================================\n');
  }

  async showHistory() {
    const records = this.history.slice(-20).reverse();

    console.log('\n==========================================');
    console.log('  Error Auto-Healer - Recent History');
    console.log('==========================================\n');

    if (records.length === 0) {
      console.log('  No healing history found.\n');
      return;
    }

    for (const record of records) {
      const statusIcon = record.status === 'success' ? '[OK]' : '[FAIL]';
      const duration = record.duration ? `${(record.duration / 1000).toFixed(1)}s` : 'N/A';

      console.log(`  ${statusIcon} ${record.timestamp}`);
      console.log(`    Repo:     ${record.repo}`);
      console.log(`    Platform: ${record.platform}`);
      console.log(`    Strategy: ${record.healingStrategy || 'N/A'}`);
      console.log(`    Duration: ${duration}`);
      if (record.prUrl) {
        console.log(`    PR:       ${record.prUrl}`);
      }
      if (record.issueUrl) {
        console.log(`    Issue:    ${record.issueUrl}`);
      }
      if (record.error) {
        console.log(`    Error:    ${record.error}`);
      }
      console.log('');
    }

    console.log(`  Showing ${records.length} of ${this.history.length} total entries.`);
    console.log('\n==========================================\n');
  }

  // =========================================================================
  // Continuous Monitoring
  // =========================================================================

  async startMonitoring() {
    this.isRunning = true;
    this.log('info', 'Starting continuous monitoring...');
    this.log('info', `Polling interval: ${this.config.polling.intervalMs}ms`);

    while (this.isRunning) {
      try {
        await this.runOnce();
      } catch (err) {
        this.log('error', `Monitoring cycle error: ${err.message}`);
      }

      await this.sleep(this.config.polling.intervalMs);
    }
  }

  async runOnce() {
    this.log('debug', 'Running check cycle...');

    if (!this.monitor) {
      this.log('warn', 'Gmail monitor not available. Cannot check for errors.');
      return;
    }

    try {
      const emails = await this.monitor.checkForErrors();

      if (!emails || emails.length === 0) {
        this.log('debug', 'No new error emails found');
        return;
      }

      this.log('info', `Found ${emails.length} potential error emails`);

      for (const email of emails) {
        const errorInfo = this.parseError(email);

        if (errorInfo) {
          this.log('info', `Detected ${errorInfo.platform} error in ${errorInfo.repo}`);
          await this.processError(errorInfo);
        }
      }
    } catch (err) {
      this.log('error', `Check cycle failed: ${err.message}`);
    }
  }

  stop() {
    this.isRunning = false;
    this.log('info', 'Stopping monitoring...');

    if (this.db) {
      try {
        this.db.close();
      } catch (err) {
        // Ignore close errors
      }
    }
  }

  // =========================================================================
  // Test
  // =========================================================================

  async runTest() {
    this.log('info', 'Running test with sample error data...');

    const sampleEmail = {
      id: 'test-email-001',
      subject: 'Run failed: myorg/myapp - CI Build (main)',
      from: 'notifications@github.com',
      body: [
        'Repository: myorg/myapp',
        'Branch: main',
        'Workflow: CI Build',
        'Run ID: 12345678',
        '',
        'Error: Module not found: Cannot resolve "./utils/helpers"',
        '',
        'npm test failed with exit code 1',
        '',
        'View details: https://github.com/myorg/myapp/actions/runs/12345678'
      ].join('\n')
    };

    console.log('\n--- Test Email ---');
    console.log(`  Subject: ${sampleEmail.subject}`);
    console.log(`  From: ${sampleEmail.from}`);
    console.log('');

    const errorInfo = this.parseError(sampleEmail);

    if (errorInfo) {
      console.log('--- Parsed Error Info ---');
      console.log(`  Platform:      ${errorInfo.platform}`);
      console.log(`  Repo:          ${errorInfo.repo}`);
      console.log(`  Branch:        ${errorInfo.branch}`);
      console.log(`  Workflow:      ${errorInfo.workflow}`);
      console.log(`  Error Type:    ${errorInfo.errorType}`);
      console.log(`  Error Message: ${errorInfo.errorMessage}`);
      console.log(`  Run ID:        ${errorInfo.runId}`);
      console.log(`  Signature:     ${errorInfo.signature}`);
      console.log('');

      const request = this.buildHealingRequest(errorInfo);
      console.log('--- Healing Request ---');
      console.log(JSON.stringify(request, null, 2));
      console.log('');

      console.log('Test completed successfully. Error was parsed and healing request was built.');
      console.log('(No actual healing was performed in test mode.)');
    } else {
      console.log('Test FAILED: Could not parse error from sample email.');
    }

    console.log('');
  }

  // =========================================================================
  // Reset
  // =========================================================================

  async reset() {
    this.log('info', 'Resetting healing history and cooldowns...');

    this.history = [];
    this.recentHeals.clear();
    this.totalProcessed = 0;
    this.totalHealed = 0;
    this.totalFailed = 0;

    // Clear JSON history
    await this.saveHistory();

    // Clear database
    if (this.db) {
      try {
        this.db.exec('DELETE FROM heal_history');
        this.log('info', 'Database cleared');
      } catch (err) {
        this.log('warn', `Failed to clear database: ${err.message}`);
      }
    }

    // Clear log file
    try {
      await fs.writeFile(LOG_PATH, '');
    } catch (err) {
      // Ignore
    }

    console.log('');
    console.log('  History, cooldowns, and logs have been reset.');
    console.log('');
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
  console.log('Error Auto-Healer - Automated CI/CD Error Detection & Healing');
  console.log('');
  console.log('Usage: node healer.js <command>');
  console.log('');
  console.log('Commands:');
  console.log('  start      Start continuous monitoring for CI/CD errors');
  console.log('  once       Run a single check cycle');
  console.log('  status     Show current healer status and configuration');
  console.log('  history    Show recent healing history');
  console.log('  analyze    Analyze error history for patterns and recommendations');
  console.log('  test       Run a test with sample error data');
  console.log('  reset      Reset healing history, cooldowns, and logs');
  console.log('');
  console.log('Configuration:');
  console.log(`  Config file: ${CONFIG_PATH}`);
  console.log(`  History:     ${HISTORY_PATH}`);
  console.log(`  Database:    ${DB_PATH}`);
  console.log(`  Logs:        ${LOG_PATH}`);
  console.log('');
  console.log('Examples:');
  console.log('  node healer.js start');
  console.log('  node healer.js status');
  console.log('  node healer.js analyze');
  console.log('  node healer.js test');
  console.log('');
}

async function main() {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const healer = new ErrorAutoHealer();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Shutting down gracefully...');
    healer.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM. Shutting down gracefully...');
    healer.stop();
    process.exit(0);
  });

  try {
    await healer.init();

    switch (command) {
      case 'start':
        await healer.startMonitoring();
        break;

      case 'once':
        await healer.runOnce();
        break;

      case 'status':
        await healer.showStatus();
        break;

      case 'history':
        await healer.showHistory();
        break;

      case 'analyze':
        await healer.analyzeHistory();
        break;

      case 'test':
        await healer.runTest();
        break;

      case 'reset':
        await healer.reset();
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
module.exports = { ErrorAutoHealer };

// Run if executed directly
if (require.main === module) {
  main();
}
