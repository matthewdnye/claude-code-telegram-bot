# Claude Code SDK Integration Documentation

## Overview

The project now includes a fully integrated Claude Code SDK wrapper that provides programmatic access to Claude Code functionality through a clean, async-first JavaScript API. This enables building advanced plugin systems and background AI processing without relying on external CLI calls.

## Architecture

### Components

- **`src/utils/ClaudeCodeSDK.js`** - Main SDK wrapper class
- **`src/config/claude-models.js`** - Centralized model configuration
- **`examples/claude-sdk-usage.js`** - Usage examples
- **`tests/unit/claude-code-sdk-basic.test.js`** - Test suite

### Key Features

- ✅ **Async/await support** - All methods return Promises
- ✅ **Model management** - Easy switching between latest Claude models
- ✅ **Streaming responses** - Real-time message processing with callbacks
- ✅ **Error handling** - Proper error wrapping and logging
- ✅ **Connection testing** - Built-in connectivity verification
- ✅ **Authentication** - Uses existing Claude Code credentials automatically

## Quick Start

### Basic Usage

```javascript
const ClaudeCodeSDK = require('./src/utils/ClaudeCodeSDK');

// Create SDK instance
const sdk = new ClaudeCodeSDK({
    maxTurns: 10
});

// Simple chat
const response = await sdk.chat('Explain async/await in one sentence.');
console.log(response);

// Test connection
const isWorking = await sdk.testConnection();
console.log('SDK working:', isWorking);
```

### Available Models

The SDK uses current Claude models by default:

- **`claude-sonnet-4-20250514`** - Claude Sonnet 4 (Default/Latest)
- **`claude-opus-4-1-20250805`** - Claude Opus 4.1 (Latest)
- **Legacy models** - Claude 3.5 Sonnet, 3.5 Haiku, 3 Opus (backward compatibility)

## API Reference

### Constructor

```javascript
const sdk = new ClaudeCodeSDK(options)
```

**Options:**
- `model` (string) - Model to use (defaults to latest Sonnet)
- `maxTurns` (number) - Maximum conversation turns (default: 10)
- `cwd` (string) - Working directory (default: process.cwd())

### Methods

#### `chat(prompt, options)`

Send a prompt and get the complete response.

```javascript
const response = await sdk.chat('Your prompt here', {
    model: 'claude-opus-4-1-20250805',
    maxTurns: 5
});
```

**Returns:** Promise&lt;string&gt; - The AI response

#### `chatStream(prompt, onMessage, options)`

Send a prompt with streaming response handling.

```javascript
await sdk.chatStream('Your prompt', async (message) => {
    if (message.type === 'assistant') {
        console.log('Assistant:', message.content);
    } else if (message.type === 'result') {
        console.log('Final result:', message.result);
    }
});
```

**Parameters:**
- `prompt` (string) - The prompt to send
- `onMessage` (function) - Callback for each message
- `options` (object) - Additional options

#### `testConnection()`

Test SDK connectivity and authentication.

```javascript
const isConnected = await sdk.testConnection();
```

**Returns:** Promise&lt;boolean&gt; - True if connection works

#### `getAvailableModels()`

Get list of available Claude models.

```javascript
const models = sdk.getAvailableModels();
// ['claude-sonnet-4-20250514', 'claude-opus-4-1-20250805', ...]
```

**Returns:** Array&lt;string&gt; - List of model names

#### `setModel(modelName)`

Switch to a different Claude model.

```javascript
sdk.setModel('claude-opus-4-1-20250805');
```

**Parameters:**
- `modelName` (string) - Name of the model to switch to

**Throws:** Error if model name is invalid

## Advanced Usage Examples

### Plugin System Integration

```javascript
class TextToSpeechPlugin {
    constructor() {
        this.sdk = new ClaudeCodeSDK({
            model: 'claude-sonnet-4-20250514'
        });
    }

    async generateAudioScript(originalText) {
        const prompt = `
        Convert this technical text into a natural, conversational script 
        suitable for text-to-speech generation:
        
        ${originalText}
        
        Make it engaging and easy to listen to.
        `;
        
        return await this.sdk.chat(prompt, { maxTurns: 1 });
    }
}
```

### Background Processing

```javascript
class ImageDescriptionPlugin {
    constructor() {
        this.sdk = new ClaudeCodeSDK({
            model: 'claude-opus-4-1-20250805'
        });
    }

    async processImageAsync(imagePath, callback) {
        const prompt = `Analyze this image and provide a detailed description for database storage.`;
        
        await this.sdk.chatStream(prompt, async (message) => {
            if (message.type === 'result' && callback) {
                await callback(message.result);
            }
        });
    }
}
```

### Batch Processing

```javascript
class BatchProcessor {
    constructor() {
        this.sdk = new ClaudeCodeSDK();
    }

    async processBatch(items) {
        const results = [];
        
        for (const item of items) {
            try {
                const result = await this.sdk.chat(`Process: ${item}`);
                results.push({ item, result, status: 'success' });
            } catch (error) {
                results.push({ item, error: error.message, status: 'error' });
            }
        }
        
        return results;
    }
}
```

## Model Configuration Management

### Updating Models

When new Claude models are released, update **one file**: `src/config/claude-models.js`

