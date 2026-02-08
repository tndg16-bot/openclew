# Morning Secretary - ベストプラクティス集

GitHubやコミュニティから収集した実装パターン

## 📊 スキル設計のベストプラクティス

### 1. SKILL.md の構造

```markdown
---
name: 【スキル名】
description: 【簡潔な説明】
metadata: {"clawdbot":{"emoji":"🎨"}}
version: 1.0.0
author: 【作者名】
tags: [【タグ1】, 【タグ2】]
---

# 【スキル名】

## 概要
【このスキルが何をするか、なぜ必要か】

## トリガー
- 自動: cron("【スケジュール】")
- 手動: 【キーワード1】, 【キーワード2】

## 手順
### Step 1: 【アクション】
【詳細な手順とコード例】

## データ永続化
【保存先と形式】

## エラーハンドリング
【よくあるエラーと対処法】
```

### 2. データ管理パターン

```javascript
// store.js の基本構造
class SkillStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.dataFile = path.join(baseDir, 'data.json');
  }

  // 読み込み（存在しない場合はデフォルト）
  async load() {
    try {
      return JSON.parse(await fs.readFile(this.dataFile, 'utf8'));
    } catch {
      return { default: 'value' };
    }
  }

  // 書き込み（必ず読み込んでから）
  async save(data) {
    await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
  }
}
```

### 3. Cronジョブの命名規則

```
【カテゴリ】-【ユーザーID】-【日付】-【時間】

例:
- morning-12345-20260206-0700    (朝のサマリー)
- progress-12345-20260206-1000   (進捗確認)
- summary-12345-20260206-1800    (日次サマリー)
```

### 4. エラーハンドリングの階層

```javascript
// Level 1: リトライ可能なエラー
if (error.code === 'RATE_LIMIT') {
  await sleep(5000);
  return retry();
}

// Level 2: フォールバック
if (error.code === 'API_ERROR') {
  return fallbackMethod();
}

// Level 3: ユーザー通知
if (error.code === 'AUTH_ERROR') {
  await notifyUser('再認証が必要です');
  return;
}
```

## 🔐 セキュリティベストプラクティス

### 1. Token管理

```json
{
  "auth": {
    "profiles": {
      "gmail": {
        "provider": "google",
        "mode": "oauth",
        "scopes": ["gmail.readonly"]  // 最小権限
      }
    }
  }
}
```

### 2. データアクセス制限

```javascript
// 自分のデータのみアクセス
const userData = await store.load(userId);
if (userData.owner !== currentUserId) {
  throw new Error('Unauthorized');
}
```

### 3. ログの機密情報除去

```javascript
// ❌ 悪い例
console.log('API Key:', apiKey);

// ✅ 良い例
console.log('API Key:', '***' + apiKey.slice(-4));
```

## 🎨 ユーザー体験の最適化

### 1. メッセージの構造

```
【絵文字】【タイトル】 - 【サブタイトル】
━━━━━━━━━━━━━━━━━━━━━━
【内容】
━━━━━━━━━━━━━━━━━━━━━━
【アクション項目】
```

### 2. 進捗インジケータ

```javascript
// 長時間処理の場合
await channels.send('⏳ 処理中... (1/3) Gmail取得');
// ...処理...
await channels.send('⏳ 処理中... (2/3) カレンダー取得');
// ...処理...
await channels.send('✅ 完了！(3/3) レポート作成');
```

### 3. コンテキスト保持

```javascript
// 会話の文脈を記憶
await memory.add({
  type: 'task',
  content: '朝のサマリー作成',
  timestamp: new Date(),
  metadata: { emails: 5, events: 3 }
});
```

## 🚀 パフォーマンス最適化

### 1. 並列処理

```javascript
// 独立した処理は並列実行
const [emails, events] = await Promise.all([
  gmail.list(),
  calendar.list()
]);
```

### 2. キャッシング

```javascript
// 頻繁に変わらないデータはキャッシュ
const cacheKey = `calendar-${today}`;
let events = cache.get(cacheKey);
if (!events) {
  events = await calendar.list();
  cache.set(cacheKey, events, 300); // 5分キャッシュ
}
```

### 3. 遅延実行

```javascript
// 即時レスポンス + バックグラウンド処理
await channels.send('📝 レポート作成中...');

// 非同期で重い処理を実行
setImmediate(async () => {
  const report = await generateDetailedReport();
  await channels.send(report);
});
```

## 📱 マルチチャンネル対応

### 1. チャンネル抽象化

```javascript
class ChannelManager {
  async send(message, options = {}) {
    const { channel = 'discord', ...rest } = options;
    
    switch(channel) {
      case 'discord':
        return await discord.send(message, rest);
      case 'line':
        return await line.push(message, rest);
      case 'slack':
        return await slack.post(message, rest);
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }
  }
}
```

### 2. フォールバック戦略

```javascript
async function notifyWithFallback(message) {
  const channels = ['discord', 'line', 'slack'];
  
  for (const channel of channels) {
    try {
      return await sendToChannel(channel, message);
    } catch (error) {
      console.log(`${channel} failed, trying next...`);
    }
  }
  
  // すべて失敗した場合はログ
  console.error('All channels failed:', message);
}
```

## 🔧 デバッグ・テスト

### 1. テストデータ

```javascript
// test-data.js
module.exports = {
  emails: [
    { subject: 'テストメール', from: 'test@example.com', unread: true }
  ],
  events: [
    { summary: '打ち合わせ', start: '10:00', end: '11:00' }
  ]
};
```

### 2. モックモード

```javascript
// 開発時はAPIを呼ばない
const isDev = process.env.NODE_ENV === 'development';

const emails = isDev 
  ? require('./test-data').emails
  : await gmail.list();
```

### 3. ログレベル

```javascript
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

function log(level, message) {
  if (LOG_LEVELS[level] >= currentLevel) {
    console.log(`[${level}] ${message}`);
  }
}
```

## 📚 参考実装

- **Working Hours Tracker**: スケジュール管理のベストプラクティス
- **Agent Mail**: MCPパターンの実装例
- **Coding Agent Session Search**: 履歴管理の実装例

## 🔗 参考リンク

- 公式ドキュメント: https://docs.clawd.bot
- GitHub Skills例: https://github.com/VoltAgent/awesome-openclaw-skills
- セキュリティガイド: https://securemolt.com/guides/
