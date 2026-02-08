---
name: self-learning-agent
description: ユーザーの行動パターンを学習し、自己進化するAIエージェントスキル
metadata: {"clawdbot":{"emoji":"🧠"}}
version: 1.0.0
author: user
tags: [learning, self-improvement, memory, pattern, ai-evolution]
---

# Self-Learning Agent Skill

ユーザーの行動パターン、好み、文脈を学習し、自分自身をアップデートしていくAIエージェントスキルです。

## コア概念

このスキルはOpenClawの「自己進化」機能を最大化し、以下を実現します：

1. **パターン学習** - 繰り返し行動を検出して自動化提案
2. **コンテキスト記憶** - 長期的な文脈を保持して対話の連続性を確保
3. **スキル自動生成** - 頻出タスクを検出して新しいスキルを提案・作成
4. **自己改善** - 過去の対話から最適な応答を学習
5. **知識ベース構築** - 学びをObsidianに蓄積

## トリガー

### 学習関連
- 「学習モード開始」
- 「パターン分析して」
- 「私の傾向を教えて」
- 「新しいスキル作って」

### 記憶・検索
- 「昨日の話の続き」
- 「〇〇について前に話したよね」
- 「私の好みは？」
- 「過去の類似タスク」

## データ構造

```json
{
  "learning": {
    "patterns": [
      {
        "id": "pattern-001",
        "name": "morning_routine",
        "type": "time_based",
        "confidence": 0.92,
        "schedule": "0 7 * * *"
      }
    ],
    "userProfile": {
      "preferences": {
        "communicationStyle": "concise",
        "workHours": { "start": "09:00", "end": "18:00" }
      }
    }
  }
}
```

## 使用可能なツール

- memory.search - 過去の記録検索
- memory.add - 新しい記録の追加
- file.read/write - データ永続化

