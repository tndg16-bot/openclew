---
name: personalized-ai-agent
description: 全てのスキルを統合し、ユーザーに合わせて自己進化するパーソナライズドAIエージェント
metadata: {"clawdbot":{"emoji":"🧠"}}
version: 1.0.0
author: user
tags: [personalized, ai-agent, integration, self-evolving, learning]
---

# Personalized AI Agent Skill

全てのスキルを統合し、ユーザーに合わせて自己進化するパーソナライズドAIエージェントです。

## コア機能

1. **行動パターン学習** - ユーザーのリクエストパターン、好み、時間帯を分析
2. **スキル統合** - 既存の全スキルを統合し、最適なものを自動選択
3. **自己進化** - 頻出タスクを検出し、新しいスキルを自動生成・提案
4. **コンテキスト記憶** - 長期的な対話履歴を保持し、文脈を引き継ぐ
5. **プロフィール作成** - ユーザーのコミュニケーションスタイル、作業時間、好みを学習
6. **タスク自動割り当て** - ユーザーの能力とスケジュールに応じてタスクを割り当て

## トリガー

### 学習関連
- 「私の傾向を分析して」
- 「パターン解析」
- 「学習モード」
- 「プロフィール更新」

### 日常運用
- 「今日の予定を教えて」
- 「進捗状況」
- 「効率化の提案」

### 自己進化
- 「新しいスキルが必要そう」
- 「この作業を自動化したい」
- 「スキル作成の提案」

## 統合されるスキル

| スキル | 機能 | 統合方法 |
|-------|------|---------|
| self-learning-agent | 行動パターン学習 | API呼び出し |
| productivity-advisor | 生産性向上の提案 | API呼び出し |
| morning-secretary | 朝の情報収集 | API呼び出し |
| discord-task-auto-completer | Discordタスク自動完了 | API呼び出し |
| error-auto-healer | エラー自動検出・修正 | API呼び出し |

## 実行手順

### Step 1: ユーザープロフィールの作成

```javascript
{
  "userId": "user-001",
  "profile": {
    "preferences": {
      "communicationStyle": "concise",  // concise, detailed, friendly
      "workingHours": {
        "start": "09:00",
        "end": "18:00",
        "timezone": "Asia/Tokyo"
      },
      "preferredChannels": {
        "tasks": "タスク管理",
        "general": "雑談",
        "work": "作業連絡"
      },
      "notificationFrequency": "balanced"  // minimal, balanced, frequent
    },
    "patterns": {
      "activeTimeSlots": [
        { "start": "09:00", "end": "12:00", "weight": 0.8 },
        { "start": "14:00", "end": "18:00", "weight": 0.9 }
      ],
      "frequentTasks": [
        { "name": "コードレビュー", "frequency": 3, "unit": "week" },
        { "name": "メール返信", "frequency": 5, "unit": "day" }
      ],
      "responseStyle": {
        "direct": true,           // 質問に直接答える
        "withExamples": true,     // 例を含める
        "withCode": false         // コードは必要な時だけ
      }
    }
  }
}
```

### Step 2: 行動パターンの分析

```javascript
async function analyzePatterns(conversations, tasks) {
  const patterns = {
    timePatterns: {},      // 時間帯ごとのアクティビティ
    topicPatterns: {},     // トピックの頻度
    requestPatterns: {},   // リクエストタイプの頻度
    skillUsage: {}        // 各スキルの使用頻度
  };

  // 時間帯分析
  for (const conv of conversations) {
    const hour = new Date(conv.timestamp).getHours();
    const timeSlot = getTimeSlot(hour);
    patterns.timePatterns[timeSlot] = (patterns.timePatterns[timeSlot] || 0) + 1;
  }

  // トピック分析
  for (const task of tasks) {
    const topic = classifyTask(task);
    patterns.topicPatterns[topic] = (patterns.topicPatterns[topic] || 0) + 1;
  }

  // スキル使用分析
  for (const skill of skillUsage) {
    patterns.skillUsage[skill.name] = skill.count;
  }

  return patterns;
}
```

