#!/usr/bin/env node

/**
 * Claude Code SDK Usage Example
 * 
 * This example demonstrates how to use the Claude Code SDK wrapper
 * in your bot applications.
 * 
 * Run with: node examples/claude-sdk-usage.js
 */

const ClaudeCodeSDK = require('../src/utils/ClaudeCodeSDK');

async function exampleUsage() {
    console.log('🚀 Claude Code SDK Example Usage\n');

    // Create SDK instance (using default/latest model)
    const sdk = new ClaudeCodeSDK({
        maxTurns: 5
    });

    console.log('📋 Available models:', sdk.getAvailableModels());

    try {
        // Example 1: Simple chat
        console.log('\n💬 Example 1: Simple chat');
        const response1 = await sdk.chat('Explain what async/await is in JavaScript in one sentence.');
        console.log('Response:', response1);

        // Example 2: Model switching
        console.log('\n🔄 Example 2: Model switching');
        sdk.setModel('claude-opus-4-1-20250805');
        const response2 = await sdk.chat('Say "Hello from Opus!" in a creative way.');
        console.log('Response:', response2);

        // Example 3: Streaming response
        console.log('\n📡 Example 3: Streaming response');
        await sdk.chatStream(
            'Count from 1 to 3 and explain each number.',
            async (message) => {
                if (message.type === 'assistant' && message.message) {
                    process.stdout.write('.');
                } else if (message.type === 'result') {
                    console.log('\nFinal result:', message.result);
                }
            }
        );

        // Example 4: Custom options
        console.log('\n⚙️ Example 4: Custom options');
        const response4 = await sdk.chat(
            'What is the capital of France? Answer in one word.',
            { maxTurns: 1 }
        );
        console.log('Response:', response4);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    console.log('\n✅ Example completed successfully!');
}

// Run the example if called directly
if (require.main === module) {
    exampleUsage().catch(error => {
        console.error('💥 Example failed:', error);
        process.exit(1);
    });
}

module.exports = { exampleUsage };