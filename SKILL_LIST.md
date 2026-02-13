# 🧩 OpenClaw スキル一覧

Clawdbotにインストールされているカスタマイズ機能（スキル）の一覧です。

---

## 1. ⏰ Working Hours Tracker （稼働時間トラッカー）

Discord上で稼働時間を宣言すると、1時間ごとに自動で進捗を確認し、一日の終わりにサマリーを生成してくれるスキルです。

### 使い方
DiscordでBot（または導入されたチャンネル）に対して話しかけます。

**開始:**
- 「今日は9時から18時まで働きます」
- 「9:00-18:00」

**進捗報告:**
1時間ごとにBotから「進捗どうですか？」とメンションが来ます。
- 「設計完了、実装中です」
- 「完了しました」

**終了:**
定時になると自動でサマリーが作成されます。早めに終わる場合は：
- 「今日はこれで終わります」

### 設定ファイル
`~/.clawdbot/skills/working-hours-tracker/`

---

## 2. 📓 Obsidian Auto Dev （Obsidian自律タスク実行）

Obsidianのデイリーノートに書かれたタスクを自動検知し、エージェントが自律的に実行するスキルです。

### 使い方
今日のデイリーノート（例: `Notes/daily/2026-02-06.md`）に以下のセクションを作ります。

```markdown
# 🤖 Clawd Task
- [ ] ここにやってほしいことを書く（ファイル作成、修正など）
- [ ] 今日の天気を調べて天気.mdに書いて
```

### 動作仕様
- **監視間隔**: 10分おき
- **動作**: 
  1. 未完了のタスク（`[ ]`）を見つけると、`[/]`（実行中）にします。
  2. エージェントがタスクを実行します。
  3. 完了すると `[x]` にチェックを入れ、完了時刻とログを追記します。
- **注意**: ページを開くことなくバックグラウンドで実行されます。

### 設定ファイル
`~/.clawdbot/skills/obsidian-auto-dev/`

---

## 3. 📰 News Curator （ニュースキュレーター）

毎朝7時に自動でAI関連のニュース（TechCrunch等）を収集・要約し、Obsidianの「AIニュース.md」に保存します。

### 使い方
- **自動実行**: 何もしなくても毎朝7時に実行されます。
- **手動実行**: すぐにニュースが見たい場合は、以下のコマンドを実行してください。
  ```bash
  node ~/.clawdbot/skills/news-curator/curator.js
  ```
- **カスタマイズ**: `curator.js` の `NEWS_URL` を変更すれば、別のニュースサイトも巡回可能です。

### 設定ファイル
`~/.clawdbot/skills/news-curator/`

---

## 4. 🤖 Error Auto Healer v2.0 （エラー自動修復）[UPGRADED]

GitHub ActionsやVercelのビルドエラーを自動検知し、AIが原因を解析して修正コードを生成・コミット・プッシュし、最終的にCI/CDパイプラインを再実行する完全自動化スキルです。

### 基本機能
- ✅ **自動エラー検知**: Gmailを監視してエラーメールを検出
- 🔍 **エラー解析**: GitHub Actions/Vercelのエラーを自動解析
- 🧠 **AI自動修復**: OpenClawがエラーを分析し修正コードを生成
- 🚀 **自動デプロイ**: 修正をコミット・プッシュしActionsを再実行
- 📱 **Discord通知**: 全ての処理をDiscordにリアルタイム通知
- 🛡️ **セーフガード**: 無限ループ防止、最大試行回数制限

### v2.0 新機能
- 📝 **GitHub Issue自動作成**: エラー検出時にIssueを自動作成
- 🔃 **PR自動作成**: 修復コードをPRとして自動作成（レビュアー指定可）
- 🔀 **PR自動マージ**: CI通過後の自動マージ（squash/merge/rebase対応）
- ☁️ **Vercel自動再デプロイ**: Vercel APIで自動再デプロイ
- 📊 **エラー履歴分析**: SQLiteによる高度な統計分析・レポート生成
- 🌐 **Webスクレイピング強化**: GitHub Actions/Vercelログの自動取得・解析

### 使い方

