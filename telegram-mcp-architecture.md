# Telegram MCP Server Architecture - Command Line Approach

## Overview

Command Line MCP server implementation for Telegram file sending with per-bot isolation using `--mcp-config` flag.

## Architecture Components

### 1. Command Line MCP Server (`telegram-mcp-server.js`)
- **Type**: STDIO MCP server (no HTTP/ports needed)
- **Location**: Project root directory
- **Input**: Bot instance ID via command line argument
- **Function**: Sends files to specific Telegram Bot via Bot API

### 2. Dynamic JSON Config Generation
- **Location**: `var/mcp-configs/` directory (auto-created)
- **Pattern**: `telegram-bot-{botId}.json` per bot instance
- **Content**: MCP server configuration with bot-specific parameters
- **Lifecycle**: Created on bot startup, cleaned on shutdown

### 3. Bot Integration
- **Startup Process**: Each bot creates its MCP config file
- **Claude Code Launch**: Uses `--mcp-config var/mcp-configs/telegram-bot-{botId}.json`
- **Session Isolation**: Each bot has unique MCP server instance

## Implementation Details

### MCP Server Architecture

```javascript
// telegram-mcp-server.js - Command Line MCP Server
const { Server } = require('@modelcontextprotocol/sdk/server/stdio');
const TelegramBot = require('node-telegram-bot-api');

class TelegramMCPServer {
  constructor(botId, botToken, chatId) {
    this.botId = botId;
    this.bot = new TelegramBot(botToken, {polling: false});
    this.chatId = chatId;
    this.server = new Server({
      name: `telegram-sender-${botId}`,
      version: '1.0.0'
    });
    
    this.setupTools();
  }

  setupTools() {
    // send_telegram_image tool
    this.server.tool('send_telegram_image', {
      description: 'Send image file to Telegram bot',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to image file' },
          caption: { type: 'string', description: 'Optional caption' }
        },
        required: ['file_path']
      }
    }, async (args) => {
      const result = await this.bot.sendPhoto(this.chatId, args.file_path, {
        caption: args.caption
      });
      return { success: true, message_id: result.message_id };
    });

    // send_telegram_document tool
    this.server.tool('send_telegram_document', {
      description: 'Send document file to Telegram bot', 
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to document file' },
          caption: { type: 'string', description: 'Optional caption' }
        },
        required: ['file_path']
      }
    }, async (args) => {
      const result = await this.bot.sendDocument(this.chatId, args.file_path, {
        caption: args.caption
      });
      return { success: true, message_id: result.message_id };
    });

    // send_telegram_voice tool  
    this.server.tool('send_telegram_voice', {
      description: 'Send voice message to Telegram bot',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to audio file' },
          duration: { type: 'number', description: 'Duration in seconds' }
        },
        required: ['file_path']
      }
    }, async (args) => {
      const result = await this.bot.sendVoice(this.chatId, args.file_path, {
        duration: args.duration
      });
      return { success: true, message_id: result.message_id };
    });
  }

  async run() {
    await this.server.connect();
  }
}

// Command line entry point
const [botId, botToken, chatId] = process.argv.slice(2);
if (!botId || !botToken || !chatId) {
  console.error('Usage: node telegram-mcp-server.js <botId> <botToken> <chatId>');
  process.exit(1);
}

const server = new TelegramMCPServer(botId, botToken, chatId);
server.run().catch(console.error);
```

### JSON Config Generation

```javascript
// In bot startup code (bot.js or similar)
const fs = require('fs');
const path = require('path');

class TelegramMCPIntegration {
  constructor(botId, botToken, chatId) {
    this.botId = botId;
    this.botToken = botToken; 
    this.chatId = chatId;
    this.configDir = path.join(__dirname, 'var', 'mcp-configs');
    this.configPath = path.join(this.configDir, `telegram-bot-${botId}.json`);
  }

  async createMCPConfig() {
    // Ensure var/mcp-configs directory exists
    await fs.promises.mkdir(this.configDir, { recursive: true });

    const config = {
      mcpServers: {
        [`telegram-sender-${this.botId}`]: {
          command: 'node',
          args: [
            path.join(__dirname, 'telegram-mcp-server.js'),
            this.botId,
            this.botToken,
            this.chatId
          ]
        }
      }
    };

    await fs.promises.writeFile(this.configPath, JSON.stringify(config, null, 2));
    console.log(`MCP config created: ${this.configPath}`);
    return this.configPath;
  }

  async cleanupMCPConfig() {
    try {
      await fs.promises.unlink(this.configPath);
      console.log(`MCP config cleaned up: ${this.configPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error cleaning up MCP config:', error);
      }
    }
  }

  getClaudeCodeArgs() {
    return [
      '--mcp-config', this.configPath,
      '--session-id', `telegram-bot-${this.botId}`
    ];
  }
}
```

### Bot Startup Integration

```javascript
// Integration in SessionManager.js or bot startup
class BotWithTelegramMCP {
  constructor(botId, botToken, chatId) {
    this.botId = botId;
    this.telegramMCP = new TelegramMCPIntegration(botId, botToken, chatId);
  }

