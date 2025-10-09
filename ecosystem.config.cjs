module.exports = {
  apps: [
    {
      name: 'dmapi-backend',
      script: 'src/index.js',
      cwd: '/home/jonny/apps/dailey-media-api',
      env: {
        NODE_ENV: 'development',
        PORT: 5173
      },
      watch: ['src'],
      ignore_watch: ['node_modules', 'uploads', 'logs'],
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/dmapi-backend.log',
      error_file: 'logs/dmapi-backend-error.log',
      out_file: 'logs/dmapi-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'dmapi-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/jonny/apps/dailey-media-api/web',
      env: {
        NODE_ENV: 'development'
      },
      watch: false, // Vite handles its own file watching
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/dmapi-frontend.log',
      error_file: 'logs/dmapi-frontend-error.log',
      out_file: 'logs/dmapi-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'dailey-core',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/jonny/apps/dailey-core/backend',
      env: {
        NODE_ENV: 'development'
      },
      watch: false, // Let nodemon handle watching
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '15s',
      log_file: 'logs/dailey-core.log',
      error_file: 'logs/dailey-core-error.log',
      out_file: 'logs/dailey-core-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ],

  // Deployment configuration (optional)
  deploy: {
    development: {
      user: 'jonny',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:jonnydailey/dailey-media-api.git',
      path: '/home/jonny/apps/dailey-media-api',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npx pm2 reload ecosystem.config.js --env development',
      'pre-setup': ''
    }
  }
};