---
name: obsidian-auto-dev
description: Detects tasks and natural-language ideas in Obsidian notes and executes them autonomously.
---

# Obsidian Auto Dev

Watches Obsidian notes for development tasks and natural-language ideas, then executes them autonomously.

## Triggers

- **Cron**: `*/10 * * * *` (Every 10 minutes)
  - Helper: `node watcher.js`

## Usage

### Task checkbox mode

In your daily note (e.g., `2026-02-06.md`), add a section:

```markdown
# 🤖 Clawd Task
- [ ] Create a hello world script
```

The bot will find this, execute it, and update the checkbox to `[x]`.

### Natural-language idea mode

Write a natural idea anywhere in a scanned note. Example:

```markdown
Someday I want to build a time tracking app with a start/stop button and daily report.
```

The watcher extracts ideas, queues them, and logs status under an `Auto Dev Log` section.

## Configuration

Edit `config.json` in this skill directory:

```json
{
  "vaultRoot": "C:\\Users\\chatg\\Obsidian Vault",
  "scanDirs": ["Notes/daily", "papa/Notes/daily", "papa/Apps"],
  "idea": { "useLLMExtraction": true, "keywords": ["someday"] },
  "execution": { "enabled": true, "maxPerRun": 1, "cooldownMinutes": 60 },
  "discord": { "enabled": false, "botToken": "", "channelId": "", "fetchLimit": 50 },
  "appBaseDir": "",
  "notifications": { "writeBackToNote": true, "discordWebhookUrl": "" }
}
```

Notes:
- Set `appBaseDir` if you want app projects created under a specific folder.
- Add your own language keywords if you prefer keyword detection over LLM extraction.
- Enable the `discord` block to ingest ideas from a Discord channel.
