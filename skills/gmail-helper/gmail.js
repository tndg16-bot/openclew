const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CREDENTIALS_PATH = path.join(HOME, '.clawdbot', 'credentials', 'google.json');
const TOKEN_PATH = path.join(HOME, '.clawdbot', 'credentials', 'token.json');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Load OAuth2 credentials and create an authenticated Gmail client.
 */
function getAuthClient() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log('Error: Google credentials not found.');
        console.log('Setup instructions:');
        console.log('  1. Go to Google Cloud Console and enable the Gmail API');
        console.log('  2. Create OAuth 2.0 credentials (Desktop app)');
        console.log('  3. Save credentials to: ' + CREDENTIALS_PATH);
        console.log('     Format: { "client_id": "...", "client_secret": "...", "refresh_token": "..." }');
        console.log('  4. Run: node scripts/gmail-oauth.js');
        process.exit(1);
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

    if (!credentials.client_id || !credentials.client_secret) {
        console.log('Error: Invalid credentials file. Must contain client_id and client_secret.');
        console.log('File: ' + CREDENTIALS_PATH);
        process.exit(1);
    }

    const oauth2Client = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret,
        'http://localhost:3000/callback'
    );

    // Load saved tokens
    if (fs.existsSync(TOKEN_PATH)) {
        const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oauth2Client.setCredentials(tokens);
    } else if (credentials.refresh_token) {
        oauth2Client.setCredentials({ refresh_token: credentials.refresh_token });
    } else {
        console.log('Error: No token found. Please authenticate first.');
        console.log('Run: node scripts/gmail-oauth.js');
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
        } catch (err) {
            console.error('Warning: Could not save refreshed token:', err.message);
        }
    });

    return oauth2Client;
}

/**
 * Execute a Gmail API call with retry logic for rate limiting (429).
 */
async function withRetry(fn) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error.code === 429 && attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                console.log(`Rate limited. Retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}

/**
 * Handle common API errors with helpful messages.
 */
function handleApiError(error) {
    if (error.code === 401 || error.code === 403) {
        console.error('Error: Authentication failed or expired.');
        console.error('Please re-authenticate by running: node scripts/gmail-oauth.js');
    } else if (error.code === 429) {
        console.error('Error: Gmail API rate limit exceeded. Please try again later.');
    } else {
        console.error('Error:', error.message);
    }
    process.exit(1);
}

/**
 * Extract a specific header value from a Gmail message payload.
 */
function getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html) {
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

/**
 * Decode a base64url-encoded string to UTF-8 text.
 */
function decodeBase64Url(encoded) {
    if (!encoded) return '';
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Extract the body text from a Gmail message payload.
 * Prefers text/plain over text/html.
 */
function extractBody(payload) {
    // Simple message with body data directly on payload
    if (payload.body && payload.body.data) {
        const mimeType = payload.mimeType || '';
        const decoded = decodeBase64Url(payload.body.data);
        if (mimeType === 'text/html') {
            return stripHtml(decoded);
        }
        return decoded;
    }

    // Multipart message - search parts recursively
    if (payload.parts && payload.parts.length > 0) {
        let textPlain = '';
        let textHtml = '';

        for (const part of payload.parts) {
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                textPlain = decodeBase64Url(part.body.data);
            } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
                textHtml = decodeBase64Url(part.body.data);
            } else if (part.parts) {
                // Nested multipart (e.g., multipart/alternative inside multipart/mixed)
                const nested = extractBody(part);
                if (nested) return nested;
            }
        }

        if (textPlain) return textPlain;
        if (textHtml) return stripHtml(textHtml);
    }

    return '(No readable body content)';
}

/**
 * Format and print a message summary (for list/search/unread).
 */
function printMessageSummary(msg) {
    const headers = msg.payload.headers || [];
    const from = getHeader(headers, 'From');
    const subject = getHeader(headers, 'Subject');
    const date = getHeader(headers, 'Date');
    const snippet = msg.snippet || '';

    console.log(`  ID: ${msg.id}`);
    console.log(`  From: ${from}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Date: ${date}`);
    console.log(`  Snippet: ${snippet}`);
    console.log('');
}

/**
 * List recent emails.
 */
async function listEmails(gmail, count) {
    const res = await withRetry(() =>
        gmail.users.messages.list({
            userId: 'me',
            maxResults: count,
        })
    );

    const messages = res.data.messages || [];
    if (messages.length === 0) {
        console.log('No emails found.');
        return;
    }

    console.log(`--- Latest ${messages.length} Emails ---\n`);

    for (const msg of messages) {
        const full = await withRetry(() =>
            gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date'],
            })
        );
        printMessageSummary(full.data);
    }
}

/**
 * Read a full email by message ID.
 */
async function readEmail(gmail, messageId) {
    const res = await withRetry(() =>
        gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
        })
    );

    const msg = res.data;
    const headers = msg.payload.headers || [];
    const from = getHeader(headers, 'From');
    const to = getHeader(headers, 'To');
    const subject = getHeader(headers, 'Subject');
    const date = getHeader(headers, 'Date');

    console.log('--- Email Details ---\n');
    console.log(`From: ${from}`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Date: ${date}`);
    console.log(`ID: ${msg.id}`);
    console.log(`Labels: ${(msg.labelIds || []).join(', ')}`);
    console.log('\n--- Body ---\n');

    const body = extractBody(msg.payload);
    console.log(body);
}

