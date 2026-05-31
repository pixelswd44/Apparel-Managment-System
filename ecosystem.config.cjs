// PM2 process manager config
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'apparel-crm-backend',
      script: './server/src/index.js',
      interpreter: 'node',
      node_args: '--experimental-vm-modules',
      cwd: './',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        JWT_SECRET: 'CHANGE-THIS-TO-A-LONG-RANDOM-SECRET',
      },
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      autorestart: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
    },
  ],
};
