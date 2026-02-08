/**
 * GitHub API統合 (GitHub API Integration)
 * GitHub APIを使用してIssues、PRs、Webhookを管理
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

/**
 * GitHub APIクライアント
 */
class GitHubApiClient {
  constructor(config = {}) {
    this.config = {
      owner: config.owner || 'tndg16-bot',
      repo: config.repo || 'openclew',
      baseUrl: config.baseUrl || 'https://api.github.com',
      timeout: config.timeout || 30000
    };

    this.token = null;
    this.cache = new Map();
    this.rateLimit = {
      remaining: 5000,
      reset: 0
    };
  }

  /**
   * トークンを設定
   */
  async setToken(token) {
    this.token = token;
    await fs.writeFile(TOKEN_PATH, JSON.stringify({ token }), 'utf8');
  }

  /**
   * トークンを読み込み
   */
  async loadToken() {
    try {
      const data = await fs.readFile(TOKEN_PATH, 'utf8');
      const parsed = JSON.parse(data);
      this.token = parsed.token;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error loading token:', err.message);
      }
    }
  }

  /**
   * GitHub APIリクエスト送信
   */
  async request(endpoint, options = {}) {
    const url = new URL(endpoint, this.config.baseUrl);
    const headers = {
      'User-Agent': 'OpenClaw-GitHub-Integration/1.0.0',
      'Accept': 'application/vnd.github.v3+json'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const requestOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers,
      timeout: this.config.timeout
    };

    return new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          // レート制限情報を更新
          if (res.headers['x-ratelimit-remaining']) {
            this.rateLimit.remaining = parseInt(res.headers['x-ratelimit-remaining']);
            this.rateLimit.reset = parseInt(res.headers['x-ratelimit-reset']);
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const jsonData = JSON.parse(data);
              resolve(jsonData);
            } catch (e) {
              resolve(data);
            }
          } else {
            const error = new Error(`GitHub API request failed: ${res.statusCode}`);
            error.statusCode = res.statusCode;
            error.response = data;
            reject(error);
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  /**
   * Issuesのリストを取得
   */
  async listIssues(options = {}) {
    const params = new URLSearchParams();
    if (options.state) params.append('state', options.state);
    if (options.labels) params.append('labels', options.labels.join(','));
    if (options.sort) params.append('sort', options.sort);
    if (options.direction) params.append('direction', options.direction);
    if (options.per_page) params.append('per_page', options.per_page.toString());
    if (options.page) params.append('page', options.page.toString());

    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/issues?${params}`;

    try {
      const issues = await this.request(endpoint);
      return issues;
    } catch (error) {
      console.error('Error listing issues:', error.message);
      throw error;
    }
  }

  /**
   * Issueを作成
   */
  async createIssue(title, body, options = {}) {
    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/issues`;

    const issueData = {
      title,
      body,
      labels: options.labels || [],
      assignees: options.assignees || []
    };

    if (options.milestone) {
      issueData.milestone = options.milestone;
    }

    try {
      const issue = await this.request(endpoint, {
        method: 'POST',
        body: issueData
      });
      console.log(`✓ Created issue #${issue.number}: ${title}`);
      return issue;
    } catch (error) {
      console.error('Error creating issue:', error.message);
      throw error;
    }
  }

  /**
   * Issueを更新
   */
  async updateIssue(issueNumber, updates) {
    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`;

    try {
      const issue = await this.request(endpoint, {
        method: 'PATCH',
        body: updates
      });
      console.log(`✓ Updated issue #${issueNumber}`);
      return issue;
    } catch (error) {
      console.error('Error updating issue:', error.message);
      throw error;
    }
  }

  /**
   * Issueをクローズ
   */
  async closeIssue(issueNumber, comment) {
    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`;

    if (comment) {
      await this.request(`${endpoint}/comments`, {
        method: 'POST',
        body: { body: comment }
      });
    }

    try {
      const issue = await this.request(endpoint, {
        method: 'PATCH',
        body: { state: 'closed' }
      });
      console.log(`✓ Closed issue #${issueNumber}`);
      return issue;
    } catch (error) {
      console.error('Error closing issue:', error.message);
      throw error;
    }
  }

  /**
   * Pull Requestsのリストを取得
   */
  async listPullRequests(options = {}) {
    const params = new URLSearchParams();
    if (options.state) params.append('state', options.state);
    if (options.sort) params.append('sort', options.sort);
    if (options.direction) params.append('direction', options.direction);
    if (options.per_page) params.append('per_page', options.per_page.toString());
    if (options.page) params.append('page', options.page.toString());

    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/pulls?${params}`;

    try {
      const pulls = await this.request(endpoint);
      return pulls;
    } catch (error) {
      console.error('Error listing pull requests:', error.message);
      throw error;
    }
  }

  /**
   * Pull Requestを作成
   */
  async createPullRequest(title, body, head, base, options = {}) {
    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/pulls`;

    const pullData = {
      title,
      body,
      head,
      base
    };

    if (options.labels) {
      pullData.labels = options.labels;
    }

    if (options.draft !== undefined) {
      pullData.draft = options.draft;
    }

    try {
      const pull = await this.request(endpoint, {
        method: 'POST',
        body: pullData
      });
      console.log(`✓ Created PR #${pull.number}: ${title}`);
      return pull;
    } catch (error) {
      console.error('Error creating pull request:', error.message);
      throw error;
    }
  }

  /**
   * Pull Requestをマージ
   */
  async mergePullRequest(pullNumber, options = {}) {
    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/pulls/${pullNumber}/merge`;

    const mergeData = {};
    if (options.commitTitle) {
      mergeData.commit_title = options.commitTitle;
    }
    if (options.commitMessage) {
      mergeData.commit_message = options.commitMessage;
    }
    if (options.mergeMethod) {
      mergeData.merge_method = options.mergeMethod;
    }

    try {
      const result = await this.request(endpoint, {
        method: 'PUT',
        body: mergeData
      });
      console.log(`✓ Merged PR #${pullNumber}`);
      return result;
    } catch (error) {
      console.error('Error merging pull request:', error.message);
      throw error;
    }
  }

  /**
   * Webhookペイロードを検証
   */
  verifyWebhook(payload, signature, secret) {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');

    return `sha256=${digest}` === signature;
  }

  /**
   * レート制限情報を取得
   */
  getRateLimitInfo() {
    return this.rateLimit;
  }

  /**
   * リポジトリ情報を取得
   */
  async getRepositoryInfo() {
    const endpoint = `/repos/${this.config.owner}/${this.config.repo}`;

    try {
      const repo = await this.request(endpoint);
      return repo;
    } catch (error) {
      console.error('Error getting repository info:', error.message);
      throw error;
    }
  }

  /**
   * ワークフローの実行状況を取得
   */
  async getWorkflowRun(workflowId, runId) {
    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/actions/workflows/${workflowId}/runs/${runId}`;

    try {
      const run = await this.request(endpoint);
      return run;
    } catch (error) {
      console.error('Error getting workflow run:', error.message);
      throw error;
    }
  }

  /**
   * ファイルコンテンツを取得
   */
  async getFileContent(path, ref = 'main') {
    const endpoint = `/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;

    try {
      const content = await this.request(endpoint);
      return content;
    } catch (error) {
      console.error('Error getting file content:', error.message);
      throw error;
    }
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      rateLimit: this.rateLimit,
      config: this.config
    };
  }
}

