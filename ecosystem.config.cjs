/**
 * PM2 Ecosystem Configuration for Dailey Media API
 * 
 * IMPORTANT NOTES:
 * 1. Backend MUST run on port 4100 (not 4000) to avoid conflicts
 * 2. Frontend proxy requires VITE_MEDIA_API_URL to be set correctly
 * 3. After changes, DELETE and restart processes (don't just restart)
 * 
 * Usage:
 *   Start all:     pm2 start ecosystem.config.cjs
 *   Start backend: pm2 start ecosystem.config.cjs --only dmapi-backend
 *   Start frontend: pm2 start ecosystem.config.cjs --only dmapi-frontend
 *   
 * Troubleshooting:
 *   If port conflicts: pm2 delete dmapi-backend && pm2 start ecosystem.config.cjs --only dmapi-backend
 *   If proxy issues: pm2 delete dmapi-frontend && pm2 start ecosystem.config.cjs --only dmapi-frontend
 */

module.exports = {
  apps: [
    {
      name: 'dmapi-backend',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 4100,  // CRITICAL: Must be 4100, not 4000
        HOST: '0.0.0.0'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4000,
        HOST: '0.0.0.0'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4100, // CRITICAL: Must be 4100 to match Nginx upstream
        HOST: '0.0.0.0',
        instances: 'max',
        exec_mode: 'cluster'
      },
      watch: ['src'],
      ignore_watch: ['node_modules', 'storage', 'logs', '.git'],
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/dmapi-backend.log',
      error_file: 'logs/dmapi-backend-error.log',
      out_file: 'logs/dmapi-backend-out.log',
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
        NODE_ENV: 'development',
        // IMPORTANT: Update this with your Tailscale IP or backend URL
        // This tells Vite where to proxy API requests
        VITE_MEDIA_API_URL: 'http://100.105.97.19:4100'
      },
      watch: false, // Vite handles its own file watching
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
      log_file: 'logs/dmapi-frontend.log',
      error_file: 'logs/dmapi-frontend-error.log',
      out_file: 'logs/dmapi-frontend-out.log',
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
      'post-deploy': 'npm install && npx pm2 reload ecosystem.config.cjs --env development',
      'pre-setup': ''
    }
  }
};
