# 🔧 Error Auto Healer v3.0

## 概要
GitHub Actions・Vercelのビルドエラーを自動検知し、AIが原因を解析して修正コードを生成・コミット・プッシュする完全自動化スキルです。

**v3.0の新機能**:
- Gmail APIエラー監視（イベント駆動型）
- GitHub APIエラー監視（イベント駆動型）
- 朝8時のサマリー通知
- 即時エラー通知（Criticalのみ）

## 機能一覧

### 基本機能（実装済み）
| 機能 | 概要 |
|------|------|
| Gmailエラー自動検出 | 未読メールチェック・パターンマッチング |
| GitHub Actionsエラー診断 | ジョブ監視・エラーログ解析 |
| エラー診断ロジック | GitHub Actions / Vercel / GASエラーの識別 |
| 部分的自動修復 | 設定エラー等の即時修復 |
| Discord通知 | エラー検出・修復結果のリアルタイム通知 |

### 高度な機能（v2.0）
| 機能 | 概要 |
|------|------|
| GitHub Issue自動作成 | エラー検出時に自動でIssue作成 |
| PR自動作成 | 修復コードをPRとして自動作成 |
| PR自動マージ | CI通過後の自動マージ |
| Vercel自動再デプロイ | Vercel APIで自動再デプロイ |
| エラー履歴分析 | SQLiteによる高度な統計分析・レポート生成 |
| Webスクレイピング強化 | GitHub Actions/Vercelログの自動取得・解析 |

### API監視機能（v3.0 NEW）
| 機能 | 概要 |
|------|------|
| Gmail APIエラー検出 | 401、403、429、500等のAPIエラーを検出 |
| GitHub APIエラー検出 | 401、403、429、500等のAPIエラーを検出 |
| レート制限監視 | GitHub APIのレート制限残量を監視 |
| 即時通知 | Criticalエラーの即時Discord通知 |
| サマリー通知 | 朝8時の24時間サマリー通知 |

## コマンド

### CI/CDエラー監視（従来の機能）
```bash
# 監視モードで起動
node healer.js start

# 現在のステータス確認
node healer.js status

# 修復履歴の表示
node healer.js history

# エラー履歴分析レポート
node healer.js analyze

# テスト実行（シミュレーション）
node healer.js test

# 履歴リセット
node healer.js reset
```

### APIエラー監視（v3.0 NEW）
```bash
# API監視モードで起動（イベント駆動型）
node api-monitor.js start

# 1回のみチェック
node api-monitor.js once

# サマリー通知を今すぐ送信
node api-monitor.js summary

# ステータス確認
node api-monitor.js status
```

### Gmail監視
```bash
# Gmail監視のみ起動
node monitor.js start

# Gmail 1回チェック
node monitor.js check

# Gmail認証
node monitor.js --authorize
```

## セットアップ

### 1. 依存関係インストール
```bash
cd skills/error-auto-healer
npm install
```

### 2. 設定ファイル作成
`config.template.json` をコピーして `config.json` を作成:
```bash
cp config.template.json config.json
```

### 3. 各種トークン設定
`config.json` を編集:
- `github.token`: GitHub Personal Access Token
- `discord.webhookUrl`: Discord Webhook URL
- `vercel.token`: Vercel Token（任意）

### 4. Gmail認証
```bash
# gmail-credentials.json を Google Cloud Console からダウンロード
# その後:
node monitor.js --authorize
```

### 5. cronジョブ設定（v3.0）
```bash
# cron.json に従ってスケジュール設定
# API監視: 5分ごと
# サマリー通知: 毎日8時
```

## 設定ファイル
- `config.json` - メイン設定（gitignore対象）
- `config.template.json` - 設定テンプレート
- `cron.json` - スケジュール設定（v3.0）
- `gmail-credentials.json` - Gmail OAuth認証情報（gitignore対象）
- `gmail-token.json` - Gmailアクセストークン（gitignore対象）
- `logs/` - ログディレクトリ

## モジュール構成

### メインモジュール
- `healer.js` - CI/CDエラー検出・修復エンジン（v1.0〜）
- `monitor.js` - Gmailメール監視（v1.0〜）
- `api-monitor.js` - APIエラー監視（v3.0 NEW）

### ライブラリ（lib/）
- `gmail-api-monitor.js` - Gmail APIエラー監視（v3.0 NEW）
- `github-api-monitor.js` - GitHub APIエラー監視（v3.0 NEW）
- `discord-notifier.js` - Discord通知機能（v3.0 拡張）
- `github-client.js` - GitHub APIクライアント
- `healing-orchestrator.js` - 修復オーケストレーション
- `openclaw-integration.js` - OpenClaw連携
- `workspace-manager.js` - ワークスペース管理
- `error-deduplicator.js` - エラー重複排除

## イベント駆動型アーキテクチャ（v3.0）

### 監視スケジュール
| ジョブ | 頻度 | 説明 |
|------|------|------|
| API監視 | 5分ごと | Gmail APIとGitHub APIのエラーを検出 |
| サマリー通知 | 毎日8時 | 24時間のエラーと修復状況をサマリー |

### エラー検出フロー
```
1. API監視（api-monitor.js）
   ↓
2. エラー分類と重複排除
   ↓
3. Criticalエラーのみ即時通知
   ↓
4. データベースに保存
   ↓
5. 朝8時にサマリー通知
```

### 通知レベル
| レベル | 説明 | 即時通知 |
|--------|------|----------|
| Critical | 401、403、500等 | ✓ |
| Warning | 429、502等 | ✗ |
| Info | レート制限警告 | ✗ |

## セーフガード
- クールダウン: 同じエラーへの連続修復防止
- 最大試行回数: エラーごとに上限設定
- ブランチ保護: main/masterへの直接push防止
- 完全ログ: 全修復試行をSQLite+JSONで保存
- 重複排除: APIエラーの重複検出と通知抑制

## Discord通知チャンネル
- チャンネル: #秘書さんの部屋（ID: 1471769660948086785）

## マイグレーションガイド（v2.x → v3.0）

### 廃止された機能
- 定期スキャン（30分ごとのDiscordエラーチェック）
- イベント駆動型のAPI監視に置き換え

### 新しいワークフロー
1. 従来のCI/CDエラー監視は継続（healer.js）
2. APIエラー監視を追加（api-monitor.js）
3. 朝8時のサマリー通知（api-monitor.js）

### 設定変更
- `cron.json` の `api-monitor` ジョブを有効化
- `config.json` の `discord.webhookUrl` を設定
- 必要に応じて `discord.channelId` を設定

## トラブルシューティング

### Gmail APIエラー
```
Error: Authentication failed
```
→ トークンの再認証が必要
```bash
node monitor.js --authorize
```

### GitHub APIエラー
```
Error: Rate limit exceeded
```
→ レート制限に達しました。数分待ってください。

### Discord通知が来ない
→ `config.json` の `discord.webhookUrl` を確認してください。

## ログファイル
- `logs/healer.log` - CI/CD修復ログ
- `logs/api-monitor.log` - API監視ログ
- `logs/discord-notifications.log` - Discord通知ログ
- `logs/gmail-api-errors.log` - Gmail APIエラーログ
- `logs/github-api-errors.log` - GitHub APIエラーログ
- `logs/heal-history.json` - 修復履歴
- `logs/api-errors.json` - APIエラー履歴
- `logs/history.db` - SQLiteデータベース
