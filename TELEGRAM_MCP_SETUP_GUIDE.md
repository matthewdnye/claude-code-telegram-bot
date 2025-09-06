# Telegram MCP Server - Setup Guide

## Overview

Successfully implemented **Command Line MCP Server** integration for Telegram file sending. This allows Claude Code to automatically send files to Telegram Bot instances using the `--mcp-config` flag.

## Architecture

✅ **Command Line MCP Server** (`telegram-mcp-server-simple.js`)
- STDIO-based MCP server (no HTTP ports needed)
- Automatic file type detection and sending
- Bot-specific configuration per instance

✅ **Dynamic JSON Config Generation** (`TelegramMCPIntegration.js`)
- Per-bot MCP configuration files in `var/mcp-configs/`
- Session isolation through unique configuration files
- Automatic cleanup on bot shutdown

✅ **Claude Code Integration** (`SessionManager.js` + `claude-stream-processor.js`)
- Automatic MCP config creation when starting Claude sessions
- `--mcp-config` flag integration with additional arguments
- Perfect session isolation using `--session-id`

## Files Created/Modified

### New Files:
- `telegram-mcp-server-simple.js` - Command Line MCP Server
- `TelegramMCPIntegration.js` - MCP configuration management
- `telegram-mcp-architecture.md` - Detailed architecture documentation
- `test-mcp-integration.js` - Integration testing script
- `TELEGRAM_FILE_SENDER_MCP_SPECIFICATION.md` - Updated technical specification

### Modified Files:
- `SessionManager.js` - Added MCP integration to session creation
- `claude-stream-processor.js` - Added support for additional Claude Code arguments

## Usage

### Automatic Integration

When a user starts a Claude Code session through the Telegram bot, the system automatically:

1. Creates MCP configuration file: `var/mcp-configs/telegram-bot-{botId}.json`
2. Launches Claude Code with: `--mcp-config {configPath} --session-id {sessionId}`
3. MCP server provides tools: `send_telegram_image`, `send_telegram_document`
4. Cleans up configuration file when session ends

### Manual Testing

```bash
# Test MCP integration
node test-mcp-integration.js

# Test simple MCP server directly
node telegram-mcp-server-simple.js bot1 "YOUR_BOT_TOKEN" "YOUR_CHAT_ID"
```

## MCP Tools Available in Claude Code

When MCP server is active, Claude Code has access to these tools:

- **`send_telegram_image`**: Send image files (PNG, JPEG, GIF, WebP)
- **`send_telegram_document`**: Send any file as document (up to 50MB)

Usage in Claude Code:
```
User: "Create a diagram and send it to Telegram"
Claude: [Creates diagram.png] → [Calls send_telegram_image] → [File sent to Telegram]
```

## Session Isolation

✅ **Perfect Isolation Achieved**:
- Bot1 sessions use: `--mcp-config telegram-bot-bot1.json --session-id telegram-bot-bot1-uuid`
- Bot2 sessions use: `--mcp-config telegram-bot-bot2.json --session-id telegram-bot-bot2-uuid`
- Terminal sessions: No `--mcp-config` flag (no Telegram integration)

## Configuration Files

Example generated config (`var/mcp-configs/telegram-bot-bot1.json`):
```json
{
  "mcpServers": {
    "telegram-sender-bot1": {
      "command": "node",
      "args": [
        "/path/to/telegram-mcp-server-simple.js",
        "bot1",
        "1234567890:BOT_TOKEN",
        "-1001234567890"
      ]
    }
  }
}
```

## Key Benefits

1. **✅ Zero Configuration Overhead**: Automatic MCP config generation
2. **✅ Perfect Session Isolation**: Each bot instance has unique MCP server
3. **✅ No Network Dependencies**: Command line STDIO communication
4. **✅ Automatic Cleanup**: MCP configs cleaned up on session end
5. **✅ Seamless Integration**: Works with existing SessionManager architecture

## Testing Results

All integration tests pass:
- MCP configuration generation ✅
- Claude Code argument injection ✅  
- Session isolation ✅
- Automatic cleanup ✅
- MCP server connectivity ✅

## Next Steps

The implementation is **production ready**. To activate:

1. Deploy the modified files to production
2. Restart bot instances to load new SessionManager
3. Test with a real Claude Code session in Telegram

Users will be able to request file creation and automatic Telegram delivery:
- "Create a chart and send it to Telegram"
- "Generate a PDF report and send it"
- "Export this data and send the file"