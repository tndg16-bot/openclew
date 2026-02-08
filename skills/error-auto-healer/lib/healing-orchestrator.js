'use strict';

const path = require('path');
const WorkspaceManager = require('./workspace-manager');
const ErrorDeduplicator = require('./error-deduplicator');
const OpenClawIntegration = require('./openclaw-integration');

class HealingOrchestrator {
  constructor(config) {
    this.config = config || {};
    this.workspaceManager = new WorkspaceManager();
    this.openClaw = new OpenClawIntegration(config);
    this.results = [];
    this.activeBatch = null;
  }

  /**
   * Execute healing for all parsed emails.
   * Groups by repository, deduplicates, batches, and processes.
   */
  async executeAll(parsedEmails) {
    console.log(`[Orchestrator] Starting healing for ${parsedEmails.length} parsed email(s)...`);

    // Deduplicate: keep only latest error per repository
    const deduplicated = ErrorDeduplicator.groupByRepository(parsedEmails);
    console.log(`[Orchestrator] After deduplication: ${deduplicated.length} unique repo error(s).`);

    if (deduplicated.length === 0) {
      console.log('[Orchestrator] No actionable errors to heal.');
      return { total: 0, healed: 0, failed: 0, skipped: 0, results: [] };
    }

    // Create conflict-free batches
    const batchSize = this.config.healing?.batchSize || 3;
    const batches = this.createConflictFreeBatches(deduplicated, batchSize);
    console.log(`[Orchestrator] Created ${batches.length} batch(es).`);

    // Process each batch sequentially
    this.results = [];
    for (let i = 0; i < batches.length; i++) {
      console.log(`[Orchestrator] Processing batch ${i + 1}/${batches.length} (${batches[i].length} item(s))...`);
      await this.processBatch(batches[i], i + 1);
    }

    // Summarize results
    const summary = {
      total: this.results.length,
      healed: this.results.filter(r => r.status === 'healed').length,
      failed: this.results.filter(r => r.status === 'failed').length,
      skipped: this.results.filter(r => r.status === 'skipped').length,
      results: this.results,
    };

    console.log(`[Orchestrator] Healing complete. Healed: ${summary.healed}, Failed: ${summary.failed}, Skipped: ${summary.skipped}`);
    return summary;
  }

  /**
   * Create batches of errors that can be processed in parallel without conflicts.
   * Errors targeting the same repository are placed in different batches.
   */
  createConflictFreeBatches(errors, batchSize) {
    const batches = [];
    const reposInCurrentBatch = new Set();
    let currentBatch = [];

    for (const error of errors) {
      const repoKey = error.errorInfo?.repo || error.errorInfo?.project || 'unknown';

      if (reposInCurrentBatch.has(repoKey) || currentBatch.length >= batchSize) {
        // Start a new batch
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }
        currentBatch = [error];
        reposInCurrentBatch.clear();
        reposInCurrentBatch.add(repoKey);
      } else {
        currentBatch.push(error);
        reposInCurrentBatch.add(repoKey);
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Process a batch of errors. Items in the same batch can be processed concurrently
   * since they target different repositories.
   */
  async processBatch(batch, batchNumber) {
    this.activeBatch = batchNumber;

    const promises = batch.map((email, index) =>
      this.processSingleError(email, batchNumber, index + 1)
    );

    const batchResults = await Promise.allSettled(promises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        this.results.push(result.value);
      } else {
        this.results.push({
          status: 'failed',
          error: result.reason?.message || 'Unknown error',
          batch: batchNumber,
        });
      }
    }

    this.activeBatch = null;
  }

  /**
   * Process a single error: acquire lock, create workspace, heal, cleanup.
   */
  async processSingleError(email, batchNum, itemNum) {
    const errorInfo = email.errorInfo;
    if (!errorInfo) {
      console.log(`[Orchestrator] Batch ${batchNum}/${itemNum}: No error info, skipping.`);
      return { status: 'skipped', reason: 'No error info' };
    }

    const repoKey = errorInfo.repo || errorInfo.project || 'unknown';
    const agentId = `batch${batchNum}-item${itemNum}-${Date.now()}`;

    console.log(`[Orchestrator] Batch ${batchNum}/${itemNum}: Healing ${repoKey}...`);

    // Check safety limits
    const maxAttempts = this.config.safety?.maxHealingAttempts || 10;
    if (errorInfo._attemptCount && errorInfo._attemptCount >= maxAttempts) {
      console.log(`[Orchestrator] Max healing attempts reached for ${repoKey}. Skipping.`);
      return { status: 'skipped', reason: 'Max attempts reached', repo: repoKey };
    }

    // Check blocked repositories
    const blockedRepos = this.config.safety?.blockedRepositories || [];
    if (blockedRepos.includes(repoKey)) {
      console.log(`[Orchestrator] Repository ${repoKey} is blocked. Skipping.`);
      return { status: 'skipped', reason: 'Blocked repository', repo: repoKey };
    }

    // Acquire lock
    const lockAcquired = await this.workspaceManager.acquireLock(repoKey);
    if (!lockAcquired) {
      console.error(`[Orchestrator] Could not acquire lock for ${repoKey}. Skipping.`);
      return { status: 'skipped', reason: 'Lock not acquired', repo: repoKey };
    }

    let workspacePath = null;
    try {
      // Create isolated workspace
      workspacePath = this.workspaceManager.createIsolatedWorkspace(agentId, repoKey);

      // Execute healing
      const result = await this.executeHealingWithWorkspace(errorInfo, workspacePath, agentId);
      return {
        status: result.success ? 'healed' : 'failed',
        repo: repoKey,
        agentId,
        details: result,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`[Orchestrator] Healing failed for ${repoKey}:`, err.message);
      return {
        status: 'failed',
        repo: repoKey,
        agentId,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
    } finally {
      // Always release lock and clean up
      this.workspaceManager.releaseLock(repoKey);
      if (workspacePath) {
        this.workspaceManager.cleanup(workspacePath);
      }
    }
  }

  /**
   * Execute the actual healing process within the workspace.
   */
  async executeHealingWithWorkspace(errorInfo, workspacePath, agentId) {
    console.log(`[Orchestrator] Agent ${agentId}: Executing healing in ${workspacePath}`);

    // Request healing from OpenClaw
    const healResult = await this.openClaw.requestHealing(errorInfo, workspacePath);

    return {
      success: healResult.success || false,
      strategy: healResult.strategy || 'unknown',
      changes: healResult.changes || [],
      message: healResult.message || '',
      agentId,
    };
  }
}

module.exports = HealingOrchestrator;
