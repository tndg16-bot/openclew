---
name: morning-secretary
description: 朝の情報収集（Gmail要約・カレンダー取得・天気・タスク提案）を自動化するAI秘書スキル
metadata: {"clawdbot":{"emoji":"🌅"}}
version: 2.0.0
author: user
tags: [automation, morning-routine, gmail, calendar, weather, secretary, phase2]
---

# Morning Secretary Skill (Phase 2)

朝の情報収集と予定管理を自動化するAI秘書スキルです。

## Phase 2 新機能

Phase 2では以下の機能が追加されました：
- **天気情報**の取得・表示
- **Discord通知**の7:00 AM自動送信
- **モーニングブリーフィング**の生成

## 機能概要

毎朝7時に自動実行され、以下を行います：
1. **Gmail未読メール**の取得・要約
2. **Google Calendar**から今日の予定取得
3. **天気情報**の取得（OpenWeatherMap API）
4. **Discord**にレポート送信
5. **音声通知**対応（オプション）

## トリガー

### 自動実行
- スケジュール: `cron("0 7 * * *")`（毎朝7時）

### 手動実行
- 「朝のサマリー」
- 「今日の予定教えて」
- 「メールチェック」

## 実行手順

### Step 1: Gmail未読メール取得

```javascript
const unreadEmails = await tools.gmail.list({
  q: "is:unread",
  maxResults: 10
});
```

取得したメールを以下の形式で要約：
- 件名（30文字以内に短縮）
- 差出人
- 要約（3行以内）
- 返信が必要かどうかの判定

### Step 2: Google Calendar予定取得

```javascript
const today = new Date();
const todayEvents = await tools.calendar.list({
  timeMin: today.toISOString(),
  timeMax: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  orderBy: "startTime"
});
```

予定を時系列でソートして表示。

### Step 3: タスク提案

過去の作業履歴（memory）から、以下を提案：
- 昨日の未完了タスク
- 定期タスク（毎週月曜日など）
- カレンダー予定に基づく準備タスク

### Step 4: レポート作成

以下のフォーマットでレポート作成：

```
🌅 朝のサマリー - 【YYYY年MM月DD日（曜日）】

📧 メール（{未読数}件）
━━━━━━━━━━━━━━━━━━━━━━
1. 【件名】
   差出人: 【名前】
   要約: 【3行要約】
   対応: 【返信不要 / 返信必要】

2. 【件名】
   ...

🗓️ 今日の予定
━━━━━━━━━━━━━━━━━━━━━━
• 09:00 〜 【予定1】
• 13:00 〜 【予定2】
• 15:30 〜 【予定3】

✅ 提案タスク
━━━━━━━━━━━━━━━━━━━━━━
1. 【タスク1】（優先度: 高）
2. 【タスク2】（優先度: 中）
3. 【タスク3】（優先度: 低）

💡 AIからの一言
━━━━━━━━━━━━━━━━━━━━━━
【文脈に応じたアドバイスや気づき】
```

### Step 5: 送信

設定されたチャンネルに送信：
- Discord: `#general` またはDM
- LINE: プッシュ通知
- Slack: 指定チャンネル

## 返信が必要なメールの処理

返信が必要と判定されたメールについて、下書きを作成：

```
📧 返信下書き: 【件名】
━━━━━━━━━━━━━━━━━━━━━━
【AI生成の返信案】

✅ 承認 → 「OK」と返信で送信
❌ 修正 → 修正内容を指示
🔄 後で → 「後で」と返信で保留
```

## データ永続化

メール処理履歴を記録：

```json
{
  "morning-reports": {
    "2026-02-06": {
      "timestamp": "2026-02-06T07:00:00+09:00",
      "emails": {
        "total": 10,
        "summarized": 5,
        "needsReply": 2
      },
      "calendar": {
        "events": 3
      },
      "tasks": {
        "suggested": 3
      }
    }
  }
}
```

保存先: `{baseDir}/morning-reports.json`

## 権限

必要なAPI権限：
- `gmail.readonly` - メール読み取り
- `calendar.readonly` - カレンダー読み取り
- `channels.send` - メッセージ送信

## 使用可能なツール

- `gmail.list` - メール一覧取得
- `gmail.get` - 個別メール取得
- `calendar.list` - 予定一覧取得
- `channels.send` - チャンネル送信
- `cron.add` - スケジュール設定
- `memory.search` - 過去の記録検索
- `file.read` / `file.write` - データ永続化

## 設定項目

`{baseDir}/config.json` でカスタマイズ：

```json
{
  "schedule": {
    "enabled": true,
    "cron": "0 7 * * *",
    "timezone": "Asia/Tokyo"
  },
  "gmail": {
    "maxResults": 10,
    "summarizeLength": 3,
    "excludeLabels": ["Spam", "Promotions"]
  },
  "calendar": {
    "includeAllDay": true
  },
  "notifications": {
    "channels": ["discord", "line"],
    "voice": false
  }
}
```

## エラーハンドリング

### Gmail APIエラー
- 認証エラー → ユーザーに再認証を依頼
- レート制限 → 5分後に再試行

### Calendar APIエラー
- 予定取得失敗 → 「予定は取得できませんでした」と表示

### 送信エラー
- Discordエラー → LINEにフォールバック
- LINEエラー → コンソールにログ出力

## ベストプラクティス

1. **サマリーは簡潔に** - 3行以内に収める
2. **時系列で表示** - 予定は時間順に
3. **優先度を明確に** - 高/中/低で区別
4. **アクション可能に** - 「承認」だけで済むように
5. **コンテキストを記憶** - 過去のやり取りを参照

## テスト項目

1. 手動実行でレポートが生成されるか
2. 自動スケジュールが正しく設定されるか
3. メール要約が適切か
4. 予定が時系列で表示されるか
5. 複数チャンネルへの送信が動作するか
6. エラー時に適切にフォールバックするか

## 今後の拡張案

- [ ] 天気情報の追加
- [ ] ニュース要約の追加
- [ ] Slack連携の強化
- [ ] 音声読み上げ対応
- [ ] 多言語対応（英語）