/**
 * GitHub Webhookハンドラ
 */
class GitHubWebhookHandler {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = {
      secret: config.secret || process.env.GITHUB_WEBHOOK_SECRET || '',
      allowedEvents: config.allowedEvents || [
        'issues',
        'issue_comment',
        'pull_request',
        'push',
        'workflow_run'
      ]
    };

    this.setupEventHandlers();
  }

  /**
   * イベントハンドラーを設定
   */
  setupEventHandlers() {
    // Issuesイベント
    this.eventBus.subscribe('github-webhook', {
      type: 'event',
      payload: { eventType: 'issues' }
    }, this.handleIssuesEvent.bind(this));

    // Pull Requestイベント
    this.eventBus.subscribe('github-webhook', {
      type: 'event',
      payload: { eventType: 'pull_request' }
    }, this.handlePullRequestEvent.bind(this));

    // Pushイベント
    this.eventBus.subscribe('github-webhook', {
      type: 'event',
      payload: { eventType: 'push' }
    }, this.handlePushEvent.bind(this));

    // Workflowイベント
    this.eventBus.subscribe('github-webhook', {
      type: 'event',
      payload: { eventType: 'workflow_run' }
    }, this.handleWorkflowEvent.bind(this));
  }

  /**
   * Issuesイベントを処理
   */
  async handleIssuesEvent(event) {
    const { action, issue } = event.payload.data;

    console.log(`🔔 GitHub Issues event: ${action} #${issue.number}`);

    // イベントバスにGitHubイベントとして発行
    await this.eventBus.send({
      type: 'event',
      source: 'github-webhook',
      target: '*',
      payload: {
        eventType: 'github_issue_' + action,
        data: { action, issue }
      }
    });
  }

  /**
   * Pull Requestイベントを処理
   */
  async handlePullRequestEvent(event) {
    const { action, pull_request, number } = event.payload.data;

    console.log(`🔔 GitHub Pull Request event: ${action} #${number}`);

    await this.eventBus.send({
      type: 'event',
      source: 'github-webhook',
      target: '*',
      payload: {
        eventType: 'github_pr_' + action,
        data: { action, pull_request, number }
      }
    });
  }

  /**
   * Pushイベントを処理
   */
  async handlePushEvent(event) {
    const { ref, commits, pusher } = event.payload.data;

    console.log(`🔔 GitHub Push event: ${ref} by ${pusher.name}`);

    await this.eventBus.send({
      type: 'event',
      source: 'github-webhook',
      target: '*',
      payload: {
        eventType: 'github_push',
        data: { ref, commits, pusher }
      }
    });
  }

  /**
   * Workflowイベントを処理
   */
  async handleWorkflowEvent(event) {
    const { action, workflow_run } = event.payload.data;

    console.log(`🔔 GitHub Workflow event: ${action} ${workflow_run.name}`);

    await this.eventBus.send({
      type: 'event',
      source: 'github-webhook',
      target: '*',
      payload: {
        eventType: 'github_workflow_' + action,
        data: { action, workflow_run }
      }
    });
  }

  /**
   * Webhookペイロードを検証して処理
   */
  async handleWebhook(payload, signature, eventName) {
    // 署名検証
    if (this.config.secret) {
      const isValid = this.verifyWebhook(payload, signature, this.config.secret);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }
    }

    // イベント許可チェック
    if (!this.config.allowedEvents.includes(eventName)) {
      console.log(`Ignoring event: ${eventName}`);
      return;
    }

    // イベント解析
    const eventData = JSON.parse(payload);

    // イベントバスに送信
    await this.eventBus.send({
      type: 'event',
      source: 'github-webhook',
      target: '*',
      payload: {
        eventType: 'github_webhook_' + eventName,
        data: eventData
      }
    });
  }

  /**
   * Webhook署名を検証
   */
  verifyWebhook(payload, signature, secret) {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');

    return `sha256=${digest}` === signature;
  }
}

