/**
 * Coder Agent - Enhanced with GitHub Issue Monitoring & Sandbox Execution
 * Digital Work Automation for OpenClaw Phase 3
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn, exec } = require('child_process');

const SKILLS_ROOT = path.join(os.homedir(), '.clawdbot', 'skills');
const CONFIG_PATH = path.join(__dirname, 'config.json');

let config = null;

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf8');
        config = JSON.parse(data);
        return config;
    } catch (err) {
        config = {
            github: { enabled: false },
            sandbox: { enabled: false },
            autoFix: { enabled: false }
        };
        return config;
    }
}

async function readFile(targetPath) {
    if (!fsSync.existsSync(targetPath)) {
        console.log(`Error: File not found: ${targetPath}`);
        return;
    }
    const content = await fs.readFile(targetPath, 'utf8');
    console.log(`\n--- File: ${targetPath} ---\n`);
    console.log(content);
    console.log(`\n---------------------------\n`);
}

async function writeFile(targetPath, content) {
    if (targetPath.includes('base_wallet.json')) {
        console.log("Error: Modification of wallet file is restricted.");
        return;
    }

    if (fsSync.existsSync(targetPath)) {
        const backupPath = `${targetPath}.bak.${Date.now()}`;
        await fs.copyFile(targetPath, backupPath);
        console.log(`Created backup: ${backupPath}`);
    } else {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
    }

    await fs.writeFile(targetPath, content, 'utf8');
    console.log(`Successfully wrote to: ${targetPath}`);
}

async function listFiles(targetDir) {
    if (!fsSync.existsSync(targetDir)) {
        console.log(`Error: Directory not found: ${targetDir}`);
        return;
    }
    const files = await fs.readdir(targetDir);
    console.log(`\nFiles in ${targetDir}:`);
    files.forEach(file => console.log(`- ${file}`));
}

class GitHubIssueMonitor {
    constructor(config) {
        this.config = config || {};
        this.token = null;
        this.baseUrl = this.config.apiBaseUrl || 'https://api.github.com';
    }

    async loadToken() {
        const tokenPath = this.config.tokenPath 
            ? this.config.tokenPath.replace('~', os.homedir())
            : path.join(os.homedir(), '.clawdbot', 'github-token.txt');
        
        try {
            this.token = (await fs.readFile(tokenPath, 'utf8')).trim();
            return this.token;
        } catch (err) {
            console.log('GitHub token not found. Running in mock mode.');
            return null;
        }
    }

    async request(endpoint, options = {}) {
        const url = new URL(endpoint, this.baseUrl);
        const headers = {
            'User-Agent': 'OpenClaw-CoderAgent/1.0.0',
            'Accept': 'application/vnd.github.v3+json'
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname + url.search,
                method: options.method || 'GET',
                headers,
                timeout: 30000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            resolve(data);
                        }
                    } else {
                        const error = new Error(`GitHub API error: ${res.statusCode}`);
                        error.statusCode = res.statusCode;
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
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

    async monitorIssues(repoConfig) {
        if (!this.token) {
            return this.mockFetchIssues(repoConfig);
        }

        const { owner, repo, labels } = repoConfig;
        const params = new URLSearchParams();
        params.append('state', 'open');
        if (labels && labels.length > 0) {
            params.append('labels', labels.join(','));
        }
        params.append('per_page', '20');

        const endpoint = `/repos/${owner}/${repo}/issues?${params}`;
        
        try {
            const issues = await this.request(endpoint);
            console.log(`Fetched ${issues.length} open issues from ${owner}/${repo}`);
            return issues;
        } catch (error) {
            console.error(`Error fetching issues: ${error.message}`);
            return [];
        }
    }

    mockFetchIssues(repoConfig) {
        console.log('Running in mock mode - returning sample issues');
        return [
            {
                id: 1,
                number: 101,
                title: 'Fix typo in README.md',
                body: 'There is a typo on line 42: "recieve" should be "receive"',
                labels: [{ name: 'good first issue' }],
                html_url: `https://github.com/${repoConfig.owner}/${repoConfig.repo}/issues/101`,
                created_at: new Date().toISOString()
            },
            {
                id: 2,
                number: 102,
                title: 'Update documentation for API v2',
                body: 'The API documentation needs to be updated for version 2 endpoints.',
                labels: [{ name: 'documentation' }],
                html_url: `https://github.com/${repoConfig.owner}/${repoConfig.repo}/issues/102`,
                created_at: new Date().toISOString()
            }
        ];
    }

    async analyzeForAutoFix(issue, config) {
        const autoFixConfig = config.autoFix || {};
        if (!autoFixConfig.enabled) {
            return { canAutoFix: false, reason: 'Auto-fix disabled' };
        }

        const allowedLabels = autoFixConfig.allowedFixTypes || [];
        const issueLabels = (issue.labels || []).map(l => l.name);
        
        const hasAllowedLabel = allowedLabels.some(label => issueLabels.includes(label));
        if (!hasAllowedLabel) {
            return { canAutoFix: false, reason: 'Issue type not allowed for auto-fix' };
        }

        const title = (issue.title || '').toLowerCase();
        const body = (issue.body || '').toLowerCase();

        if (title.includes('typo') || body.includes('typo')) {
            return { 
                canAutoFix: true, 
                fixType: 'typo',
                confidence: 0.9,
                description: 'Typo fix detected'
            };
        }

        if (title.includes('documentation') || issueLabels.includes('documentation')) {
            return {
                canAutoFix: true,
                fixType: 'documentation',
                confidence: 0.7,
                description: 'Documentation update'
            };
        }

        return { canAutoFix: false, reason: 'No auto-fix pattern matched' };
    }

    async autoFix(issue, repoConfig, fixConfig) {
        const analysis = await this.analyzeForAutoFix(issue, { autoFix: fixConfig });
        
        if (!analysis.canAutoFix) {
            console.log(`Cannot auto-fix issue #${issue.number}: ${analysis.reason}`);
            return { success: false, reason: analysis.reason };
        }

        console.log(`Attempting auto-fix for issue #${issue.number} (${analysis.fixType})`);

        if (fixConfig.requireConfirmation) {
            console.log('Auto-fix requires confirmation. Skipping automatic execution.');
            return { 
                success: false, 
                reason: 'Confirmation required',
                analysis,
                proposedFix: this.generateFixProposal(issue, analysis)
            };
        }

        return {
            success: true,
            fixType: analysis.fixType,
            issueNumber: issue.number,
            message: `Auto-fix prepared for issue #${issue.number}`
        };
    }

    generateFixProposal(issue, analysis) {
        return {
            issueNumber: issue.number,
            title: issue.title,
            fixType: analysis.fixType,
            confidence: analysis.confidence,
            suggestedAction: `Review and apply fix for: ${issue.title}`,
            issueUrl: issue.html_url
        };
    }
}

class SandboxExecutor {
    constructor(config) {
        this.config = config || {};
        this.containerName = this.config.containerName || 'opencode-sandbox';
        this.timeout = this.config.timeout || 60000;
        this.workDir = this.config.workDir || '/workspace';
    }

    async checkDockerAvailable() {
        return new Promise((resolve) => {
            exec('docker --version', (error) => {
                resolve(!error);
            });
        });
    }

    async ensureContainer() {
        const dockerAvailable = await this.checkDockerAvailable();
        if (!dockerAvailable) {
            console.log('Docker not available. Running in mock sandbox mode.');
            return false;
        }

        return new Promise((resolve) => {
            exec(`docker ps -q -f name=${this.containerName}`, (error, stdout) => {
                if (stdout.trim()) {
                    console.log(`Sandbox container ${this.containerName} is running`);
                    resolve(true);
                } else {
                    this.createContainer().then(resolve);
                }
            });
        });
    }

    async createContainer() {
        const imageName = this.config.imageName || 'node:20-slim';
        const memoryLimit = this.config.memoryLimit || '512m';
        
        return new Promise((resolve) => {
            const cmd = `docker run -d --name ${this.containerName} ` +
                `--memory=${memoryLimit} ` +
                `--network=${this.config.networkDisabled ? 'none' : 'bridge'} ` +
                `-w ${this.workDir} ` +
                `${imageName} tail -f /dev/null`;

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.log(`Failed to create sandbox container: ${stderr}`);
                    resolve(false);
                } else {
                    console.log(`Created sandbox container: ${this.containerName}`);
                    resolve(true);
                }
            });
        });
    }

    async runInSandbox(command, options = {}) {
        const dockerAvailable = await this.checkDockerAvailable();
        
        if (!dockerAvailable) {
            return this.mockSandboxExecution(command, options);
        }

        await this.ensureContainer();
        const timeout = options.timeout || this.timeout;

        return new Promise((resolve) => {
            const dockerCmd = `docker exec ${this.containerName} bash -c "${command.replace(/"/g, '\\"')}"`;
            
            const proc = exec(dockerCmd, { timeout }, (error, stdout, stderr) => {
                resolve({
                    success: !error,
                    stdout: stdout || '',
                    stderr: stderr || '',
                    exitCode: error ? error.code : 0,
                    command: command
                });
            });

            proc.on('error', (err) => {
                resolve({
                    success: false,
                    stdout: '',
                    stderr: err.message,
                    exitCode: -1,
                    command: command
                });
            });
        });
    }

    mockSandboxExecution(command, options = {}) {
        console.log(`[MOCK SANDBOX] Would execute: ${command}`);
        return {
            success: true,
            stdout: `[Mock output for: ${command}]`,
            stderr: '',
            exitCode: 0,
            command: command,
            mock: true
        };
    }

    async runCode(code, language = 'javascript') {
        const extensions = {
            javascript: 'js',
            python: 'py',
            typescript: 'ts'
        };
        const ext = extensions[language] || 'txt';
        const filename = `code_${Date.now()}.${ext}`;

        const commands = {
            javascript: `node -e "${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
            python: `python3 -c "${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
            typescript: `npx ts-node -e "${code.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
        };

        const command = commands[language] || commands.javascript;
        return this.runInSandbox(command);
    }

    async cleanup() {
        const dockerAvailable = await this.checkDockerAvailable();
        if (!dockerAvailable) return;

        return new Promise((resolve) => {
            exec(`docker rm -f ${this.containerName}`, () => {
                console.log(`Cleaned up sandbox container: ${this.containerName}`);
                resolve();
            });
        });
    }
}

async function runGitHubMonitoring() {
    await loadConfig();
    
    if (!config.github?.enabled) {
        console.log('GitHub monitoring is disabled in config');
        return { success: false, reason: 'disabled' };
    }

    const monitor = new GitHubIssueMonitor(config.github);
    await monitor.loadToken();

    const repositories = config.github.monitoredRepositories || [];
    const allIssues = [];

    for (const repo of repositories) {
        console.log(`\nMonitoring: ${repo.owner}/${repo.repo}`);
        const issues = await monitor.monitorIssues(repo);
        allIssues.push(...issues.map(i => ({ ...i, repository: `${repo.owner}/${repo.repo}` })));
    }

    console.log(`\nTotal issues found: ${allIssues.length}`);
    return { success: true, issues: allIssues };
}

async function runAutoFix(issueNumber, repoConfig) {
    await loadConfig();

    if (!config.autoFix?.enabled) {
        console.log('Auto-fix is disabled in config');
        return { success: false, reason: 'disabled' };
    }

    const monitor = new GitHubIssueMonitor(config.github);
    await monitor.loadToken();

    const mockIssue = {
        number: issueNumber,
        title: 'Sample issue for auto-fix',
        body: 'This is a sample issue',
        labels: [{ name: 'bug' }],
        html_url: `https://github.com/${repoConfig?.owner || 'test'}/${repoConfig?.repo || 'test'}/issues/${issueNumber}`
    };

    return monitor.autoFix(mockIssue, repoConfig, config.autoFix);
}

async function runSandboxCommand(command) {
    await loadConfig();

    const sandbox = new SandboxExecutor(config.sandbox);
    return sandbox.runInSandbox(command);
}

async function main() {
    await loadConfig();
    
    const command = process.argv[2];
    const targetPath = process.argv[3];
    const content = process.argv.slice(4).join(' ');

    try {
        switch (command) {
            case 'read':
                await readFile(targetPath);
                break;
            case 'write':
                if (!content) {
                    console.log("Error: Content required for write command.");
                    return;
                }
                await writeFile(targetPath, content);
                break;
            case 'list':
                await listFiles(targetPath);
                break;
            case 'monitor-issues':
                const monitorResult = await runGitHubMonitoring();
                console.log(JSON.stringify(monitorResult, null, 2));
                break;
            case 'auto-fix':
                const issueNum = parseInt(targetPath) || 1;
                const fixResult = await runAutoFix(issueNum);
                console.log(JSON.stringify(fixResult, null, 2));
                break;
            case 'sandbox':
                if (!targetPath) {
                    console.log("Error: Command required for sandbox execution.");
                    return;
                }
                const sandboxResult = await runSandboxCommand(targetPath);
                console.log(JSON.stringify(sandboxResult, null, 2));
                break;
            case 'help':
            default:
                console.log("Usage: node coder.js [command] [args]");
                console.log("\nCommands:");
                console.log("  read <path>              - Read a file");
                console.log("  write <path> <content>   - Write to a file");
                console.log("  list <dir>               - List files in directory");
                console.log("  monitor-issues           - Monitor GitHub issues");
                console.log("  auto-fix <issue_number>  - Attempt to auto-fix an issue");
                console.log("  sandbox <command>        - Execute command in sandbox");
                console.log("\nNOTE: Delete command is disabled for safety.");
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();

module.exports = {
    readFile,
    writeFile,
    listFiles,
    GitHubIssueMonitor,
    SandboxExecutor,
    runGitHubMonitoring,
    runAutoFix,
    runSandboxCommand
};
