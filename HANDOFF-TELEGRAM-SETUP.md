# Telegram Bot Setup - Handoff Document

## Current Status (December 24, 2025)

### ✅ RESOLVED - All Issues Fixed

**Both bots running successfully under PM2:**
- GwenBot (@gwen_ives_coo_bot) - Virtual COO interface
- MattBot (@matt_nye_founder_bot) - Personal development assistant

### What Was Done

1. **Fixed 409 Conflict errors** - Killed duplicate processes, single-instance via PM2
2. **Fixed 401 Unauthorized errors** - Created new Telegram bots with fresh tokens via BotFather
3. **Enforced OAuth authentication** - Claude Max subscription instead of API credits
4. **Configured PM2 process management** - Auto-restart, memory limits, log rotation
5. **Set up macOS boot auto-start** - PM2 launchd integration

---

## Architecture

### Bot Locations
```
01-MCP-Servers/claude-code-telegram-bot/
├── configs/
│   ├── gwen.json          # GwenBot config (gitignored - has token)
│   ├── matt.json          # MattBot config (gitignored - has token)
│   ├── gwen.json.example  # Template for Gwen setup
│   └── matt.json.example  # Template for Matt setup
├── ecosystem.config.js     # PM2 multi-bot configuration
├── scripts/start-bot.js    # Bot launcher (enforces OAuth)
└── .mcp.json              # Empty - lightweight mode (no MCPs)
```

### Bot Configuration

| Bot | Telegram Username | Purpose | Working Directory |
|-----|-------------------|---------|-------------------|
| gwen | @gwen_ives_coo_bot | Virtual COO | `06-Virtual-Employees/gwen-ives/workspace` |
| matt | @matt_nye_founder_bot | Personal dev | `/Users/matthewdnye/Developer` |

---

## Daily Operations

### Starting Bots
```bash
# Start both via PM2 (recommended)
pm2 start ecosystem.config.js

# Or start individually
pm2 start ecosystem.config.js --only gwen
pm2 start ecosystem.config.js --only matt
```

### Monitoring
```bash
pm2 status          # Process status
pm2 logs gwen       # Gwen logs
pm2 logs matt       # Matt logs
pm2 monit           # Interactive dashboard
```

### Stopping/Restarting
```bash
pm2 restart gwen    # Restart Gwen
pm2 restart matt    # Restart Matt
pm2 restart all     # Restart both
pm2 stop all        # Stop all bots
```

---

## Troubleshooting

### 409 Conflict Error
Another process is polling the same bot token.
```bash
# Kill all processes and restart
pm2 kill && killall node
sleep 5
pm2 start ecosystem.config.js
```

### 401 Unauthorized Error
Token is invalid or bot was deleted.
1. Go to @BotFather in Telegram
2. `/mybots` → select bot → API Token → Regenerate
3. Update `configs/[bot].json` with new token
4. `pm2 restart [bot]`

### "Credit balance too low"
Bot is using API key instead of OAuth.
- This should be fixed automatically via `scripts/start-bot.js`
- The script deletes `ANTHROPIC_API_KEY` at startup to force OAuth

### Bot Not Responding
```bash
# Check if running
pm2 status

# Check for errors
pm2 logs [bot] --lines 50

# Verify config exists
ls -la configs/gwen.json configs/matt.json
```

---

## macOS Boot Auto-Start

PM2 is configured to auto-start bots on macOS boot:
```bash
# Already done - PM2 generates launchd config
pm2 startup
pm2 save
```

**Launchd file:** `~/Library/LaunchAgents/pm2.matthewdnye.plist`

To verify auto-start is working:
```bash
launchctl list | grep pm2
```

---

## Security Notes

- **Config files are gitignored** - `configs/*.json` contains sensitive tokens
- **Example files are committed** - Use `*.json.example` as templates
- **OAuth enforced** - No API credits used, only Claude Max subscription
- **Admin-only access** - Bots only respond to configured admin user ID

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `configs/gwen.json` | GwenBot configuration (gitignored) |
| `configs/matt.json` | MattBot configuration (gitignored) |
| `ecosystem.config.js` | PM2 process management |
| `scripts/start-bot.js` | Bot launcher with OAuth enforcement |
| `.mcp.json` | Empty MCP config (lightweight mode) |