module.exports = {
  GitHubApiClient,
  GitHubWebhookHandler
};

// テスト用：メイン実行
if (require.main === module) {
  console.log('Testing GitHub API Integration...\n');

  // APIクライアント初期化
  const client = new GitHubApiClient();

  // トークンを読み込み
  client.loadToken().then(() => {
    if (!client.token) {
      console.log('No GitHub token configured');
      console.log('Set GITHUB_TOKEN environment variable or call setToken()');
      return;
    }

    // Issuesのリストを取得
    client.listIssues({ state: 'open', per_page: 5 }).then(issues => {
      console.log(`\n📋 Open Issues (${issues.length}):`);
      for (const issue of issues) {
        console.log(`  #${issue.number}: ${issue.title}`);
      }
    }).catch(error => {
      console.error('Error:', error.message);
    });

    // Pull Requestsのリストを取得
    client.listPullRequests({ state: 'open', per_page: 5 }).then(pulls => {
      console.log(`\n📋 Open Pull Requests (${pulls.length}):`);
      for (const pr of pulls) {
        console.log(`  #${pr.number}: ${pr.title} (${pr.head.ref} -> ${pr.base.ref})`);
      }
    }).catch(error => {
      console.error('Error:', error.message);
    });

    // 統計表示
    setTimeout(() => {
      console.log('\n--- Statistics ---\n');
      console.log(JSON.stringify(client.getStats(), null, 2));
    }, 2000);
  });
}
