module.exports = {
  apps: [
    {
      name: 'medical-ocr',
      script: './server.js',
      cwd: '/opt/medical-ocr',
      instances: 4,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3002,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 3000,
      kill_timeout: 5000,
      node_args: '--max-old-space-size=4096',
    },
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/medical-ocr.git',
      path: '/opt/medical-ocr',
      'post-deploy': 'npm install && cd frontend && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': '',
      'post-setup': '',
    },
    staging: {
      user: 'deploy',
      host: 'staging-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/medical-ocr.git',
      path: '/opt/medical-ocr-staging',
      'post-deploy': 'npm install && cd frontend && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env staging',
    },
  },
};
