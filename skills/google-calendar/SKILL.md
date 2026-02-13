---
name: google-calendar
description: Google Calendarと統合してスケジュール管理・同期・分析を行うスキル
metadata: {"clawdbot":{"emoji":"📅"}}
version: 1.0.0
author: user
tags: [calendar, google-api, schedule, sync, productivity]
---

# Google Calendar Integration Skill

Google Calendar APIと統合して、スケジュールの管理、同期、分析を行うスキルです。

## 概要

このスキルは、以下の機能を提供します：

1. **カレンダーイベント管理** - イベントの作成、取得、更新、削除
2. **スケジュール同期** - 自動同期とマニュアル同期
3. **カレンダー分析** - スケジュールパターンの分析
4. **リマインダー機能** - イベントの事前通知
5. **複数カレンダー対応** - 複数のカレンダーを管理

## トリガー

### イベント管理
- 「スケジュール追加」「予定追加」「イベント作成」 - イベント作成
- 「今日の予定」「今週の予定」 - スケジュール表示
- 「スケジュール削除」「予定削除」 - イベント削除
- 「カレンダー更新」 - カレンダー同期

### システムコマンド
- `:calendar create [title] [start] [end]` - イベント作成
- `:calendar list [date]` - イベント一覧表示
- `:calendar sync` - 手動同期
- `:calendar analyze` - スケジュール分析

## データ構造

```json
{
  "event": {
    "id": "event_123",
    "title": "会議",
    "start": "2026-02-09T10:00:00+09:00",
    "end": "2026-02-09T11:00:00+09:00",
    "description": "プロジェクト進捗確認",
    "location": "会議室A",
    "attendees": ["user1@example.com"],
    "colorId": "1"
  },
  "stats": {
    "totalEvents": 150,
    "eventsThisWeek": 12,
    "eventsThisMonth": 45,
    "busyHours": 8.5,
    "meetingCount": 8
  }
}
```

## 使用方法

### イベント作成

```javascript
const { GoogleCalendarManager } = require('./skills/google-calendar');

const calendarManager = new GoogleCalendarManager(eventBus, contextManager);
await calendarManager.initialize();

// イベント作成
const event = await calendarManager.createEvent({
  title: '会議',
  start: new Date('2026-02-09T10:00:00'),
  end: new Date('2026-02-09T11:00:00'),
  description: 'プロジェクト進捗確認',
  location: '会議室A'
});
```

### イベント一覧取得

```javascript
// 今日のイベント
const todayEvents = await calendarManager.getEvents({
  timeMin: new Date().setHours(0, 0, 0, 0),
  timeMax: new Date().setHours(23, 59, 59, 999)
});

// 今週のイベント
const weekEvents = await calendarManager.getEventsForWeek();
```

### スケジュール分析

```javascript
const analysis = await calendarManager.analyzeSchedule({
  days: 7
});

console.log('Meeting ratio:', analysis.meetingRatio);
console.log('Average daily hours:', analysis.avgDailyHours);
```

## 設定

### config.json

```json
{
  "api": {
    "enabled": true,
    "credentialsPath": "credentials/credentials.json",
    "tokenPath": "credentials/token.json",
    "scope": [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events"
    ]
  },
  "calendar": {
    "primary": "primary",
    "autoSync": true,
    "syncInterval": 300,
    "maxRetries": 3
  },
  "reminders": {
    "enabled": true,
    "defaultReminder": 15,
    "reminders": [
      { method: "email", minutes: 60 },
      { method: "popup", minutes: 15 }
    ]
  },
  "analysis": {
    "enabled": true,
    "trackMeetingHours": true,
    "trackBusyTime": true,
    "identifyPatterns": true
  }
}
```

## 認証

このスキルはGoogle OAuth 2.0を使用します。

### 手順

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. Calendar APIを有効化
3. OAuth 2.0クライアントIDを作成
4. `credentials.json`を保存
5. 初回実行時に認証フローを実行

## イベント

| イベント名 | 説明 |
|-----------|------|
| `calendar_event_created` | イベントが作成された |
| `calendar_event_updated` | イベントが更新された |
| `calendar_event_deleted` | イベントが削除された |
| `calendar_sync_completed` - カレンダー同期が完了した |
| `calendar_reminder_sent` - リマインダーが送信された |

## 依存関係

```json
{
  "dependencies": {
    "fs": "*",
    "path": "*",
    "../lib/context-sharing": "*",
    "../lib/skill-event-bus": "*",
    "googleapis": "^134.0.0",
    "google-auth-library": "^9.0.0"
  }
}
```

## 拡張機能

### 追加予定

1. **自然言語処理** - 自然言語でのスケジュール登録
2. **複数カレンダー統合** - ビジネス/プライベートの分離
3. **会議室予約** - リソース管理との連携
4. **カレンダービュー** - カレンダーの視覚的表示
5. **スマート提案** - 最適な会議時間の提案

---

**文書バージョン**: 1.0.0
**最終更新**: 2026-02-09