### Step 3: スキルの自動選択

ユーザーのリクエストに基づいて、最適なスキルを自動選択：

```javascript
function selectBestSkill(userRequest, profile, patterns) {
  const skills = [
    { name: 'self-learning-agent', triggers: ['学習', 'パターン', '傾向'] },
    { name: 'productivity-advisor', triggers: ['効率', '生産性', '改善'] },
    { name: 'morning-secretary', triggers: ['朝の', '予定', 'メール'] },
    { name: 'discord-task-auto-completer', triggers: ['タスク', '完了', '進捗'] },
    { name: 'error-auto-healer', triggers: ['エラー', 'バグ', '問題'] }
  ];

  // トリガーマッチ
  const matched = skills.filter(s =>
    s.triggers.some(t => userRequest.includes(t))
  );

  if (matched.length > 0) {
    return matched[0];
  }

  // パターンに基づく選択
  const activeTimeSlot = getCurrentTimeSlot();
  if (patterns.timePatterns[activeTimeSlot] > threshold) {
    return skills.find(s => s.name === 'productivity-advisor');
  }

  return null;  // デフォルト動作
}
```

### Step 4: 自己進化 - 新しいスキルの提案

頻出タスクを検出し、新しいスキルを提案：

```javascript
async function suggestNewSkills(tasks, patterns) {
  const suggestions = [];

  // 頻出タスクの分析
  const frequentTasks = Object.entries(patterns.topicPatterns)
    .filter(([_, count]) => count >= 5)
    .map(([task, _]) => task);

  for (const task of frequentTasks) {
    suggestions.push({
      type: 'new_skill',
      task: task,
      description: `"${task}"が頻出しています。この作業を自動化するスキルの作成を提案します。`,
      confidence: calculateConfidence(task, patterns)
    });
  }

  // 類似タスクのグループ化
  const groupedTasks = groupSimilarTasks(tasks);
  if (groupedTasks.length > 0) {
    suggestions.push({
      type: 'consolidate',
      description: `${groupedTasks.length}件の類似タスクを統合できるスキルが必要です。`,
      tasks: groupedTasks
    });
  }

  return suggestions;
}
```

### Step 5: コンテキストの保持

長期的な記憶と対話の文脈を維持：

```javascript
class ContextMemory {
  constructor() {
    this.shortTerm = [];    // 最近のメッセージ（直近10件）
    this.longTerm = [];     // 長期記憶（最大1000件）
    this.userFacts = [];    // ユーザー固有の事実
  }

  addContext(context) {
    this.shortTerm.push(context);
    if (this.shortTerm.length > 10) {
      this.shortTerm.shift();
    }

    // 重要な事実を長期記憶に追加
    if (isImportantFact(context)) {
      this.userFacts.push({
        fact: context,
        learnedAt: new Date().toISOString(),
        importance: calculateImportance(context)
      });
    }
  }

  getRelevantContext(currentRequest) {
    // 短期記憶から関連文脈を検索
    const relevant = this.shortTerm.filter(ctx =>
      isRelevant(ctx, currentRequest)
    );

    // 長期記憶から事実を検索
    const facts = this.userFacts.filter(fact =>
      isRelevant(fact.fact, currentRequest)
    );

    return {
      recentContext: relevant,
      knownFacts: facts
    };
  }
}
```

## 出力フォーマット

### レポート生成