```bash
node healer.js start     # 監視モードで起動
node healer.js status    # ステータス確認
node healer.js history   # 修復履歴確認
node healer.js analyze   # エラー履歴分析レポート
node healer.js test      # テスト実行
node healer.js reset     # 履歴リセット
node monitor.js start    # Gmail監視のみ起動
```

### セットアップ手順

1. **依存関係**: `cd skills/error-auto-healer && npm install`
2. **設定作成**: `cp config.template.json config.json` → トークン設定
3. **Gmail認証**: `node monitor.js --authorize`
4. **起動**: `node healer.js start`

### 設定ファイル
- `skills/error-auto-healer/config.json` - メイン設定（gitignore対象）
- `skills/error-auto-healer/config.template.json` - テンプレート

---

## 5. 📧 Gmail Helper （Gmail連携）[NEW]

Gmailのメールを確認・検索するスキルです。OAuth2認証でGmail APIと連携し、メールの一覧表示、本文読み取り、検索が可能です。

### 使い方

**メール一覧:**
```bash
node skills/gmail-helper/gmail.js list
node skills/gmail-helper/gmail.js list --count 5
```

**メール読み取り:**
```bash
node skills/gmail-helper/gmail.js read <messageId>
```

**メール検索:**
```bash
node skills/gmail-helper/gmail.js search "from:example@gmail.com"
node skills/gmail-helper/gmail.js search "subject:invoice after:2024/01/01"
```

**未読メール:**
```bash
node skills/gmail-helper/gmail.js unread
```

### セットアップ
1. Google Cloud ConsoleでGmail APIを有効化
2. OAuth 2.0認証情報を取得し `~/.clawdbot/credentials/google.json` に保存
3. `node scripts/gmail-oauth.js` で認証フローを実行
4. `cd skills/gmail-helper && npm install`

### 設定ファイル
- `~/.clawdbot/credentials/google.json` - OAuth認証情報
- `~/.clawdbot/credentials/token.json` - アクセストークン

---

## 6. 💬 LINE Connector （LINE連携）[NEW]

LINE Messaging APIと連携してメッセージの送受信を行うスキルです。Webhookサーバーでメッセージ受信も可能です。

### 使い方

**メッセージ送信:**
```bash
node skills/line-connector/line.js send <userId> "こんにちは"
```

**Webhookサーバー起動:**
```bash
node skills/line-connector/line.js webhook
```

**チャネル情報確認:**
```bash
node skills/line-connector/line.js status
```

**ユーザープロフィール取得:**
```bash
node skills/line-connector/line.js profile <userId>
```

