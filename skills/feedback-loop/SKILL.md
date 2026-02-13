---
name: feedback-loop
description: ユーザーフィードバックを収集・分析し、AIの学習を改善するフィードバックループスキル
metadata: {"clawdbot":{"emoji":"🔄"}}
version: 1.0.0
author: user
tags: [feedback, learning, improvement, rating, ai-evolution]
---

# Feedback Loop Skill

ユーザーフィードバックを収集・分析し、AIエージェントのパフォーマンスを継続的に改善するためのフィードバックループスキルです。

## 概要

このスキルは、以下の機能を提供します：

1. **フィードバック収集** - ユーザーからのフィードバックを収集
2. **フィードバック分析** - フィードバックの統計分析
3. **パターン更新** - フィードバックに基づいてパターン信頼度を更新
4. **改善提案** - 学習結果に基づく改善提案
5. **フィードバック履歴** - フィードバック履歴の記録と検索

## トリガー

### フィードバック関連
- 「良いよ」「いいね」「👍」 - ポジティブフィードバック
- 「違う」「違うよ」「👎」 - ネガティブフィードバック
- 「フィードバック」 - フィードバック履歴を表示
- 「統計」 - フィードバック統計を表示

### システムコマンド
- `:feedback positive [item_id]` - 正のフィードバックを記録
- `:feedback negative [item_id]` - 負のフィードバックを記録
- `:feedback rating 1-5 [item_id]` - 評価を記録
- `:feedback stats` - 統計情報を表示
- `:feedback history` - フィードバック履歴を表示

## データ構造

```json
{
  "feedback": [
    {
      "id": "fb-001",
      "itemId": "pattern-123",
      "itemType": "pattern",
      "rating": 5,
      "sentiment": "positive",
      "comment": "素晴らしい提案！",
      "context": {
        "timestamp": "2026-02-09T00:00:00Z",
        "channel": "general",
        "user": "user123"
      },
      "timestamp": "2026-02-09T00:00:00Z"
    }
  ],
  "stats": {
    "totalFeedback": 150,
    "positiveRatio": 0.78,
    "averageRating": 4.2,
    "byType": {
      "pattern": 120,
      "prediction": 30
    }
  }
}
```

## 使用方法

### フィードバックを記録

```javascript
const { FeedbackLoopManager } = require('./skills/feedback-loop');

const feedbackManager = new FeedbackLoopManager(eventBus, contextManager);
await feedbackManager.initialize();

// 正のフィードバック
await feedbackManager.recordFeedback({
  itemId: 'pattern-123',
  itemType: 'pattern',
  rating: 5,
  sentiment: 'positive',
  comment: '素晴らしい提案！'
});

// 負のフィードバック
await feedbackManager.recordFeedback({
  itemId: 'pattern-456',
  itemType: 'pattern',
  rating: 1,
  sentiment: 'negative',
  comment: '期待外れでした'
});
```

### 統計情報を取得

```javascript
const stats = await feedbackManager.getStats();
console.log('Positive Ratio:', stats.positiveRatio);
console.log('Average Rating:', stats.averageRating);
```

### パターン信頼度を更新

```javascript
await feedbackManager.updatePatternConfidence('pattern-123', 0.1); // 信頼度を上げる
await feedbackManager.updatePatternConfidence('pattern-456', -0.1); // 信頼度を下げる
```

## イベント

| イベント名 | 説明 |
|-----------|------|
| `feedback_recorded` | フィードバックが記録された |
| `pattern_confidence_updated` | パターン信頼度が更新された |
| `feedback_stats_updated` | フィードバック統計が更新された |
| `feedback_analysis_completed` | フィードバック分析が完了した |

## 設定

### config.json

```json
{
  "feedback": {
    "enabled": true,
    "autoUpdateConfidence": true,
    "confidenceAdjustment": {
      "positive": 0.1,
      "negative": -0.15,
      "perRating": 0.05
    },
    "minFeedbackForUpdate": 3,
    "retentionDays": 90
  },
  "notifications": {
    "enabled": true,
    "negativeFeedbackAlert": true,
    "weeklyReport": true
  },
  "analysis": {
    "enabled": true,
    "interval": 3600,
    "trendAnalysis": true
  }
}
```

## フィードバック分析

### 分析タイプ

1. **感情分析** - ポジティブ/ネガティブの比率
2. **評価分析** - 平均評価、評価分布
3. **傾向分析** - 時系列トレンド
4. **パターン分析** - フィードバックパターンの特定
5. **改善提案** - 低評価項目の改善点

### 統計メトリクス

| メトリクス | 説明 |
|----------|------|
| `totalFeedback` | 総フィードバック数 |
| `positiveRatio` | 正のフィードバック比率 |
| `averageRating` | 平均評価 |
| `byType` | タイプ別フィードバック数 |
| `trend7d` - 過去7日間のトレンド |
| `trend30d` | 過去30日間のトレンド |

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

## 拡張機能

### 追加予定

1. **自動フィードバック収集** - ユーザーの反応から自動収集
2. **多言語対応** - 複数言語の感情分析
3. **高度な分析** - 機械学習によるパターン検出
4. **A/Bテスト統合** - A/Bテスト結果との連携
5. **リアルタイム通知** - 重要なフィードバックの即時通知

---

**文書バージョン**: 1.0.0
**最終更新**: 2026-02-09
