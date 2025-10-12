import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:5173',
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
})