### セットアップ
1. [LINE Developers](https://developers.line.biz/) でMessaging APIチャネルを作成
2. Channel Access TokenとChannel Secretを取得
3. `~/.clawdbot/credentials/line.json` に保存:
   ```json
   {
     "channelAccessToken": "YOUR_TOKEN",
     "channelSecret": "YOUR_SECRET"
   }
   ```
4. `cd skills/line-connector && npm install`
5. Webhook URLをLINE Developersコンソールに設定

### 設定ファイル
- `~/.clawdbot/credentials/line.json` - LINE API認証情報

---

## 7. 🤖 LLM Provider （Kimi 2.5 / マルチLLM）[NEW]

Moonshot AI Kimi 2.5モデルを使ったチャット機能。OpenAI互換APIでプロバイダー切替が可能です。

### 使い方

**チャット（ストリーミング出力）:**
```bash
node skills/llm-provider/llm.js chat "量子コンピューティングについて説明して"
```

**思考モード:**
```bash
node skills/llm-provider/llm.js chat --think "この数学の問題を解いて"
```

**利用可能モデル一覧:**
```bash
node skills/llm-provider/llm.js models
```

**設定表示/変更:**
```bash
node skills/llm-provider/llm.js config
node skills/llm-provider/llm.js config set provider deepseek
node skills/llm-provider/llm.js config set model kimi-k2
```

### セットアップ
1. [Moonshot AI Platform](https://platform.moonshot.ai/) でAPIキーを取得
2. `~/.clawdbot/credentials/moonshot.json` に保存:
   ```json
   {
     "apiKey": "YOUR_API_KEY"
   }
   ```
3. `cd skills/llm-provider && npm install`

### 対応プロバイダー
| プロバイダー | モデル例 |
|---|---|
| moonshot | kimi-k2.5, kimi-k2, kimi-k2-thinking |
| openai | gpt-4o, gpt-4o-mini |
| deepseek | deepseek-chat, deepseek-reasoner |

### 設定ファイル
- `~/.clawdbot/credentials/moonshot.json` - API認証情報
- `~/.clawdbot/skills/llm-provider/config.json` - モデル設定

---

## 8. 📝 Task Tracker （タスクトラッカー）[NEW]

タスクの作成・進捗管理・完了を自動化するスキルです。Discordや他のツールと統合してタスクを一元管理します。

### 使い方

**タスク作成:**
- Discord: 「タスクを追加：〇〇機能の実装」
- 手動: `node skills/task-tracker/index.js add "task description"`

**タスク一覧:**
- Discord: 「タスク一覧」
- 手動: `node skills/task-tracker/index.js list`

**タスク更新:**
- Discord: 「タスク完了：〇〇」
- 手動: `node skills/task-tracker/index.js complete <task-id>`

### 設定ファイル
- `~/.clawdbot/skills/task-tracker/config.json`

---

## 9. 🤖 Personalized AI Agent （パーソナライズドAIエージェント）[NEW]

全てのスキルを統合し、ユーザーに合わせて自己進化するパーソナライズドAIエージェントです。ユーザーの行動パターンを学習し、最適なスキルを自動選択します。

### 使い方

**プロフィール確認:**
- 「私の傾向を分析して」
- 「パターン解析」
- 「学習モード」

**統合スキル一覧:**
- 「使えるスキルは？」
- 「統合されているスキル」

**自己進化の提案:**
- 「新しいスキルが必要そう」
- 「この作業を自動化したい」

### 統合されるスキル
- self-learning-agent: 行動パターン学習
- productivity-advisor: 生産性向上の提案
- morning-secretary: 朝の情報収集
- discord-task-auto-completer: Discordタスク自動完了
- error-auto-healer: エラー自動検出・修正

### 設定ファイル
- `~/.clawdbot/skills/personalized-ai-agent/config.json`

---

## 10. 🤖 Self-Learning Agent （自己学習エージェント）[NEW]

ユーザーの行動パターン、好み、文脈を学習し、自分自身をアップデートしていくAIエージェントスキルです。過去の対話から最適な応答を学習します。

### 使い方

**学習モード:**
- 「学習モード開始」
- 「パターン分析して」
- 「私の傾向を教えて」

**記憶の検索:**
- 「昨日の話の続き」
- 「〇〇について前に話したよね」
- 「過去の類似タスク」

**パターンの確認:**
- 「私の好みは？」
- 「学習したパターン」

### 設定ファイル
- `~/.clawdbot/skills/self-learning-agent/config.json`

---

## 11. 📊 Productivity Advisor （生産性アドバイザー）[NEW]

ユーザーの作業パターンを分析し、生産性向上の提案を自動生成するスキルです。作業時間の最適化や効率的なワークフローの提案を行います。

### 使い方

**生産性分析:**
- 「今の生産性を教えて」
- 「効率化の提案」
- 「生産性改善して」

**作業時間の分析:**
- 「今日の稼働時間は？」
- 「今週の生産性」

**効率化の提案:**
- 「この作業を効率化して」
- 「もっと生産的には？」

### 設定ファイル
- `~/.clawdbot/skills/productivity-advisor/config.json`

---

## 12. 🤖 Discord Task Auto-Completer （Discordタスク自動完了）[NEW]

Discordのログを解析し、タスクを自動抽出・管理・完了するAIアシスタントスキルです。完了の兆候を検出してタスクを自動的に完了させます。

### 使い方

**タスク一覧:**
- 「タスク一覧」
- 「タスク状況を教えて」
- 「今のタスクは？」

**手動完了:**
- 「完了したタスク」
- 「完了マーク：〇〇」

**学習機能:**
- 「学習モード」
- 「キーワード追加：〇〇」

### 設定ファイル
- `~/.clawdbot/skills/discord-task-auto-completer/config.json`

---

## 13. 🌅 Morning Secretary （朝の秘書）[NEW]

毎朝の情報を自動収集し、ユーザーに提供するスキルです。天気、予定、メールなど朝に必要な情報をまとめて表示します。

### 使い方

**朝の情報取得:**
- 「おはようございます」
- 「今日の予定は？」
- 「朝の情報を教えて」

**設定済みの情報源:**
- 天気予報
- Google Calendar
- Gmail未読
- 今日のタスク一覧

### 設定ファイル
- `~/.clawdbot/skills/morning-secretary/config.json`

---

## 14. 💼 Base Wallet （ベースウォレット）[NEW]

Baseチェーンのウォレット機能を提供するスキルです。残高確認、送金、履歴の閲覧が可能です。

### 使い方

**残高確認:**
- 「残高は？」

**送金:**
- 「〇〇アドレスに〇〇送って」

**履歴確認:**
- 「トランザクション履歴」

### 設定ファイル
- `~/.clawdbot/skills/base-wallet/config.json`

---

## 15. 👨‍💻 Coder Agent （コーダーエージェント）[NEW]

コード生成・レビュー・リファクタリングを自動化するAIエージェントスキルです。コード品質の向上や開発効率の改善を支援します。

### 使い方

**コード生成:**
- 「〇〇機能を実装して」
- 「〇〇関数を書いて」

**コードレビュー:**
- 「このコードレビューして」
- 「バグを探して」

**リファクタリング:**
- 「このコードをきれいにして」
- 「もっと効率的にして」

### 設定ファイル
- `~/.clawdbot/skills/coder-agent/config.json`

---

## 16. 📈 DEX Trader （DEXトレーダー）[NEW]

分散型取引所（DEX）でのトレードを支援するスキルです。価格監視、注文管理、ポートフォリオ分析が可能です。

### 使い方

**価格確認:**
- 「〇〇の価格は？」

**注文作成:**
- 「〇〇を〇〇で売買」

**ポートフォリオ確認:**
- 「私のポートフォリオ」

### 設定ファイル
- `~/.clawdbot/skills/dex-trader/config.json`

---

## 17. 🎨 NFT Creator （NFTクリエイター）[NEW]

NFTの作成・ミント・管理を支援するスキルです。メタデータ設定やコレクション管理が可能です。

### 使い方

**NFT作成:**
- 「NFTを作成して」
- 「新しいNFTをミントして」

**メタデータ設定:**
- 「メタデータを設定して」
- 「コレクションを管理」

### 設定ファイル
- `~/.clawdbot/skills/nft-creator/config.json`

---

## 18. 🔗 Social Connector （ソーシャルコネクター）[NEW]

各種ソーシャルサービスとの連携を提供するスキルです。Twitter、Facebook、InstagramなどのAPIを通じて投稿・管理が可能です。

### 使い方

**投稿:**
- 「Twitterに投稿して」
- 「Facebookにシェアして」

**管理:**
- 「ソーシャルの状況を教えて」

### 設定ファイル
- `~/.clawdbot/skills/social-connector/config.json`

---

## 19. 🖥️ X402 Server （X402サーバー）[NEW]

X402プロトコルのサーバー機能を提供するスキルです。

### 設定ファイル
- `~/.clawdbot/skills/x402-server/config.json`

---

## スキルの管理

### 一覧表示
```bash
clawdbot skills list
```

### スキルのリロード/追加
新しいスキルを追加した場合は、Gatewayを再起動すると認識されます。
```bash
# Gateway再起動
taskkill /F /IM node.exe
clawdbot gateway --port 18789 --daemon
```

---

## スキルの開発

新しいスキルを開発する場合は、`skills/`ディレクトリに新しいフォルダを作成し、以下の構造で配置してください：

```
skills/your-skill/
├── package.json      # npmパッケージ設定
├── skill.json        # OpenClawスキル定義
├── config.json       # ユーザー設定（オプション）
├── README.md         # ドキュメント
└── index.js          # メインエントリポイント
```

スキルのテンプレートは既存のスキルを参考にしてください。
