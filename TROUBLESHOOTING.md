# DMAPI Troubleshooting Guide

## Common Issues and Solutions

### 🔴 Issue: API endpoints returning 404 or 500 errors in browser

**Symptoms:**
- Browser console shows: `Failed to load resource: the server responded with a status of 404 (Not Found)`
- Errors like: `GET http://YOUR_IP:5174/api/upload/formats 404`
- `SyntaxError: Unexpected end of JSON input`

**Cause:** Frontend proxy misconfiguration or backend not running on correct port

**Solution:**
1. Verify backend is running on port 4100:
   ```bash
   pm2 status | grep dmapi-backend
   curl http://localhost:4100/health
   ```

2. Check frontend proxy configuration in `web/vite.config.js`:
   ```javascript
   const mediaApiTarget = env.VITE_MEDIA_API_URL || 'http://100.105.97.19:4100';
   ```

3. Restart services from ecosystem config:
   ```bash
   pm2 delete dmapi-frontend dmapi-backend
   cd /home/jonny/apps/dailey-media-api
   pm2 start ecosystem.config.cjs
   ```

4. Verify proxy is working:
   ```bash
   curl http://localhost:5174/api/upload/formats
   ```

---

### 🔴 Issue: Port 4000 already in use

**Symptoms:**
- Error: `EADDRINUSE: address already in use 0.0.0.0:4000`
- PM2 shows continuous restarts

**Cause:** Another service using port 4000 or incorrect configuration

**Solution:**
1. Check what's using port 4000:
   ```bash
   lsof -i :4000
   ```

2. Ensure `.env` file has correct port:
   ```bash
   PORT=4100
   ```

3. Ensure `ecosystem.config.cjs` has correct port:
   ```javascript
   env: {
     NODE_ENV: 'development',
     PORT: 4100,
     HOST: '0.0.0.0'
   }
   ```

4. Restart with updated config:
   ```bash
   pm2 restart dmapi-backend --update-env
   ```

---

### 🔴 Issue: CORS errors when accessing from Tailscale IP

**Symptoms:**
- `Error: Not allowed by CORS`
- Browser blocks requests from Tailscale IP

**Solution:**
1. Add your Tailscale IP to `.env`:
   ```bash
   CORS_ORIGINS=http://localhost:5174,http://100.105.97.19:5174
   ```

2. Restart backend:
   ```bash
   pm2 restart dmapi-backend
   ```

---

### 🔴 Issue: Vite proxy not updating after configuration change

**Symptoms:**
- Changes to `vite.config.js` not taking effect
- Proxy still using old backend URL

**Solution:**
1. Stop and delete the frontend process:
   ```bash
   pm2 delete dmapi-frontend
   ```

2. Clear any cached processes:
   ```bash
   pkill -f vite
   ```

3. Restart from ecosystem config:
   ```bash
   pm2 start ecosystem.config.cjs --only dmapi-frontend
   ```

---

### 🔴 Issue: Authentication errors (403 Forbidden)

**Symptoms:**
- `403 Forbidden` on API calls
- `Error: Missing required scope`

**Solution for Development:**
1. Enable auth bypass in `.env`:
   ```bash
   DISABLE_AUTH=true
   NODE_ENV=development
   ```

2. Restart backend:
   ```bash
   pm2 restart dmapi-backend
   ```

---

### 🔴 Issue: PM2 services not starting correctly

**Symptoms:**
- PM2 shows status as `errored` or `stopped`
- Services keep restarting

**Solution:**
1. Check logs for specific errors:
   ```bash
   pm2 logs dmapi-backend --lines 50
   pm2 logs dmapi-frontend --lines 50
   ```

2. Clear PM2 and restart:
   ```bash
   pm2 delete all
   pm2 flush  # Clear logs
   cd /home/jonny/apps/dailey-media-api
   pm2 start ecosystem.config.cjs
   ```

3. Save PM2 configuration:
   ```bash
   pm2 save
   pm2 startup  # Generate startup script
   ```

---

## Debugging Commands

### Check Service Status
```bash
# PM2 status
pm2 status

# Specific service
pm2 show dmapi-backend
pm2 show dmapi-frontend

# Service logs
pm2 logs dmapi-backend --lines 100
pm2 logs dmapi-frontend --lines 100
```

### Test Endpoints
```bash
# Backend direct
curl http://localhost:4100/health
curl http://localhost:4100/api/upload/formats
curl http://localhost:4100/api/buckets

# Frontend proxy
curl http://localhost:5174/api/upload/formats
curl http://localhost:5174/api/buckets

# Via Tailscale
curl http://YOUR_TAILSCALE_IP:5174/api/upload/formats
```

### Port Diagnostics
```bash
# Check what's using a port
lsof -i :4100
lsof -i :5174

# Check if port is accessible
nc -zv localhost 4100
nc -zv localhost 5174
```

### Process Management
```bash
# Find Vite processes
ps aux | grep vite

# Kill stuck processes
pkill -f vite
pkill -f "node.*dmapi"

# Restart everything
pm2 delete all
pm2 start ecosystem.config.cjs
```

---

## Configuration Files Reference

### `.env` (Root Directory)
```bash
# CRITICAL: Must be 4100, not 4000
PORT=4100
HOST=0.0.0.0
NODE_ENV=development
STORAGE_TYPE=local
DISABLE_AUTH=true
LOG_LEVEL=debug
CORS_ORIGINS=http://localhost:5174,http://YOUR_TAILSCALE_IP:5174
```

### `ecosystem.config.cjs`
```javascript
module.exports = {
  apps: [
    {
      name: 'dmapi-backend',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'development',
        PORT: 4100,  // MUST match .env
        HOST: '0.0.0.0'
      }
    },
    {
      name: 'dmapi-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/jonny/apps/dailey-media-api/web',
      env: {
        NODE_ENV: 'development',
        VITE_MEDIA_API_URL: 'http://YOUR_TAILSCALE_IP:4100'
      }
    }
  ]
};
```

### `web/vite.config.js`
```javascript
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Should use Tailscale IP for remote access
  const mediaApiTarget = env.VITE_MEDIA_API_URL || 'http://100.105.97.19:4100';
  
  return {
    server: {
      host: '0.0.0.0',
      port: 5174,
      proxy: {
        '/api': {
          target: mediaApiTarget,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
```

---

## Prevention Checklist

Before starting services:
- [ ] Verify `.env` has `PORT=4100`
- [ ] Verify `ecosystem.config.cjs` has `PORT: 4100`
- [ ] Update Tailscale IP in `ecosystem.config.cjs` if needed
- [ ] Check no other service is using port 4100
- [ ] Ensure CORS_ORIGINS includes all access URLs

After configuration changes:
- [ ] Delete and restart PM2 processes (not just restart)
- [ ] Clear browser cache and hard refresh
- [ ] Test endpoints with curl before browser testing

---

## Getting Help

If issues persist:
1. Collect diagnostic information:
   ```bash
   pm2 status > pm2-status.log
   pm2 logs --lines 100 > pm2-logs.log
   curl -v http://localhost:4100/health > backend-health.log 2>&1
   curl -v http://localhost:5174/api/upload/formats > proxy-test.log 2>&1
   ```

2. Check GitHub issues: https://github.com/yourusername/dailey-media-api/issues

3. Include in bug report:
   - Error messages from browser console
   - PM2 status and logs
   - Your `.env` configuration (remove sensitive data)
   - Output from diagnostic commands