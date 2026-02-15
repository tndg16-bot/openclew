'use strict';

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const LOG_PATH = path.join(__dirname, '..', 'logs', 'github-api-errors.log');

/**
 * GitHub API Error Monitor
 * Monitors GitHub API errors (401, 403, 429, 500, etc.) from logs and API calls
 */
class GitHubApiMonitor {
  constructor(config) {
    this.config = config;
    this.octokit = null;
    this.errorPatterns = [
      {
        pattern: /401/gi,
        type: 'authentication',
        severity: 'critical',
        message: 'Authentication failed - token may have expired'
      },
      {
        pattern: /403/gi,
        type: 'forbidden',
        severity: 'critical',
        message: 'Access forbidden - insufficient permissions or rate limit exceeded'
      },
      {
        pattern: /429/gi,
        type: 'rate_limit',
        severity: 'warning',
        message: 'Rate limit exceeded - API quota exhausted'
      },
      {
        pattern: /500/gi,
        type: 'server_error',
        severity: 'critical',
        message: 'GitHub API server error'
      },
      {
        pattern: /502|503|504/gi,
        type: 'service_unavailable',
        severity: 'warning',
        message: 'GitHub API service temporarily unavailable'
      },
      {
        pattern: /abuse/gi,
        type: 'abuse_detection',
        severity: 'critical',
        message: 'Abuse detection triggered - API access restricted'
      }
    ];
    this.recentErrors = [];
  }

  /**
   * Initialize GitHub API client
   */
  async init() {
    try {
      const token = this.config?.github?.token || process.env.GITHUB_TOKEN;

      if (!token) {
        throw new Error('GitHub token not found in config or environment');
      }

      this.octokit = new Octokit({ auth: token });
      console.log('[GitHubApiMonitor] Initialized successfully');
      return true;
    } catch (err) {
      console.error('[GitHubApiMonitor] Initialization failed:', err.message);
      return false;
    }
  }

