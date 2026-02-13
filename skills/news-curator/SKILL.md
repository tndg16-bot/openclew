---
name: news-curator
description: RSS feed reader with tech news summarization and Discord notifications
metadata: {"clawdbot":{"emoji":"📰"}}
version: 1.0.0
author: user
tags: [rss, news, automation, discord, notifications]
---

# News Curator Skill

Automatically fetches RSS feeds, curates tech news, and sends summaries to Discord at scheduled times.

## Core Features

1. **RSS Feed Reader** - Fetches articles from multiple RSS sources
2. **Tech News Summarization** - Groups and formats articles by category
3. **Discord Notifications** - Sends summaries at 8:00 AM and 6:00 PM (configurable)
4. **Deduplication** - Removes duplicate articles across feeds
5. **Priority Sorting** - Ranks articles by source priority

## Commands

| Command | Description |
|---------|-------------|
| `fetch` | Fetch articles from all enabled feeds |
| `summary` | Generate summary from cached articles |
| `notify` | Fetch and send to Discord immediately |
| `scheduled` | Check if current time matches schedule |
| `list-feeds` | List all configured RSS feeds |

## Configuration

### config.json

```json
{
  "discord": {
    "enabled": true,
    "channelId": "your_channel_id",
    "webhookUrl": "https://discord.com/api/webhooks/..."
  },
  "schedule": {
    "enabled": true,
    "times": ["08:00", "18:00"],
    "timezone": "Asia/Tokyo"
  },
  "summary": {
    "maxArticlesPerSummary": 10,
    "maxTitleLength": 100,
    "includeDescription": true,
    "groupByCategory": true
  }
}
```

### sources.json

```json
{
  "feeds": [
    {
      "id": "techcrunch",
      "name": "TechCrunch",
      "url": "https://techcrunch.com/feed/",
      "category": "tech",
      "enabled": true,
      "priority": 1,
      "maxArticles": 5
    }
  ]
}
```

## Default Sources

- TechCrunch (tech)
- Hacker News (tech)
- Ars Technica (tech)
- The Verge (tech)
- Wired (tech)
- Dev.to (programming)
- GitHub Blog (programming)
- Product Hunt (startup)

## Usage Examples

### Fetch and display articles
```bash
node index.js fetch
```

### Send summary to Discord
```bash
node index.js notify
```

### Run scheduled check
```bash
node index.js scheduled
```

## Output Format

```
📰 **Tech News Summary**
🕐 2026-02-13 08:00:00
━━━━━━━━━━━━━━━━━━━━━━

💻 **Technology** (5)
• [Article Title](https://example.com/article)
  _Description excerpt..._

👨‍💻 **Programming** (3)
• [Another Article](https://example.com/another)
  _Description excerpt..._

━━━━━━━━━━━━━━━━━━━━━━
📊 Total: 10 articles
```

## Integration with OpenClaw

This skill can be triggered by:
- Scheduled cron jobs (morning/evening)
- Manual Discord commands
- Webhook events

## Troubleshooting

### No articles fetched
- Check network connectivity
- Verify RSS feed URLs in sources.json
- Check if feeds are enabled

### Discord notifications not sending
- Verify webhook URL is correct
- Check if discord.enabled is true
- Ensure message isn't too long (Discord limit: 2000 chars)

## Future Enhancements

- [ ] AI-powered article summarization
- [ ] Custom keyword filtering
- [ ] Multiple Discord channel support
- [ ] Article read-later queue
- [ ] Integration with pocket/instapaper
