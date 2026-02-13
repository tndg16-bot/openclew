const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const crypto = require('crypto');
const https = require('https');

const execAsync = util.promisify(exec);

// Git branch management
async function findGitRepo(startPath) {
  let currentPath = path.resolve(startPath);
  while (currentPath !== path.parse(currentPath).root) {
    const gitDir = path.join(currentPath, '.git');
    if (fs.existsSync(gitDir)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  return null;
}

function sanitizeBranchName(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s\-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function generateBranchName(idea) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const kind = idea.kind || 'task';
  const cleanText = sanitizeBranchName(idea.text);
  return `${kind}/${timestamp}-${cleanText}`;
}

async function getCurrentBranch(repoPath) {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
    return stdout.trim();
  } catch (error) {
    return null;
  }
}

async function branchExists(repoPath, branchName) {
  try {
    const { stdout } = await execAsync(`git branch --list "${branchName}"`, { cwd: repoPath });
    return stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

async function createBranch(repoPath, branchName, startBranch = null) {
  try {
    // Ensure working directory is clean
    await execAsync('git status --porcelain', { cwd: repoPath });

    // Get current branch if not specified
    const currentBranch = startBranch || await getCurrentBranch(repoPath);
    if (!currentBranch) {
      throw new Error('Could not determine current branch');
    }

    // Check if branch already exists
    if (await branchExists(repoPath, branchName)) {
      console.log(`Branch ${branchName} already exists, checking out...`);
      await execAsync(`git checkout "${branchName}"`, { cwd: repoPath });
      return { success: true, existing: true, branchName };
    }

    // Create and checkout new branch
    await execAsync(`git checkout -b "${branchName}"`, { cwd: repoPath });
    console.log(`Created branch: ${branchName}`);
    return { success: true, existing: false, branchName };
  } catch (error) {
    console.error('Failed to create branch:', error.message);
    return { success: false, error: error.message };
  }
}

async function ensureWorkingDirectoryClean(repoPath) {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
    if (stdout.trim()) {
      // Stash changes
      await execAsync('git stash push -m "Auto-stash before branch creation"', { cwd: repoPath });
      return { success: true, stashed: true };
    }
    return { success: true, stashed: false };
  } catch (error) {
    console.error('Failed to check working directory:', error.message);
    return { success: false, error: error.message };
  }
}

const TASK_HEADER = '🤖 Clawd Task';
const LOG_HEADER = '## Auto Dev Log';
const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, 'state.json');

const DEFAULT_CONFIG = {
  vaultRoot: 'C:\\Users\\chatg\\Obsidian Vault',
  scanDirs: [
    'Notes/daily',
    'papa/Notes/daily',
    'papa-notes/Notes/daily',
    'papa/Apps'
  ],
  includeExtensions: ['.md'],
  excludeDirNames: ['.git', '.trash', 'node_modules'],
  scanMaxFiles: 500,
  scanMaxBytes: 200000,
  idea: {
    useLLMExtraction: true,
    keywords: [
      'someday',
      'want to build',
      'want to develop',
      'would like to build',
      'plan to build',
      'idea:'
    ]
  },
  execution: {
    enabled: true,
    maxPerRun: 1,
    cooldownMinutes: 60
  },
  agent: {
    name: 'main',
    timeoutMs: 600000
  },
  discord: {
    enabled: false,
    botToken: '',
    channelId: '',
    fetchLimit: 50
  },
  appBaseDir: '',
  notifications: {
    writeBackToNote: true,
    discordWebhookUrl: ''
  },
  git: {
    autoBranch: true,
    branchPrefix: 'feature',
    maxBranchLength: 60,
    pushAfterExecution: false
  }
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (error) {
    console.error('Failed to load config.json:', error.message);
    return { ...DEFAULT_CONFIG };
  }
}

function mergeConfig(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }
  if (base && typeof base === 'object') {
    const result = { ...base };
    Object.keys(override || {}).forEach((key) => {
      result[key] = mergeConfig(base[key], override[key]);
    });
    return result;
  }
  return override !== undefined ? override : base;
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return {
      version: 1,
      lastRun: null,
      fileIndex: {},
      ideas: {},
      queue: [],
      discord: {
        lastMessageId: null
      }
    };
  }
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      lastRun: null,
      fileIndex: {},
      ideas: {},
      queue: [],
      discord: {
        lastMessageId: null
      },
      ...parsed
    };
  } catch (error) {
    console.error('Failed to load state.json:', error.message);
    return {
      version: 1,
      lastRun: null,
      fileIndex: {},
      ideas: {},
      queue: [],
      discord: {
        lastMessageId: null
      }
    };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function listMarkdownFiles(root, scanDirs, includeExtensions, excludeDirNames, maxFiles) {
  const results = [];
  const queue = scanDirs.map((dir) => path.join(root, dir));
  const includes = new Set(includeExtensions.map((ext) => ext.toLowerCase()));
  const excludes = new Set(excludeDirNames.map((name) => name.toLowerCase()));

  while (queue.length > 0 && results.length < maxFiles) {
    const current = queue.shift();
    if (!current || !fs.existsSync(current)) {
      continue;
    }
    const stats = fs.statSync(current);
    if (stats.isDirectory()) {
      const dirName = path.basename(current).toLowerCase();
      if (excludes.has(dirName)) {
        continue;
      }
      const entries = fs.readdirSync(current);
      for (const entry of entries) {
        if (results.length >= maxFiles) {
          break;
        }
        queue.push(path.join(current, entry));
      }
      continue;
    }
    const ext = path.extname(current).toLowerCase();
    if (includes.has(ext)) {
      results.push(current);
    }
  }

  return results;
}

function shouldProcessFile(filePath, stats, state) {
  if (!stats || !stats.isFile()) {
    return false;
  }
  const previous = state.fileIndex[filePath];
  if (!previous) {
    return true;
  }
  return stats.mtimeMs > previous;
}

function updateFileIndex(state, filePath, stats) {
  state.fileIndex[filePath] = stats.mtimeMs;
}

function normalizeIdeaText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function buildIdeaId(filePath, ideaText) {
  const hash = crypto.createHash('sha1');
  hash.update(`${filePath}|${ideaText}`);
  return hash.digest('hex').slice(0, 12);
}

function extractIdeasSimple(lines, keywords) {
  if (!keywords || keywords.length === 0) {
    return [];
  }
  const lowered = keywords.map((word) => word.toLowerCase());
  const ideas = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      continue;
    }
    if (!line.trim()) {
      continue;
    }
    if (line.includes('auto-dev:') || line.includes('Auto Dev Log')) {
      continue;
    }
    const check = line.toLowerCase();
    const matched = lowered.some((keyword) => check.includes(keyword));
    if (matched) {
      ideas.push({ text: line.trim(), lineIndex: i });
    }
  }
  return ideas;
}

