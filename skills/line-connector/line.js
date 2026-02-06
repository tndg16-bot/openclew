const { messagingApi, middleware } = require('@line/bot-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CREDENTIALS_PATH = path.join(HOME, '.clawdbot', 'credentials', 'line.json');
const WEBHOOK_PORT = 3001;

function loadCredentials() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log('Error: LINE credentials not found.');
        console.log('');
        console.log('Setup instructions:');
        console.log('  1. Go to LINE Developers console: https://developers.line.biz/');
        console.log('  2. Create a new Messaging API channel');
        console.log('  3. Get your Channel Access Token (long-lived) and Channel Secret');
        console.log('  4. Save credentials to ' + CREDENTIALS_PATH + ':');
        console.log('');
        console.log('     {');
        console.log('       "channelAccessToken": "YOUR_CHANNEL_ACCESS_TOKEN",');
        console.log('       "channelSecret": "YOUR_CHANNEL_SECRET"');
        console.log('     }');
        console.log('');
        console.log('  Make sure the directory exists:');
        console.log('    mkdir -p ~/.clawdbot/credentials');
        return null;
    }

    try {
        const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        if (!data.channelAccessToken || !data.channelSecret) {
            console.log('Error: credentials file must contain both "channelAccessToken" and "channelSecret".');
            return null;
        }
        return data;
    } catch (err) {
        console.log('Error: Failed to parse credentials file:', err.message);
        return null;
    }
}

function createClient(credentials) {
    return new messagingApi.MessagingApiClient({
        channelAccessToken: credentials.channelAccessToken,
    });
}

async function sendMessage(client, userId, message) {
    console.log(`Sending message to user: ${userId}`);
    console.log(`Message: "${message}"`);

    try {
        await client.pushMessage({
            to: userId,
            messages: [
                {
                    type: 'text',
                    text: message,
                },
            ],
        });
        console.log('Message sent successfully.');
    } catch (err) {
        console.error('Failed to send message:', err.message || err);
    }
}

async function getStatus(client) {
    console.log('Fetching channel bot info...');

    try {
        const botInfo = await client.getBotInfo();
        console.log('');
        console.log('--- Channel Bot Info ---');
        console.log(`  Display Name : ${botInfo.displayName}`);
        console.log(`  User ID      : ${botInfo.userId}`);
        console.log(`  Basic ID     : ${botInfo.basicId || 'N/A'}`);
        console.log(`  Premium ID   : ${botInfo.premiumId || 'N/A'}`);
        console.log(`  Picture URL  : ${botInfo.pictureUrl || 'N/A'}`);
        console.log(`  Chat Mode    : ${botInfo.chatMode || 'N/A'}`);
        console.log(`  Mark as Read : ${botInfo.markAsReadMode || 'N/A'}`);
        console.log('------------------------');
    } catch (err) {
        console.error('Failed to fetch bot info:', err.message || err);
    }
}

async function getProfile(client, userId) {
    console.log(`Fetching profile for user: ${userId}`);

    try {
        const profile = await client.getProfile(userId);
        console.log('');
        console.log('--- User Profile ---');
        console.log(`  Display Name   : ${profile.displayName}`);
        console.log(`  User ID        : ${profile.userId}`);
        console.log(`  Picture URL    : ${profile.pictureUrl || 'N/A'}`);
        console.log(`  Status Message : ${profile.statusMessage || 'N/A'}`);
        console.log(`  Language       : ${profile.language || 'N/A'}`);
        console.log('---------------------');
    } catch (err) {
        console.error('Failed to fetch user profile:', err.message || err);
    }
}

async function handleEvent(client, event) {
    console.log(`Received event: type=${event.type}`);

    if (event.type === 'message' && event.message.type === 'text') {
        const receivedText = event.message.text;
        const userId = event.source.userId || 'unknown';
        console.log(`  From: ${userId}`);
        console.log(`  Text: "${receivedText}"`);

        const replyText = `Received: "${receivedText}"`;
        try {
            await client.replyMessage({
                replyToken: event.replyToken,
                messages: [
                    {
                        type: 'text',
                        text: replyText,
                    },
                ],
            });
            console.log(`  Replied with confirmation.`);
        } catch (err) {
            console.error('  Failed to reply:', err.message || err);
        }
    } else {
        console.log(`  Event type "${event.type}" (not handled, logged only).`);
        if (event.source) {
            console.log(`  Source: type=${event.source.type}, userId=${event.source.userId || 'N/A'}`);
        }
    }
}

function startWebhookServer(credentials) {
    const app = express();

    const middlewareConfig = {
        channelAccessToken: credentials.channelAccessToken,
        channelSecret: credentials.channelSecret,
    };

    const client = createClient(credentials);

    const port = process.env.LINE_WEBHOOK_PORT || WEBHOOK_PORT;

    // Health check endpoint
    app.get('/', (req, res) => {
        res.json({ status: 'ok', service: 'line-connector webhook' });
    });

    // LINE middleware must be before any body parser
    app.post('/webhook', middleware(middlewareConfig), (req, res) => {
        const events = req.body.events;
        console.log(`Webhook received: ${events.length} event(s)`);

        Promise.all(events.map((event) => handleEvent(client, event)))
            .then(() => res.json({ success: true }))
            .catch((err) => {
                console.error('Event handling error:', err);
                res.status(500).end();
            });
    });

    app.listen(port, () => {
        console.log(`LINE webhook server started on port ${port}`);
        console.log(`Webhook URL: http://localhost:${port}/webhook`);
        console.log('');
        console.log('Set this URL (with HTTPS) in your LINE Developers console.');
        console.log('Press Ctrl+C to stop.');
    });
}

function showUsage() {
    console.log('LINE Connector - Clawdbot Skill');
    console.log('');
    console.log('Usage: node line.js <command> [args...]');
    console.log('');
    console.log('Commands:');
    console.log('  send <userId> <message>  Send a text message to a user');
    console.log('  webhook                  Start the webhook server (port ' + WEBHOOK_PORT + ')');
    console.log('  status                   Show channel bot info');
    console.log('  profile <userId>         Get user profile');
    console.log('');
    console.log('Environment variables:');
    console.log('  LINE_WEBHOOK_PORT        Override default webhook port (' + WEBHOOK_PORT + ')');
}

async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    if (!command) {
        showUsage();
        return;
    }

    try {
        if (command === 'webhook') {
            const credentials = loadCredentials();
            if (!credentials) return;
            startWebhookServer(credentials);
            return; // Server keeps running
        }

        const credentials = loadCredentials();
        if (!credentials) return;

        const client = createClient(credentials);

        if (command === 'send') {
            const userId = args[0];
            const message = args.slice(1).join(' ');
            if (!userId || !message) {
                console.log('Usage: node line.js send <userId> <message>');
                return;
            }
            await sendMessage(client, userId, message);
        } else if (command === 'status') {
            await getStatus(client);
        } else if (command === 'profile') {
            const userId = args[0];
            if (!userId) {
                console.log('Usage: node line.js profile <userId>');
                return;
            }
            await getProfile(client, userId);
        } else {
            console.log(`Unknown command: ${command}`);
            console.log('');
            showUsage();
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
