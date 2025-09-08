/**
 * Basic Unit Tests for Claude Code SDK Integration (No Jest Setup Dependencies)
 */

const ClaudeCodeSDK = require('../../src/utils/ClaudeCodeSDK');

describe('ClaudeCodeSDK - Basic Tests', () => {
    let sdk;

    beforeEach(() => {
        sdk = new ClaudeCodeSDK({
            model: 'claude-sonnet-4-20250514',
            maxTurns: 5
        });
    });

    describe('Constructor and Configuration', () => {
        test('should create instance with default options', () => {
            const defaultSdk = new ClaudeCodeSDK();
            expect(defaultSdk.defaultOptions.model).toBe('claude-sonnet-4-20250514');
            expect(defaultSdk.defaultOptions.maxTurns).toBe(10);
            expect(defaultSdk.defaultOptions.cwd).toBe(process.cwd());
        });

        test('should merge custom options with defaults', () => {
            const customSdk = new ClaudeCodeSDK({
                model: 'claude-opus-4-1-20250805',
                maxTurns: 3
            });
            
            expect(customSdk.defaultOptions.model).toBe('claude-opus-4-1-20250805');
            expect(customSdk.defaultOptions.maxTurns).toBe(3);
            expect(customSdk.defaultOptions.cwd).toBe(process.cwd());
        });
    });

    describe('Model Management', () => {
        test('should return available models list', () => {
            const models = sdk.getAvailableModels();
            expect(Array.isArray(models)).toBe(true);
            expect(models.length).toBeGreaterThan(0);
            expect(models).toContain('claude-sonnet-4-20250514');
        });

        test('should set valid model successfully', () => {
            sdk.setModel('claude-opus-4-1-20250805');
            expect(sdk.defaultOptions.model).toBe('claude-opus-4-1-20250805');
        });

        test('should throw error for invalid model', () => {
            expect(() => {
                sdk.setModel('invalid-model');
            }).toThrow('Invalid model: invalid-model');
        });
    });

    describe('API Methods Exist', () => {
        test('should have all required methods', () => {
            expect(typeof sdk.chat).toBe('function');
            expect(typeof sdk.chatStream).toBe('function');
            expect(typeof sdk.testConnection).toBe('function');
            expect(typeof sdk.getAvailableModels).toBe('function');
            expect(typeof sdk.setModel).toBe('function');
        });
    });
});

// Live integration tests - these require Claude Code SDK to be properly configured
// and may not work in CI/CD environments due to authentication requirements
describe('ClaudeCodeSDK - Integration Tests', () => {
    let sdk;

    beforeAll(() => {
        sdk = new ClaudeCodeSDK();
    });

    // These tests are skipped by default to avoid Jest dynamic import issues
    // They can be run manually using Node.js directly
    test.skip('should successfully test connection', async () => {
        const isConnected = await sdk.testConnection();
        expect(typeof isConnected).toBe('boolean');
    }, 30000);

    test.skip('should handle basic chat interaction', async () => {
        const response = await sdk.chat('What is 5+5? Answer with just the number.');
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(0);
    }, 30000);
});