# LINE Connector

## 概要
LINE Messaging APIと連携してメッセージの送受信を行うスキル

## コマンド
- `node line.js send <userId> <message>` - テキストメッセージ送信
- `node line.js webhook` - Webhookサーバー起動（ポート3001）
- `node line.js status` - チャネル情報表示
- `node line.js profile <userId>` - ユーザープロフィール取得

## セットアップ
1. [LINE Developers](https://developers.line.biz/) でMessaging APIチャネルを作成
2. Channel Access TokenとChannel Secretを取得
3. `~/.clawdbot/credentials/line.json` に以下を保存:
   ```json
   {
     "channelAccessToken": "YOUR_CHANNEL_ACCESS_TOKEN",
     "channelSecret": "YOUR_CHANNEL_SECRET"
   }
   ```
4. `cd skills/line-connector && npm install`
5. Webhook URL: `https://YOUR_DOMAIN:3001/webhook` をLINE Developersコンソールに設定

## 認証ファイル
- `~/.clawdbot/credentials/line.json` - LINE API認証情報
