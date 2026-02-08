'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const TOKEN_PATH = path.join(__dirname, 'gmail-token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'gmail-credentials.json');

let healer;
try {
  healer = require('./healer');
} catch (e) {
  healer = null;
}

class GmailMonitor {
  constructor() {
    this.config = this._loadConfig();
    this.auth = null;
    this.gmail = null;
    this.intervalHandle = null;
    this.isRunning = false;
    this.lastCheckTime = null;
    this.processedIds = new Set();
  }

  // ── Config & Auth ──────────────────────────────────────────────

  _loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error('[Monitor] config.json not found:', CONFIG_PATH);
      console.error('  Copy config.template.json to config.json and fill in your values.');
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }

  _getAuthClient() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error('[Monitor] Gmail credentials not found:', CREDENTIALS_PATH);
      console.error('Setup instructions:');
      console.error('  1. Go to Google Cloud Console and enable the Gmail API');
      console.error('  2. Create OAuth 2.0 credentials (Desktop app)');
      console.error('  3. Download and save to:', CREDENTIALS_PATH);
      console.error('  4. Run: node monitor.js --authorize');
      process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || credentials;
    const redirectUri = (redirect_uris && redirect_uris[0]) || 'http://localhost:3000/callback';

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oauth2Client.setCredentials(tokens);
    } else {
      console.error('[Monitor] No token found. Please authenticate first.');
      console.error('Run: node monitor.js --authorize');
      process.exit(1);
    }

    // Auto-save refreshed tokens
    oauth2Client.on('tokens', (tokens) => {
      try {
        let existing = {};
        if (fs.existsSync(TOKEN_PATH)) {
          existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        }
        const updated = { ...existing, ...tokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
        console.log('[Monitor] Token refreshed and saved.');
      } catch (err) {
        console.error('[Monitor] Warning: Could not save refreshed token:', err.message);
      }
    });

    return oauth2Client;
  }

  _initGmail() {
    this.auth = this._getAuthClient();
    this.gmail = google.gmail({ version: 'v1', auth: this.auth });
  }

  // ── Query Building ─────────────────────────────────────────────

  buildQuery() {
    const gmailConfig = this.config.gmail || {};
    const filters = gmailConfig.filters || [];
    const enabledFilters = filters.filter(f => f.enabled !== false);

    if (enabledFilters.length === 0) {
      // Default: look for error notification emails
      return 'is:unread subject:(failed OR failure OR error) from:(notifications@github.com OR notifications@vercel.com)';
    }

    const queryParts = [];
    for (const filter of enabledFilters) {
      const parts = [];
      if (filter.from) {
        parts.push(`from:${filter.from}`);
      }
      if (filter.subjectContains && filter.subjectContains.length > 0) {
        const subjects = filter.subjectContains.map(s => `"${s}"`).join(' OR ');
        parts.push(`subject:(${subjects})`);
      }
      if (parts.length > 0) {
        queryParts.push(`(${parts.join(' ')})`);
      }
    }

    const baseQuery = queryParts.length > 0 ? queryParts.join(' OR ') : '';
    const labelQuery = this.config.monitoring?.processedLabel
      ? ` -label:${this.config.monitoring.processedLabel}`
      : '';

    return `is:unread ${baseQuery}${labelQuery}`.trim();
  }

  // ── Email Processing ───────────────────────────────────────────

  async checkEmails(force = false) {
    if (!this.gmail) {
      this._initGmail();
    }

    const query = this.buildQuery();
    console.log(`[Monitor] Checking emails... query: ${query}`);

    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 10,
      });

      const messages = res.data.messages || [];
      if (messages.length === 0) {
        console.log('[Monitor] No new error emails found.');
        this.lastCheckTime = new Date().toISOString();
        return [];
      }

      console.log(`[Monitor] Found ${messages.length} error email(s).`);
      const results = [];

      for (const msg of messages) {
        if (!force && this.processedIds.has(msg.id)) {
          console.log(`[Monitor] Skipping already-processed message: ${msg.id}`);
          continue;
        }

        try {
          const result = await this.processEmail(msg.id);
          if (result) {
            results.push(result);
          }
        } catch (err) {
          console.error(`[Monitor] Error processing message ${msg.id}:`, err.message);
        }
      }

      this.lastCheckTime = new Date().toISOString();
      return results;
    } catch (error) {
      if (error.code === 401 || error.code === 403) {
        console.error('[Monitor] Authentication failed or expired.');
        console.error('Please re-authenticate: node monitor.js --authorize');
      } else if (error.code === 429) {
        console.error('[Monitor] Gmail API rate limit exceeded. Will retry next cycle.');
      } else {
        console.error('[Monitor] Error checking emails:', error.message);
      }
      return [];
    }
  }

  async processEmail(messageId) {
    console.log(`[Monitor] Processing message: ${messageId}`);

    const res = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const msg = res.data;
    const headers = msg.payload.headers || [];

    const from = this._getHeader(headers, 'From');
    const subject = this._getHeader(headers, 'Subject');
    const date = this._getHeader(headers, 'Date');
    const body = this._extractBody(msg.payload);

    console.log(`[Monitor] Email from: ${from}`);
    console.log(`[Monitor] Subject: ${subject}`);

    const emailData = {
      messageId,
      from,
      subject,
      date,
      body,
      snippet: msg.snippet || '',
    };

    // Pass to healer for error parsing
    if (healer && typeof healer.parseError === 'function') {
      try {
        const errorInfo = healer.parseError(emailData);
        if (errorInfo) {
          emailData.errorInfo = errorInfo;
          console.log(`[Monitor] Error parsed: ${errorInfo.type} in ${errorInfo.repo || errorInfo.project}`);
        } else {
          console.log('[Monitor] No actionable error found in this email.');
        }
      } catch (err) {
        console.error('[Monitor] Error parsing email content:', err.message);
      }
    } else {
      console.log('[Monitor] Healer not available; email queued for manual review.');
    }

    // Mark as processed
    await this.markAsProcessed(messageId);

    return emailData;
  }

  async markAsProcessed(messageId) {
    this.processedIds.add(messageId);

    const processedLabel = this.config.monitoring?.processedLabel;
    if (!processedLabel) return;

    try {
      // Try to find or create the label
      const labelId = await this._getOrCreateLabel(processedLabel);
      if (labelId) {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: [labelId],
            removeLabelIds: ['UNREAD'],
          },
        });
        console.log(`[Monitor] Marked message ${messageId} as processed.`);
      }
    } catch (err) {
      console.error(`[Monitor] Could not label message ${messageId}:`, err.message);
    }
  }

  async _getOrCreateLabel(labelName) {
    try {
      const res = await this.gmail.users.labels.list({ userId: 'me' });
      const labels = res.data.labels || [];
      const existing = labels.find(l => l.name === labelName);
      if (existing) return existing.id;

      const created = await this.gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      console.log(`[Monitor] Created label: ${labelName}`);
      return created.data.id;
    } catch (err) {
      console.error(`[Monitor] Could not get/create label "${labelName}":`, err.message);
      return null;
    }
  }

  // ── Header / Body Helpers ──────────────────────────────────────

  _getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
  }

  _extractBody(payload) {
    if (payload.body && payload.body.data) {
      const decoded = this._decodeBase64Url(payload.body.data);
      if ((payload.mimeType || '') === 'text/html') {
        return this._stripHtml(decoded);
      }
      return decoded;
    }

    if (payload.parts && payload.parts.length > 0) {
      let textPlain = '';
      let textHtml = '';

      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          textPlain = this._decodeBase64Url(part.body.data);
        } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
          textHtml = this._decodeBase64Url(part.body.data);
        } else if (part.parts) {
          const nested = this._extractBody(part);
          if (nested) return nested;
        }
      }

      if (textPlain) return textPlain;
      if (textHtml) return this._stripHtml(textHtml);
    }

    return '';
  }

  _decodeBase64Url(encoded) {
    if (!encoded) return '';
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  _stripHtml(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ── Start / Stop ───────────────────────────────────────────────

  start() {
    if (this.isRunning) {
      console.log('[Monitor] Already running.');
      return;
    }

    this._initGmail();
    const intervalMinutes = this.config.monitoring?.intervalMinutes || 2;
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[Monitor] Starting email monitor (interval: ${intervalMinutes} min)...`);
    this.isRunning = true;

    // Initial check
    this.checkEmails().catch(err => {
      console.error('[Monitor] Initial check failed:', err.message);
    });

    // Schedule recurring checks
    this.intervalHandle = setInterval(() => {
      this.checkEmails().catch(err => {
        console.error('[Monitor] Scheduled check failed:', err.message);
      });
    }, intervalMs);

    console.log('[Monitor] Monitor started. Press Ctrl+C to stop.');
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    console.log('[Monitor] Monitor stopped.');
  }

  // ── OAuth Authorization Flow ───────────────────────────────────

  async authorize() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error('[Monitor] Gmail credentials not found:', CREDENTIALS_PATH);
      console.error('Download OAuth credentials from Google Cloud Console first.');
      process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || credentials;
    const redirectUri = (redirect_uris && redirect_uris[0]) || 'http://localhost:3000/callback';

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

    const SCOPES = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.labels',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('[Monitor] Authorize this app by visiting this URL:');
    console.log('');
    console.log(authUrl);
    console.log('');
    console.log('After authorization, you will receive a code.');
    console.log('Run: node monitor.js --authorize --code YOUR_CODE');
  }

  async exchangeCode(code) {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error('[Monitor] Gmail credentials not found:', CREDENTIALS_PATH);
      process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web || credentials;
    const redirectUri = (redirect_uris && redirect_uris[0]) || 'http://localhost:3000/callback';

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

    try {
      const { tokens } = await oauth2Client.getToken(code);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('[Monitor] Token saved to:', TOKEN_PATH);
      console.log('[Monitor] Authentication successful!');
    } catch (err) {
      console.error('[Monitor] Error exchanging code for tokens:', err.message);
      process.exit(1);
    }
  }
}

// ── CLI Entry Point ────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const monitor = new GmailMonitor();

  if (command === '--authorize' || command === 'authorize') {
    const codeIndex = args.indexOf('--code');
    if (codeIndex !== -1 && args[codeIndex + 1]) {
      await monitor.exchangeCode(args[codeIndex + 1]);
    } else {
      await monitor.authorize();
    }
    return;
  }

  if (command === 'check') {
    const force = args.includes('--force');
    const results = await monitor.checkEmails(force);
    console.log(`[Monitor] Processed ${results.length} email(s).`);
    return;
  }

  if (command === 'start' || !command) {
    monitor.start();

    // Graceful shutdown
    const shutdown = () => {
      console.log('\n[Monitor] Shutting down...');
      monitor.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  console.log('Gmail Monitor - Error Auto Healer');
  console.log('');
  console.log('Usage: node monitor.js <command>');
  console.log('');
  console.log('Commands:');
  console.log('  start              Start monitoring (default)');
  console.log('  check [--force]    Check emails once');
  console.log('  --authorize        Start OAuth authorization flow');
  console.log('  --authorize --code CODE  Exchange authorization code for token');
}

module.exports = GmailMonitor;

if (require.main === module) {
  main().catch(err => {
    console.error('[Monitor] Fatal error:', err.message);
    process.exit(1);
  });
}
