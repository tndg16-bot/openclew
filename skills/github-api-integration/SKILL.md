# GitHub API統合スキル (GitHub API Integration Skill)

**バージョン**: 1.0.0
**作成日**: 2026-02-09

---

## 概要

GitHub APIと統合して、Issues、Pull Requests、Webhook、Actionsを管理するスキルです。

---

## 機能

### 1. Issues管理

| 機能 | 説明 |
|--------|------|
| **Issueリスト取得** | ステータス、ラベル、ソート条件でIssuesを検索 |
| **Issue作成** | 新しいIssueを作成（ラベル、担当者、マイルストーン設定可） |
| **Issue更新** | 既存のIssueを更新（ステータス、ラベルなど） |
| **Issueクローズ** | Issueをクローズ（コメント付与可） |

### 2. Pull Requests管理

| 機能 | 説明 |
|--------|------|
| **PRリスト取得** | ステータス、ソート条件でPRsを検索 |
| **PR作成** | 新しいPRを作成（ラベル、ドラフト設定可） |
| **PRマージ** | PRをマージ（マージ方法指定可） |

### 3. Webhook処理

| 機能 | 説明 |
|--------|------|
| **Issuesイベント** | Issue作成、更新、コメント、クローズを処理 |
| **PRイベント** | PR作成、更新、コメント、マージを処理 |
| **Pushイベント** | コミットプッシュを監視 |
| **Workflowイベント** | GitHub Actionsの実行状況を監視 |
| **署名検証** | Webhookペイロードの署名を検証 |

### 4. GitHub Actions

| 機能 | 説明 |
|--------|------|
| **Workflow Run監視** | ワークフローの実行状況を取得 |
| **失敗通知** | CI/CD失敗時に通知 |
| **Issue自動作成** | 失敗時にIssueを自動作成 |

---

## 設定

### config.json

```json
{
  "api": {
    "enabled": true,
    "baseUrl": "https://api.github.com",
    "timeout": 30000
  },
  "repository": {
    "owner": "tndg16-bot",
    "repo": "openclew",
    "defaultBranch": "main"
  },
  "issues": {
    "enabled": true,
    "autoLabel": true,
    "defaultLabels": ["enhancement", "bug", "question", "documentation"],
    "autoAssign": false,
    "assignees": []
  },
  "pullRequests": {
    "enabled": true,
    "autoMerge": false,
    "requireReviews": true,
    "defaultMergeMethod": "squash"
  },
  "webhooks": {
    "enabled": true,
    "secret": "",
    "allowedEvents": [
      "issues",
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "push",
      "workflow_run"
    ]
  },
  "actions": {
    "enabled": true,
    "notifyOnFailure": true,
    "notifyOnSuccess": false,
    "createIssueOnFailure": true,
    "failureLabels": ["ci-failure"]
  },
  "notifications": {
    "enabled": true,
    "channels": {
      "github_events": "general",
      "pr_merged": "general",
      "issues_created": "issues"
    }
  },
  "cache": {
    "enabled": true,
    "ttl": 300000,
    "maxSize": 100
  },
  "rateLimit": {
    "warnThreshold": 100,
    "blockThreshold": 50
  }
}
```

---

## 使用方法

### Issues管理

```javascript
const { GitHubApiClient } = require('./skills/github-api-integration');

const client = new GitHubApiClient();

// トークン設定
await client.setToken('your-github-token');

// Issuesをリスト
const issues = await client.listIssues({ state: 'open', labels: ['bug'] });

// Issueを作成
const newIssue = await client.createIssue(
  'Test issue from API integration',
  'Issue body here',
  { labels: ['bug'], milestone: 1 }
);

// Issueを更新
const updatedIssue = await client.updateIssue(issue.number, {
  labels: ['enhancement'],
  state: 'closed'
});

// Issueをクローズ
await client.closeIssue(issue.number, 'Closing this issue');
```