  /**
   * Check log files for GitHub API errors
   */
  async checkLogFiles() {
    if (!fs.existsSync(LOG_PATH)) {
      return [];
    }

    try {
      const logContent = fs.readFileSync(LOG_PATH, 'utf8');
      const lines = logContent.split('\n');
      const errors = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        for (const pattern of this.errorPatterns) {
          if (pattern.pattern.test(line)) {
            const error = this.parseLogLine(line, pattern);
            if (error && !this.isDuplicate(error)) {
              errors.push(error);
              this.recentErrors.push(error);
            }
          }
        }
      }

      return errors;
    } catch (err) {
      console.error('[GitHubApiMonitor] Error checking log files:', err.message);
      return [];
    }
  }

  /**
   * Parse a log line and extract error details
   */
  parseLogLine(line, pattern) {
    const timestamp = this.extractTimestamp(line);
    const repoMatch = line.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
    const repo = repoMatch ? repoMatch[1] : 'unknown';

    return {
      platform: 'github-api',
      type: pattern.type,
      severity: pattern.severity,
      message: pattern.message,
      repo,
      timestamp: timestamp || new Date().toISOString(),
      raw: line,
      signature: this.generateSignature(pattern.type, repo)
    };
  }

  /**
   * Extract timestamp from log line
   */
  extractTimestamp(line) {
    const timestampMatch = line.match(/\[?(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})\]?/);
    if (timestampMatch) {
      return timestampMatch[1];
    }
    return null;
  }

  /**
   * Generate unique signature for error deduplication
   */
  generateSignature(type, repo) {
    const hash = require('crypto')
      .createHash('md5')
      .update(`${type}:${repo}`)
      .digest('hex')
      .substring(0, 16);
    return `github-api-${type}-${hash}`;
  }

  /**
   * Check if error is duplicate (recent error with same signature)
   */
  isDuplicate(error) {
    const duplicate = this.recentErrors.find(e =>
      e.signature === error.signature &&
      Date.now() - new Date(e.timestamp).getTime() < 3600000 // 1 hour
    );
    return !!duplicate;
  }

  /**
   * Test GitHub API connection and detect errors
   */
  async testConnection() {
    if (!this.octokit) {
      const initialized = await this.init();
      if (!initialized) {
        return {
          success: false,
          error: 'Failed to initialize GitHub API client'
        };
      }
    }

    try {
      // Test API call - get authenticated user
      await this.octokit.users.getAuthenticated();
      return {
        success: true,
        message: 'GitHub API connection successful'
      };
    } catch (err) {
      const errorInfo = this.classifyApiError(err);
      return {
        success: false,
        error: err.message,
        errorInfo
      };
    }
  }

  /**
   * Check GitHub API rate limits
   */
  async checkRateLimit() {
    if (!this.octokit) {
      await this.init();
    }

    try {
      const response = await this.octokit.rateLimit.get();
      const { core, graphql } = response.data.resources;

      return {
        success: true,
        core: {
          limit: core.limit,
          remaining: core.remaining,
          reset: new Date(core.reset * 1000).toISOString(),
          percentage: ((core.remaining / core.limit) * 100).toFixed(2)
        },
        graphql: {
          limit: graphql.limit,
          remaining: graphql.remaining,
          reset: new Date(graphql.reset * 1000).toISOString(),
          percentage: ((graphql.remaining / graphql.limit) * 100).toFixed(2)
        }
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Classify API error based on response code and message
   */
  classifyApiError(err) {
    const code = err.status || err.response?.status;
    const message = err.message || '';

    for (const pattern of this.errorPatterns) {
      if (pattern.pattern.test(code) || pattern.pattern.test(message)) {
        return {
          type: pattern.type,
          severity: pattern.severity,
          message: pattern.message,
          code,
          raw: message
        };
      }
    }

    return {
      type: 'unknown',
      severity: 'warning',
      message: 'Unknown GitHub API error',
      code,
      raw: message
    };
  }

  /**
   * Monitor for errors (combined log check and API test)
   */
  async monitor() {
    console.log('[GitHubApiMonitor] Checking for GitHub API errors...');

    const errors = [];

    // Check log files
    const logErrors = await this.checkLogFiles();
    errors.push(...logErrors);

    // Test API connection
    const connectionResult = await this.testConnection();
    if (!connectionResult.success && connectionResult.errorInfo) {
      const apiError = {
        platform: 'github-api',
        type: connectionResult.errorInfo.type,
        severity: connectionResult.errorInfo.severity,
        message: connectionResult.errorInfo.message,
        timestamp: new Date().toISOString(),
        signature: this.generateSignature(connectionResult.errorInfo.type, 'connection')
      };

      if (!this.isDuplicate(apiError)) {
        errors.push(apiError);
        this.recentErrors.push(apiError);
      }
    }

    // Check rate limits
    const rateLimitResult = await this.checkRateLimit();
    if (rateLimitResult.success) {
      const corePercentage = parseFloat(rateLimitResult.core.percentage);
      const graphqlPercentage = parseFloat(rateLimitResult.graphql.percentage);

      // Warn if rate limit is below 10%
      if (corePercentage < 10 || graphqlPercentage < 10) {
        const rateLimitError = {
          platform: 'github-api',
          type: 'rate_limit_warning',
          severity: 'warning',
          message: `Rate limit running low - Core: ${corePercentage}%, GraphQL: ${graphqlPercentage}%`,
          timestamp: new Date().toISOString(),
          signature: this.generateSignature('rate_limit_warning', 'global')
        };

        if (!this.isDuplicate(rateLimitError)) {
          errors.push(rateLimitError);
          this.recentErrors.push(rateLimitError);
        }
      }
    }

    // Clean old errors (older than 24 hours)
    this.cleanOldErrors();

    console.log(`[GitHubApiMonitor] Found ${errors.length} new error(s)`);
    return errors;
  }

  /**
   * Clean errors older than 24 hours
   */
  cleanOldErrors() {
    const now = Date.now();
    this.recentErrors = this.recentErrors.filter(e =>
      now - new Date(e.timestamp).getTime() < 86400000 // 24 hours
    );
  }

  /**
   * Get error statistics
   */
  getStats() {
    const byType = {};
    const bySeverity = {};
    const byRepo = {};

    for (const error of this.recentErrors) {
      byType[error.type] = (byType[error.type] || 0) + 1;
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;

      if (error.repo) {
        byRepo[error.repo] = (byRepo[error.repo] || 0) + 1;
      }
    }

    return {
      total: this.recentErrors.length,
      byType,
      bySeverity,
      byRepo
    };
  }
}

module.exports = GitHubApiMonitor;
