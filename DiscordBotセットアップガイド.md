# Discord Bot セットアップガイド

ClawdbotをDiscordから操作できるようにする手順です。

## 手順 1: Discord Botを作成

### 1. Discord Developer Portalにアクセス
https://discord.com/developers/applications

### 2. アプリケーションを作成
1. **New Application** をクリック
2. アプリケーション名を入力（例：`clawdbot`）
3. **Create** をクリック

### 3. Botユーザーを作成
1. 左サイドバーの **Bot** をクリック
2. **Add Bot** をクリック
3. 確認メッセージで **Yes, do it!** をクリック

### 4. Bot Tokenをコピー（重要）
1. **Reset Token** の横にある **Copy** ボタンをクリック
2. このトークンをメモ帳などに保存（後で使用します）
3. ⚠️ **このトークンは秘密情報です。他人と共有しないでください。**

### 5. 特権Gateaway Intentsを有効化
Botの設定画面で、以下の項目を有効化します：

**Privileged Gateway Intents:**
- ✅ **Message Content Intent**（必須）
- ✅ **Server Members Intent**（推奨）

これらを有効にしないと、botはメッセージを読み取れません。

### 6. OAuth2 URLを作成してBotをサーバーに招待
1. 左サイドバーの **OAuth2** → **URL Generator** をクリック

**Scopes:**
- ✅ `bot`
- ✅ `applications.commands`

**Bot Permissions:**
- ✅ View Channels
- ✅ Send Messages
- ✅ Read Message History
- ✅ Embed Links
- ✅ Attach Files
- ✅ Add Reactions

2. 生成されたURLをコピー
3. ブラウザでURLを開く
4. 使用するサーバーを選択して **Authorize** をクリック

### 7. IDを取得（設定に必要）
1. Discordの設定（User Settings）→ Advanced → **Developer Mode** を有効化
2. 必要なIDを右クリック → Copy ID でコピー：
   - サーバーID（Guild ID）
   - チャンネルID
   - ユーザーID

## 手順 2: ClawdbotにBot Tokenを設定

### 方法1: 環境変数を使用（推奨）

```bash
# Windows (PowerShell)
$env:DISCORD_BOT_TOKEN = "あなたのBot_Token"

# Windows (コマンドプロンプト)
set DISCORD_BOT_TOKEN=あなたのBot_Token
```

### 方法2: 設定ファイルを編集

Clawdbotの設定ファイルを開きます：

```bash
# Windows
notepad $env:USERPROFILE\.clawdbot\clawdbot.json
```

以下の設定を更新します：

```json
{
  "channels": {
    "discord": {
      "enabled": true,
      "token": "あなたのBot_Token_ここにペースト",
      "groupPolicy": "allowlist",
      "guilds": {
        "あなたのサーバーID": {
          "users": ["あなたのユーザーID"],
          "requireMention": true,
          "channels": {
            "general": { "allow": true }
          }
        }
      }
    }
  }
}
```

**設定の説明：**
- `token`: 手順1.4でコピーしたBot Token
- `guilds`: Botを招待したサーバー
- `users`: Botを使用を許可するユーザーのID
- `requireMention`: `true`にすると、メンション（@bot）した時だけ応答します（推奨）
- `channels`: 使用を許可するチャンネル（`*`で全チャンネル許可）

## 手順 3: Gatewayを起動

```bash
# 前景で実行（テスト用）
clawdbot gateway --port 18789 --verbose

# バックグラウンドで実行（推奨）
clawdbot gateway --port 18789 --daemon
```

Gatewayが正常に起動すると、以下のようなログが表示されます：

```
[INFO] Discord connected
[INFO] Gateway listening on port 18789
```

## 手順 4: テスト

1. DiscordでBotを招待したサーバーを開く
2. 許可したチャンネルでBotをメンションしてメッセージを送信：

```
@Bot名 こんにちは
```

3. Botが応答すれば成功です！

## トラブルシューティング

### Botが応答しない場合

1. **Intentsが有効か確認**
   - Discord Developer Portal → Bot → Privileged Gateway Intents
   - Message Content Intent が有効になっているか

2. **権限が正しいか確認**
   - Botがそのチャンネルでメッセージを送信・読み取れる権限を持っているか
   - サーバー設定 → ロール → Botのロールで権限を確認

3. **Bot Tokenが正しいか確認**
   - Tokenが正しくコピーされているか
   - 設定ファイルに正しく保存されているか

4. **Gatewayが起動しているか確認**
   ```bash
   clawdbot gateway status
   ```

### "Used disallowed intents" エラー

Discord Developer Portalで **Message Content Intent** を有効にしてからGatewayを再起動してください。

### Botがメンションしないと応答しない

これは設定の `requireMention: true` による正常な動作です。
全メッセージに応答させたい場合、`requireMention: false` に設定してください。

## 次のステップ

- [ ] DiscordでBotにメッセージを送ってテスト
- [ ] 便利なスキルを追加する（ブラウザ操作、音声認識など）
- [ ] 複数のチャンネルで使用する設定を行う

---

**参考情報：**
- Clawdbot公式ドキュメント: https://docs.clawd.bot/channels/discord
- Discord Developer Portal: https://discord.com/developers/applications