### Pull Requests管理

```javascript
// Pull Requestsをリスト
const pulls = await client.listPullRequests({ state: 'open' });

// Pull Requestを作成
const newPR = await client.createPullRequest(
  'Feature branch name',
  'PR description here',
  'feature/my-feature',
  'main',
  { labels: ['enhancement'], draft: false }
);

// Pull Requestをマージ
await client.mergePullRequest(pull.number, {
  mergeMethod: 'squash',
  commitMessage: 'Merge feature branch'
});
```

### Webhookハンドリング

```javascript
const { SkillEventBus } = require('../lib/skill-event-bus');
const { GitHubWebhookHandler } = require('./skills/github-api-integration');

// イベントバス初期化
const eventBus = new SkillEventBus();

// Webhookハンドラー初期化
const webhook = new GitHubWebhookHandler(eventBus, {
  secret: 'your-webhook-secret',
  allowedEvents: ['issues', 'pull_request', 'push', 'workflow_run']
});

// Webhookリクエストを処理
app.post('/webhook', (req, res) => {
  const { payload, signature, eventName } = req;

  webhook.handleWebhook(payload, signature, eventName)
    .then(() => {
      res.status(200).send('OK');
    })
    .catch(err => {
      res.status(400).send(err.message);
    });
});
```

---

## イベント

| イベント名 | 説明 |
|-----------|------|
| `github_issue_opened` | 新しいIssueが作成された |
| `github_issue_closed` | Issueがクローズされた |
| `github_issue_updated` | Issueが更新された |
| `github_pr_opened` | 新しいPRが作成された |
| `github_pr_merged` | PRがマージされた |
| `github_pr_closed` | PRがクローズされた |
| `github_push` | コミットがプッシュされた |
| `github_workflow_completed` | ワークフローが完了した |
| `github_workflow_failed` | ワークフローが失敗した |

---

## レート制限

GitHub APIはレート制限があります：

- **認証済み**: 5,000リクエスト/時間
- **未認証**: 60リクエスト/時間

レート制限に達すると、以下の動作になります：

1. **警告**: 残り100リクエストで警告
2. **ブロック**: 残り50リクエストでリクエストを一時停止
3. **自動再試行**: リセット時刻に合わせて自動再試行

---

## セキュリティ

### 1. トークン管理

- トークンを環境変数または安全な設定ファイルに保存
- リポジトリにコミットしない
- 定期的にローテーション

### 2. Webhook署名検証

- すべてのWebhookペイロードの署名を検証
- 不正な署名を持つリクエストを拒否

### 3. アクセス制御

- APIアクセスを必要最小限に制限
- スコープを適切に設定
- 秘密情報を含めない

---

## エラーハンドリング

| エラータイプ | 対処方法 |
|-------------|-----------|
| `401 Unauthorized` | トークン期限切れ - 再認証を促す |
| `403 Forbidden` | 権限不足 - 必要なスコープを表示 |
| `404 Not Found` | リソース不存在 - 詳当リソースを確認 |
| `429 Too Many Requests` | レート制限 - 一時停止 |
| `500 Internal Server Error` | サーバーエラー - 再試行 |

---

## キャッシュ

APIレスポンスをキャッシュして、レート制限を節約：

```javascript
// キャッシュ有効
const client = new GitHubApiClient({ cacheEnabled: true });

// キャッシュ無効
const response = await client.listIssues({ cache: false });
```

---

## 将来の拡張

1. **GraphQL API**: GitHub GraphQL APIへの移行
2. **リアルタイム通知**: WebSocketでのリアルタイム通知
3. **高度なフィルタリング**: Issues/PRsの高度な検索
4. **自動ラベリング**: AIベースの自動ラベリング
5. **自動マージ**: 条件を満たすPRの自動マージ

---

**文書バージョン**: 1.0.0
**最終更新**: 2026-02-09 08:00 (Asia/Tokyo)