async function extractIdeasWithLLM(content, filePath, config) {
  const truncated = content.slice(0, config.scanMaxBytes);
  const prompt = [
    'You are a parser. Extract development ideas from the note content.',
    'A development idea is a user desire to build or implement a tool/app/skill/project.',
    'Return JSON array only. Each item should include:',
    '{ "text": "<idea sentence>", "context": "<short context>", "confidence": 0.0 }',
    'If no ideas, return []. Do not add any prose.',
    `Source file: ${filePath}`,
    'Note content:',
    truncated
  ].join('\n');

  try {
    const output = await runClawdbotAgent(prompt, config.agent);
    const ideas = parseJsonArray(output);
    return ideas
      .map((idea) => ({
        text: normalizeIdeaText(idea.text || idea.idea || idea.title || ''),
        context: normalizeIdeaText(idea.context || ''),
        confidence: Number(idea.confidence || 0)
      }))
      .filter((idea) => idea.text.length > 0);
  } catch (error) {
    console.error('LLM extraction failed:', error.message);
    return [];
  }
}

function parseJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }
  const raw = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function classifyIdea(text) {
  const check = text.toLowerCase();
  if (check.includes('skill') || check.includes('clawdbot') || check.includes('openclaw') || check.includes('bot')) {
    return 'skill';
  }
  if (check.includes('app') || check.includes('tool') || check.includes('service') || check.includes('website') || check.includes('web')) {
    return 'app';
  }
  return 'unknown';
}

