/**
 * Claude SDK Processor - SDK-based replacement for ClaudeStreamProcessor
 * Provides identical API to ClaudeStreamProcessor but uses Claude Code SDK instead of spawning processes
 * 
 * Maintains complete API compatibility for seamless migration
 */

// Dynamic import to handle ESM module in CommonJS environment
let query;
const loadClaudeCode = async () => {
  if (!query) {
    const claudeCode = await import('@anthropic-ai/claude-code');
    query = claudeCode.query;
  }
  return query;
};

const { EventEmitter } = require('events');

class ClaudeSDKProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      model: 'sonnet',
      workingDirectory: process.cwd(),
      verbose: true,
      skipPermissions: true,
      ...options
    };
    
    // SDK-specific state
    this.currentQuery = null;
    this.sessionId = null;
    this.isProcessing = false;
    this.messageBuffer = '';
    this.processExitCode = null;
    this.promptTooLongDetected = false;

    // API compatibility properties (for tests and existing code)
    this.additionalArgs = [];
    this.lastClaudeArgs = null;
    this.lastClaudeOptions = null;

    // SDK-specific initialization
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    
    console.log('[ClaudeSDK] Initialized Claude SDK Processor');
  }

  /**
   * Parse additional CLI arguments to SDK options
   */
  _parseAdditionalArgsToOptions(args) {
    const options = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--mcp-config':
          if (i + 1 < args.length) {
            // MCP servers config file path - convert to SDK format
            const mcpConfigPath = args[i + 1];
            try {
              const fs = require('fs');
              const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
              options.mcpServers = mcpConfig.mcpServers || mcpConfig;
            } catch (error) {
              console.warn('[ClaudeSDK] Failed to load MCP config:', error.message);
            }
            i++; // Skip the next argument as it's the value
          }
          break;
        // Add other argument mappings as needed
      }
    }
    
    return options;
  }

  /**
   * API Compatibility: Test helper methods
   * (Same as ClaudeStreamProcessor)
   */
  getLastClaudeArgs() {
    return this.lastClaudeArgs;
  }

  getLastClaudeOptions() {
    return this.lastClaudeOptions;
  }

  static getClaudeTestRegistry() {
    return global.claudeTestRegistry || [];
  }

  static clearClaudeTestRegistry() {
    global.claudeTestRegistry = [];
  }

  /**
   * API Compatibility: Additional arguments support
   * (Same as ClaudeStreamProcessor)
   */
  setAdditionalArgs(args) {
    this.additionalArgs = Array.isArray(args) ? args : [];
    console.log('[ClaudeSDK] SDK options configured from args:', this.additionalArgs?.length || 0, 'parameters');
  }

  getAdditionalArgs() {
    return this.additionalArgs;
  }

  /**
   * Start new conversation using SDK
   */
  async startNewConversation(prompt) {
    if (this.isProcessing) {
      throw new Error('Already processing a request');
    }

    this.isProcessing = true;
    this.messageBuffer = '';
    this.processExitCode = null;
    this.promptTooLongDetected = false;

    console.log('[ClaudeSDK] Working directory:', this.options.workingDirectory);
    console.log('[ClaudeSDK] Starting new conversation with model:', this.options.model);

    // Parse additional args and convert to SDK options
    const additionalOptions = this._parseAdditionalArgsToOptions(this.additionalArgs);

    // Prepare SDK options (equivalent to CLI args)
    const options = {
      model: this.options.model,
      cwd: this.options.workingDirectory,
      permissions: this.options.skipPermissions ? 'all' : 'safe',
      ...additionalOptions
    };

    // Store arguments for test compatibility
    this.lastClaudeArgs = [
      '-p',
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      prompt
    ];
    this.lastClaudeOptions = {
      cwd: this.options.workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe']
    };

    try {
      // Load Claude Code SDK and start query
      const queryFunction = await loadClaudeCode();
      this.currentQuery = queryFunction({
        prompt: prompt,
        options: options
      });
      
      // Process stream messages
      await this._processSDKStream();
      
    } catch (error) {
      console.error('[ClaudeSDK] Error in startNewConversation:', error);
      this.isProcessing = false;
      this.currentQuery = null;
      throw error;
    }
  }

  /**
   * Continue conversation using SDK
   */
  async continueConversation(prompt, sessionId = null) {
    if (sessionId) {
      return this.resumeSession(sessionId, prompt);
    }

    if (this.isProcessing) {
      throw new Error('Already processing a request');
    }

    this.isProcessing = true;
    this.messageBuffer = '';
    this.processExitCode = null;
    this.promptTooLongDetected = false;

    console.log('[ClaudeSDK] Continuing conversation');

    // Parse additional args and convert to SDK options
    const additionalOptions = this._parseAdditionalArgsToOptions(this.additionalArgs);

    const options = {
      model: this.options.model,
      cwd: this.options.workingDirectory,
      permissions: this.options.skipPermissions ? 'all' : 'safe',
      continue: true,  // SDK equivalent of -c flag
      ...additionalOptions
    };

    // Store arguments for test compatibility
    this.lastClaudeArgs = [
      '-c',
      '-p',
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      prompt
    ];

    try {
      const queryFunction = await loadClaudeCode();
      this.currentQuery = queryFunction({
        prompt: prompt,
        options: options
      });
      await this._processSDKStream();
    } catch (error) {
      console.error('[ClaudeSDK] Error in continueConversation:', error);
      this.isProcessing = false;
      this.currentQuery = null;
      throw error;
    }
  }

  /**
   * Resume session using SDK
   */
  async resumeSession(sessionId, prompt) {
    if (this.isProcessing) {
      throw new Error('Already processing a request');
    }

    this.isProcessing = true;
    this.messageBuffer = '';
    this.processExitCode = null;
    this.promptTooLongDetected = false;

    console.log(`[ClaudeSDK] Resuming session: ${sessionId}`);

    // Parse additional args and convert to SDK options
    const additionalOptions = this._parseAdditionalArgsToOptions(this.additionalArgs);

    const options = {
      model: this.options.model,
      cwd: this.options.workingDirectory,
      permissions: this.options.skipPermissions ? 'all' : 'safe',
      sessionId: sessionId,  // SDK equivalent of -r sessionId
      ...additionalOptions
    };

    // Store arguments for test compatibility
    this.lastClaudeArgs = [
      '-r', sessionId,
      '-p',
      '--model', this.options.model,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      prompt
    ];

    try {
      const queryFunction = await loadClaudeCode();
      this.currentQuery = queryFunction({
        prompt: prompt,
        options: options
      });
      await this._processSDKStream();
    } catch (error) {
      console.error('[ClaudeSDK] Error in resumeSession:', error);
      this.isProcessing = false;
      this.currentQuery = null;
      throw error;
    }
  }

  /**
   * Process SDK stream and emit compatible events
   */
  async _processSDKStream() {
    try {
      console.log('[ClaudeSDK] Starting to process SDK stream...');
      let messageCount = 0;
      
      for await (const message of this.currentQuery) {
        messageCount++;
        
        // Handle session ID from system messages and emit session-init
        if (message.type === 'system' && message.subtype === 'init' && message.session_id) {
          this.sessionId = message.session_id;
          this.emit('session-id', this.sessionId);
          console.log('[ClaudeSDK] Session ID:', this.sessionId);
          
          // Emit session-init for startup screen (same format as ClaudeStreamProcessor)
          this.emit('session-init', {
            sessionId: message.session_id,
            model: message.model,
            cwd: message.cwd,
            tools: message.tools,
            permissionMode: message.permissionMode
          });
          console.log('[ClaudeSDK] Session initialized');
        }
        
        // Convert SDK assistant messages to expected format  
        if (message.type === 'assistant' && message.message && message.message.content) {
          for (const content of message.message.content) {
            if (content.type === 'text' && content.text) {
              console.log(`[ClaudeSDK] Emitting assistant-text: "${content.text.substring(0, 100)}..."`);
              
              // Emit in same format as ClaudeStreamProcessor
              this.emit('assistant-text', {
                text: content.text,
                messageId: message.message.id,
                sessionId: message.session_id,
                usage: message.message.usage
              });
              
              // Check for prompt-too-long detection
              if (content.text.includes('prompt is too long') || content.text.includes('context window') || content.text.includes('reduce the length')) {
                this.promptTooLongDetected = true;
                console.log('[ClaudeSDK] Prompt too long detected in text');
              }
              
              // Update message buffer for compatibility
              this.messageBuffer += content.text;
            } else if (content.type === 'tool_use') {
              // For tool use, emit compatible event structure
              console.log(`[ClaudeSDK] Tool use: ${content.name}`);
              this.emit('data', message);
            }
          }
        } else if (message.type === 'user') {
          // Pass through user messages (tool results) as-is
          this.emit('data', message);
        }
      }
      
      console.log(`[ClaudeSDK] Stream processing complete. Total messages: ${messageCount}`);

      // Handle successful completion
      this.processExitCode = 0;
      this.isProcessing = false;
      this.currentQuery = null;

      console.log('[ClaudeSDK] Process completed with code: 0');

      // Check for prompt-too-long condition and emit event if detected
      if (this.promptTooLongDetected) {
        console.log('[ClaudeSDK] Prompt too long confirmed - triggering auto-compact');
        this.emit('prompt-too-long', {
          type: 'prompt-too-long',
          sessionId: this.sessionId,
          detectedInOutput: true
        });
      }

      // Emit complete event (same format as ClaudeStreamProcessor) 
      this.emit('complete', {
        success: true,
        sessionId: this.sessionId
      });

      // Emit end event (compatible with ClaudeStreamProcessor)
      this.emit('end', { exitCode: 0 });
      
    } catch (error) {
      this.processExitCode = 1;
      this.isProcessing = false;
      this.currentQuery = null;
      
      console.error('[ClaudeSDK] Process error:', error);
      this.emit('error', error);
      
      // Emit complete event with failure (same format as ClaudeStreamProcessor)
      this.emit('complete', {
        success: false,
        sessionId: this.sessionId
      });
      
      // Emit end event with error code
      this.emit('end', { exitCode: 1 });
    }
  }

  /**
   * Cancel current operation
   */
  cancel() {
    if (this.currentQuery) {
      console.log('[ClaudeSDK] Cancelling process');
      
      // Try to cancel SDK query if possible
      if (this.currentQuery.cancel && typeof this.currentQuery.cancel === 'function') {
        this.currentQuery.cancel();
      }
      
      this.currentQuery = null;
      this.isProcessing = false;
      
      // Emit cancelled event after a short delay
      setTimeout(() => {
        this.emit('end', { exitCode: 130 }); // SIGINT exit code
      }, 100);
    }
  }

  /**
   * Get current processing state
   */
  isCurrentlyProcessing() {
    return this.isProcessing;
  }

  /**
   * Check if processor is active (API compatibility with ClaudeStreamProcessor)
   */
  isActive() {
    return this.isProcessing;
  }

  /**
   * Check if processor is responsive (API compatibility with ClaudeStreamProcessor)
   */
  isResponsive() {
    // For SDK, if no current query, consider it responsive (idle state)
    if (!this.currentQuery) {
      return true;
    }
    
    // If we're not processing, consider it responsive
    if (!this.isProcessing) {
      return true;
    }
    
    // If processing with active query, consider responsive
    return this.currentQuery !== null;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId() {
    return this.sessionId;
  }

  /**
   * Get process exit code
   */
  getProcessExitCode() {
    return this.processExitCode;
  }

  /**
   * Get message buffer (compatibility method)
   */
  getMessageBuffer() {
    return this.messageBuffer;
  }

  /**
   * Check if prompt too long was detected
   */
  wasPromptTooLongDetected() {
    return this.promptTooLongDetected;
  }

  /**
   * Clear state (useful for testing)
   */
  clearState() {
    this.currentQuery = null;
    this.sessionId = null;
    this.isProcessing = false;
    this.messageBuffer = '';
    this.processExitCode = null;
    this.promptTooLongDetected = false;
    this.lastClaudeArgs = null;
    this.lastClaudeOptions = null;
  }
}

module.exports = ClaudeSDKProcessor;