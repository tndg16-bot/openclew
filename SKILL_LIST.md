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

## 4. 🤖 Error Auto Healer （エラー自動修復）[NEW]

GitHub ActionsやVercelのビルドエラーを自動検知し、AIが原因を解析して修正コードを生成・コミット・プッシュし、最終的にCI/CDパイプラインを再実行する完全自動化スキルです。

### 機能
- ✅ **自動エラー検知**: Gmailを監視してエラーメールを検出
- 🔍 **エラー解析**: GitHub Actions/Vercelのエラーを自動解析
- 🧠 **AI自動修復**: OpenClawがエラーを分析し修正コードを生成
- 🚀 **自動デプロイ**: 修正をコミット・プッシュしActionsを再実行
- 📱 **Discord通知**: 全ての処理をDiscordにリアルタイム通知
- 🛡️ **セーフガード**: 無限ループ防止、最大試行回数制限

### 使い方

**監視モードで起動:**
```bash
node ~/.clawdbot/skills/error-auto-healer/healer.js start
```

**ステータス確認:**
```bash
node ~/.clawdbot/skills/error-auto-healer/healer.js status
```

**修復履歴確認:**
```bash
node ~/.clawdbot/skills/error-auto-healer/healer.js history
```

### セットアップ手順

1. **Discordチャンネル作成**: 「🔧error-auto-healer」チャンネルを作成
2. **Gmail API設定**: Google Cloud ConsoleでGmail APIを有効化し、認証情報を取得
3. **GitHub認証**: Personal Access Tokenを発行
4. **設定ファイル編集**: `config.json`に各種設定を記述
5. **依存関係インストール**: `npm install`

### 動作フロー
```
Gmailエラー通知検知
    ↓
エラー解析（リポジトリ・ブランチ・エラー内容を抽出）
    ↓
Discord通知（エラー検知を報告）
    ↓
AI修復プロセス開始
    ↓
リポジトリクローン → ブランチ作成 → 修正適用 → コミット → プッシュ
    ↓
GitHub Actions再実行
    ↓
Discord通知（成功/失敗を報告）
```

### セーフガード機能
- **クールダウン**: 同じエラーに対する連続修復を30分間防止
- **最大試行回数**: 同じエラーに対して最大3回まで試行
- **ブランチ保護**: main/masterへの直接pushをブロック
- **完全ログ**: 全ての修復試行を履歴として保存

### 設定ファイル
`~/.clawdbot/skills/error-auto-healer/`

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
