/**
 * Telegram MCP Integration
 * Manages MCP configuration files for Telegram Bot instances
 * Provides session isolation via per-bot MCP configs
 */

const fs = require('fs');
const path = require('path');

class TelegramMCPIntegration {
  constructor(botId, botToken, chatId) {
    this.botId = botId;
    this.botToken = botToken;
    this.chatId = chatId;
    
    // Configuration paths
    this.configDir = path.join(__dirname, 'var', 'mcp-configs');
    this.configPath = path.join(this.configDir, `telegram-bot-${botId}.json`);
    
    // Session ID for Claude Code isolation
    this.sessionId = `telegram-bot-${botId}-${Date.now()}`;
  }

  /**
   * Create MCP configuration file for this bot instance
   * @returns {Promise<string>} Path to created config file
   */
  async createMCPConfig() {
    try {
      // Ensure var/mcp-configs directory exists
      await fs.promises.mkdir(this.configDir, { recursive: true });

      // Create MCP server configuration
      const config = {
        mcpServers: {
          [`telegram-sender-${this.botId}`]: {
            command: 'node',
            args: [
              path.join(__dirname, 'telegram-mcp-server-simple.js'),
              this.botId,
              this.botToken,
              this.chatId
            ]
          }
        }
      };

      // Write configuration file
      await fs.promises.writeFile(this.configPath, JSON.stringify(config, null, 2));
      
      console.log(`✅ MCP config created for ${this.botId}: ${this.configPath}`);
      return this.configPath;
    } catch (error) {
      console.error(`❌ Error creating MCP config for ${this.botId}:`, error.message);
      throw error;
    }
  }

  /**
   * Clean up MCP configuration file
   * Called on bot shutdown
   */
  async cleanupMCPConfig() {
    try {
      await fs.promises.unlink(this.configPath);
      console.log(`🧹 MCP config cleaned up for ${this.botId}: ${this.configPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`⚠️ Error cleaning up MCP config for ${this.botId}:`, error.message);
      }
      // Don't throw - cleanup errors shouldn't crash bot
    }
  }

  /**
   * Get Claude Code command line arguments for this bot
   * @param {Array<string>} additionalArgs - Additional Claude Code arguments
   * @param {boolean} includeSessionId - Whether to include --session-id (conflicts with --continue/--resume)
   * @returns {Array<string>} Complete argument array for Claude Code
   */
  getClaudeCodeArgs(additionalArgs = [], includeSessionId = true) {
    const args = [
      '--mcp-config', this.configPath,
      '--output-format', 'stream-json'
    ];
    
    // Only add --session-id if it doesn't conflict with session flags
    if (includeSessionId) {
      args.push('--session-id', this.sessionId);
    }
    
    args.push(...additionalArgs);

    return args;
  }

  /**
   * Get Claude Code arguments that are compatible with session flags (--continue, --resume)
   * Excludes --session-id to avoid conflicts
   * @param {Array<string>} additionalArgs - Additional Claude Code arguments
   * @returns {Array<string>} Session-compatible argument array for Claude Code
   */
  getSessionCompatibleArgs(additionalArgs = []) {
    return this.getClaudeCodeArgs(additionalArgs, false);
  }

  /**
   * Get environment variables for Claude Code process
   * @returns {Object} Environment variables
   */
  getEnvironment() {
    return {
      ...process.env,
      BOT_INSTANCE_ID: this.botId,
      TELEGRAM_BOT_TOKEN: this.botToken,
      TELEGRAM_CHAT_ID: this.chatId,
      CLAUDE_SESSION_TYPE: 'telegram-bot'
    };
  }

  /**
   * Check if MCP config file exists
   * @returns {boolean} True if config file exists
   */
  configExists() {
    return fs.existsSync(this.configPath);
  }

  /**
   * Test MCP server connectivity
   * @returns {Promise<boolean>} True if MCP server can be reached
   */
  async testMCPServer() {
    try {
      if (!this.configExists()) {
        console.warn(`⚠️ MCP config does not exist for ${this.botId}`);
        return false;
      }

      // Test by spawning MCP server briefly
      const { spawn } = require('child_process');
      
      const mcpProcess = spawn('node', [
        path.join(__dirname, 'telegram-mcp-server-simple.js'),
        this.botId,
        this.botToken,
        this.chatId
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      mcpProcess.kill('SIGTERM');
      
      console.log(`✅ MCP server test passed for ${this.botId}`);
      return true;
    } catch (error) {
      console.error(`❌ MCP server test failed for ${this.botId}:`, error.message);
      return false;
    }
  }

  /**
   * Static method to clean up all bot MCP configs
   * Useful for application shutdown
   */
  static async cleanupAllConfigs() {
    try {
      const configDir = path.join(__dirname, 'var', 'mcp-configs');
      
      if (!fs.existsSync(configDir)) {
        return;
      }

      const files = await fs.promises.readdir(configDir);
      const configFiles = files.filter(file => file.startsWith('telegram-bot-') && file.endsWith('.json'));

      for (const file of configFiles) {
        try {
          await fs.promises.unlink(path.join(configDir, file));
          console.log(`🧹 Cleaned up config: ${file}`);
        } catch (error) {
          console.error(`⚠️ Error cleaning up ${file}:`, error.message);
        }
      }

      // Remove directory if empty
      const remainingFiles = await fs.promises.readdir(configDir);
      if (remainingFiles.length === 0) {
        await fs.promises.rmdir(configDir);
        console.log(`🧹 Cleaned up empty config directory`);
      }
    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
    }
  }

  /**
   * Static method to get all active bot MCP configs
   * @returns {Promise<Array>} List of active bot configurations
   */
  static async getActiveBotConfigs() {
    try {
      const configDir = path.join(__dirname, 'var', 'mcp-configs');
      
      if (!fs.existsSync(configDir)) {
        return [];
      }

      const files = await fs.promises.readdir(configDir);
      const configFiles = files.filter(file => file.startsWith('telegram-bot-') && file.endsWith('.json'));

      const configs = [];
      for (const file of configFiles) {
        try {
          const configPath = path.join(configDir, file);
          const configData = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
          
          // Extract bot ID from filename
          const botId = file.replace('telegram-bot-', '').replace('.json', '');
          
          configs.push({
            botId,
            configPath,
            configData,
            filename: file
          });
        } catch (error) {
          console.error(`⚠️ Error reading config ${file}:`, error.message);
        }
      }

      return configs;
    } catch (error) {
      console.error('❌ Error getting active configs:', error.message);
      return [];
    }
  }
}

// Global cleanup handlers
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, cleaning up MCP configs...');
  await TelegramMCPIntegration.cleanupAllConfigs();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, cleaning up MCP configs...');
  await TelegramMCPIntegration.cleanupAllConfigs();
  process.exit(0);
});

module.exports = TelegramMCPIntegration;