function upsertIdea(state, idea) {
  const existing = state.ideas[idea.id];
  if (existing) {
    return existing;
  }
  state.ideas[idea.id] = idea;
  state.queue.push(idea.id);
  return idea;
}

function ensureLogSection(lines) {
  const index = lines.findIndex((line) => line.trim() === LOG_HEADER);
  if (index !== -1) {
    return index;
  }
  lines.push('');
  lines.push(LOG_HEADER);
  return lines.length - 1;
}

function appendLogEntry(filePath, idea) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  ensureLogSection(lines);
  lines.push(`- [queued] ${idea.text} (id: ${idea.id})`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function updateLogStatus(filePath, ideaId, status, message) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const marker = `(id: ${ideaId})`;
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(marker)) {
      continue;
    }
    lines[i] = lines[i].replace(/\[(queued|running|done|failed)\]/, `[${status}]`);
    if (message) {
      lines.splice(i + 1, 0, `  - ${message}`);
    }
    updated = true;
    break;
  }

  if (updated) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
}

function sendDiscordWebhook(webhookUrl, title, description, color) {
  if (!webhookUrl) {
    return;
  }
  try {
    const url = new URL(webhookUrl);
    const payload = JSON.stringify({
      embeds: [
        {
          title,
          description,
          color: color || 0x3498db,
          timestamp: new Date().toISOString()
        }
      ]
    });

    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      res.on('data', () => {});
    });
    req.on('error', (error) => {
      console.error('Discord webhook error:', error.message);
    });
    req.write(payload);
    req.end();
  } catch (error) {
    console.error('Discord webhook error:', error.message);
  }
}

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (!data) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function isNewerSnowflake(id, lastId) {
  if (!lastId) {
    return true;
  }
  try {
    return BigInt(id) > BigInt(lastId);
  } catch (error) {
    return id !== lastId;
  }
}

async function fetchDiscordMessages(config, state) {
  if (!config.discord.enabled || !config.discord.botToken || !config.discord.channelId) {
    return [];
  }
  const pathName = `/api/v10/channels/${config.discord.channelId}/messages?limit=${config.discord.fetchLimit}`;
  const options = {
    method: 'GET',
    hostname: 'discord.com',
    path: pathName,
    headers: {
      Authorization: `Bot ${config.discord.botToken}`
    }
  };

  try {
    const messages = await requestJson(options);
    if (!Array.isArray(messages)) {
      return [];
    }
    const lastId = state.discord.lastMessageId;
    const ordered = messages.slice().reverse();
    const fresh = ordered.filter((message) => {
      if (!message || !message.id) {
        return false;
      }
      if (message.author && message.author.bot) {
        return false;
      }
      return isNewerSnowflake(message.id, lastId);
    });
    if (fresh.length > 0) {
      state.discord.lastMessageId = fresh[fresh.length - 1].id;
    }
    return fresh;
  } catch (error) {
    console.error('Discord fetch failed:', error.message);
    return [];
  }
}

async function processDiscordMessages(config, state) {
  const messages = await fetchDiscordMessages(config, state);
  if (messages.length === 0) {
    return [];
  }
  const newIdeas = [];
  for (const message of messages) {
    const content = normalizeIdeaText(message.content || '');
    if (!content) {
      continue;
    }

    let ideas = extractIdeasSimple([content], config.idea.keywords).map((idea) => ({
      text: normalizeIdeaText(idea.text)
    }));

    if (config.idea.useLLMExtraction && ideas.length === 0) {
      const llmIdeas = await extractIdeasWithLLM(content, `discord:${config.discord.channelId}/${message.id}`, config);
      ideas = llmIdeas.map((idea) => ({ text: normalizeIdeaText(idea.text) }));
    }

    ideas.forEach((idea) => {
      if (!idea.text) {
        return;
      }
      const id = buildIdeaId(`discord:${message.id}`, idea.text);
      if (state.ideas[id]) {
        return;
      }
      const kind = classifyIdea(idea.text);
      const createdAt = new Date().toISOString();
      const record = {
        id,
        text: idea.text,
        kind,
        sourceFile: `discord:${config.discord.channelId}`,
        sourceLine: null,
        context: '',
        status: 'queued',
        createdAt,
        updatedAt: createdAt,
        lastAttemptAt: null,
        sourceMessageId: message.id
      };
      upsertIdea(state, record);
      newIdeas.push(record);
    });
  }
  return newIdeas;
}

