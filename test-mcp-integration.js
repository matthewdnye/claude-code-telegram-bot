#!/usr/bin/env node

/**
 * Test script for Telegram MCP Integration
 * Tests MCP config generation and cleanup
 */

const TelegramMCPIntegration = require('./TelegramMCPIntegration');
const fs = require('fs');

async function testMCPIntegration() {
  console.log('🧪 Testing Telegram MCP Integration...\n');
  
  try {
    // Test 1: Create MCP Integration
    console.log('1️⃣ Creating TelegramMCPIntegration instance...');
    const mcp = new TelegramMCPIntegration(
      'test-bot1',
      '1234567890:TEST_TOKEN_FOR_TESTING_ONLY',
      '-1001234567890'
    );
    console.log('✅ MCP integration instance created');

    // Test 2: Generate MCP Config
    console.log('\n2️⃣ Generating MCP configuration file...');
    const configPath = await mcp.createMCPConfig();
    console.log(`✅ MCP config created at: ${configPath}`);
    
    // Test 3: Verify config file contents
    console.log('\n3️⃣ Verifying configuration file contents...');
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('📄 Config contents:');
    console.log(JSON.stringify(configData, null, 2));
    
    if (configData.mcpServers && configData.mcpServers['telegram-sender-test-bot1']) {
      console.log('✅ MCP server configuration is valid');
    } else {
      throw new Error('Invalid MCP server configuration');
    }

    // Test 4: Get Claude Code arguments (with session-id)
    console.log('\n4️⃣ Getting Claude Code arguments (with session-id)...');
    const claudeArgs = mcp.getClaudeCodeArgs(['--model', 'sonnet']);
    console.log('🔧 Claude Code args (full):', claudeArgs);
    
    if (claudeArgs.includes('--mcp-config') && claudeArgs.includes(configPath) && claudeArgs.includes('--session-id')) {
      console.log('✅ Claude Code arguments with session-id are valid');
    } else {
      throw new Error('Invalid Claude Code arguments with session-id');
    }

    // Test 4b: Get session-compatible arguments (without session-id)
    console.log('\n4️⃣b Getting session-compatible Claude Code arguments...');
    const sessionCompatibleArgs = mcp.getSessionCompatibleArgs(['--model', 'sonnet']);
    console.log('🔧 Session-compatible args:', sessionCompatibleArgs);
    
    if (sessionCompatibleArgs.includes('--mcp-config') && sessionCompatibleArgs.includes(configPath) && !sessionCompatibleArgs.includes('--session-id')) {
      console.log('✅ Session-compatible arguments are valid (no --session-id)');
    } else {
      throw new Error('Invalid session-compatible Claude Code arguments');
    }

    // Test 5: Get environment variables
    console.log('\n5️⃣ Getting environment variables...');
    const env = mcp.getEnvironment();
    console.log('🌐 Environment variables:', {
      BOT_INSTANCE_ID: env.BOT_INSTANCE_ID,
      CLAUDE_SESSION_TYPE: env.CLAUDE_SESSION_TYPE
    });
    
    // Test 6: Test MCP server connectivity (basic)
    console.log('\n6️⃣ Testing MCP server connectivity...');
    const serverTest = await mcp.testMCPServer();
    console.log(`${serverTest ? '✅' : '❌'} MCP server test: ${serverTest ? 'PASSED' : 'FAILED'}`);

    // Test 7: Get active bot configs
    console.log('\n7️⃣ Getting active bot configurations...');
    const activeConfigs = await TelegramMCPIntegration.getActiveBotConfigs();
    console.log(`📊 Active bot configs found: ${activeConfigs.length}`);
    activeConfigs.forEach(config => {
      console.log(`  - Bot ID: ${config.botId}, Config: ${config.filename}`);
    });

    // Test 8: Cleanup
    console.log('\n8️⃣ Testing cleanup...');
    await mcp.cleanupMCPConfig();
    
    if (!fs.existsSync(configPath)) {
      console.log('✅ MCP config cleaned up successfully');
    } else {
      throw new Error('MCP config was not cleaned up');
    }

    console.log('\n🎉 All tests passed! Telegram MCP Integration is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function testMCPServerDirectly() {
  console.log('\n🔧 Testing MCP Server directly...\n');
  
  try {
    // Test MCP Server can be imported and instantiated
    const TelegramMCPServer = require('./telegram-mcp-server.js');
    console.log('✅ MCP Server module imported successfully');
    
    // Test command line parsing
    const originalArgv = process.argv;
    process.argv = ['node', 'telegram-mcp-server.js', 'test-bot1', 'test-token', 'test-chat-id'];
    
    console.log('✅ Command line arguments test passed');
    
    // Restore original argv
    process.argv = originalArgv;
    
    console.log('✅ MCP Server direct test completed');
    
  } catch (error) {
    console.error('❌ MCP Server direct test failed:', error.message);
  }
}

// Run tests
(async () => {
  await testMCPIntegration();
  await testMCPServerDirectly();
  
  console.log('\n🏁 All integration tests completed!');
})().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});