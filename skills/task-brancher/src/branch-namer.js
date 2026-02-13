/**
 * Branch Name Generator Module
 */

/**
 * Sanitize text for branch name
 */
function sanitizeBranchName(text, maxLength = 60) {
  return text
    .toLowerCase()
    .trim()
    // Remove special characters except hyphens
    .replace(/[^a-z0-9\s\-]/g, '')
    // Replace spaces and multiple hyphens with single hyphen
    .replace(/[\s-]+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Truncate to max length
    .slice(0, maxLength);
}

/**
 * Detect task type from description
 */
function detectTaskType(description, prefixMapping) {
  const lowerDesc = description.toLowerCase();

  for (const [prefix, keywords] of Object.entries(prefixMapping)) {
    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword.toLowerCase())) {
        return prefix;
      }
    }
  }

  return null;
}

/**
 * Generate branch name for a task
 */
function generateBranchName(task, config) {
  const branchNaming = config.branchNaming || {};
  const prefixMapping = branchNaming.prefixMapping || {};
  const defaultPrefix = branchNaming.defaultPrefix || 'task';
  const maxBranchLength = branchNaming.maxBranchLength || 60;

  // Detect task type
  const taskType = detectTaskType(task.description, prefixMapping) || defaultPrefix;

  // Generate date suffix
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Sanitize task description
  const sanitizedDesc = sanitizeBranchName(task.description, maxBranchLength - taskType.length - date.length - 10);

  // Combine parts
  const branchName = `${taskType}/${date}-${sanitizedDesc}`;

  return branchName;
}

/**
 * Generate unique branch name (avoid conflicts)
 */
async function generateUniqueBranchName(task, config, existingBranches = []) {
  let branchName = generateBranchName(task, config);
  let counter = 1;

  while (existingBranches.includes(branchName)) {
    const branchNaming = config.branchNaming || {};
    const taskType = branchNaming.defaultPrefix || 'task';
    const date = new Date().toISOString().slice(0, 10);

    // Add counter suffix
    const baseName = generateBranchName(task, config);
    const parts = baseName.split('-');
    const sanitizedDesc = sanitizeBranchName(task.description, 50);

    branchName = `${taskType}/${date}-${sanitizedDesc}-${counter}`;
    counter++;

    // Prevent infinite loops
    if (counter > 100) {
      // Fallback to timestamp-based name
      const timestamp = Date.now();
      branchName = `${taskType}/${date}-task-${timestamp}`;
      break;
    }
  }

  return branchName;
}

/**
 * Parse branch name to extract metadata
 */
function parseBranchName(branchName) {
  const parts = branchName.split('/');

  if (parts.length < 2) {
    return {
      type: 'unknown',
      date: null,
      description: branchName
    };
  }

  const type = parts[0];
  const rest = parts.slice(1).join('/');

  // Extract date (YYYY-MM-DD format)
  const dateMatch = rest.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);

  if (dateMatch) {
    return {
      type,
      date: dateMatch[1],
      description: dateMatch[2]
    };
  }

  return {
    type,
    date: null,
    description: rest
  };
}

/**
 * Validate branch name
 */
function validateBranchName(branchName) {
  if (!branchName || typeof branchName !== 'string') {
    return { valid: false, error: 'Branch name must be a non-empty string' };
  }

  if (branchName.length > 100) {
    return { valid: false, error: 'Branch name too long (max 100 characters)' };
  }

  // Check for invalid characters
  const invalidChars = /[~\^:\s\*\?\[\]\\]+/;
  if (invalidChars.test(branchName)) {
    return { valid: false, error: 'Branch name contains invalid characters' };
  }

  // Check for reserved names
  const reserved = ['HEAD', 'FETCH_HEAD', 'ORIG_HEAD', 'MERGE_HEAD'];
  if (reserved.includes(branchName) || branchName === '.') {
    return { valid: false, error: 'Branch name is reserved' };
  }

  return { valid: true };
}

/**
 * Generate branch description from branch name
 */
function generateBranchDescription(branchName, taskDescription) {
  const parsed = parseBranchName(branchName);

  let description = `Branch for ${parsed.type}: ${taskDescription}`;

  if (parsed.date) {
    description += `\nCreated: ${parsed.date}`;
  }

  return description;
}

module.exports = {
  sanitizeBranchName,
  detectTaskType,
  generateBranchName,
  generateUniqueBranchName,
  parseBranchName,
  validateBranchName,
  generateBranchDescription
};
