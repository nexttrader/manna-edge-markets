module.exports = {
  apps: [
    {
      name: 'manna-backend',
      cwd: '/Users/chadwinsolomon/Documents/MANNEDFINDER 2.0/backend',
      script: './node_modules/.bin/tsx',
      args: 'src/server.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      error_file: '/Users/chadwinsolomon/.pm2/logs/manna-backend-error.log',
      out_file: '/Users/chadwinsolomon/.pm2/logs/manna-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'manna-frontend',
      cwd: '/Users/chadwinsolomon/Documents/MANNEDFINDER 2.0/frontend',
      script: 'npx',
      args: 'vite preview --port 5173 --host 0.0.0.0',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      error_file: '/Users/chadwinsolomon/.pm2/logs/manna-frontend-error.log',
      out_file: '/Users/chadwinsolomon/.pm2/logs/manna-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
