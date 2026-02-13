---
name: task-brancher
description: Detects tasks from Obsidian notes, creates appropriate Git branches, manages task execution, and tracks progress.
---

# Task Brancher

Automated task management for Obsidian-based development workflows. Detects tasks, creates dedicated Git branches, manages execution, and tracks progress.

## Triggers

- **Cron**: `*/15 * * * *` (Every 15 minutes)
  - Helper: `node src/index.js`

## Usage

### Task Detection

In your Obsidian notes, create tasks in the following format:

```markdown
# Tasks

- [ ] Implement user authentication
- [ ] Create dashboard widget
- [ ] Fix login bug in API

# Dev Tasks

- [ ] Refactor database queries
- [ ] Add unit tests for auth module
```

### Workflow

1. **Detection**: Scans configured Obsidian directories for unchecked tasks
2. **Branch Creation**: Creates a new Git branch for each task using generated names
3. **Task Assignment**: Assigns tasks to branches and stores state
4. **Execution**: Executes tasks via Clawdbot agent
5. **Progress Tracking**: Updates task status and creates progress logs
6. **Completion**: Marks branches as ready for PR or merges

### Branch Naming Rules

Branch names are automatically generated based on task content:

- **Format**: `{type}/{date}-{sanitized-task-text}`
- **Examples**:
  - `feature/2026-02-06-implement-user-authentication`
  - `fix/2026-02-06-fix-login-bug-in-api`
  - `refactor/2026-02-06-refactor-database-queries`

Branch types are automatically detected:
- `feature/` - New features, implementations
- `fix/` - Bug fixes, corrections
- `refactor/` - Code refactoring, optimization
- `test/` - Test additions, test fixes
- `docs/` - Documentation updates
- `task/` - General tasks

## Configuration

Edit `config.json`:

```json
{
  "vaultRoot": "C:\\Users\\chatg\\Obsidian Vault",
  "scanDirs": ["Notes/daily", "Dev/Tasks"],
  "git": {
    "autoBranch": true,
    "autoPush": false,
    "defaultRemote": "origin"
  },
  "execution": {
    "enabled": true,
    "maxPerRun": 3,
    "timeoutMs": 600000,
    "concurrent": false
  },
  "agent": {
    "name": "main",
    "contextFile": ""
  },
  "notifications": {
    "discordWebhookUrl": "",
    "writeBackToNote": true
  },
  "branchNaming": {
    "maxBranchLength": 60,
    "prefixMapping": {
      "feature": ["implement", "create", "add", "build", "new"],
      "fix": ["fix", "bug", "error", "crash"],
      "refactor": ["refactor", "optimize", "improve", "clean"],
      "test": ["test", "spec", "coverage"],
      "docs": ["document", "readme", "guide"]
    }
  }
}
```

## Progress Tracking

The skill maintains progress state in `state.json`:

```json
{
  "tasks": {
    "task-id": {
      "id": "task-id",
      "description": "Implement user authentication",
      "sourceFile": "path/to/note.md",
      "branch": "feature/2026-02-06-implement-user-authentication",
      "status": "running",
      "createdAt": "2026-02-06T10:00:00.000Z",
      "updatedAt": "2026-02-06T10:30:00.000Z",
      "progress": {
        "steps": ["created branch", "analyzed requirements"],
        "currentStep": 1
      }
    }
  },
  "branches": {},
  "statistics": {
    "totalTasks": 10,
    "completedTasks": 7,
    "failedTasks": 1,
    "runningTasks": 2
  }
}
```

## Scalability

- Designed to handle **5+ tasks per day**
- Efficient file scanning with caching
- Branch name deduplication
- State persistence across runs
- Graceful error handling and recovery

## Error Handling

- **Git conflicts**: Detects and reports conflicts before branching
- **Duplicate branches**: Reuses existing branches instead of creating duplicates
- **Task timeout**: Marks tasks as failed after timeout, preserves branch for manual inspection
- **Git repo not found**: Falls back to task execution without branching
- **Obsidian vault unavailable**: Logs error and retries on next run

## Integration

Works seamlessly with:
- **obsidian-auto-dev**: Shares task detection logic
- **Git**: Automatic branch management
- **Discord**: Progress notifications via webhooks
- **Clawdbot Agents**: Task execution via agent interface
