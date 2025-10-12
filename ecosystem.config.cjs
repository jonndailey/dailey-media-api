module.exports = {
  apps: [
    {
      name: 'dailey-media-api',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
        HOST: '0.0.0.0'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4000,
        HOST: '0.0.0.0'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
        HOST: '0.0.0.0',
        instances: 'max',
        exec_mode: 'cluster'
      },
      watch: ['src'],
      ignore_watch: ['node_modules', 'storage', 'logs', '.git'],
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/dailey-media-api.log',
      error_file: 'logs/dailey-media-api-error.log',
      out_file: 'logs/dailey-media-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true
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
      name: 'dailey-core-backend',
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
      log_file: 'logs/dailey-core-backend.log',
      error_file: 'logs/dailey-core-backend-error.log',
      out_file: 'logs/dailey-core-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'dailey-core-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/home/jonny/apps/dailey-core/frontend',
      env: {
        NODE_ENV: 'development',
        PORT: 3005
      },
      watch: false, // React handles its own file watching
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '15s',
      log_file: 'logs/dailey-core-frontend.log',
      error_file: 'logs/dailey-core-frontend-error.log',
      out_file: 'logs/dailey-core-frontend-out.log',
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