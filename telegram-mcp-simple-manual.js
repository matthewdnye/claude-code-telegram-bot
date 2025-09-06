#!/usr/bin/env node

/**
 * Simple Manual Telegram MCP Server 
 * Implements basic MCP protocol manually over stdio
 * 
 * Usage: node telegram-mcp-simple-manual.js <botId> <botToken> <chatId>
 */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

class SimpleMCPServer {
  constructor(botId, botToken, chatId) {
    this.botId = botId;
    this.botToken = botToken;
    this.chatId = chatId;
    this.bot = new TelegramBot(botToken, { polling: false });
    this.setupStdio();
  }

  setupStdio() {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (data) => {
      this.handleMessage(data);
    });
  }

  handleMessage(data) {
    try {
      const lines = data.trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const message = JSON.parse(line);
          this.processMessage(message);
        }
      }
    } catch (error) {
      console.error(`[${this.botId}] Error processing message:`, error);
    }
  }

  async processMessage(message) {
    const { id, method, params } = message;

    try {
      let result;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;
        case 'tools/list':
          result = await this.handleToolsList(params);
          break;
        case 'tools/call':
          result = await this.handleToolsCall(params);
          break;
        default:
          throw new Error(`Unknown method: ${method}`);
      }

      this.sendResponse(id, result);
    } catch (error) {
      this.sendError(id, error.message);
    }
  }

  async handleInitialize(params) {
    console.error(`[${this.botId}] Initializing MCP server...`);
    
    // Test Telegram connection
    const me = await this.bot.getMe();
    console.error(`[${this.botId}] Bot connected: @${me.username}`);

    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: `telegram-sender-${this.botId}`,
        version: "1.0.0"
      }
    };
  }

  async handleToolsList(params) {
    return {
      tools: [
        {
          name: 'send_telegram_image',
          description: `Send an image file to Telegram bot ${this.botId}`,
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the image file (PNG, JPEG, GIF, WebP)'
              },
              caption: {
                type: 'string',
                description: 'Optional caption for the image'
              }
            },
            required: ['file_path']
          }
        },
        {
          name: 'send_telegram_document',
          description: `Send a document file to Telegram bot ${this.botId}`,
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the document file'
              },
              caption: {
                type: 'string',
                description: 'Optional caption for the document'
              }
            },
            required: ['file_path']
          }
        }
      ]
    };
  }

  async handleToolsCall(params) {
    const { name, arguments: args } = params;

    switch (name) {
      case 'send_telegram_image':
        return await this.sendImage(args);
      case 'send_telegram_document':
        return await this.sendDocument(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async sendImage(args) {
    const { file_path, caption } = args;
    
    if (!fs.existsSync(file_path)) {
      throw new Error(`File not found: ${file_path}`);
    }

    const ext = path.extname(file_path).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (!imageExts.includes(ext)) {
      throw new Error(`Unsupported image format: ${ext}. Supported: ${imageExts.join(', ')}`);
    }

    const result = await this.bot.sendPhoto(this.chatId, file_path, {
      caption: caption || `Image sent from Claude Code (${this.botId})`
    });

    return {
      content: [{
        type: 'text',
        text: `✅ Image sent successfully to Telegram bot ${this.botId}\n` +
              `📄 File: ${path.basename(file_path)}\n` +
              `📨 Message ID: ${result.message_id}\n` +
              `💬 Chat ID: ${this.chatId}`
      }]
    };
  }

  async sendDocument(args) {
    const { file_path, caption } = args;
    
    if (!fs.existsSync(file_path)) {
      throw new Error(`File not found: ${file_path}`);
    }

    // Check file size (Telegram limit is 50MB)
    const stats = fs.statSync(file_path);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    if (fileSizeMB > 50) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB. Telegram limit is 50MB.`);
    }

    const result = await this.bot.sendDocument(this.chatId, file_path, {
      caption: caption || `Document sent from Claude Code (${this.botId})`
    });

    return {
      content: [{
        type: 'text',
        text: `✅ Document sent successfully to Telegram bot ${this.botId}\n` +
              `📄 File: ${path.basename(file_path)} (${fileSizeMB.toFixed(2)}MB)\n` +
              `📨 Message ID: ${result.message_id}\n` +
              `💬 Chat ID: ${this.chatId}`
      }]
    };
  }

  sendResponse(id, result) {
    const response = {
      jsonrpc: "2.0",
      id: id,
      result: result
    };
    console.log(JSON.stringify(response));
  }

  sendError(id, error) {
    const response = {
      jsonrpc: "2.0",
      id: id,
      error: {
        code: -32000,
        message: error
      }
    };
    console.log(JSON.stringify(response));
  }
}

// Command line entry point
async function main() {
  const [botId, botToken, chatId] = process.argv.slice(2);
  
  if (!botId || !botToken || !chatId) {
    console.error('Usage: node telegram-mcp-simple-manual.js <botId> <botToken> <chatId>');
    console.error('Example: node telegram-mcp-simple-manual.js bot1 "1234567890:ABC..." "-1001234567890"');
    process.exit(1);
  }

  const server = new SimpleMCPServer(botId, botToken, chatId);
  console.error(`[${botId}] Simple Manual MCP Server ready`);
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = SimpleMCPServer;