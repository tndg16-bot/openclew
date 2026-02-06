const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(process.env.USERPROFILE, '.clawdbot', 'credentials', 'google.json');
const TOKEN_PATH = path.join(process.env.USERPROFILE, '.clawdbot', 'credentials', 'token.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

async function main() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

    const oauth2Client = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret,
        'http://localhost:3000/callback'
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });

    console.log('Opening browser for authorization...');
    console.log('If browser does not open, visit this URL manually:');
    console.log(authUrl);

    // Start local server to receive callback
    const server = http.createServer(async (req, res) => {
        const queryParams = url.parse(req.url, true).query;

        if (queryParams.code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authorization successful!</h1><p>You can close this window.</p>');

            try {
                const { tokens } = await oauth2Client.getToken(queryParams.code);

                // Update credentials file with refresh token
                credentials.refresh_token = tokens.refresh_token;
                fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));

                // Also save full token
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

                console.log('\n✅ Authorization successful!');
                console.log('Refresh token saved to:', CREDENTIALS_PATH);
                console.log('Full token saved to:', TOKEN_PATH);

                server.close();
                process.exit(0);
            } catch (error) {
                console.error('Error getting tokens:', error.message);
                server.close();
                process.exit(1);
            }
        }
    });

    server.listen(3000, async () => {
        console.log('Waiting for authorization callback on http://localhost:3000...');
        const open = (await import('open')).default;
        open(authUrl);
    });
}

main().catch(console.error);
