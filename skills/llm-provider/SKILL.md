# LLM Provider (Kimi 2.5)

## 概要
Moonshot AI Kimi 2.5モデルを使ったチャット機能。OpenAI互換APIでプロバイダー切替可能。

## コマンド
- `node llm.js chat <message>` - チャット（ストリーミング出力）
- `node llm.js chat --think <message>` - 思考モードでチャット
- `node llm.js models` - 利用可能モデル一覧
- `node llm.js config` - 現在の設定表示
- `node llm.js config set <key> <value>` - 設定変更

## セットアップ
1. [Moonshot AI Platform](https://platform.moonshot.ai/) でAPIキーを取得
2. `~/.clawdbot/credentials/moonshot.json` に以下を保存:
   ```json
   {
     "apiKey": "YOUR_MOONSHOT_API_KEY"
   }
   ```
3. `cd skills/llm-provider && npm install`

## 設定
設定ファイル: `~/.clawdbot/skills/llm-provider/config.json`
- `provider`: moonshot / openai / deepseek
- `model`: kimi-k2.5 (デフォルト)
- `temperature`: 0.6 (デフォルト)
- `topP`: 0.95
- `maxTokens`: 4096

## 対応プロバイダー
| プロバイダー | モデル例 |
|---|---|
| moonshot | kimi-k2.5, kimi-k2, kimi-k2-thinking |
| openai | gpt-4o, gpt-4o-mini |
| deepseek | deepseek-chat, deepseek-reasoner |