function escapeForCli(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function runClawdbotAgent(message, agentConfig) {
  const safeMessage = escapeForCli(message);
  const command = `clawdbot agent --agent ${agentConfig.name} --message "${safeMessage}"`;
  const { stdout } = await execAsync(command, { timeout: agentConfig.timeoutMs });
  return stdout || '';
}

function buildExecutionPrompt(idea, config, branchInfo = null) {
  const targetKind = idea.kind === 'unknown' ? 'app_or_skill' : idea.kind;
  const appBaseDir = config.appBaseDir || 'UNSET';
  const sourceFile = idea.sourceFile || 'unknown';

  const prompt = [
    'Context: You are an autonomous developer agent triggered by an Obsidian idea.',
    `Idea: ${idea.text}`,
    `Target kind: ${targetKind}`,
    'Skill base path: C:\\Users\\chatg\\.clawdbot\\skills',
    `App base path: ${appBaseDir}`,
    `Source note: ${sourceFile}`
  ];

  if (branchInfo && branchInfo.success) {
    prompt.push('');
    prompt.push(`Working on branch: ${branchInfo.branchName}`);
    if (branchInfo.existing) {
      prompt.push('(Existing branch was checked out)');
    }
  }

  prompt.push('');
  prompt.push('Requirements:');
  prompt.push('- Identify the best target repo or create a new one under the base path.');
  if (branchInfo && branchInfo.success) {
    prompt.push(`- Work on the current git branch: ${branchInfo.branchName}`);
  } else {
    prompt.push('- Create a new git branch (do not work on main/master).');
  }
  prompt.push('- Implement the feature end-to-end with minimal scope.');
  prompt.push('- Run relevant tests or diagnostics if available.');
  prompt.push('- Create a PR if gh is available; otherwise prepare a PR summary.');
  prompt.push('- Log progress and results back to the caller.');
  prompt.push('');
  prompt.push('Do not ask for confirmation. Proceed with best defaults.');

  return prompt.join('\n');
}

async function executeIdea(idea, config, branchInfo = null) {
  const prompt = buildExecutionPrompt(idea, config, branchInfo);
  return runClawdbotAgent(prompt, config.agent);
}

async function processTaskSection(filePath, lines, config) {
  let isTaskSection = false;
  let hasChanges = false;
  const newLines = [...lines];

  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i];

    if (line.includes(TASK_HEADER)) {
      isTaskSection = true;
      continue;
    }
    if (isTaskSection && line.trim().startsWith('#')) {
      isTaskSection = false;
    }

    if (isTaskSection) {
      const match = line.match(/^(\s*)-\s*\[\s*\]\s*(.+)$/);
      if (!match) {
        continue;
      }
      const indent = match[1];
      const taskDescription = match[2];
      console.log(`Found task: ${taskDescription}`);

      newLines[i] = `${indent}- [/] ${taskDescription} (Executing...)`;
      fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');

      try {
        // Create branch if configured
        let branchInfo = null;
        if (config.git.autoBranch) {
          try {
            let targetPath = config.appBaseDir || config.vaultRoot;
            const repoPath = await findGitRepo(targetPath);

            if (repoPath) {
              const branchName = generateBranchName({
                text: taskDescription,
                kind: 'task'
              });
              const cleanResult = await ensureWorkingDirectoryClean(repoPath);

              if (cleanResult.success) {
                branchInfo = await createBranch(repoPath, branchName);
                if (branchInfo.success) {
                  console.log(`Created branch for task: ${branchInfo.branchName}`);
                }
              }
            }
          } catch (error) {
            console.warn('Branch creation for task failed:', error.message);
          }
        }

        const prompt = [
          'Context: You are an autonomous developer agent triggered by an Obsidian task.',
          `Task: ${taskDescription}`,
          branchInfo && branchInfo.success ? `Working on branch: ${branchInfo.branchName}` : '',
          '',
          'Please execute this task. You have access to the file system and tools.',
          'Do not ask for confirmation, just do it.'
        ].filter(Boolean).join('\n');

        await runClawdbotAgent(prompt, config.agent);
        const timestamp = new Date().toLocaleTimeString();
        newLines[i] = `${indent}- [x] ${taskDescription}`;
        const completionNote = `${indent}  - Completed at ${timestamp}`;
        if (branchInfo && branchInfo.success) {
          newLines.splice(i + 1, 0, completionNote, `${indent}  - Branch: ${branchInfo.branchName}`);
          i += 1; // Adjust index for inserted line
        } else {
          newLines.splice(i + 1, 0, completionNote);
        }
        hasChanges = true;
      } catch (error) {
        console.error('Task failed:', error.message);
        newLines[i] = `${indent}- [!] ${taskDescription} (Failed)`;
        newLines.splice(i + 1, 0, `${indent}  - Error: ${error.message}`);
        hasChanges = true;
      }
    }
  }

  if (hasChanges) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
  }

  return newLines;
}