```
🧠 パーソナライズドAIエージェント レポート
━━━━━━━━━━━━━━━━━━━━━━

👤 ユーザープロフィール
────────────────────────────
• コミュニケーションスタイル: 簡潔
• 作業時間: 09:00-18:00 (Asia/Tokyo)
• アクティブ時間帯: 朝・夕方
• 通知頻度: バランス

📊 行動パターン分析
────────────────────────────
• 最も生産的な時間帯: 14:00-18:00
• 頻出タスクTop5:
  1. コード実装 (15回/週)
  2. コードレビュー (8回/週)
  3. ドキュメント作成 (5回/週)
  4. メール返信 (25回/週)
  5. バグ修正 (3回/週)

🚀 自己進化の提案
────────────────────────────
💡 "メール返信"が頻出しています。Gmail自動返信スキルの作成を提案します。

💡 "コードレビュー"のパターンを検出しました。コードレビュー自動化スキルの作成を提案します。

📝 統合スキル状況
────────────────────────────
✅ 有効なスキル: 5個
• self-learning-agent: ✓ 動作中
• productivity-advisor: ✓ 動作中
• morning-secretary: ✓ 動作中
• discord-task-auto-completer: ✓ 動作中
• error-auto-healer: ✓ 動作中

💬 質問や詳細な指示を返信してください！
```

## 設定

`config.json` でカスタマイズ可能：

```json
{
  "learning": {
    "enabled": true,
    "analysisInterval": "daily",
    "patternThreshold": 5,
    "maxContextSize": 1000,
    "factRetentionDays": 90
  },
  "skills": {
    "autoSelect": true,
    "fallbackBehavior": "ask_user",
    "maxConcurrentSkills": 3
  },
  "profiling": {
    "enabled": true,
    "updateInterval": "weekly",
    "categories": [
      "communicationStyle",
      "workingHours",
      "activeTimeSlots",
      "preferredChannels"
    ]
  },
  "evolution": {
    "enabled": true,
    "suggestNewSkills": true,
    "minTaskFrequency": 5,
    "autoGenerateSkills": false
  },
  "memory": {
    "shortTermSize": 10,
    "longTermSize": 1000,
    "userFactsSize": 500,
    "retentionPolicy": "90d"
  },
  "notifications": {
    "dailySummary": {
      "enabled": true,
      "time": "21:00"
    },
    "weeklyAnalysis": {
      "enabled": true,
      "day": "sunday"
    },
    "suggestions": {
      "enabled": true,
      "quietHours": { "start": "23:00", "end": "07:00" }
    }
  }
}
```

## 使用可能なツール

- `memory.search/add` - コンテキスト記憶の管理
- `skills.invoke` - 他のスキルの実行
- `discord.getMessages/sendMessage` - Discord連携
- `file.read/write` - データ永続化
- `channels.send` - 複数チャンネル対応

## トラブルシューティング

### 学習が進まない場合

1. **アクティビティの確認**: 十分な対話履歴があるか
2. **パターン閾値の調整**: `learning.patternThreshold`
3. **分析頻度の確認**: `learning.analysisInterval`

### スキル選択が間違っている場合

1. **トリガーキーワードの確認**: 各スキルのトリガー設定
2. **手動オーバーライド**: ユーザーがスキルを明示的に指定できるようにする
3. **学習データのリセット**: 必要に応じて学習をリセット

### メモリ使用量が多い場合

1. **記憶サイズの制限**: `memory.shortTermSize` を減らす
2. **古いデータの削除**: `memory.retentionPolicy` を短くする
3. **重要度のフィルタ**: 低い重要度のデータを自動削除

## ベストプラクティス

1. **明確なトリガー設定**: 各スキルが適切に起動するようにする
2. **定期的なプロフィール更新**: ユーザーの好みの変化を追跡
3. **学習データのバックアップ**: 学習したパターンを定期的にバックアップ
4. **フィードバックループ**: ユーザーからのフィードバックを積極的に収集

## 将来の拡張案

- [ ] マルチモーダル入力対応（音声・テキスト・画像）
- [ ] 感情分析を用いた応答の調整
- [ ] チームモードでの使用
- [ ] 外部APIとの統合（GitHub, JIRA, Slack）
- [ ] ニューラルネットワークによる予測
- [ ] カレンダーの自動連携（Google Calendar, Outlook）
