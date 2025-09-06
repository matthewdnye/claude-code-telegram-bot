#!/usr/bin/env node

/**
 * Simple Telegram MCP Server - Command Line STDIO Implementation
 * Minimal version for testing
 * 
 * Usage: node telegram-mcp-server-simple.js <botId> <botToken> <chatId>
 */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Simple MCP Server implementation without SDK for now
class SimpleTelegramMCPServer {
  constructor(botId, botToken, chatId) {
    this.botId = botId;
    this.botToken = botToken;
    this.chatId = chatId;
    
    // Initialize Telegram Bot (no polling for MCP server)
    this.bot = new TelegramBot(botToken, { polling: false });
    
    this.setupErrorHandling();
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

  async sendImage(filePath, caption) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (!imageExts.includes(ext)) {
      throw new Error(`Unsupported image format: ${ext}. Supported: ${imageExts.join(', ')}`);
    }

    try {
      const result = await this.bot.sendPhoto(this.chatId, filePath, {
        caption: caption || `Image sent from Claude Code (${this.botId})`
      });

      return {
        success: true,
        message_id: result.message_id,
        file: path.basename(filePath)
      };
    } catch (error) {
      throw new Error(`Telegram API error: ${error.message}`);
    }
  }

  async sendDocument(filePath, caption) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Check file size (Telegram limit is 50MB)
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    if (fileSizeMB > 50) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB. Telegram limit is 50MB.`);
    }

    try {
      const result = await this.bot.sendDocument(this.chatId, filePath, {
        caption: caption || `Document sent from Claude Code (${this.botId})`
      });

      return {
        success: true,
        message_id: result.message_id,
        file: path.basename(filePath),
        size: fileSizeMB.toFixed(2) + 'MB'
      };
    } catch (error) {
      throw new Error(`Telegram API error: ${error.message}`);
    }
  }

  async run() {
    console.error(`[${this.botId}] Starting Simple Telegram MCP Server...`);
    console.error(`[${this.botId}] Bot Token: ${this.botToken.substring(0, 10)}...`);
    console.error(`[${this.botId}] Chat ID: ${this.chatId}`);
    
    // For now, just test connection
    try {
      const me = await this.bot.getMe();
      console.error(`[${this.botId}] Bot connected: @${me.username}`);
      console.error(`[${this.botId}] Simple MCP Server ready`);
      
      // Keep process alive for testing
      setInterval(() => {
        // Keep alive
      }, 60000);
      
    } catch (error) {
      console.error(`[${this.botId}] Failed to connect to Telegram:`, error.message);
      process.exit(1);
    }
  }

  // Test methods
  async testImageSend(testImagePath) {
    try {
      console.error(`[${this.botId}] Testing image send...`);
      const result = await this.sendImage(testImagePath, 'Test image from MCP server');
      console.error(`[${this.botId}] Image sent successfully:`, result);
      return result;
    } catch (error) {
      console.error(`[${this.botId}] Image send failed:`, error.message);
      throw error;
    }
  }

  async testDocumentSend(testDocPath) {
    try {
      console.error(`[${this.botId}] Testing document send...`);
      const result = await this.sendDocument(testDocPath, 'Test document from MCP server');
      console.error(`[${this.botId}] Document sent successfully:`, result);
      return result;
    } catch (error) {
      console.error(`[${this.botId}] Document send failed:`, error.message);
      throw error;
    }
  }
}

// Command line entry point
async function main() {
  const [botId, botToken, chatId] = process.argv.slice(2);
  
  if (!botId || !botToken || !chatId) {
    console.error('Usage: node telegram-mcp-server-simple.js <botId> <botToken> <chatId>');
    console.error('Example: node telegram-mcp-server-simple.js bot1 "1234567890:ABC..." "-1001234567890"');
    process.exit(1);
  }

  const server = new SimpleTelegramMCPServer(botId, botToken, chatId);
  await server.run();
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = SimpleTelegramMCPServer;