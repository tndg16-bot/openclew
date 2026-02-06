# 🤖 Error Auto Healer セットアップガイド

GitHub/Vercelのエラーを完全自動で修復するスキルのセットアップ手順です。

## 概要

このスキルは以下の流れで動作します：

```
Gmailでエラー通知を受信
    ↓
エラーを自動解析
    ↓
AIが原因を特定して修正
    ↓
自動でコミット・プッシュ
    ↓
GitHub Actionsを再実行
    ↓
Discordに結果を通知
```

---

## 事前準備

以下のものを準備してください：

- [ ] Discordアカウント（BotまたはWebhook作成用）
- [ ] Googleアカウント（Gmail API用）
- [ ] GitHubアカウント（Personal Access Token用）
- [ ] Node.js 18以上がインストールされていること

---

## Step 1: Discordチャンネルの作成

### 1.1 チャンネルを作成

Discordサーバーで新しいチャンネルを作成します：

- **チャンネル名**: `🔧error-auto-healer`
- **タイプ**: テキストチャンネル

### 1.2 Webhookの作成

1. チャンネル設定（⚙️）を開く
2. 「連携サービス」→「ウェブフック」を選択
3. 「新しいウェブフック」をクリック
4. 名前: `Error Auto Healer`
5. アイコン: お好みで（ロボット画像など）
6. 「ウェブフックURLをコピー」をクリック
7. **このURLをメモしておいてください**

---

## Step 2: Gmail API設定

### 2.1 Google Cloudプロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクトセレクターから「新しいプロジェクト」を選択
3. プロジェクト名: `error-auto-healer`
4. 「作成」をクリック

### 2.2 Gmail API有効化

1. ナビゲーションメニュー（≡）→「APIとサービス」→「ライブラリ」
2. 「Gmail API」を検索して選択
3. 「有効にする」をクリック

### 2.3 OAuth 2.0クレデンシャル作成

1. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアントID」
2. 「同意画面を設定」をクリック
3. ユーザータイプ: 「外部」→「作成」
4. アプリ名: `Error Auto Healer`
5. ユーザーサポートメール: あなたのGmailアドレス
6. デベロッパーの連絡先情報: あなたのメールアドレス
7. 「保存して次へ」をクリック
8. スコープは「保存して次へ」でスキップ
9. テストユーザーを追加（あなたのGmailアドレス）
10. 「保存して次へ」→「ダッシュボードに戻る」

11. 再度「認証情報」→「認証情報を作成」→「OAuth クライアントID」
12. アプリケーションの種類: 「デスクトップアプリ」
13. 名前: `Error Auto Healer Desktop`
14. 「作成」をクリック
15. 「JSONをダウンロード」をクリック
16. **ダウンロードしたファイルを `gmail-credentials.json` として保存**

### 2.4 認証情報ファイルの配置

```bash
# ダウンロードしたJSONファイルをスキルディレクトリに配置
cp ~/Downloads/client_secret_*.json ~/.clawdbot/skills/error-auto-healer/gmail-credentials.json
```

---

## Step 3: GitHub認証設定

### 3.1 Personal Access Token発行

1. GitHubにログイン
2. Settings → Developer settings → Personal access tokens → Tokens (classic)
3. 「Generate new token (classic)」をクリック
4. 以下のスコープを選択：
   - ✅ `repo`（Full control of private repositories）
   - ✅ `workflow`（Update GitHub Action workflows）
5. 「Generate token」をクリック
6. **トークンをコピーして安全な場所に保存**（再表示されません）

### 3.2 環境変数に設定

```bash
# Windows (PowerShell)
$env:GITHUB_TOKEN = "ghp_xxxxxxxxxxxxxxxxxxxx"

# Windows (Command Prompt)
set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Linux/Mac
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

または `config.json` の `github.token` に直接記述（セキュリティ上推奨されません）

---

## Step 4: スキルのインストール

### 4.1 依存関係のインストール

```bash
cd ~/.clawdbot/skills/error-auto-healer
npm install
```

### 4.2 設定ファイルの編集

`config.json` を編集します：

```json
{
  "version": "1.0.0",
  "mode": "auto",
  "monitoring": {
    "intervalMinutes": 2,
    "gmailLabel": "error-notifications",
    "processedLabel": "error-auto-healed"
  },
  "github": {
    "token": "YOUR_GITHUB_TOKEN_HERE",
    "autoRetry": true,
    "maxRetries": 3
  },
  "gmail": {
    "credentialsPath": "./gmail-credentials.json",
    "tokenPath": "./gmail-token.json"
  },
  "discord": {
    "webhookUrl": "YOUR_DISCORD_WEBHOOK_URL_HERE"
  },
  "safety": {
    "maxHealingAttempts": 3,
    "cooldownMinutes": 30,
    "blockedRepositories": [],
    "blockedBranches": ["main", "master"]
  }
}
```

**必ず以下を置き換えてください：**
- `YOUR_GITHUB_TOKEN_HERE` → 先ほど発行したGitHubトークン
- `YOUR_DISCORD_WEBHOOK_URL_HERE` → 先ほどコピーしたDiscord Webhook URL

---

## Step 5: Gmail認証

### 5.1 初回認証

```bash
cd ~/.clawdbot/skills/error-auto-healer
node monitor.js --authorize
```

または直接：

```bash
node -e "
const { google } = require('googleapis');
const fs = require('fs');
const credentials = JSON.parse(fs.readFileSync('./gmail-credentials.json'));
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.modify']
});
console.log('Authorize this app by visiting this url:', authUrl);
"
```

### 5.2 ブラウザで認証

1. 表示されたURLをブラウザで開く
2. Googleアカウントでログイン
3. 「Error Auto HealerがGoogleアカウントへのアクセスをリクエストしています」→「続行」
4. 認証コードが表示されるのでコピー

### 5.3 認証コードの入力

```bash
node -e "
const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');

