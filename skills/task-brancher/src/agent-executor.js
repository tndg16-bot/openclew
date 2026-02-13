/**
 * Agent Executor Module
 */

const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

/**
 * Escape text for CLI
 */
function escapeForCli(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$');
}

/**
 * Run Clawdbot agent
 */
async function runClawdbotAgent(message, agentConfig) {
  const safeMessage = escapeForCli(message);
  const agentName = agentConfig.name || 'main';
  const timeout = agentConfig.timeoutMs || 600000;

  const command = `clawdbot agent --agent ${agentName} --message "${safeMessage}"`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout });
    return {
      success: true,
      output: stdout || '',
      error: stderr || null
    };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.message || error.stderr || 'Unknown error'
    };
  }
}

/**
 * Build execution prompt for task
 */
function buildExecutionPrompt(task, branchName, config) {
  const prompt = [
    'Context: You are an autonomous developer agent triggered by Task Brancher.',
    '',
    `Task: ${task.description}`,
    `Branch: ${branchName}`,
    `Source: ${task.sourceFile}`,
    `Section: ${task.section || 'N/A'}`,
    '',
    'Instructions:',
    '- Work on the current git branch.',
    '- Implement the task end-to-end with minimal scope.',
    '- Run relevant tests or diagnostics if available.',
    '- Create a commit with descriptive message.',
    '- If gh is available, create a PR.',
    '',
    'Do not ask for confirmation. Proceed with best defaults.',
    'Report your progress and final status.'
  ];

  return prompt.join('\n');
}

/**
 * Execute task via agent
 */
async function executeTask(task, branchName, config, progressTracker) {
  const prompt = buildExecutionPrompt(task, branchName, config);

  // Update task status to running
  progressTracker.updateTaskStatus(task, 'running');
  progressTracker.addProgressStep(task, 'Agent execution started');

  // Execute agent
  const result = await runClawdbotAgent(prompt, config.agent);

  if (result.success) {
    progressTracker.updateTaskStatus(task, 'done');
    progressTracker.addProgressStep(task, 'Agent execution completed successfully');

    return {
      success: true,
      output: result.output,
      duration: null // TODO: calculate actual duration
    };
  } else {
    progressTracker.updateTaskStatus(task, 'failed', result.error);
    progressTracker.addProgressStep(task, `Agent execution failed: ${result.error}`);

    return {
      success: false,
      output: result.output,
      error: result.error,
      duration: null
    };
  }
}

/**
 * Execute multiple tasks (batch)
 */
async function executeTasks(tasks, config, state, progressTracker, notifications) {
  const results = [];

  for (const task of tasks) {
    const taskState = state.tasks[task.id];
    if (!taskState || !taskState.branch) {
      console.error(`Task ${task.id} has no branch assigned, skipping`);
      continue;
    }

    console.log(`Executing task: ${task.description}`);

    // Notify task started
    await notifications.notifyTaskStarted(config, task, taskState.branch);

    // Update note
    if (config.notifications?.writeBackToNote) {
      progressTracker.updateTaskInNote(task.sourceFile, task.id, 'running', 'Executing...');
    }

    // Execute task
    const result = await executeTask(taskState, taskState.branch, config, progressTracker);

    // Update note
    if (config.notifications?.writeBackToNote) {
      const status = result.success ? 'done' : 'failed';
      const message = result.success
        ? 'Completed successfully'
        : `Failed: ${result.error}`;
      progressTracker.updateTaskInNote(task.sourceFile, task.id, status, message);
    }

    // Notify completion
    if (result.success) {
      await notifications.notifyTaskCompleted(config, task, taskState.branch, result.duration);
    } else {
      await notifications.notifyTaskFailed(config, task, taskState.branch, result.error);
    }

    // Append log entry
    if (config.notifications?.writeBackToNote) {
      progressTracker.appendLogEntry(
        task.sourceFile,
        task.id,
        result.success ? 'done' : 'failed',
        result.success ? 'Task completed' : `Task failed: ${result.error}`
      );
    }

    results.push({
      task,
      taskState,
      result
    });

    // Respect cooldown if not concurrent
    if (!config.execution?.concurrent) {
      const cooldownMs = (config.execution?.cooldownMinutes || 5) * 60 * 1000;
      console.log(`Waiting ${cooldownMs / 1000}s before next task...`);
      await new Promise(resolve => setTimeout(resolve, cooldownMs));
    }
  }

  return results;
}

module.exports = {
  escapeForCli,
  runClawdbotAgent,
  buildExecutionPrompt,
  executeTask,
  executeTasks
};