  async startClaudeCodeSession(projectPath) {
    // Create MCP config for this bot
    const mcpConfigPath = await this.telegramMCP.createMCPConfig();
    
    // Launch Claude Code with bot-specific MCP config
    const claudeArgs = [
      '--mcp-config', mcpConfigPath,
      '--session-id', `telegram-bot-${this.botId}`,
      '--output-format', 'stream-json',
      // Add other existing args...
    ];

    const claudeProcess = spawn('claude', claudeArgs, {
      cwd: projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BOT_INSTANCE_ID: this.botId,
        TELEGRAM_BOT_TOKEN: this.botToken, // For fallback identification
        TELEGRAM_CHAT_ID: this.chatId
      }
    });

    // Setup cleanup on process termination
    process.on('exit', () => this.telegramMCP.cleanupMCPConfig());
    process.on('SIGINT', () => this.telegramMCP.cleanupMCPConfig());
    process.on('SIGTERM', () => this.telegramMCP.cleanupMCPConfig());

    return claudeProcess;
  }
}
```

## File Structure

```
project/
├── telegram-mcp-server.js          # Command Line MCP Server
├── var/                            # Temp files (in .gitignore)
│   └── mcp-configs/               # Auto-created
│       ├── telegram-bot-bot1.json # Bot1 MCP config
│       ├── telegram-bot-bot2.json # Bot2 MCP config
│       └── telegram-bot-bot3.json # Bot3 MCP config
├── .mcp.json                      # Project MCP servers (existing)
└── SessionManager.js              # Updated with MCP integration
```

## Command Line Usage

### Bot1 Instance
```bash
# Auto-generated config: var/mcp-configs/telegram-bot-bot1.json
claude --mcp-config var/mcp-configs/telegram-bot-bot1.json --session-id telegram-bot-bot1
```

### Bot2 Instance  
```bash
# Auto-generated config: var/mcp-configs/telegram-bot-bot2.json
claude --mcp-config var/mcp-configs/telegram-bot-bot2.json --session-id telegram-bot-bot2
```

### Terminal Session (No Telegram MCP)
```bash
# Uses only project .mcp.json (existing MCP servers)
claude --session-id terminal-session
```

## MCP Config Merging Behavior

**Key Question**: Does `--mcp-config` ADD to or REPLACE existing MCP servers?

Based on CLI design patterns, `--mcp-config` likely **adds** to existing configuration, meaning:
- Project `.mcp.json` servers remain available
- `--mcp-config` servers are added to the session
- No conflicts since bot-specific servers have unique names

**Test Strategy**: 
1. Add test MCP server to `.mcp.json`
2. Launch with `--mcp-config` and verify both servers are available
3. Confirm additive behavior

## Session Isolation

### Per-Bot Isolation
- Each bot instance creates unique MCP config file
- Unique session IDs prevent cross-contamination
- Bot-specific MCP server instances with separate tokens
- File cleanup on bot shutdown

### Terminal Isolation
- Terminal sessions don't use `--mcp-config` 
- Only access project-level `.mcp.json` MCP servers
- No Telegram functionality available in terminal

## Advantages

1. **Perfect Isolation**: Each bot has completely separate MCP server
2. **No Ports/Networking**: Pure command line STDIO communication
3. **Dynamic Configuration**: Configs created/destroyed with bot lifecycle
4. **Secure**: Bot tokens passed via command line args, not stored in files
5. **Clean**: var/ directory cleanup on bot shutdown
6. **Additive**: Existing project MCP servers remain unaffected

## Usage Examples

### Sending Image from Claude Code
```
User: "Create a diagram and send it to Telegram"
Claude: Creates image.png, then calls send_telegram_image tool
Result: Image automatically sent to bot's Telegram chat
```

### Sending Document  
```
User: "Send this analysis report to Telegram"
Claude: Calls send_telegram_document with report.pdf
Result: Document sent to Telegram with caption
```

### Voice Message
```
User: "Convert this text to speech and send as voice message"
Claude: Creates audio file, calls send_telegram_voice tool
Result: Voice message sent to Telegram
```

## Implementation Priority

1. **Phase 1**: Basic MCP server with image/document sending
2. **Phase 2**: JSON config generation and bot integration
3. **Phase 3**: Voice message and advanced file processing
4. **Phase 4**: Testing with multiple bot instances and cleanup

This architecture provides the exact functionality requested with perfect session isolation and no networking complexity.