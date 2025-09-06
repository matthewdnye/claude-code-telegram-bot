/**
 * Tests for ClaudeCodeTokenCounter
 * Validates accurate token counting matching Claude Code's /context command
 */

const ClaudeCodeTokenCounter = require('../../ClaudeCodeTokenCounter');
const fs = require('fs').promises;
const path = require('path');

// Mock child_process spawn
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: mockSpawn
}));

// Mock fs for file operations
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn()
  }
}));

describe('ClaudeCodeTokenCounter', () => {
  let tokenCounter;
  let mockClaudeCodeOutput;

  beforeEach(() => {
    tokenCounter = new ClaudeCodeTokenCounter();
    
    // Mock Claude Code /context output based on provided example
    mockClaudeCodeOutput = `> /context 
  ⎿ ⛁ ⛀ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀ ⛁ 
    ⛁ ⛁ ⛁ ⛁ ⛁ ⛀ ⛁ ⛁ ⛶ ⛶   Context Usage
    ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   claude-sonnet-4-20250514 • 34k/200k tokens (17%)
    ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ 
    ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ System prompt: 3.0k tokens (1.5%)
    ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ System tools: 13.3k tokens (6.6%)
    ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ MCP tools: 13.4k tokens (6.7%)
    ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Custom agents: 1.6k tokens (0.8%)
    ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Memory files: 2.6k tokens (1.3%)
    ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛶ Free space: 166.2k (83.1%)

    MCP tools · /mcp
    └ mcp__github__create_or_update_file (github): 568 tokens
    └ mcp__github__search_repositories (github): 472 tokens
    Custom agents · /agents
    └ taskmaster-guardian (User): 52 tokens
    └ base-template-generator (Project): 274 tokens`;

    jest.clearAllMocks();
  });

  describe('parseContextOutput', () => {
    test('should parse Claude Code context output correctly', () => {
      const parsed = tokenCounter.parseContextOutput(mockClaudeCodeOutput);
      
      expect(parsed.systemPrompt).toBe(3000);
      expect(parsed.systemTools).toBe(13300);
      expect(parsed.mcpTools).toBe(13400);
      expect(parsed.customAgents).toBe(1600);
      expect(parsed.memoryFiles).toBe(2600);
      expect(parsed.contextLimit).toBe(200000);
      expect(parsed.totalUsed).toBe(34000);
    });

    test('should parse MCP tools breakdown', () => {
      const parsed = tokenCounter.parseContextOutput(mockClaudeCodeOutput);
      
      expect(parsed.breakdown.mcpTools).toContainEqual({
        name: 'mcp__github__create_or_update_file (github)',
        tokens: 568
      });
      expect(parsed.breakdown.mcpTools).toContainEqual({
        name: 'mcp__github__search_repositories (github)',
        tokens: 472
      });
    });

    test('should parse Custom agents breakdown', () => {
      const parsed = tokenCounter.parseContextOutput(mockClaudeCodeOutput);
      
      expect(parsed.breakdown.customAgents).toContainEqual({
        name: 'taskmaster-guardian (User)',
        tokens: 52
      });
      expect(parsed.breakdown.customAgents).toContainEqual({
        name: 'base-template-generator (Project)',
        tokens: 274
      });
    });
  });

  describe('refreshStaticTokenCache', () => {
    test('should successfully cache static tokens when claude-code works', async () => {
      // Mock successful claude-code execution
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        stdin: { end: jest.fn() }
      };

      mockSpawn.mockReturnValue(mockChild);

      // Simulate successful execution
      const refreshPromise = tokenCounter.refreshStaticTokenCache('/test/dir');
      
      // Trigger stdout data
      const stdoutCallback = mockChild.stdout.on.mock.calls.find(call => call[0] === 'data')[1];
      stdoutCallback(Buffer.from(mockClaudeCodeOutput));
      
      // Trigger close with success
      const closeCallback = mockChild.on.mock.calls.find(call => call[0] === 'close')[1];
      closeCallback(0);

      const cache = await refreshPromise;
      
      expect(cache.systemPrompt).toBe(3000);
      expect(cache.systemTools).toBe(13300);
      expect(cache.mcpTools).toBe(13400);
      expect(cache.customAgents).toBe(1600);
      expect(cache.contextLimit).toBe(200000);
    });

    test('should use fallback values when claude-code fails', async () => {
      // Mock failed claude-code execution
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        stdin: { end: jest.fn() }
      };

      mockSpawn.mockReturnValue(mockChild);

      const refreshPromise = tokenCounter.refreshStaticTokenCache('/test/dir');
      
      // Trigger error
      const errorCallback = mockChild.on.mock.calls.find(call => call[0] === 'error')[1];
      errorCallback(new Error('claude-code not found'));

      const cache = await refreshPromise;
      
      // Should use fallback estimates
      expect(cache.systemPrompt).toBe(3000);
      expect(cache.systemTools).toBe(13300);
      expect(cache.mcpTools).toBe(13400);
      expect(cache.customAgents).toBe(1600);
      expect(cache.contextLimit).toBe(200000);
    });
  });

  describe('calculateMemoryFiles', () => {
    test('should calculate memory files tokens from CLAUDE.md files', async () => {
      // Mock file stats
      fs.stat.mockImplementation((filepath) => {
        if (filepath.includes('.claude/CLAUDE.md')) {
          return Promise.resolve({ size: 84 }); // 21 tokens (84/4)
        } else if (filepath.includes('CLAUDE.md')) {
          return Promise.resolve({ size: 10400 }); // 2600 tokens (10400/4)  
        }
        return Promise.reject(new Error('File not found'));
      });

      const memoryTokens = await tokenCounter.calculateMemoryFiles();
      
      expect(memoryTokens).toBe(2621); // 21 + 2600
    });

    test('should handle missing CLAUDE.md files', async () => {
      fs.stat.mockRejectedValue(new Error('File not found'));
      
      const memoryTokens = await tokenCounter.calculateMemoryFiles();
      
      expect(memoryTokens).toBe(2600); // Fallback value
    });
  });

  describe('calculateConversationTokens', () => {
    test('should calculate tokens from session JSONL', async () => {
      const mockJsonlContent = `{"usage": {"input_tokens": 150, "output_tokens": 300}}
{"usage": {"input_tokens": 100, "output_tokens": 200}}
{"type": "message", "content": "test"}
{"usage": {"input_tokens": 50, "output_tokens": 75}}`;

      fs.readFile.mockResolvedValue(mockJsonlContent);

      const tokens = await tokenCounter.calculateConversationTokens('test-session', '/sessions');
      
      expect(tokens.inputTokens).toBe(300); // 150 + 100 + 50
      expect(tokens.outputTokens).toBe(575); // 300 + 200 + 75
      expect(tokens.totalTokens).toBe(875);
    });

    test('should handle malformed JSONL gracefully', async () => {
      const mockJsonlContent = `{"usage": {"input_tokens": 150, "output_tokens": 300}}
invalid json line
{"usage": {"input_tokens": 100}}`;

      fs.readFile.mockResolvedValue(mockJsonlContent);

      const tokens = await tokenCounter.calculateConversationTokens('test-session', '/sessions');
      
      expect(tokens.inputTokens).toBe(250); // 150 + 100
      expect(tokens.outputTokens).toBe(300); // 300 + 0
      expect(tokens.totalTokens).toBe(550);
    });
  });

  describe('getAccurateTokenBreakdown', () => {
    test('should provide complete token breakdown', async () => {
      // Setup mocks
      tokenCounter.staticTokenCache = {
        systemPrompt: 3000,
        systemTools: 13300,
        mcpTools: 13400,
        customAgents: 1600,
        contextLimit: 200000,
        breakdown: { mcpTools: [], customAgents: [] }
      };
      tokenCounter.lastCacheTime = Date.now();

      // Mock memory files calculation
      jest.spyOn(tokenCounter, 'calculateMemoryFiles').mockResolvedValue(2600);
      
      // Mock conversation calculation
      jest.spyOn(tokenCounter, 'calculateConversationTokens').mockResolvedValue({
        inputTokens: 400,
        outputTokens: 500,
        totalTokens: 900
      });

      const breakdown = await tokenCounter.getAccurateTokenBreakdown('test-session', '/sessions');
      
      expect(breakdown.systemPrompt).toBe(3000);
      expect(breakdown.systemTools).toBe(13300);
      expect(breakdown.mcpTools).toBe(13400);
      expect(breakdown.customAgents).toBe(1600);
      expect(breakdown.memoryFiles).toBe(2600);
      expect(breakdown.conversation).toBe(900);
      expect(breakdown.staticTotal).toBe(31300); // 3000 + 13300 + 13400 + 1600
      expect(breakdown.dynamicTotal).toBe(3500); // 2600 + 900
      expect(breakdown.grandTotal).toBe(34800); // 31300 + 3500
      expect(breakdown.freeSpace).toBe(165200); // 200000 - 34800
    });
  });

  describe('formatClaudeCodeStyle', () => {
    test('should format output matching Claude Code style', () => {
      const breakdown = {
        systemPrompt: 3000,
        systemTools: 13300,
        mcpTools: 13400,
        customAgents: 1600,
        memoryFiles: 2600,
        conversation: 100,
        contextLimit: 200000,
        grandTotal: 34000,
        freeSpace: 166000,
        usagePercentage: '17.0'
      };

      const formatted = tokenCounter.formatClaudeCodeStyle(breakdown);
      
      expect(formatted).toContain('Context Usage');
      expect(formatted).toContain('claude-sonnet-4-20250514 • 34k/200k tokens (17.0%)');
      expect(formatted).toContain('⛁ System prompt: 3.0k tokens (1.5%)');
      expect(formatted).toContain('⛁ System tools: 13.3k tokens (6.7%)');
      expect(formatted).toContain('⛁ MCP tools: 13.4k tokens (6.7%)');
      expect(formatted).toContain('⛁ Custom agents: 1.6k tokens (0.8%)');
      expect(formatted).toContain('⛁ Memory files: 2.6k tokens (1.3%)');
      expect(formatted).toContain('⛶ Free space: 166.0k (83.0%)');
    });
  });
});