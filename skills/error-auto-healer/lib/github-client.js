const { Octokit } = require('@octokit/rest');
const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

class GitHubClient {
  constructor() {
    this.octokit = null;
    this.token = null;
  }

  /**
   * Initialize the GitHub client by loading config and creating Octokit instance.
   */
  async init() {
    try {
      const config = await fs.readJson(CONFIG_PATH);
      this.token = config.githubToken || process.env.GITHUB_TOKEN;

      if (!this.token) {
        throw new Error('GitHub token not found in config or environment');
      }

      this.octokit = new Octokit({ auth: this.token });
      console.log('✅ GitHub client initialized successfully');
      return this;
    } catch (error) {
      console.error('❌ Failed to initialize GitHub client:', error.message);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Repository helpers
  // ---------------------------------------------------------------------------

  /**
   * Parse a "owner/repo" string into its components.
   * @param {string} repoString - e.g. "octocat/Hello-World"
   * @returns {{ owner: string, repo: string }}
   */
  parseRepo(repoString) {
    const parts = repoString.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid repo format: "${repoString}". Expected "owner/repo".`);
    }
    return { owner: parts[0], repo: parts[1] };
  }

  /**
   * Get the default branch for a repository.
   * @param {string} owner
   * @param {string} repo
   * @returns {Promise<string>}
   */
  async getDefaultBranch(owner, repo) {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      console.log(`🔍 Default branch for ${owner}/${repo}: ${data.default_branch}`);
      return data.default_branch;
    } catch (error) {
      console.error(`❌ Failed to get default branch for ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  /**
   * Clone a repository to a local directory with retry logic (up to 3 attempts).
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   * @param {string} [customWorkDir] - Optional custom working directory
   * @returns {Promise<string>} Path to the cloned repository
   */
  async cloneRepository(owner, repo, branch, customWorkDir) {
    const workDir = customWorkDir || path.join(
      require('os').tmpdir(),
      `heal-${owner}-${repo}-${Date.now()}`
    );

    const cloneUrl = `https://x-access-token:${this.token}@github.com/${owner}/${repo}.git`;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`📦 Cloning ${owner}/${repo} (branch: ${branch}) - attempt ${attempt}/${maxAttempts}...`);
        await fs.ensureDir(workDir);
        const git = simpleGit();
        await git.clone(cloneUrl, workDir, ['--branch', branch, '--single-branch']);
        console.log(`✅ Repository cloned to ${workDir}`);
        return workDir;
      } catch (error) {
        console.error(`❌ Clone attempt ${attempt} failed:`, error.message);
        // Clean up failed clone directory
        await fs.remove(workDir).catch(() => {});

        if (attempt === maxAttempts) {
          throw new Error(
            `Failed to clone ${owner}/${repo} after ${maxAttempts} attempts: ${error.message}`
          );
        }

        // Wait before retrying (exponential back-off: 1s, 2s, 4s)
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Branch management
  // ---------------------------------------------------------------------------

  /**
   * Create a new healing branch from the base branch.
   * @param {string} repoDir - Path to the local repo clone
   * @param {string} baseBranch - The branch to base the healing branch on
   * @returns {Promise<string>} Name of the created branch
   */
  async createHealingBranch(repoDir, baseBranch) {
    try {
      const branchName = `auto-heal/${baseBranch}-${Date.now()}`;
      const git = simpleGit(repoDir);

      await git.checkout(baseBranch);
      await git.checkoutLocalBranch(branchName);
      console.log(`🌿 Created healing branch: ${branchName}`);
      return branchName;
    } catch (error) {
      console.error('❌ Failed to create healing branch:', error.message);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Git operations
  // ---------------------------------------------------------------------------

  /**
   * Stage and commit all changes in the working directory.
   * @param {string} repoDir
   * @param {string} message - Commit message
   * @returns {Promise<string>} Commit hash
   */
  async commitChanges(repoDir, message) {
    try {
      const git = simpleGit(repoDir);
      await git.add('.');
      const result = await git.commit(message);
      const commitHash = result.commit || 'unknown';
      console.log(`📝 Changes committed: ${commitHash} - "${message}"`);
      return commitHash;
    } catch (error) {
      console.error('❌ Failed to commit changes:', error.message);
      throw error;
    }
  }

  /**
   * Push a branch to the remote origin.
   * @param {string} repoDir
   * @param {string} branchName
   */
  async pushBranch(repoDir, branchName) {
    try {
      const git = simpleGit(repoDir);
      await git.push('origin', branchName, ['--set-upstream']);
      console.log(`🚀 Pushed branch: ${branchName}`);
    } catch (error) {
      console.error(`❌ Failed to push branch ${branchName}:`, error.message);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Pull requests
  // ---------------------------------------------------------------------------

  /**
   * Create a pull request.
   * @param {string} owner
   * @param {string} repo
   * @param {string} title
   * @param {string} body
   * @param {string} headBranch
   * @param {string} baseBranch
   * @returns {Promise<object>} Pull request data
   */
  async createPullRequest(owner, repo, title, body, headBranch, baseBranch) {
    try {
      const { data } = await this.octokit.pulls.create({
        owner,
        repo,
        title,
        body,
        head: headBranch,
        base: baseBranch,
      });
      console.log(`🔃 Pull request created: ${data.html_url}`);
      return data;
    } catch (error) {
      console.error('❌ Failed to create pull request:', error.message);
      throw error;
    }
  }

  /**
   * Enable auto-merge on a pull request via GraphQL mutation.
   * @param {string} owner
   * @param {string} repo
   * @param {number} pullNumber
   * @param {string} [mergeMethod='SQUASH'] - MERGE, SQUASH, or REBASE
   * @returns {Promise<boolean>}
   */
  async enableAutoMerge(owner, repo, pullNumber, mergeMethod = 'SQUASH') {
    try {
      // First get the PR node ID
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      // Enable auto-merge via GraphQL
      await this.octokit.graphql(
        `
        mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
          enablePullRequestAutoMerge(input: {
            pullRequestId: $pullRequestId
            mergeMethod: $mergeMethod
          }) {
            pullRequest {
              number
              title
            }
          }
        }
        `,
        {
          pullRequestId: pr.node_id,
          mergeMethod,
        }
      );

      console.log(`🔀 Auto-merge enabled for PR #${pullNumber}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to enable auto-merge for PR #${pullNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Directly merge a pull request (fallback when auto-merge is not available).
   * @param {string} owner
   * @param {string} repo
   * @param {number} pullNumber
   * @param {string} [mergeMethod='squash'] - merge, squash, or rebase
   * @returns {Promise<object>}
   */
  async mergePullRequest(owner, repo, pullNumber, mergeMethod = 'squash') {
    try {
      const response = await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        merge_method: mergeMethod,
      });
      console.log(`✅ PR #${pullNumber} merged`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to merge PR #${pullNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Request reviewers for a pull request.
   * @param {string} owner
   * @param {string} repo
   * @param {number} pullNumber
   * @param {string[]} reviewers - GitHub usernames
   */
  async addPullRequestReviewers(owner, repo, pullNumber, reviewers = []) {
    if (reviewers.length === 0) return;

    try {
      await this.octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: pullNumber,
        reviewers,
      });
      console.log(`👥 Reviewers added to PR #${pullNumber}: ${reviewers.join(', ')}`);
    } catch (error) {
      console.error(`❌ Failed to add reviewers to PR #${pullNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Add labels to a pull request (or issue).
   * @param {string} owner
   * @param {string} repo
   * @param {number} issueNumber - PR number (PRs are issues in the GitHub API)
   * @param {string[]} labels
   */
  async addPullRequestLabels(owner, repo, issueNumber, labels = []) {
    if (labels.length === 0) return;

    try {
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels,
      });
      console.log(`🏷️ Labels added to #${issueNumber}: ${labels.join(', ')}`);
    } catch (error) {
      console.error(`❌ Failed to add labels to #${issueNumber}:`, error.message);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Issues
  // ---------------------------------------------------------------------------

  /**
   * Create a GitHub issue.
   * @param {string} owner
   * @param {string} repo
   * @param {string} title
   * @param {string} body
   * @param {string[]} labels
   * @returns {Promise<object>} Issue data
   */
  async createIssue(owner, repo, title, body, labels = ['bug', 'auto-detected']) {
    try {
      const response = await this.octokit.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
      });
      console.log(`📝 Issue created: ${response.data.html_url}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to create issue:', error.message);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Workflow / CI helpers
  // ---------------------------------------------------------------------------

  /**
   * Re-run failed jobs for a workflow run.
   * @param {string} owner
   * @param {string} repo
   * @param {number} runId
   */
  async retryWorkflow(owner, repo, runId) {
    try {
      // Note: Use reRunWorkflowFailedJobs to only retry failed jobs
      // Use reRunWorkflow to rerun all jobs
      await this.octokit.rest.actions.reRunWorkflowFailedJobs({
        owner,
        repo,
        run_id: runId,
      });
      console.log(`🔄 Retried failed jobs in workflow run: ${runId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to retry workflow:', error.message);
      if (error.status) {
        console.error(`   Status: ${error.status}`);
        console.error(`   Response: ${JSON.stringify(error.response?.data || {})}`);
      }
      return false;
    }
  }

  /**
   * Get failed workflow runs for a repository branch.
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   * @returns {Promise<object[]>} Array of failed workflow runs
   */
  async getFailedWorkflows(owner, repo, branch) {
    try {
      console.log(`🔍 Fetching failed workflows for ${owner}/${repo} (branch: ${branch})...`);

      const response = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch,
        status: 'failure',
        per_page: 10,
      });

      const workflows = response.data.workflow_runs;
      console.log(`   Found ${workflows.length} failed workflow(s)`);

      workflows.forEach((wf, idx) => {
        console.log(`   ${idx + 1}. ${wf.name} (ID: ${wf.id}) - ${new Date(wf.created_at).toLocaleString()}`);
      });

      return workflows;
    } catch (error) {
      console.error('❌ Failed to get workflows:', error.message);
      if (error.status) {
        console.error(`   Status: ${error.status}`);
        console.error(`   Response: ${JSON.stringify(error.response?.data || {})}`);
      }
      return [];
    }
  }

  /**
   * Download the logs for a workflow run (as text).
   * @param {string} owner
   * @param {string} repo
   * @param {number} runId
   * @returns {Promise<string>} Log content
   */
  async getWorkflowLogs(owner, repo, runId) {
    try {
      console.log(`📄 Fetching logs for workflow run ${runId}...`);
      const response = await this.octokit.actions.downloadWorkflowRunLogs({
        owner,
        repo,
        run_id: runId,
      });
      console.log(`✅ Logs retrieved for workflow run ${runId}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to get workflow logs for run ${runId}:`, error.message);
      throw error;
    }
  }

  /**
   * Download workflow run logs as a zip archive (raw buffer).
   * GitHub returns a redirect URL that resolves to a zip file.
   * @param {string} owner
   * @param {string} repo
   * @param {number} runId
   * @returns {Promise<Buffer>} Raw zip content
   */
  async downloadWorkflowLogZip(owner, repo, runId) {
    try {
      console.log(`📦 Downloading log zip for workflow run ${runId}...`);
      const response = await this.octokit.actions.downloadWorkflowRunLogs({
        owner,
        repo,
        run_id: runId,
      });
      // response.data is the zip content (as ArrayBuffer/Buffer)
      // Actual extraction is handled by the caller
      console.log(`✅ Log zip downloaded for workflow run ${runId}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to download log zip for run ${runId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get the status of a single workflow run.
   * @param {string} owner
   * @param {string} repo
   * @param {number} runId
   * @returns {Promise<object>} Workflow run data
   */
  async getWorkflowRunStatus(owner, repo, runId) {
    try {
      const { data } = await this.octokit.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      console.log(
        `📊 Workflow run ${runId}: status=${data.status}, conclusion=${data.conclusion}`
      );
      return data;
    } catch (error) {
      console.error(`❌ Failed to get workflow run status for ${runId}:`, error.message);
      throw error;
    }
  }

  /**
   * Poll a workflow run until it completes or times out.
   * @param {string} owner
   * @param {string} repo
   * @param {number} runId
   * @param {number} [timeoutMs=600000] - Maximum wait time (default 10 min)
   * @param {number} [pollIntervalMs=15000] - Poll interval (default 15 s)
   * @returns {Promise<object>} Final workflow run data
   */
  async waitForWorkflowCompletion(owner, repo, runId, timeoutMs = 600000, pollIntervalMs = 15000) {
    const startTime = Date.now();
    console.log(`⏳ Waiting for workflow run ${runId} to complete (timeout: ${timeoutMs / 1000}s)...`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        const runData = await this.getWorkflowRunStatus(owner, repo, runId);

        if (runData.status === 'completed') {
          console.log(`✅ Workflow run ${runId} completed with conclusion: ${runData.conclusion}`);
          return runData;
        }

        console.log(`⏳ Workflow run ${runId} still ${runData.status}... polling again in ${pollIntervalMs / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        console.error(`⚠️ Error polling workflow run ${runId}:`, error.message);
        // Continue polling despite transient errors
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    throw new Error(`Timeout: workflow run ${runId} did not complete within ${timeoutMs / 1000}s`);
  }

  // ---------------------------------------------------------------------------
  // Check runs
  // ---------------------------------------------------------------------------

  /**
   * Get CI check runs for a specific git ref (commit SHA, branch, or tag).
   * @param {string} owner
   * @param {string} repo
   * @param {string} ref - Commit SHA, branch name, or tag
   * @returns {Promise<object[]>} Array of check run objects
   */
  async getCheckRunsForRef(owner, repo, ref) {
    try {
      console.log(`🔍 Fetching check runs for ref ${ref} in ${owner}/${repo}...`);
      const response = await this.octokit.checks.listForRef({
        owner,
        repo,
        ref,
        per_page: 100,
      });
      console.log(`📋 Found ${response.data.check_runs.length} check run(s) for ref ${ref}`);
      return response.data.check_runs;
    } catch (error) {
      console.error(`❌ Failed to get check runs for ref ${ref}:`, error.message);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // File content
  // ---------------------------------------------------------------------------

  /**
   * Get the content of a file from a repository.
   * @param {string} owner
   * @param {string} repo
   * @param {string} filePath - Path within the repo
   * @param {string} [ref] - Branch, tag, or commit SHA
   * @returns {Promise<string>} Decoded file content (UTF-8)
   */
  async getFileContent(owner, repo, filePath, ref) {
    try {
      const params = { owner, repo, path: filePath };
      if (ref) params.ref = ref;

      const { data } = await this.octokit.repos.getContent(params);

      if (data.type !== 'file') {
        throw new Error(`Path "${filePath}" is not a file (type: ${data.type})`);
      }

      const content = Buffer.from(data.content, 'base64').toString('utf8');
      console.log(`📄 Retrieved file: ${filePath} (${data.size} bytes)`);
      return content;
    } catch (error) {
      console.error(`❌ Failed to get file content for ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Update (or create) a file in a repository via the Contents API.
   * @param {string} owner
   * @param {string} repo
   * @param {string} filePath
   * @param {string} content - New file content (plain text, will be base64-encoded)
   * @param {string} message - Commit message
   * @param {string} branch
   * @param {string} [sha] - Current blob SHA (required for updates, omit for creation)
   * @returns {Promise<object>} Commit data from the API
   */
  async updateFile(owner, repo, filePath, content, message, branch, sha) {
    try {
      const params = {
        owner,
        repo,
        path: filePath,
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
      };
      if (sha) params.sha = sha;

      const { data } = await this.octokit.repos.createOrUpdateFileContents(params);
      console.log(`✅ File updated: ${filePath} on branch ${branch}`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to update file ${filePath}:`, error.message);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Healing pipeline
  // ---------------------------------------------------------------------------

  /**
   * Execute the full healing workflow:
   *   1. Clone the repo
   *   2. Create a healing branch
   *   3. Apply the fix (via fixFunction callback)
   *   4. Commit and push
   *   5. Open a pull request
   *
   * @param {object} errorInfo - Information about the error to heal
   * @param {string} errorInfo.repo - "owner/repo" string
   * @param {string} [errorInfo.branch] - Branch with the error (defaults to repo default)
   * @param {string} [errorInfo.title] - PR title
   * @param {string} [errorInfo.body] - PR body / description
   * @param {string} [errorInfo.commitMessage] - Commit message for the fix
   * @param {Function} fixFunction - async (repoDir) => void — applies the fix on disk
   * @returns {Promise<object>} The created pull request data
   */
  async executeHealingWorkflow(errorInfo, fixFunction) {
    const { owner, repo } = this.parseRepo(errorInfo.repo);
    let repoDir;

    try {
      console.log(`🏥 Starting healing workflow for ${owner}/${repo}...`);

      // 1. Determine the base branch
      const baseBranch = errorInfo.branch || (await this.getDefaultBranch(owner, repo));

      // 2. Clone the repository
      repoDir = await this.cloneRepository(owner, repo, baseBranch);

      // 3. Create a healing branch
      const healingBranch = await this.createHealingBranch(repoDir, baseBranch);

      // 4. Apply the fix
      console.log('🔧 Applying fix...');
      await fixFunction(repoDir);

      // 5. Commit changes
      const commitMessage =
        errorInfo.commitMessage || `fix: auto-heal error in ${owner}/${repo}`;
      await this.commitChanges(repoDir, commitMessage);

      // 6. Push the branch
      await this.pushBranch(repoDir, healingBranch);

      // 7. Create the pull request
      const prTitle = errorInfo.title || `🏥 Auto-heal: fix detected error`;
      const prBody =
        errorInfo.body ||
        [
          '## Auto-Healing Pull Request',
          '',
          'This PR was automatically generated by **error-auto-healer**.',
          '',
          `**Branch:** \`${healingBranch}\``,
          `**Base:** \`${baseBranch}\``,
          '',
          '---',
          '_Please review the changes carefully before merging._',
        ].join('\n');

      const pullRequest = await this.createPullRequest(
        owner,
        repo,
        prTitle,
        prBody,
        healingBranch,
        baseBranch
      );

      console.log(`🎉 Healing workflow completed! PR: ${pullRequest.html_url}`);
      return pullRequest;
    } catch (error) {
      console.error('❌ Healing workflow failed:', error.message);
      throw error;
    } finally {
      // Clean up cloned repository
      if (repoDir) {
        try {
          await fs.remove(repoDir);
          console.log('🧹 Cleaned up temporary clone directory');
        } catch (cleanupError) {
          console.warn('⚠️ Failed to clean up clone directory:', cleanupError.message);
        }
      }
    }
  }
}

module.exports = GitHubClient;
