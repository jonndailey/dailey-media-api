import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mediaApiTarget = env.VITE_MEDIA_API_URL || 'http://100.105.97.19:4100';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5174,
      proxy: {
        '/api': {
          target: mediaApiTarget,
          changeOrigin: true,
          secure: false
        },
        '/auth/health': {
          target: 'http://localhost:3002/health',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/auth\/health/, '')
        },
        '/auth': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
