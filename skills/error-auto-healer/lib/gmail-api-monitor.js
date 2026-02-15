'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const TOKEN_PATH = path.join(__dirname, '..', 'gmail-token.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'gmail-credentials.json');
const LOG_PATH = path.join(__dirname, '..', 'logs', 'gmail-api-errors.log');

/**
 * Gmail API Error Monitor
 * Monitors Gmail API errors (401, 429, 500, etc.) from logs and API calls
 */
class GmailApiMonitor {
  constructor(config) {
    this.config = config;
    this.gmail = null;
    this.auth = null;
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
        message: 'Access forbidden - insufficient permissions'
      },
      {
        pattern: /429/gi,
        type: 'rate_limit',
        severity: 'warning',
        message: 'Rate limit exceeded - API quota exceeded'
      },
      {
        pattern: /500/gi,
        type: 'server_error',
        severity: 'critical',
        message: 'Gmail API server error'
      },
      {
        pattern: /502|503|504/gi,
        type: 'service_unavailable',
        severity: 'warning',
        message: 'Gmail API service temporarily unavailable'
      }
    ];
    this.recentErrors = [];
  }

  /**
   * Initialize Gmail API client
   */
  async init() {
    try {
      if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error('Gmail credentials not found');
      }

      if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error('Gmail token not found');
      }

      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || credentials;
      const redirectUri = (redirect_uris && redirect_uris[0]) || 'http://localhost:3000/callback';

      this.auth = new google.auth.OAuth2(client_id, client_secret, redirectUri);
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      this.auth.setCredentials(tokens);

      this.gmail = google.gmail({ version: 'v1', auth: this.auth });
      console.log('[GmailApiMonitor] Initialized successfully');
      return true;
    } catch (err) {
      console.error('[GmailApiMonitor] Initialization failed:', err.message);
      return false;
    }
  }

  /**
   * Check log files for Gmail API errors
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
      console.error('[GmailApiMonitor] Error checking log files:', err.message);
      return [];
    }
  }

  /**
   * Parse a log line and extract error details
   */
  parseLogLine(line, pattern) {
    const timestamp = this.extractTimestamp(line);
    const message = pattern.message || 'Unknown error';

    return {
      platform: 'gmail-api',
      type: pattern.type,
      severity: pattern.severity,
      message,
      timestamp: timestamp || new Date().toISOString(),
      raw: line,
      signature: this.generateSignature(pattern.type, message)
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
  generateSignature(type, message) {
    const hash = require('crypto')
      .createHash('md5')
      .update(`${type}:${message}`)
      .digest('hex')
      .substring(0, 16);
    return `gmail-api-${type}-${hash}`;
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
   * Test Gmail API connection and detect errors
   */
  async testConnection() {
    if (!this.gmail) {
      const initialized = await this.init();
      if (!initialized) {
        return {
          success: false,
          error: 'Failed to initialize Gmail API client'
        };
      }
    }

    try {
      // Test API call
      await this.gmail.users.getProfile({ userId: 'me' });
      return {
        success: true,
        message: 'Gmail API connection successful'
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
   * Classify API error based on response code and message
   */
  classifyApiError(err) {
    const code = err.code || err.response?.status;
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
      message: 'Unknown Gmail API error',
      code,
      raw: message
    };
  }

  /**
   * Monitor for errors (combined log check and API test)
   */
  async monitor() {
    console.log('[GmailApiMonitor] Checking for Gmail API errors...');

    const errors = [];

    // Check log files
    const logErrors = await this.checkLogFiles();
    errors.push(...logErrors);

    // Test API connection
    const connectionResult = await this.testConnection();
    if (!connectionResult.success && connectionResult.errorInfo) {
      const apiError = {
        platform: 'gmail-api',
        type: connectionResult.errorInfo.type,
        severity: connectionResult.errorInfo.severity,
        message: connectionResult.errorInfo.message,
        timestamp: new Date().toISOString(),
        signature: this.generateSignature(connectionResult.errorInfo.type, connectionResult.errorInfo.message)
      };

      if (!this.isDuplicate(apiError)) {
        errors.push(apiError);
        this.recentErrors.push(apiError);
      }
    }

    // Clean old errors (older than 24 hours)
    this.cleanOldErrors();

    console.log(`[GmailApiMonitor] Found ${errors.length} new error(s)`);
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

    for (const error of this.recentErrors) {
      byType[error.type] = (byType[error.type] || 0) + 1;
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
    }

    return {
      total: this.recentErrors.length,
      byType,
      bySeverity
    };
  }
}

module.exports = GmailApiMonitor;
