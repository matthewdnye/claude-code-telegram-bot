module.exports = {
  apps: [
    // Gwen Ives - Virtual COO
    {
      name: 'gwen',
      script: 'scripts/start-bot.js',
      args: 'gwen',
      cwd: '/Users/matthewdnye/Developer/claude-code-telegram-bot',
      env: {
        NODE_ENV: 'production',
        NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      cron_restart: '0 4 * * *',  // Auto-restart daily at 4 AM to prevent polling issues
      log_file: 'logs/gwen.log',
      error_file: 'logs/gwen-error.log',
      out_file: 'logs/gwen-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    },
    // Matt Nye - Personal Interface
    {
      name: 'matt',
      script: 'scripts/start-bot.js',
      args: 'matt',
      cwd: '/Users/matthewdnye/Developer/claude-code-telegram-bot',
      env: {
        NODE_ENV: 'production',
        NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      cron_restart: '0 4 * * *',  // Auto-restart daily at 4 AM to prevent polling issues
      log_file: 'logs/matt.log',
      error_file: 'logs/matt-error.log',
      out_file: 'logs/matt-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      instance_var: 'INSTANCE_ID',
      exec_mode: 'fork'
    },
    // Legacy bot1-4 for backwards compatibility
    {
      name: 'bot1',
      script: 'scripts/start-bot.js',
      args: 'bot1',
      cwd: '/Users/matthewdnye/Developer/claude-code-telegram-bot',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      log_file: 'logs/bot1.log',
      exec_mode: 'fork'
    },
    {
      name: 'bot2',
      script: 'scripts/start-bot.js',
      args: 'bot2',
      cwd: '/Users/matthewdnye/Developer/claude-code-telegram-bot',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      log_file: 'logs/bot2.log',
      exec_mode: 'fork'
    }
  ]
};
