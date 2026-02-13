---
name: error-handler
description: 標準化されたエラーハンドリング、ロギング、リカバリ機能を提供するスキル
metadata: {"clawdbot":{"emoji":"🛡️"}}
version: 1.0.0
author: user
tags: [error-handling, logging, recovery, monitoring, stability]
---

# Error Handler Skill

エラーのキャッチ、記録、分析、自動リカバリを行う標準化されたエラーハンドリングスキルです。

## 概要

このスキルは、以下の機能を提供します：

1. **エラーキャッチ** - 全スキルのエラーを一元的にキャッチ
2. **エラーロギング** - 構造化されたエラーログ
3. **エラー分類** - エラーの種類と重大度の自動分類
4. **自動リカバリ** - 共通エラーパターンの自動修復
5. **エラー監視** - エラー統計とアラート
6. **ヘルスチェック** - システム全体のヘルス状態監視

## トリガー

### システムコマンド
- `:error stats` - エラー統計を表示
- `:error recent` - 最近のエラーを表示
- `:error clear` - エラーログをクリア
- `:health check` - ヘルスチェック実行

## エラー分類

### エラータイプ

| タイプ | 説明 | 例 |
|--------|------|-----|
| `network` | ネットワーク関連エラー | ECONNREFUSED, ETIMEDOUT |
| `authentication` | 認証エラー | 401 Unauthorized |
| `authorization` | 認可エラー | 403 Forbidden |
| `validation` | 入力検証エラー | Invalid parameter |
| `dependency` | 外部依存関係エラー | Module not found |
| `runtime` | 実行時エラー | TypeError, ReferenceError |
| `system` | システムレベルエラー | Out of memory |
| `api` | API関連エラー | 500 Internal Server Error |
| `unknown` | 不明なエラー | Uncategorized errors |

### 重大度レベル

| レベル | 説明 | アクション |
|--------|------|----------|
| `critical` | システム停止、緊急対応必要 | 即時通知、リカバリ試行 |
| `high` | 主要機能の障害 | 通知、リカバリ試行 |
| `medium` | 一部機能の制限 | ログ記録、リカバリ試行 |
| `low` | 軽微な問題 | ログ記録のみ |

## 使用方法

### エラーハンドリングの追加

```javascript
const { ErrorHandler } = require('./skills/error-handler');

const errorHandler = new ErrorHandler(eventBus, contextManager);
await errorHandler.initialize();

// エラーをハンドル
try {
  await someOperation();
} catch (error) {
  await errorHandler.handleError(error, {
    source: 'my-skill',
    operation: 'someOperation',
    context: { userId: '123' }
  });
}
```

### ヘルスチェック

```javascript
const health = await errorHandler.getHealth();
console.log('Overall health:', health.status);
console.log('Services:', health.services);
```

### エラー統計

```javascript
const stats = await errorHandler.getStats();
console.log('Total errors:', stats.total);
console.log('By type:', stats.byType);
console.log('By severity:', stats.bySeverity);
```

## 設定

### config.json

```json
{
  "logging": {
    "enabled": true,
    "logPath": "logs/errors.log",
    "maxLogSize": "10M",
    "maxLogFiles": 5,
    "logLevel": "info",
    "structuredLogging": true
  },
  "recovery": {
    "enabled": true,
    "maxRetries": 3,
    "retryDelay": 1000,
    "exponentialBackoff": true
  },
  "alerts": {
    "enabled": true,
    "criticalThreshold": 5,
    "highThreshold": 10,
    "alertWindow": 300,
    "alertChannels": ["general"]
  },
  "monitoring": {
    "enabled": true,
    "healthCheckInterval": 60,
    "statsRetentionDays": 30
  }
}
```

## 自動リカバリ戦略

### サポートされているリカバリ

1. **Network Errors**:
   - 自動リトライ（指数バックオフ）
   - コネクション再確立

2. **Authentication Errors**:
   - トークン更新リクエスト
   - 再認証フローのトリガー

3. **Rate Limit Errors**:
   - 指数バックオフ
   - キューイング

4. **Module Not Found**:
   - 依存関係の再インストール試行
   - モジュールキャッシュのクリア

## エラーデータ構造

```json
{
  "id": "err_1234567890",
  "timestamp": "2026-02-09T10:00:00Z",
  "type": "network",
  "severity": "high",
  "source": "my-skill",
  "operation": "someOperation",
  "message": "Connection refused",
  "stackTrace": "Error: Connection refused...",
  "context": {
    "userId": "123",
    "attempt": 1
  },
  "recovered": false,
  "retryCount": 0
}
```

## イベント

| イベント名 | 説明 |
|-----------|------|
| `error_occurred` - エラーが発生した |
| `error_recovered` - エラーから回復した |
| `error_failed` - リカバリに失敗した |
| `health_status_changed` - ヘルスステータスが変化した |
| `error_threshold_exceeded` - エラー閾値を超過した |

## 依存関係

```json
{
  "dependencies": {
    "fs": "*",
    "path": "*",
    "../lib/context-sharing": "*",
    "../lib/skill-event-bus": "*"
  }
}
```

## ヘルスチェック

### サービス状態

| サービス | 説明 |
|---------|------|
| `event_bus` | イベントバスの稼働状態 |
| `skills` | アクティブなスキルの状態 |
| `external_apis` | 外部API接続状態 |
| `database` - データベース接続状態 |

---

**文書バージョン**: 1.0.0
**最終更新**: 2026-02-09
