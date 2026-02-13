# OpenClaw Life OS Configuration Guide

このドキュメントは各スキルの設定方法を説明します。

## 必須設定

### 1. Discord (morning-secretary, news-curator, approval-gatekeeper)

Discord Webhook URLを取得：
1. Discordサーバー設定 → 連携サービス → ウェブフック
2. 「新しいウェブフック」を作成
3. URLをコピー

設定ファイル：
- `skills/morning-secretary/config.json`
- `skills/news-curator/config.json`
- `skills/approval-gatekeeper/config.json`

```json
{
  "discord": {
    "channelId": "YOUR_CHANNEL_ID",
    "webhookUrl": "https://discord.com/api/webhooks/XXX/YYY"
  }
}
```

### 2. Weather API (morning-secretary)

OpenWeatherMap API Keyを取得：
1. https://openweathermap.org/api でアカウント作成
2. API Keys → Generate

設定ファイル：`skills/morning-secretary/config.json`
```json
{
  "weather": {
    "apiKey": "YOUR_OPENWEATHERMAP_API_KEY",
    "location": "Tokyo"
  }
}
```

### 3. Google Calendar (morning-secretary)

Google Cloud ConsoleでOAuth認証を設定：
1. プロジェクト作成
2. Google Calendar APIを有効化
3. OAuth 2.0クライアントID作成
4. `credentials.json`をダウンロード

ファイル配置：`skills/morning-secretary/credentials.json`

### 4. GitHub Token (coder-agent)

Personal Access Tokenを作成：
1. GitHub Settings → Developer settings → Personal access tokens
2. `repo` スコープを選択

設定ファイル：`skills/coder-agent/config.json`
```json
{
  "github": {
    "tokenPath": "~/.clawdbot/github-token.txt"
  }
}
```

トークンファイル作成：
```bash
echo "ghp_YOUR_TOKEN" > ~/.clawdbot/github-token.txt
```

## オプション設定

### Tailscale (リモートアクセス)

```bash
# Windows
winget install Tailscale.Tailscale
tailscale up
```

### Docker (サンドボックス実行)

```bash
# Docker Desktopをインストール
# https://www.docker.com/products/docker-desktop
```

## 設定ファイル一覧

| スキル | 設定ファイル | 必須設定 |
|--------|-------------|----------|
| morning-secretary | config.json | Discord, Weather API |
| news-curator | config.json | Discord |
| coder-agent | config.json | GitHub Token |
| approval-gatekeeper | config.json | Discord |
| base-wallet | config.json | (暗号資産を使用する場合) |
| task-tracker | config.json | Obsidian Vault Path |

## 動作確認

```bash
# 全体ヘルスチェック
node scripts/health-check.js

# 各スキルのテスト
node skills/morning-secretary/index.js test
node skills/news-curator/index.js fetch
node skills/task-tracker/index.js list
node skills/coder-agent/coder.js help
node skills/base-wallet/wallet.js address
node skills/approval-gatekeeper/index.js list
node skills/soul-updater/index.js status
```

## cron設定（自動実行）

crontab例：
```cron
# 朝の秘書 (7:00)
0 7 * * * cd /path/to/openclew && node skills/morning-secretary/index.js

# ニュースキュレーター (8:00, 18:00)
0 8,18 * * * cd /path/to/openclew && node skills/news-curator/index.js

# 自己学習 (3:00)
0 3 * * * cd /path/to/openclew && node skills/soul-updater/index.js
```
