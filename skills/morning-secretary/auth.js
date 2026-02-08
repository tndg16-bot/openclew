/**
 * Google OAuth 認証フロー
 * 初回のみ実行してtoken.jsonを生成
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const url = require('url');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

// 必要なスコープ
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly'
];

async function authorize() {
    // 認証情報読み込み
    let credentials;
    try {
        const data = await fs.readFile(CREDENTIALS_PATH, 'utf8');
        credentials = JSON.parse(data);
    } catch (e) {
        console.error('❌ credentials.json が見つかりません');
        console.log('Google Cloud Console から OAuth 2.0 クライアント ID をダウンロードして');
        console.log('credentials.json として保存してください。');
        process.exit(1);
    }

    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    // リダイレクトURIをlocalhostに設定
    const redirectUri = 'http://localhost:3000/callback';
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

    // 認証URLを生成
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });

    console.log('\n🔐 Google OAuth 認証フロー\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n以下のURLをブラウザで開いてください:\n');
    console.log(authUrl);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nコールバック待機中... (http://localhost:3000)\n');

    // ローカルサーバーでコールバックを受け取る
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const parsedUrl = url.parse(req.url, true);

            if (parsedUrl.pathname === '/callback') {
                const code = parsedUrl.query.code;

                if (!code) {
                    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<h1>❌ 認証コードが見つかりません</h1>');
                    reject(new Error('No code'));
                    server.close();
                    return;
                }

                try {
                    const { tokens } = await oAuth2Client.getToken(code);
                    oAuth2Client.setCredentials(tokens);

                    // トークン保存
                    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));

                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`
            <html>
            <head><title>認証成功</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>✅ 認証成功！</h1>
              <p>token.json が保存されました。</p>
              <p>このウィンドウを閉じてください。</p>
            </body>
            </html>
          `);

                    console.log('✅ 認証成功！token.json を保存しました。');
                    resolve(oAuth2Client);
                    server.close();
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<h1>❌ エラー: ${e.message}</h1>`);
                    reject(e);
                    server.close();
                }
            }
        });

        server.listen(3000, () => {
            console.log('🌐 認証サーバー起動: http://localhost:3000');
        });

        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                console.error('❌ ポート3000は使用中です。他のプロセスを停止してください。');
            }
            reject(e);
        });
    });
}

// 実行
authorize()
    .then(() => {
        console.log('\n🎉 設定完了！morning-secretary が Gmail/Calendar にアクセスできます。');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ 認証エラー:', err.message);
        process.exit(1);
    });
