#!/usr/bin/env node

/**
 * Telegram MCP Server - Working Implementation
 * Provides Telegram file sending capabilities to Claude Code via MCP protocol
 * 
 * Usage: node telegram-mcp-server-working.js <botId> <botToken> <chatId>
 */

const { Server } = require('@modelcontextprotocol/sdk/server');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

class TelegramMCPServer {
  constructor(botId, botToken, chatId) {
    this.botId = botId;
    this.botToken = botToken;
    this.chatId = chatId;
    
    // Initialize Telegram Bot (no polling for MCP server)
    this.bot = new TelegramBot(botToken, { polling: false });
    
    // Initialize MCP Server
    this.server = new Server(
      {
        name: `telegram-sender-${botId}`,
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupErrorHandling();
    this.setupTools();
  }

  setupErrorHandling() {
    process.on('SIGINT', () => {
      console.error(`[${this.botId}] MCP Server shutting down...`);
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      console.error(`[${this.botId}] Uncaught exception:`, error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error(`[${this.botId}] Unhandled rejection at:`, promise, 'reason:', reason);
      process.exit(1);
    });
  }

  setupTools() {
    // Handle tools/list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
    }));

    // Handle tools/call
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'send_telegram_image':
            return await this.sendImage(args);
          case 'send_telegram_document':
            return await this.sendDocument(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  async sendImage(args) {
    const { file_path, caption } = args;
    
    // Validate file exists and is an image
    if (!fs.existsSync(file_path)) {
      throw new Error(`File not found: ${file_path}`);
    }

    const ext = path.extname(file_path).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (!imageExts.includes(ext)) {
      throw new Error(`Unsupported image format: ${ext}. Supported: ${imageExts.join(', ')}`);
    }

    try {
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
    } catch (error) {
      throw new Error(`Telegram API error: ${error.message}`);
    }
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

    try {
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
    } catch (error) {
      throw new Error(`Telegram API error: ${error.message}`);
    }
  }

  async run() {
    console.error(`[${this.botId}] Starting Telegram MCP Server...`);
    console.error(`[${this.botId}] Bot Token: ${this.botToken.substring(0, 10)}...`);
    console.error(`[${this.botId}] Chat ID: ${this.chatId}`);
    
    try {
      // Test Telegram connection first
      const me = await this.bot.getMe();
      console.error(`[${this.botId}] Bot connected: @${me.username}`);

      // Connect MCP server to stdio
      await this.server.connect(process.stdin, process.stdout);
      console.error(`[${this.botId}] MCP Server connected and ready`);
    } catch (error) {
      console.error(`[${this.botId}] Failed to start MCP Server:`, error);
      process.exit(1);
    }
  }
}

// Command line entry point
async function main() {
  const [botId, botToken, chatId] = process.argv.slice(2);
  
  if (!botId || !botToken || !chatId) {
    console.error('Usage: node telegram-mcp-server-working.js <botId> <botToken> <chatId>');
    console.error('Example: node telegram-mcp-server-working.js bot1 "1234567890:ABC..." "-1001234567890"');
    process.exit(1);
  }

  const server = new TelegramMCPServer(botId, botToken, chatId);
  await server.run();
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TelegramMCPServer;