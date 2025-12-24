---
aliases:
  - Telegram Bot
  - Claude Telegram Interface
tags:
  - mcp-server
  - integration
  - telegram
  - claude-code
created: 2024-12-24
---

# Claude Code Telegram Bot

Multi-user Telegram interface for Claude Code, enabling virtual employees (like [[06-Virtual-Employees/gwen-ives/README|Gwen Ives]]) and team members to interact with Claude via Telegram.

## Quick Links

- [[01-MCP-Servers/claude-code-telegram-bot/MULTI-BOT-SETUP|Multi-Bot Setup Guide]]
- [[01-MCP-Servers/claude-code-telegram-bot/CLAUDE|Claude Code Configuration]]

## Architecture

```
01-MCP-Servers/claude-code-telegram-bot/
├── configs/           # Per-user bot configurations
│   ├── gwen.json      # Gwen Ives bot config
│   ├── matt.json      # Matt Nye bot config
│   └── *.json.example # Template configs
├── .claude/           # Claude Code project settings
│   └── settings.json  # MCP deny rules (lightweight mode)
└── bot.js             # Main bot entry point
```

## User Configurations

Each user gets their own config in `configs/`:

| User | Config File | Working Directory | Purpose |
|------|-------------|-------------------|---------|
| Gwen | `gwen.json` | `06-Virtual-Employees/gwen-ives/workspace` | Virtual COO operations |
| Matt | `matt.json` | User-defined | Personal Claude interface |

## PM2 Commands

```bash
# Start individual bots
pm2 start ecosystem.config.js --only gwen
pm2 start ecosystem.config.js --only matt

# Start all bots
pm2 start ecosystem.config.js

# View logs
pm2 logs gwen
pm2 logs matt

# Restart
pm2 restart gwen
pm2 restart matt
```

## Related

- [[01-MCP-Servers/README|MCP Servers Overview]]
- [[06-Virtual-Employees/gwen-ives/README|Gwen Ives Virtual Employee]]
- [[00-System/README|System Configuration]]
