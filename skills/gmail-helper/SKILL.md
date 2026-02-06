# Gmail Helper

## 概要
Gmailのメールを確認・検索するスキル

## コマンド
- `node gmail.js list [--count N]` - 最新メール一覧（デフォルト10件）
- `node gmail.js read <messageId>` - メール本文表示
- `node gmail.js search <query>` - メール検索
- `node gmail.js unread` - 未読メール一覧

## セットアップ
1. Google Cloud ConsoleでGmail APIを有効化
2. OAuth認証情報を取得し `~/.clawdbot/credentials/google.json` に保存
3. `node scripts/gmail-oauth.js` を実行して認証フローを完了
4. `cd skills/gmail-helper && npm install`

## 認証ファイル
- `~/.clawdbot/credentials/google.json` - OAuth認証情報 + refresh_token
- `~/.clawdbot/credentials/token.json` - アクセストークン