/**
 * Search emails using Gmail query syntax.
 */
async function searchEmails(gmail, query) {
    const res = await withRetry(() =>
        gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 20,
        })
    );

    const messages = res.data.messages || [];
    if (messages.length === 0) {
        console.log(`No emails found for query: "${query}"`);
        return;
    }

    console.log(`--- Search Results for "${query}" (${messages.length} found) ---\n`);

    for (const msg of messages) {
        const full = await withRetry(() =>
            gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date'],
            })
        );
        printMessageSummary(full.data);
    }
}

/**
 * List unread emails.
 */
async function listUnread(gmail) {
    const res = await withRetry(() =>
        gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 20,
        })
    );

    const messages = res.data.messages || [];
    if (messages.length === 0) {
        console.log('No unread emails.');
        return;
    }

    console.log(`--- Unread Emails (${messages.length}) ---\n`);

    for (const msg of messages) {
        const full = await withRetry(() =>
            gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date'],
            })
        );
        printMessageSummary(full.data);
    }
}

/**
 * Print usage information.
 */
function printUsage() {
    console.log('Gmail Helper - Read and search Gmail emails');
    console.log('');
    console.log('Usage: node gmail.js <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  list [--count N]    List recent N emails (default: 10)');
    console.log('  read <messageId>    Read full email content by message ID');
    console.log('  search <query>      Search emails using Gmail query syntax');
    console.log('  unread              List unread emails');
    console.log('');
    console.log('Examples:');
    console.log('  node gmail.js list');
    console.log('  node gmail.js list --count 5');
    console.log('  node gmail.js read 18f1a2b3c4d5e6f7');
    console.log('  node gmail.js search "from:example@gmail.com"');
    console.log('  node gmail.js search "subject:invoice after:2024/01/01"');
    console.log('  node gmail.js unread');
}

/**
 * Main entry point.
 */
async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    if (!command || command === '--help' || command === '-h') {
        printUsage();
        return;
    }

    const auth = getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    try {
        switch (command) {
            case 'list': {
                let count = 10;
                const countIndex = args.indexOf('--count');
                if (countIndex !== -1 && args[countIndex + 1]) {
                    const parsed = parseInt(args[countIndex + 1], 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        count = parsed;
                    }
                }
                await listEmails(gmail, count);
                break;
            }

            case 'read': {
                const messageId = args[0];
                if (!messageId) {
                    console.log('Error: Message ID is required.');
                    console.log('Usage: node gmail.js read <messageId>');
                    return;
                }
                await readEmail(gmail, messageId);
                break;
            }

            case 'search': {
                const query = args.join(' ');
                if (!query) {
                    console.log('Error: Search query is required.');
                    console.log('Usage: node gmail.js search <query>');
                    console.log('Example: node gmail.js search "from:user@example.com"');
                    return;
                }
                await searchEmails(gmail, query);
                break;
            }

            case 'unread': {
                await listUnread(gmail);
                break;
            }

            default: {
                console.log(`Unknown command: ${command}`);
                console.log('');
                printUsage();
            }
        }
    } catch (error) {
        handleApiError(error);
    }
}

main();
