---
name: productivity-advisor
description: 毎日1回、ユーザーの作業パターンを分析し効率化・生産性向上の提案をDiscordに通知するスキル
metadata: {"clawdbot":{"emoji":"💡"}}
version: 1.0.0
author: user
tags: [productivity, analysis, daily-tips, automation, discord]
---

# Productivity Advisor Skill

毎日1回、ユーザーの作業パターンを分析し、効率化・生産性向上の具体的な提案をチャット通知するAIアドバイザースキルです。

## 機能概要

1. **環境スキャン** - Obsidianデイリーノート、作業履歴を分析
2. **パターン検出** - 繰り返し作業、時間の使い方、未完了タスクを検出
3. **提案生成** - AIが具体的な効率化ヒントを生成
4. **Discord通知** - 毎日1回（デフォルト: 21:00）に通知

## トリガー

### 自動実行
- スケジュール: `cron("0 21 * * *")`（毎日21:00）

### 手動実行
- 「効率化提案」
- 「改善ポイント教えて」
- 「生産性チェック」
- 「今日のヒント」

## 実行手順

### Step 1: データ収集

```javascript
// Obsidianデイリーノートをスキャン（過去7日分）
const dailyNotes = await scanObsidianNotes(7);

// 作業時間トラッカーのログを取得
const workLogs = await getWorkingHoursData();
```

### Step 2: パターン分析

- 完了/未完了タスクの比率
- 作業時間帯の傾向
- 繰り返し作業の検出
- 頻出キーワードの抽出

### Step 3: 提案生成

AIが以下の観点から提案を生成：
- 時間管理の改善点
- 自動化候補のタスク
- 休憩・健康管理の提案
- ワークフロー最適化

### Step 4: 通知送信

Discordに整形されたレポートを送信し、Obsidianにログを保存。

## 出力フォーマット

```
💡 今日の効率化提案 - 【YYYY年MM月DD日（曜日）】

📊 分析結果（過去7日間）
━━━━━━━━━━━━━━━━━━━━━━
• 平均作業時間: X.X時間/日
• 最も生産的な時間帯: HH:MM-HH:MM
• タスク完了率: XX%

🚀 今日のヒント
━━━━━━━━━━━━━━━━━━━━━━
1. 【カテゴリ】提案内容

2. 【カテゴリ】提案内容

3. 【カテゴリ】提案内容

💬 質問や詳細は返信してください！
```

## 設定

`config.json` でカスタマイズ可能：

```json
{
  "schedule": { "cron": "0 21 * * *", "timezone": "Asia/Tokyo" },
  "analysis": { "lookbackDays": 7 },
  "notifications": { "discord": true, "obsidian": true }
}
```

## 使用可能なツール

- `file.read` / `file.write` - Obsidianノート読み書き
- `channels.send` - Discord送信
- `memory.search` - 過去の記録検索
