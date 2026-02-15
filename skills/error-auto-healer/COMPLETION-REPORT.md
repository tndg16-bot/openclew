# Issue #21: エラー自動修復統合（Gmail + GitHub） - 完了報告

## 概要
error-auto-healerをv3.0にアップグレードし、Gmail APIとGitHub APIのエラーを一元管理するイベント駆動型システムを構築しました。

## 実装内容

### 1. Gmail APIエラーの検出ロジック ✓
**ファイル:** `lib/gmail-api-monitor.js`

- Gmail APIエラー（401、403、429、500等）の検出
- APIエラーログの監視
- エラー分類と重複排除
- 即時Discord通知（Criticalエラーのみ）

**検出するエラータイプ:**
- Authentication（401）
- Forbidden（403）
- Rate Limit（429）
- Server Error（500）
- Service Unavailable（502、503、504）
- Abuse Detection

### 2. GitHub APIエラーの検出ロジック ✓
**ファイル:** `lib/github-api-monitor.js`

- GitHub APIエラー（401、403、429、500等）の検出
- APIエラーログの監視
- レート制限の監視
- エラー分類と重複排除
- 即時Discord通知（Criticalエラーのみ）

**検出するエラータイプ:**
- Authentication（401）
- Forbidden（403）
- Rate Limit（429）
- Server Error（500）
- Service Unavailable（502、503、504）
- Abuse Detection
- Rate Limit Warning（残量10%未満）

### 3. error-auto-healerへの統合 ✓
**ファイル:**
- `api-monitor.js` - 新しいAPI監視モジュール
- `package.json` - バージョンアップとスクリプト追加

**統合内容:**
- 既存のCI/CDエラー検出（healer.js）を維持
- 新しいAPI監視モジュール（api-monitor.js）を追加
- 共通の設定ファイル（config.json）を使用
- 共通のログディレクトリ（logs/）を使用
- SQLiteデータベースで履歴管理

### 4. Discord通知機能の実装 ✓
**ファイル:** `lib/discord-notifier.js`

**通知機能:**
- エラー発生時の即時通知（Criticalのみ）
- 修復完了時の通知（従来通り）
- サマリー通知（朝8時）- 新機能

**サマリー通知の内容:**
- 24時間のAPIエラー統計（Gmail API、GitHub API）
- 24時間の修復統計（成功、失敗、スキップ）
- 成功率の計算
- 最近のエラーリスト（最大5件）

**Discordチャンネル:**
- #秘書さんの部屋（ID: 1471769660948086785）

### 5. cronジョブの設定 ✓
**ファイル:** `cron.json`

**スケジュール:**
| ジョブ | 頻度 | 説明 |
|------|------|------|
| api-monitor | `*/5 * * * *` | 5分ごとにAPIエラーをチェック |
| daily-summary | `0 8 * * *` | 毎日8時にサマリー通知 |

**廃止されたジョブ:**
- 定期スキャン（30分ごとのDiscordエラーチェック）
- イベント駆動型のAPI監視に置き換え

## ファイル構成

### 新規ファイル
- `api-monitor.js` - API監視メインモジュール
- `lib/gmail-api-monitor.js` - Gmail API監視
- `lib/github-api-monitor.js` - GitHub API監視
- `lib/discord-notifier.js` - Discord通知機能（拡張）
- `cron.json` - スケジュール設定
- `README.md` - ドキュメント

### 更新ファイル
- `SKILL.md` - v3.0の機能をドキュメント化
- `package.json` - バージョンアップとスクリプト追加
- `config.template.json` - API監視用設定追加

## アーキテクチャ

### イベント駆動型フロー
```
1. API監視（api-monitor.js）
   ↓
2. エラー分類と重複排除
   ↓
3. Criticalエラーのみ即時通知
   ↓
4. データベースに保存（SQLite）
   ↓
5. 朝8時にサマリー通知
```

### モジュール連携
```
api-monitor.js (メイン)
├── gmail-api-monitor.js (Gmail API監視)
├── github-api-monitor.js (GitHub API監視)
└── discord-notifier.js (Discord通知)

healer.js (CI/CD修復 - 従来通り)
├── monitor.js (Gmailメール監視)
├── lib/github-client.js
├── lib/healing-orchestrator.js
└── lib/openclaw-integration.js
```

## 期待される成果

### 実現した機能 ✓
- ✅ GmailとGitHubのAPIエラーを一元管理
- ✅ イベント駆動型で効率的なエラー検出
- ✅ Criticalエラーの即時通知
- ✅ 朝8時のサマリー通知
- ✅ Discordスレッドでの進捗管理（#秘書さんの部屋）

### セーフガード ✓
- ✅ クールダウン: 同じエラーへの連続通知防止
- ✅ 重複排除: APIエラーの重複検出と通知抑制
- ✅ 完全ログ: 全エラーをSQLite+JSONで保存

## 使用方法

### API監視の開始
```bash
cd skills/error-auto-healer
npm install

# 設定ファイル作成
cp config.template.json config.json
# config.json を編集（discord.webhookUrl、github.token など）

# API監視開始
node api-monitor.js start
```

### コマンド
```bash
# API監視開始
node api-monitor.js start

# 1回のみチェック
node api-monitor.js once

# サマリー通知を今すぐ送信
node api-monitor.js summary

# ステータス確認
node api-monitor.js status
```

## テストと検証

### 機能テスト
- [x] Gmail APIエラー検出
- [x] GitHub APIエラー検出
- [x] レート制限監視
- [x] Criticalエラー即時通知
- [x] 朝8時サマリー通知
- [x] 重複排除
- [x] SQLiteデータベース保存

### 手動テスト方法
```bash
# 1回チェックでエラーを検出
node api-monitor.js once

# サマリー通知をテスト
node api-monitor.js summary

# ステータスで統計を確認
node api-monitor.js status
```

## PRの作成

変更内容をコミットして、PRを作成してください。

### コミットメッセージ
```
feat: Add event-driven API error monitoring (v3.0)

- Add Gmail API error monitoring (401, 403, 429, 500)
- Add GitHub API error monitoring (401, 403, 429, 500)
- Add rate limit monitoring for GitHub API
- Add immediate Discord notifications for critical errors
- Add daily summary notifications at 8 AM JST
- Migrate from periodic scans to event-driven approach
- Update documentation (SKILL.md, README.md)

Resolves #21
```

## 注意点

- 既存のerror-auto-healerスキル（CI/CD修復）は継続して使用可能
- API監視は別プロセスとして実行（api-monitor.js）
- Discord通知は#秘書さんの部屋チャンネル（ID: 1471769660948086785）を使用
- 設定ファイル（config.json）はgitignore対象

## 今後の改善案

1. **Gmail APIエラーの自動修復**
   - トークンリフレッシュの自動化
   - 認証エラーの自動再認証

2. **GitHub APIエラーの自動修復**
   - レート制限エラーの自動待機
   - トークンローテーション

3. **より高度なサマリー**
   - 週間サマリーの追加
   - エラーパターンの分析と推奨

4. **Slack/Teams通知の追加**
   - Discord以外の通知先の追加

## 結論

Issue #21のすべての要件を満たし、error-auto-healerをv3.0にアップグレードしました。Gmail APIとGitHub APIのエラーを一元管理するイベント駆動型システムが正常に動作し、Criticalエラーの即時通知と朝8時のサマリー通知が可能になりました。

---

**完了日:** 2026-02-15
**バージョン:** 3.0.0
**ステータス:** ✅ 完了
