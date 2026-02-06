# 🤖 Error Auto Healer - 実装完了報告

## 実装済み機能

### ✅ コア機能
- **Gmail監視エンジン** (`monitor.js`)
  - Gmail APIを使用したエラーメールの自動検知
  - 2分間隔での監視（設定可能）
  - 既読/処理済みメールの除外

- **エラー解析エンジン** (`healer.js`)
  - GitHub Actionsエラーの解析
  - Vercelデプロイエラーの解析
  - リポジトリ、ブランチ、エラー内容の自動抽出

- **GitHubクライアント** (`lib/github-client.js`)
  - リポジトリのクローン
  - 修復用ブランチの作成
  - 変更のコミット・プッシュ
  - GitHub Actionsの再実行
  - Pull Request作成（オプション）

- **Discord通知システム** (統合済み)
  - エラー検知時の通知
  - 修復開始時の通知
  - 成功/失敗時の通知
  - リッチなEmbedメッセージ

- **セーフガード機能**
  - 無限ループ防止（クールダウン機能）
  - 最大修復試行回数制限（デフォルト3回）
  - main/masterブランチ保護
  - 完全な修復履歴の記録

### 📁 ファイル構成

```
skills/error-auto-healer/
├── package.json              # npm依存関係
├── config.json               # 設定ファイル
├── skill.json                # OpenClawスキル定義
├── healer.js                 # メイン修復エンジン
├── monitor.js                # Gmail監視エンジン
├── README.md                 # スキルドキュメント
├── lib/
│   └── github-client.js      # GitHub APIクライアント
└── logs/                     # ログディレクトリ（自動作成）
    ├── healer.log            # アクティビティログ
    └── heal-history.json     # 修復履歴
```

## 動作フロー

```
┌─────────────────┐
│ Gmail監視       │◄── 2分間隔でチェック
│ (monitor.js)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ エラーメール    │
│ 検出            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ エラー解析      │◄── リポジトリ・ブランチ・エラー内容を抽出
│ (healer.js)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Discord通知     │◄── 🔍 エラー検知を通知
│                 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ セーフガード    │────►│ スキップ判定    │◄── クールダウン中・試行回数超過
│ チェック        │     │                 │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ 修復プロセス    │◄── 🔧 Discordに開始通知
│ 開始            │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GitHub操作      │
│ (github-client) │
├─────────────────┤
│ 1. リポジトリ   │
│    クローン     │
│ 2. ブランチ作成 │
│ 3. AI修復適用   │◄── OpenClaw連携（TODO）
│ 4. コミット     │
│ 5. プッシュ     │
│ 6. Actions再実行│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Discord通知     │◄── ✅成功 または ❌失敗
│ 結果報告        │
└─────────────────┘
```

## 次のステップ

### 1. Discordチャンネル作成（手動）
- Discordで `🔧error-auto-healer` チャンネルを作成
- Webhook URLを取得して `config.json` に設定

### 2. Gmail API設定（手動）
- Google Cloud Consoleでプロジェクト作成
- Gmail API有効化
- OAuth 2.0クレデンシャル作成
- 認証フロー実行

### 3. GitHub認証設定（手動）
- Personal Access Token発行
- 環境変数またはconfig.jsonに設定

### 4. 依存関係インストール
```bash
cd skills/error-auto-healer
npm install
```

### 5. テスト実行
```bash
node healer.js test
```

### 6. 監視モード起動
```bash
node healer.js start
```

## 今後の拡張予定

### フェーズ2: AI修復エンジンの統合
現在の `simulateHealing` メソッドを実際のOpenClawエージェント呼び出しに置き換え：

```javascript
async executeRealHealing(errorInfo, repoDir) {
  // OpenClawエージェントに修復を依頼
  const result = await this.clawAgent.execute({
    action: 'fix_error',
    errorInfo,
    repoDir,
    instructions: `以下のエラーを修正してください：
      - リポジトリ: ${errorInfo.repo}
      - エラー: ${errorInfo.errorMessage}
      - ログの該当部分を確認して修正
    `
  });
  return result;
}
```

### フェーズ3: 追加機能
- [ ] Slack対応
- [ ] 複数リポジトリの同時監視
- [ ] エラーパターン学習（ML）
- [ ] ダッシュボードUI
- [ ] メトリクス収集

## セキュリティ対策

✅ **実装済み**
- 認証情報ファイルは `.gitignore` に追加
- main/masterブランチへの直接pushをブロック
- 同じエラーに対する連続修復を防止（クールダウン）
- 最大修復試行回数の制限
- 全ての修復試行をログ記録

## リソース使用量見積もり

| 項目 | 使用量 | 備考 |
|------|--------|------|
| Gmail API | ~100リクエスト/日 | 監視頻度による |
| GitHub API | ~10-50リクエスト/修復 | リポジトリ数による |
| Discord API | ~4メッセージ/修復 | 通知頻度による |
| ディスク | ~100MB/リポジトリ | クローンしたリポジトリ |

## まとめ

Error Auto Healerスキルの基本フレームワークが完成しました。
このスキルにより、GitHub/Vercelのエラーが自動的に検知・修正・デプロイされるパイプラインが構築できます。

**詳細なセットアップ手順**: `ErrorAutoHealer_セットアップガイド.md` を参照してください。