```javascript
const CLAUDE_MODELS = {
    // Update these when new models arrive
    SONNET: 'claude-sonnet-5-20250601',  // New version
    OPUS: 'claude-opus-5-20250601',      // New version
    
    // Legacy models for backward compatibility
    LEGACY_SONNET: 'claude-sonnet-4-20250514',
    LEGACY_OPUS: 'claude-opus-4-1-20250805'
};
```

### Model Display Names

The configuration includes user-friendly display names:

```javascript
const displayNames = {
    'claude-sonnet-4-20250514': 'Claude Sonnet 4 (Latest)',
    'claude-opus-4-1-20250805': 'Claude Opus 4.1 (Latest)',
    // ... more models
};
```

## Authentication

The SDK automatically uses your existing Claude Code authentication. No additional setup required if Claude Code CLI is already working.

### Troubleshooting Authentication

```javascript
// Test if authentication is working
const sdk = new ClaudeCodeSDK();
const isWorking = await sdk.testConnection();

if (!isWorking) {
    console.log('Authentication issue. Check Claude Code CLI setup.');
    // Run: claude login
}
```

## Error Handling

### Common Patterns

```javascript
try {
    const response = await sdk.chat('Your prompt');
    return response;
} catch (error) {
    if (error.message.includes('authentication')) {
        // Handle auth errors
        console.log('Please run: claude login');
    } else if (error.message.includes('quota')) {
        // Handle quota errors
        console.log('API quota exceeded');
    } else {
        // Generic error handling
        console.log('SDK error:', error.message);
    }
    throw error;
}
```

### Retry Logic

```javascript
async function chatWithRetry(sdk, prompt, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await sdk.chat(prompt);
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}
```

## Testing

### Unit Tests

Tests are available in `tests/unit/claude-code-sdk-basic.test.js`:

```bash
npm test tests/unit/claude-code-sdk-basic.test.js
```

### Manual Testing

Use the example script:

```bash
node examples/claude-sdk-usage.js
```

### Integration Testing

```javascript
describe('Claude Code SDK Integration', () => {
    test('should handle real conversation', async () => {
        const sdk = new ClaudeCodeSDK();
        const response = await sdk.chat('What is 2+2?');
        expect(response).toContain('4');
    }, 30000);
});
```

## Performance Considerations

### Caching

```javascript
class CachedSDK {
    constructor() {
        this.sdk = new ClaudeCodeSDK();
        this.cache = new Map();
    }

    async chat(prompt) {
        if (this.cache.has(prompt)) {
            return this.cache.get(prompt);
        }
        
        const response = await this.sdk.chat(prompt);
        this.cache.set(prompt, response);
        return response;
    }
}
```

### Rate Limiting

```javascript
class RateLimitedSDK {
    constructor(requestsPerSecond = 2) {
        this.sdk = new ClaudeCodeSDK();
        this.lastRequest = 0;
        this.interval = 1000 / requestsPerSecond;
    }

    async chat(prompt) {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequest;
        
        if (timeSinceLastRequest < this.interval) {
            await new Promise(resolve => 
                setTimeout(resolve, this.interval - timeSinceLastRequest)
            );
        }
        
        this.lastRequest = Date.now();
        return await this.sdk.chat(prompt);
    }
}
```

## Future Plugin System Architecture

The SDK is designed to support your planned plugin system:

### Session Completion Plugin

```javascript
class SessionCompletionPlugin {
    constructor() {
        this.sdk = new ClaudeCodeSDK();
    }

    async onSessionComplete(sessionResult) {
        // Generate audio-friendly text
        const audioScript = await this.sdk.chat(`
            Convert this technical session result into a natural, 
            conversational script suitable for text-to-speech:
            
            ${sessionResult}
            
            Make it engaging like a micro-podcast.
        `);
        
        // Send to external TTS API
        return await this.generateAudio(audioScript);
    }
}
```

### Image Processing Plugin

```javascript
class ImageAnalysisPlugin {
    constructor() {
        this.sdk = new ClaudeCodeSDK({
            model: 'claude-opus-4-1-20250805' // Use Opus for detailed analysis
        });
    }

    async processImage(imageData) {
        // Background processing
        setTimeout(async () => {
            const description = await this.sdk.chat(`
                Analyze this image and provide a detailed description 
                for database storage and search.
            `);
            
            await this.saveToDatabase(imageData, description);
        }, 0);
    }
}
```

## Troubleshooting

### Common Issues

1. **"Cannot find module @anthropic-ai/claude-code"**
   - Run: `npm install`
   - Check if package is in package.json

2. **"Authentication failed"**
   - Run: `claude login`
   - Check Claude Code CLI setup

3. **"Dynamic import error"**
   - This is expected in Jest tests
   - Use manual testing with Node.js directly

4. **"Invalid model" error**
   - Check available models with `sdk.getAvailableModels()`
   - Update model configuration if needed

### Debug Mode

Enable detailed logging:

```javascript
const sdk = new ClaudeCodeSDK({
    debug: true  // Enable if debugging is implemented
});
```

## Changelog

### Version 1.0.0 (2025-01-07)
- ✅ Initial Claude Code SDK integration
- ✅ Support for Claude Sonnet 4 and Opus 4.1
- ✅ Async/await API
- ✅ Streaming response support
- ✅ Model management system
- ✅ Test suite and examples
- ✅ Authentication integration
- ✅ Error handling and validation

---

**Last Updated:** January 7, 2025  
**Next Review:** When new Claude models are released