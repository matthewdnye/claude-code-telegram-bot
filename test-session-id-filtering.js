#!/usr/bin/env node

/**
 * Test script for session-id filtering in claude-stream-processor
 * Verifies that --session-id is properly filtered when using --continue or --resume flags
 */

const ClaudeStreamProcessor = require('./claude-stream-processor');

async function testSessionIdFiltering() {
  console.log('🧪 Testing --session-id filtering in claude-stream-processor...\n');
  
  // Set test environment to use mock process
  process.env.NODE_ENV = 'test';
  
  try {
    // Create processor instance
    const processor = new ClaudeStreamProcessor({
      model: 'sonnet',
      workingDirectory: process.cwd()
    });

    // Set additional args with --session-id (this simulates MCP integration)
    const additionalArgs = [
      '--mcp-config', '/some/config.json',
      '--session-id', 'test-session-123',
      '--output-format', 'stream-json'
    ];
    
    processor.setAdditionalArgs(additionalArgs);
    console.log('✅ Set additional args:', additionalArgs);

    // Test 1: startNewConversation (should include --session-id)
    console.log('\n1️⃣ Testing startNewConversation (should include --session-id)...');
    try {
      // This will fail in test environment, but we can check the arguments
      await processor.startNewConversation('test prompt');
    } catch (error) {
      // Expected to fail in test environment
      const lastArgs = processor.getLastClaudeArgs();
      console.log('📋 Args for new conversation:', lastArgs);
      
      if (lastArgs.includes('--session-id') && lastArgs.includes('--mcp-config')) {
        console.log('✅ New conversation includes --session-id correctly');
      } else {
        throw new Error('New conversation should include --session-id');
      }
    }

    // Test 2: continueConversation with sessionId (should NOT include --session-id from additionalArgs)
    console.log('\n2️⃣ Testing resumeSession (should filter out --session-id)...');
    
    // Clear test registry to ensure fresh capture
    ClaudeStreamProcessor.clearClaudeTestRegistry();
    
    // Reset isProcessing flag
    processor.isProcessing = false;
    
    try {
      await processor.resumeSession('existing-session-id', 'continue prompt');
    } catch (error) {
      // Expected to fail in test environment
      const lastArgs = processor.getLastClaudeArgs();
      console.log('📋 Args for resume session:', lastArgs);
      console.log('🔍 Looking for --session-id:', lastArgs.includes('--session-id'));
      console.log('🔍 Looking for --mcp-config:', lastArgs.includes('--mcp-config'));
      console.log('🔍 Looking for -r:', lastArgs.includes('-r'));
      
      if (!lastArgs.includes('--session-id') && lastArgs.includes('--mcp-config')) {
        console.log('✅ Resume session correctly filtered out --session-id');
      } else if (lastArgs.includes('--session-id')) {
        throw new Error('Resume session should NOT include --session-id from additional args');
      } else {
        throw new Error('Resume session should still include --mcp-config');
      }
    }

    // Test 3: continueConversation with -c flag (should NOT include --session-id from additionalArgs)
    console.log('\n3️⃣ Testing continueConversation with -c (should filter out --session-id)...');
    
    // Reset for third test
    processor.isProcessing = false;
    
    try {
      await processor.continueConversation('continue prompt', null);
    } catch (error) {
      // Expected to fail in test environment
      const lastArgs = processor.getLastClaudeArgs();
      console.log('📋 Args for continue conversation:', lastArgs);
      
      if (!lastArgs.includes('--session-id') && lastArgs.includes('--mcp-config')) {
        console.log('✅ Continue conversation correctly filtered out --session-id');
      } else if (lastArgs.includes('--session-id')) {
        throw new Error('Continue conversation should NOT include --session-id from additional args');
      } else {
        throw new Error('Continue conversation should still include --mcp-config');
      }
    }

    console.log('\n🎉 All session-id filtering tests passed!');
    console.log('\n📋 Summary:');
    console.log('   - New conversations: Include --session-id ✅');
    console.log('   - Resume/Continue: Filter out --session-id ✅');
    console.log('   - MCP config preserved in all cases ✅');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test
testSessionIdFiltering();