const credentials = JSON.parse(fs.readFileSync('./gmail-credentials.json'));
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter the code from that page here: ', (code) => {
  rl.close();
  oAuth2Client.getToken(code, (err, token) => {
    if (err) return console.error('Error retrieving access token', err);
    fs.writeFileSync('./gmail-token.json', JSON.stringify(token));
    console.log('Token stored to gmail-token.json');
  });
});
"
```

認証コードを貼り付けてEnter。

---

## Step 6: 動作テスト

### 6.1 ステータス確認

```bash
node healer.js status
```

正常に初期化されると、設定情報と統計が表示されます。

### 6.2 テスト実行

```bash
node healer.js test
```

これにより：
- Discordにテスト通知が送信されます
- 修復履歴にテストレコードが追加されます

Discordチャンネルに通知が届くことを確認してください。

### 6.3 Gmail監視テスト

```bash
node monitor.js check
```

エラーメールがあれば処理されます。現在エラーメールがなければ「No new error emails found」と表示されます。

---

## Step 7: 常時監視モードで起動

### 7.1 フォアグラウンドで起動

```bash
node healer.js start
```

Ctrl+Cで停止します。

### 7.2 バックグラウンドで起動（推奨）

#### Windows (PowerShell)

```powershell
Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "healer.js", "start" -WorkingDirectory "$env:USERPROFILE\.clawdbot\skills\error-auto-healer"
```

#### Windows (winswサービス)

```xml
<!-- error-auto-healer.xml -->
<service>
  <id>error-auto-healer</id>
  <name>Error Auto Healer</name>
  <description>GitHub/Vercel Error Auto Healing Service</description>
  <executable>node</executable>
  <arguments>healer.js start</arguments>
  <workingdirectory>%USERPROFILE%\.clawdbot\skills\error-auto-healer</workingdirectory>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
</service>
```

```bash
winsw install error-auto-healer.xml
winsw start error-auto-healer
```

#### Linux/Mac (systemd)

```ini
# ~/.config/systemd/user/error-auto-healer.service
[Unit]
Description=Error Auto Healer
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.clawdbot/skills/error-auto-healer
ExecStart=/usr/bin/node healer.js start
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable error-auto-healer
systemctl --user start error-auto-healer
```

---

## Step 8: OpenClaw Gatewayへの登録

### 8.1 Gateway設定ファイル編集

`~/.clawdbot/config.json` を編集：

```json
{
  "skills": {
    "error-auto-healer": {
      "enabled": true,
      "autoStart": true,
      "entryPoint": "healer.js"
    }
  }
}
```

### 8.2 Gateway再起動

```bash
clawdbot gateway --port 18789 --daemon
```

---

## 運用

### 日常の確認

Discordの `#🔧error-auto-healer` チャンネルを定期的に確認してください。

通知パターン：
- 🔍 **エラー検知**: 新しいエラーが検出されました
- 🔧 **修復開始**: AIが修復処理を開始しました
- ✅ **修復完了**: エラーが修正され、デプロイされました
- ❌ **修復失敗**: 自動修復できませんでした（手動対応が必要）
- ⚠️ **修復スキップ**: クールダウン中のため修復をスキップしました
- 🚫 **修復不可能**: 最大試行回数に達しました

### ログ確認

```bash
# リアルタイムログ監視
tail -f ~/.clawdbot/skills/error-auto-healer/logs/healer.log

# 修復履歴確認
node healer.js history
```

### 停止・再起動

```bash
# 停止
pkill -f "error-auto-healer"

# 再起動
node healer.js start
```

---

## トラブルシューティング

### Gmail認証エラー

```bash
# トークンを削除して再認証
rm ~/.clawdbot/skills/error-auto-healer/gmail-token.json
node monitor.js --authorize
```

### Discord通知が届かない

1. Webhook URLが正しいか確認
2. チャンネルのアクセス権限を確認
3. 手動テスト:
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"content":"Test message"}' \
     YOUR_WEBHOOK_URL
   ```

### GitHub APIエラー

- トークンの有効期限を確認
- レート制限（1時間あたり5000リクエスト）に注意
- リポジトリへのアクセス権限を確認

### 修復が繰り返し失敗する

1. `he
### 修復が繰り返し失敗する

1. `healer.js history` で履歴を確認
2. エラーの種類が修復不可能なものか確認
3. `config.json` で `blockedRepositories` に追加

---

## セキュリティ注意事項

⚠️ **重要**

1. **認証情報の保護**
   - `config.json`、`gmail-credentials.json`、`gmail-token.json`は決してGitHubにプッシュしない
   - `.gitignore`に追加済み

2. **ブランチ保護**
   - main/masterブランチへの直接pushはデフォルトでブロック
   - 必要に応じて `blockedBranches` を設定

3. **API使用量**
   - GitHub API: 1時間あたり5000リクエスト
   - Gmail API: 1日あたり1億リクエスト（十分）

4. **テスト環境での検証**
   - 本番環境使用前にテストリポジトリで十分に検証

---

**セットアップ完了！** 🎉

これでGitHub/Vercelのエラーが自動修復されるようになりました。
