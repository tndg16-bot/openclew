# Clawdbot 設定管理

このディレクトリにはClawdbotの設定ファイルの例が含まれています。

## 設定ファイルの構成

実際の設定ファイルは `~/.clawdbot/` ディレクトリに保存されます：

```
~/.clawdbot/
├── clawdbot.json          # メイン設定ファイル
├── credentials/            # 認証情報（トークン、APIキー）
│   ├── discord.json       # Discord Bot Token
│   ├── openai.json       # OpenAI API Key
│   └── ...
├── cron/                 # 定期タスク
│   └── jobs.json        # ジョブ設定
├── skills/               # インストール済みスキル
└── logs/                 # ログファイル
```

## 設定ファイルの使い方

### 手動で設定する場合

1. `clawdbot.json.example` を `~/.clawdbot/clawdbot.json` にコピー
2. 必要な値を編集
3. Clawdbotを再起動（設定変更は自動検知されます）

### 環境変数で設定する場合（推奨）

認証情報は環境変数で設定する方が安全です：

```bash
# Windows (PowerShell)
$env:DISCORD_BOT_TOKEN = "your_token_here"
$env:OPENAI_API_KEY = "your_api_key_here"

# Linux/macOS
export DISCORD_BOT_TOKEN="your_token_here"
export OPENAI_API_KEY="your_api_key_here"
```

## 認証情報の管理

### 安全な設定方法

1. **このリポジトリに含まれている例ファイル**:
   - `clawdbot.json.example` - 機密情報を含まない設定例
   - `jobs.json.example` - ジョブ設定例

2. **機密情報は含めない**:
   - `.gitignore` で以下が除外されています:
     - `.clawdbot/credentials/` (全ての認証情報)
     - `.clawdbot/.env`
     - `.clawdbot/logs/`

3. **実際の設定**:
   - `~/.clawdbot/clawdbot.json` はローカルでのみ管理
   - 認証情報は `credentials/` ディレクトリに保存

### トークンの取得方法

#### Discord Bot Token

1. https://discord.com/developers/applications にアクセス
2. アプリケーションを選択 → **Bot** → **Add Bot**
3. **Privileged Gateway Intents** で以下を有効化:
   - ✅ Message Content Intent (必須)
   - ✅ Server Members Intent (推奨)
4. Bot Tokenをコピー

#### OpenAI API Key

1. https://platform.openai.com/api-keys にアクセス
2. **Create new secret key** をクリック
3. APIキーをコピー

## 設定の同期方法

このリポジトリの設定を更新した場合：

```bash
# 1. openclewディレクトリに移動
cd ~/openclew

# 2. 変更をコミット
git add .
git commit -m "Update Clawdbot config"

# 3. GitHubにプッシュ
git push origin main

# 4. 他のマシンで設定を適用する場合:
cp clawdbot-config/clawdbot.json.example ~/.clawdbot/clawdbot.json
cp clawdbot-config/jobs.json.example ~/.clawdbot/cron/jobs.json
```

## 設定の自動リロード

Clawdbotは設定ファイルの変更を自動検知して再読み込みします。

変更を反映させるには、設定ファイルを保存するだけでOKです。

## トラブルシューティング

### Clawdbotが動作しない場合

```bash
# 設定を確認
cat ~/.clawdbot/clawdbot.json

# ログを確認
tail -f /tmp/clawdbot/clawdbot-*.log

# ステータスを確認
clawdbot status
```

### 設定エラーが発生する場合

1. JSON形式が正しいか確認:
   ```bash
   cat ~/.clawdbot/clawdbot.json | jq .
   ```

2. 必要なフィールドがすべてあるか確認

3. 認証情報が正しいか確認

## リファレンス

- [Clawdbot公式ドキュメント](https://docs.clawd.bot)
- [Discord Botセットアップガイド](../DiscordBotセットアップガイド.md)
- [OPENCLAW_BEST_PRACTICES.md](../OPENCLAW_BEST_PRACTICES.md)
