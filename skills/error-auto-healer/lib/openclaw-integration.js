'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GATEWAY_PORT = 18789;
const GATEWAY_URL = `http://localhost:${GATEWAY_PORT}`;

class OpenClawIntegration {
  constructor(config) {
    this.config = config || {};
    this.gatewayUrl = this.config.gateway?.url || GATEWAY_URL;
  }

  /**
   * Check if the OpenClaw gateway is running.
   */
  async isGatewayRunning() {
    try {
      const res = await axios.get(`${this.gatewayUrl}/health`, { timeout: 3000 });
      return res.status === 200;
    } catch (err) {
      return false;
    }
  }

  /**
   * Request healing from OpenClaw (via gateway or direct agent call).
   */
  async requestHealing(errorInfo, repoDir) {
    const prompt = this.buildHealingPrompt(errorInfo, repoDir);

    console.log(`[OpenClaw] Requesting healing for: ${errorInfo.repo || errorInfo.project}`);

    // Try gateway first, fall back to direct call
    const gatewayRunning = await this.isGatewayRunning();

    if (gatewayRunning) {
      console.log('[OpenClaw] Using gateway for healing request.');
      return await this.callViaGateway(prompt, repoDir);
    }

    console.log('[OpenClaw] Gateway not available. Attempting direct agent call.');
    return await this.callDirectly(prompt, repoDir);
  }

  /**
   * Call the OpenClaw healing agent via the gateway API.
   */
  async callViaGateway(prompt, repoDir) {
    try {
      const res = await axios.post(`${this.gatewayUrl}/agent/execute`, {
        action: 'heal',
        prompt,
        workingDirectory: repoDir,
        timeout: 300000, // 5-minute timeout
      }, {
        timeout: 310000,
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.data && res.data.success) {
        return {
          success: true,
          strategy: res.data.strategy || 'ai-fix',
          changes: res.data.changes || [],
          message: res.data.message || 'Healing completed via gateway.',
        };
      }

      return {
        success: false,
        message: res.data?.message || 'Gateway returned unsuccessful response.',
      };
    } catch (err) {
      console.error('[OpenClaw] Gateway call failed:', err.message);
      return {
        success: false,
        message: `Gateway error: ${err.message}`,
      };
    }
  }

  /**
   * Call the Claude CLI agent directly (fallback when gateway is down).
   */
  async callDirectly(prompt, repoDir) {
    try {
      // Check if claude CLI is available
      let cliAvailable = false;
      try {
        execSync('claude --version', { stdio: 'pipe', timeout: 5000 });
        cliAvailable = true;
      } catch (e) {
        // CLI not available
      }

      if (!cliAvailable) {
        console.log('[OpenClaw] Claude CLI not available. Using simulated healing.');
        return this.simulateHealing(prompt, repoDir);
      }

      return new Promise((resolve, reject) => {
        const child = spawn('claude', [
          '--print',
          '--allowedTools', 'Edit,Write,Bash,Read',
          prompt,
        ], {
          cwd: repoDir,
          timeout: 300000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              strategy: 'ai-fix',
              changes: [],
              message: stdout.trim() || 'Direct agent healing completed.',
            });
          } else {
            resolve({
              success: false,
              message: `Agent exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
            });
          }
        });

        child.on('error', (err) => {
          resolve({
            success: false,
            message: `Agent spawn error: ${err.message}`,
          });
        });
      });
    } catch (err) {
      console.error('[OpenClaw] Direct call failed:', err.message);
      return {
        success: false,
        message: `Direct call error: ${err.message}`,
      };
    }
  }

  /**
   * Build a detailed healing prompt for the agent.
   */
  buildHealingPrompt(errorInfo, repoDir) {
    const parts = [
      'You are an automated error healer. Analyze and fix the following error.',
      '',
      '## Error Details',
    ];

    if (errorInfo.type) {
      parts.push(`- **Type**: ${errorInfo.type}`);
    }
    if (errorInfo.repo) {
      parts.push(`- **Repository**: ${errorInfo.repo}`);
    }
    if (errorInfo.branch) {
      parts.push(`- **Branch**: ${errorInfo.branch}`);
    }
    if (errorInfo.workflow) {
      parts.push(`- **Workflow**: ${errorInfo.workflow}`);
    }
    if (errorInfo.errorMessage) {
      parts.push(`- **Error Message**: ${errorInfo.errorMessage}`);
    }
    if (errorInfo.logUrl) {
      parts.push(`- **Log URL**: ${errorInfo.logUrl}`);
    }

    parts.push('');
    parts.push('## Working Directory');
    parts.push(`The repository has been cloned to: ${repoDir}`);
    parts.push('');
    parts.push('## Instructions');
    parts.push('1. Analyze the error and identify the root cause.');
    parts.push('2. Implement the minimal fix necessary to resolve the error.');
    parts.push('3. Do NOT modify unrelated files or add unnecessary changes.');
    parts.push('4. Ensure the fix does not break existing functionality.');
    parts.push('5. If you cannot determine the fix with high confidence, report that.');

    if (errorInfo.errorLog) {
      parts.push('');
      parts.push('## Error Log');
      parts.push('```');
      // Truncate very long logs
      const log = errorInfo.errorLog.length > 3000
        ? errorInfo.errorLog.substring(0, 3000) + '\n... (truncated)'
        : errorInfo.errorLog;
      parts.push(log);
      parts.push('```');
    }

    return parts.join('\n');
  }

  /**
   * Simulated healing for testing or when no agent is available.
   */
  simulateHealing(prompt, repoDir) {
    console.log('[OpenClaw] Simulating healing (no real agent available).');
    console.log('[OpenClaw] Prompt preview:', prompt.substring(0, 200) + '...');

    return {
      success: false,
      strategy: 'simulated',
      changes: [],
      message: 'Healing simulated. No real changes were made. Configure an agent (gateway or CLI) for actual healing.',
    };
  }
}

module.exports = OpenClawIntegration;
