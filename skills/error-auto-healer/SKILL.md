# 🔧 Error Auto Healer v2.0

## 概要
GitHub Actions・Vercelのビルドエラーを自動検知し、AIが原因を解析して修正コードを生成・コミット・プッシュする完全自動化スキルです。

## 機能一覧

### 基本機能（実装済み）
| 機能 | 概要 |
|------|------|
| Gmailエラー自動検出 | 10分ごとの未読メールチェック・パターンマッチング |
| GitHub Actionsエラー診断 | 15分ごとのジョブ監視・エラーログ解析 |
| エラー診断ロジック | GitHub Actions / Vercel / GASエラーの識別 |
| 部分的自動修復 | 設定エラー等の即時修復 |
| Discord通知 | エラー検出・修復結果のリアルタイム通知 |

### 高度な機能（v2.0 NEW）
| 機能 | 概要 |
|------|------|
| GitHub Issue自動作成 | エラー検出時に自動でIssue作成 |
| PR自動作成 | 修復コードをPRとして自動作成（レビュアー指定可） |
| PR自動マージ | CI通過後の自動マージ（squash/merge/rebase） |
| Vercel自動再デプロイ | Vercel APIで自動再デプロイ |
| エラー履歴分析 | SQLiteによる高度な統計分析・レポート生成 |
| Webスクレイピング強化 | GitHub Actions/Vercelログの自動取得・解析 |

## コマンド

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

# Gmail監視のみ起動
node monitor.js start

# Gmail 1回チェック
node monitor.js check
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

## 設定ファイル
- `config.json` - メイン設定（gitignore対象）
- `config.template.json` - 設定テンプレート
- `gmail-credentials.json` - Gmail OAuth認証情報（gitignore対象）
- `gmail-token.json` - Gmailアクセストークン（gitignore対象）
- `logs/` - ログディレクトリ

## セーフガード
- クールダウン: 同じエラーへの連続修復防止
- 最大試行回数: エラーごとに上限設定
- ブランチ保護: main/masterへの直接push防止
- 完全ログ: 全修復試行をSQLite+JSONで保存
