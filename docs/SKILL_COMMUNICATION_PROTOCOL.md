# スキル間通信プロトコル (Skill Communication Protocol)

**バージョン**: 1.0.0
**作成日**: 2026-02-09

---

## 概要

OpenClawプロジェクト内のスキル間で通信を行うための統一されたプロトコル定義。

---

## メッセージフォーマット

### 基本構造

```json
{
  "id": "msg_123456789",
  "type": "request|response|event|notification",
  "timestamp": "2026-02-09T07:53:00.000Z",
  "source": "personalized-ai-agent",
  "target": "self-learning-agent",
  "priority": "high|normal|low",
  "correlationId": "corr_123",
  "payload": {
    "action": "get_pattern",
    "data": {}
  },
  "metadata": {
    "timeout": 5000,
    "retry": 3,
    "encoding": "utf-8"
  }
}
```

### フィールド説明

| フィールド | 型 | 必須 | 説明 |
|-----------|------|--------|------|
| `id` | string | ✅ | メッセージの一意識別子（UUID推奨） |
| `type` | enum | ✅ | メッセージタイプ: `request`, `response`, `event`, `notification` |
| `timestamp` | string (ISO8601) | ✅ | メッセージ作成時刻 |
| `source` | string | ✅ | 送信元スキルID |
| `target` | string | ✅ | 受信先スキルID（ブロードキャスト時は`*`） |
| `priority` | enum | - | 優先度: `high`, `normal`, `low`（デフォルト: `normal`） |
| `correlationId` | string | - | リクエスト-レスポンスペアの関連付けID |
| `payload` | object | ✅ | メッセージ本文 |
| `metadata` | object | - | 追加メタデータ |

---

## メッセージタイプ

### 1. Request（リクエスト）

他のスキルへリクエストを送信する場合に使用。

```json
{
  "type": "request",
  "payload": {
    "action": "get_user_profile",
    "params": {
      "userId": "user123"
    }
  },
  "metadata": {
    "timeout": 5000,
    "retry": 3
  }
}
```

### 2. Response（レスポンス）

リクエストへの応答。

```json
{
  "type": "response",
  "correlationId": "corr_123",
  "payload": {
    "status": "success|error|partial",
    "data": {},
    "error": {
      "code": "ERR_NOT_FOUND",
      "message": "Profile not found"
    }
  }
}
```

### 3. Event（イベント）

ステータス変更など、一方向の通知。

```json
{
  "type": "event",
  "target": "*",
  "payload": {
    "eventType": "pattern_updated",
    "timestamp": "2026-02-09T07:53:00.000Z"
  }
}
```

### 4. Notification（通知）

ユーザー向けの通知。

```json
{
  "type": "notification",
  "target": "morning-secretary",
  "payload": {
    "message": "Daily report ready",
    "channel": "discord",
    "priority": "high"
  }
}
```

---

## イベント定義

### 共通イベント

| イベント名 | 説明 | ペイロード |
|-----------|------|-----------|
| `skill_ready` | スキル準備完了 | `{ skillId, version, capabilities }` |
| `skill_shutdown` | スキルシャットダウン | `{ skillId, reason }` |
| `context_update` | コンテキスト更新 | `{ contextType, data }` |
| `pattern_detected` | パターン検出 | `{ patternType, confidence, data }` |
| `task_completed` | タスク完了 | `{ taskId, status, result }` |
| `error_occurred` | エラー発生 | `{ errorCode, message, stack }` |

---

## スキル登録・発見

### 登録メッセージ

```json
{
  "type": "event",
  "target": "*",
  "payload": {
    "eventType": "skill_ready",
    "skillId": "self-learning-agent",
    "version": "1.0.0",
    "capabilities": [
      "pattern_analysis",
      "user_profiling",
      "learning"
    ],
    "endpoints": {
      "request": "ipc://skill/self-learning-agent",
      "events": "ipc://skill/self-learning-agent/events"
    }
  }
}
```

### 発見クエリ

```json
{
  "type": "request",
  "target": "*",
  "payload": {
    "action": "discover_skills",
    "filter": {
      "capability": "pattern_analysis"
    }
  }
}
```

---

## エラーコード

| コード | 説明 |
|-------|------|
| `ERR_INVALID_REQUEST` | 無効なリクエスト |
| `ERR_SKILL_NOT_FOUND` | スキルが見つからない |
| `ERR_TIMEOUT` | タイムアウト |
| `ERR_PERMISSION_DENIED` | 権限なし |
| `ERR_UNSUPPORTED_ACTION` | サポートされないアクション |
| `ERR_INTERNAL` | 内部エラー |
| `ERR_PAYLOAD_TOO_LARGE` | ペイロードサイズ超過 |
| `ERR_RATE_LIMITED` | レート制限 |

---

## セキュリティ

### 認証・認可

- メッセージ送信元の検証
- アクション実行の権限チェック

### データ保護

- 機密情報の暗号化
- ユーザーデータの匿名化

---

## 実装要件

### 1. イベントバス

```javascript
class SkillEventBus {
  // スキル登録
  register(skillId, endpoint) { }

  // メッセージ送信
  send(message) { }

  // メッセージ購読
  subscribe(skillId, pattern, callback) { }

  // メッセージ購読解除
  unsubscribe(skillId, pattern) { }
}
```

### 2. スキルアダプター

各スキルは以下のインターフェースを実装:

```javascript
class SkillAdapter {
  // 初期化
  async initialize(eventBus) { }

  // メッセージ処理
  async handle(message) { }

  // 終了処理
  async shutdown() { }
}
```

---

## 使用例

### リクエスト送信

```javascript
const message = {
  id: generateUUID(),
  type: 'request',
  timestamp: new Date().toISOString(),
  source: 'personalized-ai-agent',
  target: 'self-learning-agent',
  payload: {
    action: 'get_user_profile',
    params: { userId: 'user123' }
  },
  metadata: { timeout: 5000 }
};

await eventBus.send(message);
```

### レスポンス受信

```javascript
eventBus.subscribe('personalized-ai-agent', {
  type: 'response',
  correlationId: message.id
}, (response) => {
  if (response.payload.status === 'success') {
    console.log('Data:', response.payload.data);
  }
});
```

### イベント発行

```javascript
const event = {
  id: generateUUID(),
  type: 'event',
  timestamp: new Date().toISOString(),
  source: 'self-learning-agent',
  target: '*',
  payload: {
    eventType: 'pattern_detected',
    patternType: 'coding_pattern',
    confidence: 0.85,
    data: { frequency: 10, timeOfDay: 'afternoon' }
  }
};

await eventBus.send(event);
```

---

## スケーラビリティ考慮

1. **非同期処理**: 全ての通信は非同期で行う
2. **メッセージキュー**: 負荷分散のためのキュー導入
3. **タイムアウト**: すべてのリクエストにタイムアウト設定
4. **再試行**: 一時的エラーに対する再試行ロジック
5. **バックプレッシャー**: エラー時の指数的バックオフ

---

## 将来の拡張

1. **RPC over IPC**: 高速プロセス間通信
2. **WebSocket**: リアルタイム双方向通信
3. **Message Broker**: RabbitMQ/Kafkaの導入
4. **分散追跡**: OpenTelemetryによる追跡
5. **スキルオーケストレーション**: 複数スキルの連携実行

---

**文書バージョン**: 1.0.0
**最終更新**: 2026-02-09 08:00 (Asia/Tokyo)
