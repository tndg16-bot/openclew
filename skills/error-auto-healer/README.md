# Error Auto-Healer v3.0

**イベント駆動型エラー検出・自動修復システム**

Gmail APIとGitHub APIのエラーを一元管理し、Criticalエラーを即時通知、朝8時に24時間サマリーを送信するイベント駆動型システムです。

## 🎯 v3.0の主な変更点

### 新機能
- ✅ **Gmail APIエラー監視** - 401、403、429、500等のAPIエラーを検出
- ✅ **GitHub APIエラー監視** - APIエラーとレート制限を監視
- ✅ **即時通知** - Criticalエラーを即時にDiscord通知
- ✅ **朝8時サマリー** - 24時間のエラーと修復状況をサマリー通知
- ✅ **イベント駆動型** - 定期スキャンからイベント駆動型へ移行

### 廃止された機能
- ❌ 定期スキャン（30分ごとのDiscordエラーチェック）
- ❌ イベント駆動型のAPI監視に置き換え

## 🚀 クイックスタート

### 1. インストール
```bash
cd skills/error-auto-healer
npm install
```

### 2. 設定
```bash
cp config.template.json config.json
```

`config.json` を編集して、以下を設定:
- `github.token` - GitHub Personal Access Token
- `discord.webhookUrl` - Discord Webhook URL

### 3. Gmail認証（必要な場合）
```bash
# Google Cloud Console から gmail-credentials.json をダウンロード
node monitor.js --authorize
```

### 4. API監視を開始
```bash
node api-monitor.js start
```

## 📋 機能一覧

### APIエラー監視（v3.0 NEW）
| 機能 | 説明 |
|------|------|
| Gmail APIエラー検出 | 401、403、429、500等のAPIエラーを検出 |
| GitHub APIエラー検出 | APIエラーとレート制限を監視 |
| レート制限監視 | GitHub APIのレート制限残量を監視 |
| 即時通知 | Criticalエラーの即時Discord通知 |
| サマリー通知 | 朝8時の24時間サマリー通知 |

### CI/CDエラー監視（v1.0〜）
| 機能 | 説明 |
|------|------|
| Gmailエラー検出 | 未読メールチェック・パターンマッチング |
| GitHub Actionsエラー診断 | ジョブ監視・エラーログ解析 |
| 自動修復 | AIによる修正コード生成とPR作成 |
| Issue自動作成 | エラー検出時に自動でIssue作成 |
| Vercel再デプロイ | 自動再デプロイ |

## 📝 コマンドリファレンス

### API監視（v3.0）
```bash
# 監視開始
node api-monitor.js start

# 1回のみチェック
node api-monitor.js once

# サマリー通知を今すぐ送信
node api-monitor.js summary

# ステータス確認
node api-monitor.js status
```

### CI/CD修復（v1.0〜）
```bash
# 監視開始
node healer.js start

# 1回のみチェック
node healer.js once

# ステータス確認
node healer.js status

# 修復履歴
node healer.js history

# 分析レポート
node healer.js analyze
```

## 📊 監視スケジュール

| ジョブ | 頻度 | 説明 |
|------|------|------|
| API監視 | 5分ごと | Gmail APIとGitHub APIのエラーを検出 |
| サマリー通知 | 毎日8時 | 24時間のエラーと修復状況をサマリー |

## 🔧 設定ファイル

### config.json
```json
{
  "monitoring": {
    "intervalMinutes": 5,
    "dailySummaryHour": 8,
    "dailySummaryMinute": 0
  },
  "discord": {
    "webhookUrl": "YOUR_WEBHOOK_URL",
    "channelId": "1471769660948086785"
  },
  "github": {
    "enabled": true,
    "token": "YOUR_GITHUB_TOKEN"
  },
  "gmail": {
    "enabled": true,
    "credentialsPath": "./gmail-credentials.json",
    "tokenPath": "./gmail-token.json"
  }
}
```

### cron.json
```json
{
  "jobs": [
    {
      "id": "api-monitor",
      "schedule": "*/5 * * * *",
      "command": "node api-monitor.js once"
    },
    {
      "id": "daily-summary",
      "schedule": "0 8 * * *",
      "command": "node api-monitor.js summary"
    }
  ]
}
```

## 🔐 セキュリティ

### 環境変数（推奨）
```bash
export GITHUB_TOKEN="your_github_token"
export DISCORD_WEBHOOK_URL="your_webhook_url"
```

### トークン管理
- GitHub Token: `config.json` の `github.token` または環境変数 `GITHUB_TOKEN`
- Discord Webhook: `config.json` の `discord.webhookUrl` または環境変数 `DISCORD_WEBHOOK_URL`
- Gmail Credentials: `gmail-credentials.json`（gitignore対象）

## 📁 ディレクトリ構造

```
error-auto-healer/
├── api-monitor.js           # API監視（v3.0）
├── healer.js               # CI/CD修復（v1.0〜）
├── monitor.js              # Gmail監視（v1.0〜）
├── config.json             # 設定ファイル（gitignore）
├── config.template.json    # 設定テンプレート
├── cron.json               # スケジュール設定（v3.0）
├── package.json
├── lib/                    # モジュール
│   ├── gmail-api-monitor.js    # Gmail API監視（v3.0）
│   ├── github-api-monitor.js  # GitHub API監視（v3.0）
│   ├── discord-notifier.js    # Discord通知（v3.0）
│   ├── github-client.js
│   ├── healing-orchestrator.js
│   ├── openclaw-integration.js
│   ├── workspace-manager.js
│   └── error-deduplicator.js
└── logs/                   # ログディレクトリ
    ├── healer.log
    ├── api-monitor.log
    ├── discord-notifications.log
    ├── gmail-api-errors.log
    ├── github-api-errors.log
    ├── heal-history.json
    ├── api-errors.json
    └── history.db
```

## 🚨 通知レベル

| レベル | 説明 | 即時通知 |
|--------|------|----------|
| Critical | 401、403、500等 | ✓ |
| Warning | 429、502等 | ✗ |
| Info | レート制限警告 | ✗ |

## 📈 モニタリング

### ステータス確認
```bash
node api-monitor.js status
```

出力例:
```
==========================================
  API Error Monitor - Status
==========================================

  Running:            Yes
  Uptime:             1h 23m 45s
  Total errors:       3
  History entries:    3

  Monitors:
    Gmail API:        ✓
    GitHub API:       ✓
    Discord:          ✓

  Gmail API Statistics:
    Total (24h):      1
    By type:          {"authentication": 1}
    By severity:      {"critical": 1}

  GitHub API Statistics:
    Total (24h):      2
    By type:          {"rate_limit": 2}
    By severity:      {"warning": 2}

==========================================
```

## 🛠️ トラブルシューティング

### Gmail APIエラー
```
Error: Authentication failed
```
**解決策:** トークンの再認証
```bash
node monitor.js --authorize
```

### GitHub APIエラー
```
Error: Rate limit exceeded
```
**解決策:** レート制限に達しました。数分待ってください。

### Discord通知が来ない
**解決策:** `config.json` の `discord.webhookUrl` を確認してください。

## 🔗 関連リンク

- Discordチャンネル: #秘書さんの部屋（ID: 1471769660948086785）
- Issues: GitHub Issues
- ドキュメント: SKILL.md

## 📄 ライセンス

MIT License

---

**最終更新:** 2026-02-15
**バージョン:** 3.0.0
