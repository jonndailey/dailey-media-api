# DMAPI Port Configuration Guide

## ⚠️ CRITICAL: Port 4100, NOT 4000

### Why Port 4100?
Port 4000 is commonly used by other development services and will cause conflicts. DMAPI has been configured to use **port 4100** to ensure it runs without conflicts.

## Quick Reference

| Service | Port | URL |
|---------|------|-----|
| Backend API | 4100 | http://localhost:4100 |
| Frontend Dev | 5174 | http://localhost:5174 |
| Backend Health | 4100 | http://localhost:4100/health |
| API via Frontend | 5174 | http://localhost:5174/api/* |

## Configuration Files

### 1. `.env` (Root Directory)
```bash
PORT=4100  # MUST be 4100
HOST=0.0.0.0
```

### 2. `ecosystem.config.cjs`
```javascript
env: {
  NODE_ENV: 'development',
  PORT: 4100,  // MUST match .env
  HOST: '0.0.0.0',
  VITE_MEDIA_API_URL: 'http://YOUR_TAILSCALE_IP:4100'
}
```

### 3. `src/config/index.js`
```javascript
port: parseInt(process.env.PORT || '4100'),  // Default changed from 4000
```

### 4. `web/vite.config.js`
```javascript
const mediaApiTarget = env.VITE_MEDIA_API_URL || 'http://YOUR_TAILSCALE_IP:4100';
```

## Common Port Conflicts

### If you see: `Error: listen EADDRINUSE: address already in use 0.0.0.0:4000`

This means something is trying to use port 4000. Check:

1. **Find what's using port 4000:**
   ```bash
   lsof -i :4000
   ```

2. **Verify your configuration:**
   ```bash
   grep -r "4000" . --include="*.js" --include="*.cjs" --include=".env"
   ```

3. **Fix any remaining 4000 references to 4100**

## Verification Commands

### Check Services Are Running
```bash
# Check what's on our ports
lsof -i :4100  # Should show node/dmapi
lsof -i :5174  # Should show node/vite

# Test backend directly
curl http://localhost:4100/health

# Test frontend proxy
curl http://localhost:5174/api/upload/formats
```

### PM2 Commands
```bash
# Start everything correctly
pm2 start ecosystem.config.cjs

# If port issues, completely restart
pm2 delete dmapi-backend dmapi-frontend
pm2 start ecosystem.config.cjs

# Check status
pm2 status
pm2 logs dmapi-backend
```

## Tailscale Access

When accessing from another machine via Tailscale:

1. **Update `ecosystem.config.cjs`:**
   ```javascript
   VITE_MEDIA_API_URL: 'http://YOUR_TAILSCALE_IP:4100'
   ```

2. **Update `.env`:**
   ```bash
   CORS_ORIGINS=http://localhost:5174,http://YOUR_TAILSCALE_IP:5174
   ```

3. **Restart services:**
   ```bash
   pm2 delete dmapi-frontend dmapi-backend
   pm2 start ecosystem.config.cjs
   ```

## Port Usage by Service

### Services That Should NOT Be on These Ports:
- Port 3000: Usually React apps
- Port 3001: Common dev server
- Port 4000: Many Node apps default (conflict!)
- Port 5000: Flask/Python apps
- Port 5173: Default Vite port
- Port 8000: Django/Python
- Port 8080: Common proxy/web server

### Our Reserved Ports:
- **4100**: DMAPI Backend (changed from 4000)
- **5174**: DMAPI Frontend (Vite)

## Troubleshooting Checklist

- [ ] Is `.env` using `PORT=4100`?
- [ ] Is `ecosystem.config.cjs` using `PORT: 4100`?
- [ ] Is the backend actually running on 4100? (`lsof -i :4100`)
- [ ] Is the frontend proxy pointing to 4100? (check Vite config)
- [ ] Have you deleted and restarted PM2 processes after changes?
- [ ] Is CORS configured for your access URL?

## Remember: After ANY Port Configuration Change

1. **Delete** the PM2 process (don't just restart)
2. **Start** fresh from ecosystem config
3. **Verify** with curl before testing in browser

```bash
pm2 delete dmapi-backend dmapi-frontend
pm2 start ecosystem.config.cjs
curl http://localhost:4100/health
curl http://localhost:5174/api/upload/formats
```