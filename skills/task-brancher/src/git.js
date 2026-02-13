/**
 * Git Branch Management Module
 */

const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

/**
 * Find the nearest Git repository from a given path
 */
async function findGitRepo(startPath) {
  const path = require('path');
  const fs = require('fs');

  let currentPath = path.resolve(startPath);
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    const gitDir = path.join(currentPath, '.git');
    if (fs.existsSync(gitDir)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  return null;
}

/**
 * Get the current branch name
 */
async function getCurrentBranch(repoPath) {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Check if a branch exists
 */
async function branchExists(repoPath, branchName) {
  try {
    const { stdout } = await execAsync(`git branch --list "${branchName}"`, { cwd: repoPath });
    return stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if working directory is clean
 */
async function isWorkingDirectoryClean(repoPath) {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
    return stdout.trim().length === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure working directory is clean (stash if needed)
 */
async function ensureWorkingDirectoryClean(repoPath) {
  const clean = await isWorkingDirectoryClean(repoPath);

  if (clean) {
    return { success: true, stashed: false };
  }

  try {
    const { stdout } = await execAsync('git stash push -m "Auto-stash before task brancher"', { cwd: repoPath });
    return { success: true, stashed: true, stashSha: stdout.trim().slice(0, 8) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create a new branch from the current branch
 */
async function createBranch(repoPath, branchName, startBranch = null) {
  try {
    // Ensure clean working directory
    const cleanResult = await ensureWorkingDirectoryClean(repoPath);
    if (!cleanResult.success) {
      throw new Error(`Could not clean working directory: ${cleanResult.error}`);
    }

    // Get current branch if not specified
    const currentBranch = startBranch || await getCurrentBranch(repoPath);
    if (!currentBranch) {
      throw new Error('Could not determine current branch');
    }

    // Check if branch already exists
    if (await branchExists(repoPath, branchName)) {
      return {
        success: true,
        existing: true,
        branchName,
        message: `Checked out existing branch: ${branchName}`
      };
    }

    // Create and checkout new branch
    await execAsync(`git checkout -b "${branchName}"`, { cwd: repoPath });

    return {
      success: true,
      existing: false,
      branchName,
      message: `Created new branch: ${branchName}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      branchName
    };
  }
}

/**
 * Switch to an existing branch
 */
async function switchBranch(repoPath, branchName) {
  try {
    // Ensure clean working directory
    const cleanResult = await ensureWorkingDirectoryClean(repoPath);
    if (!cleanResult.success) {
      throw new Error(`Could not clean working directory: ${cleanResult.error}`);
    }

    // Switch branch
    await execAsync(`git checkout "${branchName}"`, { cwd: repoPath });

    return {
      success: true,
      branchName,
      message: `Switched to branch: ${branchName}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      branchName
    };
  }
}

/**
 * Delete a branch
 */
async function deleteBranch(repoPath, branchName, force = false) {
  try {
    const forceFlag = force ? '-D' : '-d';
    await execAsync(`git branch ${forceFlag} "${branchName}"`, { cwd: repoPath });

    return {
      success: true,
      branchName,
      message: `Deleted branch: ${branchName}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      branchName
    };
  }
}

/**
 * Get list of all branches
 */
async function listBranches(repoPath) {
  try {
    const { stdout } = await execAsync('git branch -a', { cwd: repoPath });
    const branches = stdout
      .split('\n')
      .map(line => line.trim().replace('* ', '').replace('remotes/origin/', ''))
      .filter(line => line.length > 0);

    return { success: true, branches };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Push branch to remote
 */
async function pushBranch(repoPath, branchName, setUpstream = true, remote = 'origin') {
  try {
    const setUpstreamFlag = setUpstream ? '-u' : '';
    await execAsync(`git push ${setUpstreamFlag} ${remote} ${branchName}`, { cwd: repoPath });

    return {
      success: true,
      branchName,
      message: `Pushed branch ${branchName} to ${remote}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      branchName
    };
  }
}

/**
 * Create a commit
 */
async function createCommit(repoPath, message, files = []) {
  try {
    if (files.length > 0) {
      await execAsync(`git add ${files.join(' ')}`, { cwd: repoPath });
    } else {
      await execAsync('git add -A', { cwd: repoPath });
    }

    await execAsync(`git commit -m "${message}"`, { cwd: repoPath });

    return {
      success: true,
      message: `Committed: ${message}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get the last commit message
 */
async function getLastCommitMessage(repoPath) {
  try {
    const { stdout } = await execAsync('git log -1 --pretty=%B', { cwd: repoPath });
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

module.exports = {
  findGitRepo,
  getCurrentBranch,
  branchExists,
  isWorkingDirectoryClean,
  ensureWorkingDirectoryClean,
  createBranch,
  switchBranch,
  deleteBranch,
  listBranches,
  pushBranch,
  createCommit,
  getLastCommitMessage
};
