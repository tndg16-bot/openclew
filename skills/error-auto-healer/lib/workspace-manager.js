'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const WORKSPACE_BASE = path.join(os.tmpdir(), 'error-auto-healer-workspaces');
const LOCK_DIR = path.join(WORKSPACE_BASE, '.locks');

class WorkspaceManager {
  constructor() {
    this._ensureDir(WORKSPACE_BASE);
    this._ensureDir(LOCK_DIR);
  }

  /**
   * Create an isolated workspace directory for a specific agent and repo.
   * Returns the absolute path to the workspace.
   */
  createIsolatedWorkspace(agentId, repoKey) {
    const sanitizedRepo = repoKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedAgent = agentId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();
    const workspaceName = `${sanitizedRepo}_${sanitizedAgent}_${timestamp}`;
    const workspacePath = path.join(WORKSPACE_BASE, workspaceName);

    this._ensureDir(workspacePath);

    // Write metadata for tracking
    const metaPath = path.join(workspacePath, '.workspace-meta.json');
    const meta = {
      agentId,
      repoKey,
      createdAt: new Date().toISOString(),
      pid: process.pid,
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    console.log(`[WorkspaceManager] Created workspace: ${workspacePath}`);
    return workspacePath;
  }

  /**
   * Acquire a file-based lock for a repository to prevent concurrent operations.
   * Returns true if the lock was acquired, false if timed out.
   */
  async acquireLock(repoKey, timeout = 60000) {
    const sanitizedRepo = repoKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const lockFile = path.join(LOCK_DIR, `${sanitizedRepo}.lock`);
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeout) {
      try {
        // Attempt to create lock file exclusively
        const fd = fs.openSync(lockFile, 'wx');
        const lockData = JSON.stringify({
          pid: process.pid,
          acquiredAt: new Date().toISOString(),
          repoKey,
        });
        fs.writeSync(fd, lockData);
        fs.closeSync(fd);
        console.log(`[WorkspaceManager] Lock acquired for: ${repoKey}`);
        return true;
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Lock exists; check if it's stale
          try {
            const lockContent = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
            const lockAge = Date.now() - new Date(lockContent.acquiredAt).getTime();
            // If lock is older than 10 minutes, consider it stale
            if (lockAge > 600000) {
              console.log(`[WorkspaceManager] Removing stale lock for: ${repoKey}`);
              fs.unlinkSync(lockFile);
              continue;
            }
          } catch (readErr) {
            // If we can't read the lock file, wait and retry
          }
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        } else {
          throw err;
        }
      }
    }

    console.error(`[WorkspaceManager] Timed out waiting for lock on: ${repoKey}`);
    return false;
  }

  /**
   * Release a file-based lock for a repository.
   */
  releaseLock(repoKey) {
    const sanitizedRepo = repoKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const lockFile = path.join(LOCK_DIR, `${sanitizedRepo}.lock`);

    try {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log(`[WorkspaceManager] Lock released for: ${repoKey}`);
      }
    } catch (err) {
      console.error(`[WorkspaceManager] Error releasing lock for ${repoKey}:`, err.message);
    }
  }

  /**
   * Clean up a workspace directory.
   */
  cleanup(workspacePath) {
    try {
      if (fs.existsSync(workspacePath)) {
        fs.rmSync(workspacePath, { recursive: true, force: true });
        console.log(`[WorkspaceManager] Cleaned up workspace: ${workspacePath}`);
      }
    } catch (err) {
      console.error(`[WorkspaceManager] Error cleaning up ${workspacePath}:`, err.message);
    }
  }

  /**
   * Emergency cleanup: remove all workspaces and locks.
   */
  emergencyCleanup() {
    console.log('[WorkspaceManager] Emergency cleanup: removing all workspaces and locks...');

    try {
      // Remove all lock files
      if (fs.existsSync(LOCK_DIR)) {
        const locks = fs.readdirSync(LOCK_DIR);
        for (const lock of locks) {
          try {
            fs.unlinkSync(path.join(LOCK_DIR, lock));
          } catch (e) {
            // Ignore individual file errors
          }
        }
        console.log(`[WorkspaceManager] Removed ${locks.length} lock file(s).`);
      }

      // Remove all workspace directories
      if (fs.existsSync(WORKSPACE_BASE)) {
        const entries = fs.readdirSync(WORKSPACE_BASE);
        let cleaned = 0;
        for (const entry of entries) {
          if (entry === '.locks') continue;
          const fullPath = path.join(WORKSPACE_BASE, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              fs.rmSync(fullPath, { recursive: true, force: true });
              cleaned++;
            }
          } catch (e) {
            // Ignore individual directory errors
          }
        }
        console.log(`[WorkspaceManager] Removed ${cleaned} workspace(s).`);
      }
    } catch (err) {
      console.error('[WorkspaceManager] Emergency cleanup error:', err.message);
    }
  }

  /**
   * Clean up workspace directories older than maxAge milliseconds.
   * Default: 1 hour (3600000 ms).
   */
  cleanupStaleWorkspaces(maxAge = 3600000) {
    console.log(`[WorkspaceManager] Cleaning up workspaces older than ${maxAge / 60000} minutes...`);

    try {
      if (!fs.existsSync(WORKSPACE_BASE)) return;

      const entries = fs.readdirSync(WORKSPACE_BASE);
      const now = Date.now();
      let cleaned = 0;

      for (const entry of entries) {
        if (entry === '.locks') continue;
        const fullPath = path.join(WORKSPACE_BASE, entry);

        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isDirectory()) continue;

          // Check workspace metadata for creation time
          const metaPath = path.join(fullPath, '.workspace-meta.json');
          let createdAt;
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            createdAt = new Date(meta.createdAt).getTime();
          } else {
            // Fall back to directory modification time
            createdAt = stat.mtimeMs;
          }

          if (now - createdAt > maxAge) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            cleaned++;
            console.log(`[WorkspaceManager] Removed stale workspace: ${entry}`);
          }
        } catch (e) {
          // Ignore individual errors
        }
      }

      console.log(`[WorkspaceManager] Cleaned up ${cleaned} stale workspace(s).`);
    } catch (err) {
      console.error('[WorkspaceManager] Error cleaning stale workspaces:', err.message);
    }
  }

  /**
   * Ensure a directory exists (create recursively if needed).
   */
  _ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

module.exports = WorkspaceManager;