async function processNote(filePath, config, state) {
  const stats = fs.statSync(filePath);
  if (!shouldProcessFile(filePath, stats, state)) {
    return [];
  }
  if (stats.size > config.scanMaxBytes) {
    updateFileIndex(state, filePath, stats);
    return [];
  }

  console.log(`Checking file: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split(/\r?\n/);

  lines = await processTaskSection(filePath, lines, config);

  const keywordIdeas = extractIdeasSimple(lines, config.idea.keywords);
  let ideas = keywordIdeas.map((idea) => ({
    text: normalizeIdeaText(idea.text),
    sourceFile: filePath,
    sourceLine: idea.lineIndex
  }));

  if (config.idea.useLLMExtraction && ideas.length === 0) {
    const llmIdeas = await extractIdeasWithLLM(lines.join('\n'), filePath, config);
    ideas = ideas.concat(
      llmIdeas.map((idea) => ({
        text: normalizeIdeaText(idea.text),
        sourceFile: filePath,
        sourceLine: null,
        context: idea.context,
        confidence: idea.confidence
      }))
    );
  }

  const unique = new Map();
  ideas.forEach((idea) => {
    const key = idea.text;
    if (!unique.has(key)) {
      unique.set(key, idea);
    }
  });

  const newIdeas = [];
  unique.forEach((idea) => {
    const id = buildIdeaId(filePath, idea.text);
    if (state.ideas[id]) {
      return;
    }
    const kind = classifyIdea(idea.text);
    const createdAt = new Date().toISOString();
    const record = {
      id,
      text: idea.text,
      kind,
      sourceFile: filePath,
      sourceLine: idea.sourceLine,
      context: idea.context || '',
      status: 'queued',
      createdAt,
      updatedAt: createdAt,
      lastAttemptAt: null
    };
    upsertIdea(state, record);
    newIdeas.push(record);
    if (config.notifications.writeBackToNote) {
      appendLogEntry(filePath, record);
    }
  });

  updateFileIndex(state, filePath, stats);
  return newIdeas;
}

async function processQueue(state, config) {
  if (!config.execution.enabled) {
    return;
  }
  const now = Date.now();
  const remaining = [];
  let processedCount = 0;

  for (const ideaId of state.queue) {
    const idea = state.ideas[ideaId];
    if (!idea) {
      continue;
    }
    if (idea.status === 'done' || idea.status === 'failed') {
      continue;
    }
    if (idea.status === 'running') {
      remaining.push(ideaId);
      continue;
    }
    if (processedCount >= config.execution.maxPerRun) {
      remaining.push(ideaId);
      continue;
    }
    if (idea.lastAttemptAt) {
      const delta = now - new Date(idea.lastAttemptAt).getTime();
      if (delta < config.execution.cooldownMinutes * 60 * 1000) {
        remaining.push(ideaId);
        continue;
      }
    }

    idea.status = 'running';
    idea.lastAttemptAt = new Date().toISOString();
    idea.updatedAt = idea.lastAttemptAt;
    updateLogStatus(idea.sourceFile, idea.id, 'running', 'Execution started');

    let branchInfo = null;
    if (config.git.autoBranch) {
      try {
        // Find appropriate git repo
        let targetPath = config.appBaseDir || config.vaultRoot;
        const repoPath = await findGitRepo(targetPath);

        if (repoPath) {
          const branchName = generateBranchName(idea);
          const cleanResult = await ensureWorkingDirectoryClean(repoPath);

          if (cleanResult.success) {
            if (cleanResult.stashed) {
              updateLogStatus(idea.sourceFile, idea.id, 'running', 'Stashed changes before branch creation');
            }
            branchInfo = await createBranch(repoPath, branchName);
            if (branchInfo.success) {
              updateLogStatus(idea.sourceFile, idea.id, 'running', `Created branch: ${branchInfo.branchName}`);
              sendDiscordWebhook(
                config.notifications.discordWebhookUrl,
                'Auto Dev: Branch created',
                `${idea.text}\n\nBranch: ${branchInfo.branchName}`,
                0x3498db
              );
            } else {
              console.warn('Branch creation failed, continuing on current branch');
            }
          }
        } else {
          console.warn('No git repo found, skipping branch creation');
        }
      } catch (error) {
        console.error('Git setup failed:', error.message);
        updateLogStatus(idea.sourceFile, idea.id, 'running', `Git setup warning: ${error.message}`);
      }
    }

    sendDiscordWebhook(
      config.notifications.discordWebhookUrl,
      'Auto Dev started',
      `${idea.text}\n\nSource: ${idea.sourceFile}${branchInfo ? `\nBranch: ${branchInfo.branchName}` : ''}`,
      0x3498db
    );

    try {
      await executeIdea(idea, config, branchInfo);
      idea.status = 'done';
      idea.updatedAt = new Date().toISOString();
      updateLogStatus(idea.sourceFile, idea.id, 'done', 'Execution complete');

      // Push branch after execution if configured
      if (branchInfo && branchInfo.success && config.git.pushAfterExecution) {
        try {
          const repoPath = await findGitRepo(config.appBaseDir || config.vaultRoot);
          if (repoPath) {
            await execAsync(`git push -u origin ${branchInfo.branchName}`, { cwd: repoPath });
            updateLogStatus(idea.sourceFile, idea.id, 'done', `Pushed branch: ${branchInfo.branchName}`);
          }
        } catch (error) {
          console.error('Failed to push branch:', error.message);
          updateLogStatus(idea.sourceFile, idea.id, 'done', `Push failed: ${error.message}`);
        }
      }

      sendDiscordWebhook(
        config.notifications.discordWebhookUrl,
        'Auto Dev complete',
        `${idea.text}\n\nStatus: done${branchInfo ? `\nBranch: ${branchInfo.branchName}` : ''}`,
        0x2ecc71
      );
    } catch (error) {
      idea.status = 'failed';
      idea.updatedAt = new Date().toISOString();
      updateLogStatus(idea.sourceFile, idea.id, 'failed', `Error: ${error.message}`);
      sendDiscordWebhook(
        config.notifications.discordWebhookUrl,
        'Auto Dev failed',
        `${idea.text}\n\nError: ${error.message}`,
        0xe74c3c
      );
    }

    processedCount += 1;
  }

  const nextQueue = new Set(remaining);
  state.queue
    .filter((id) => state.ideas[id] && state.ideas[id].status === 'queued')
    .forEach((id) => nextQueue.add(id));
  state.queue = Array.from(nextQueue);
}

async function main() {
  const config = loadConfig();
  const state = loadState();

  if (!fs.existsSync(config.vaultRoot)) {
    console.error(`Vault root not found: ${config.vaultRoot}`);
    return;
  }

  const files = listMarkdownFiles(
    config.vaultRoot,
    config.scanDirs,
    config.includeExtensions,
    config.excludeDirNames,
    config.scanMaxFiles
  );

  for (const filePath of files) {
    await processNote(filePath, config, state);
  }

  await processDiscordMessages(config, state);

  await processQueue(state, config);
  state.lastRun = new Date().toISOString();
  saveState(state);
}

main().catch((error) => {
  console.error('Auto dev watcher failed:', error.message);
});
