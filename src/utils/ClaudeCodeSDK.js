/**
 * Claude Code SDK Wrapper
 * Provides async interface to Claude Code SDK functionality
 */

const { getDefaultModel, getAvailableModels, isValidModel } = require('../config/claude-models');

// Dynamic import for ES module in CommonJS project
let query;
const initSDK = async () => {
    if (!query) {
        const sdk = await import('@anthropic-ai/claude-code');
        query = sdk.query;
    }
    return query;
};

class ClaudeCodeSDK {
    constructor(options = {}) {
        this.defaultOptions = {
            model: getDefaultModel(),
            maxTurns: 10,
            cwd: process.cwd(),
            ...options
        };
    }

    /**
     * Send a query to Claude Code and get response
     * @param {string} prompt - The prompt to send
     * @param {Object} options - Additional options
     * @returns {Promise<string>} - The response text
     */
    async chat(prompt, options = {}) {
        await initSDK(); // Ensure SDK is loaded

        const queryOptions = {
            ...this.defaultOptions,
            ...options
        };

        try {
            const queryStream = query({
                prompt,
                options: queryOptions
            });

            let fullResponse = '';
            let lastAssistantMessage = '';

            for await (const message of queryStream) {
                if (message.type === 'assistant' && message.message) {
                    // Extract content from the nested message structure
                    const content = message.message.content;
                    if (Array.isArray(content)) {
                        lastAssistantMessage = content.map(part => 
                            typeof part === 'string' ? part : part.text || JSON.stringify(part)
                        ).join('');
                    } else {
                        lastAssistantMessage = content || '';
                    }
                    fullResponse += lastAssistantMessage;
                } else if (message.type === 'result') {
                    // The final result message contains the actual response
                    if (message.result) {
                        lastAssistantMessage = message.result;
                        fullResponse = message.result; // Use result as final response
                    }
                } else if (message.type === 'tool_result') {
                    // Handle tool results if needed
                    console.log('[ClaudeCodeSDK] Tool result:', message.toolName);
                }
            }

            return lastAssistantMessage || fullResponse;
        } catch (error) {
            console.error('[ClaudeCodeSDK] Error:', error);
            throw new Error(`Claude Code SDK error: ${error.message}`);
        }
    }

    /**
     * Send a query with streaming response
     * @param {string} prompt - The prompt to send
     * @param {Function} onMessage - Callback for each message
     * @param {Object} options - Additional options
     */
    async chatStream(prompt, onMessage, options = {}) {
        await initSDK(); // Ensure SDK is loaded

        const queryOptions = {
            ...this.defaultOptions,
            ...options
        };

        try {
            const queryStream = query({
                prompt,
                options: queryOptions
            });

            for await (const message of queryStream) {
                if (onMessage) {
                    await onMessage(message);
                }
            }
        } catch (error) {
            console.error('[ClaudeCodeSDK] Stream error:', error);
            throw new Error(`Claude Code SDK stream error: ${error.message}`);
        }
    }

    /**
     * Test basic connectivity
     * @returns {Promise<boolean>} - True if connection works
     */
    async testConnection() {
        try {
            const response = await this.chat('Hello! Please respond with just "SDK Working" to test the connection.');
            return (typeof response === 'string' && response.length > 0) && 
                   (response.includes('SDK Working') || response.includes('Hello') || response.length > 0);
        } catch (error) {
            console.error('[ClaudeCodeSDK] Connection test failed:', error);
            return false;
        }
    }

    /**
     * Get available models
     * @returns {Array<string>} - List of available models
     */
    getAvailableModels() {
        return getAvailableModels();
    }

    /**
     * Set default model
     * @param {string} model - Model name
     */
    setModel(model) {
        if (isValidModel(model)) {
            this.defaultOptions.model = model;
        } else {
            throw new Error(`Invalid model: ${model}. Available models: ${this.getAvailableModels().join(', ')}`);
        }
    }
}

module.exports = ClaudeCodeSDK;