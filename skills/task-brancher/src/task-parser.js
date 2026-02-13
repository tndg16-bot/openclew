/**
 * Task Parser Module
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate a unique task ID
 */
function generateTaskId(sourceFile, lineIndex, description) {
  const hash = crypto.createHash('sha256');
  hash.update(`${sourceFile}:${lineIndex}:${description}`);
  return hash.digest('hex').slice(0, 16);
}

/**
 * Detect task sections in markdown content
 */
function detectTaskSections(lines, taskHeaders) {
  const sections = [];
  const normalizedHeaders = taskHeaders.map(h => h.toLowerCase().trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    const headerIndex = normalizedHeaders.findIndex(h => line === h || line.startsWith(h));

    if (headerIndex !== -1) {
      sections.push({
        index: i,
        header: taskHeaders[headerIndex]
      });
    }
  }

  return sections;
}

/**
 * Extract tasks from a markdown note
 */
function extractTasks(filePath, content, config) {
  const lines = content.split(/\r?\n/);
  const taskHeaders = config.task?.taskHeaders || ['# Tasks', '# Dev Tasks', '# TODO'];

  const sections = detectTaskSections(lines, taskHeaders);
  const tasks = [];
  let inTaskSection = false;
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check if we're entering a task section
    const sectionMatch = taskHeaders.find(h => trimmedLine.toLowerCase().startsWith(h.toLowerCase()));
    if (sectionMatch) {
      inTaskSection = true;
      currentSection = sectionMatch;
      continue;
    }

    // Check if we're leaving the task section
    if (inTaskSection && trimmedLine.startsWith('#') && !taskHeaders.some(h => trimmedLine.toLowerCase().startsWith(h.toLowerCase()))) {
      inTaskSection = false;
      currentSection = null;
      continue;
    }

    // Only process tasks if we're in a task section
    if (!inTaskSection) {
      continue;
    }

    // Skip code blocks
    if (trimmedLine.startsWith('```')) {
      inTaskSection = false;
      continue;
    }

    // Extract unchecked tasks
    const match = line.match(/^(\s*)-\s*\[\s*\]\s*(.+)$/);
    if (match) {
      const description = match[2].trim();
      const taskId = generateTaskId(filePath, i, description);

      tasks.push({
        id: taskId,
        description,
        sourceFile: filePath,
        lineIndex: i,
        section: currentSection,
        completed: false
      });
    }

    // Extract checked tasks (for tracking)
    const checkedMatch = line.match(/^(\s*)-\s*\[x\]\s*(.+)$/);
    if (checkedMatch) {
      const description = checkedMatch[2].trim();
      const taskId = generateTaskId(filePath, i, description);

      tasks.push({
        id: taskId,
        description,
        sourceFile: filePath,
        lineIndex: i,
        section: currentSection,
        completed: true
      });
    }
  }

  return tasks;
}

/**
 * Filter tasks based on configuration
 */
function filterTasks(tasks, config, state) {
  const filtered = [];

  for (const task of tasks) {
    // Skip completed tasks if configured
    if (config.task?.skipCompletedTasks && task.completed) {
      continue;
    }

    // Skip tasks that are already in state
    if (state.tasks[task.id]) {
      // Only include if task is not completed
      const existingTask = state.tasks[task.id];
      if (existingTask.status !== 'done' && existingTask.status !== 'failed') {
        filtered.push(task);
      }
      continue;
    }

    // Skip tasks marked as skipped
    if (task.description.toLowerCase().includes('[skip]')) {
      continue;
    }

    filtered.push(task);
  }

  return filtered;
}

/**
 * List markdown files to scan
 */
function listMarkdownFiles(root, scanDirs, includeExtensions, excludeDirNames, maxFiles) {
  const files = [];
  const queue = scanDirs.map(dir => path.join(root, dir));
  const includes = new Set(includeExtensions.map(ext => ext.toLowerCase()));
  const excludes = new Set(excludeDirNames.map(name => name.toLowerCase()));

  while (queue.length > 0 && files.length < maxFiles) {
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
        if (files.length >= maxFiles) {
          break;
        }
        queue.push(path.join(current, entry));
      }
      continue;
    }

    const ext = path.extname(current).toLowerCase();
    if (includes.has(ext)) {
      files.push(current);
    }
  }

  return files;
}

/**
 * Scan all markdown files and extract tasks
 */
function scanFiles(filePaths, config) {
  const allTasks = [];

  for (const filePath of filePaths) {
    try {
      const stats = fs.statSync(filePath);

      // Skip large files
      if (stats.size > (config.scanMaxBytes || 200000)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const tasks = extractTasks(filePath, content, config);
      allTasks.push(...tasks);
    } catch (error) {
      console.error(`Failed to scan file ${filePath}:`, error.message);
    }
  }

  return allTasks;
}

module.exports = {
  generateTaskId,
  detectTaskSections,
  extractTasks,
  filterTasks,
  listMarkdownFiles,
  scanFiles
};
