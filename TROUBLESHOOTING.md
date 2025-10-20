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

### 🔴 Issue: Immediate logout after Core login (401 on /api/*)

Symptoms:
- Browser logs in to Core successfully, then DMAPI calls like `/api/buckets` respond 401 and the UI logs out.
- In PM2 logs you may see nothing obvious, or occasional `Token validation failed` entries.

Likely causes:
- JWT audience mismatch: Core issues tokens with `aud` set to the DMAPI app-id GUID, but DMAPI only accepts `dailey-media-api`.
- JWKS validate ok but `CORE_APP_ID` was not loaded (wrong CWD or missing from `.env`).
- Fallback to `GET /auth/validate` on Core returned 5xx while local JWKS verify was not enabled.

Fix checklist:
- Ensure DMAPI knows the Core audience:
  - Add to `/opt/dailey-media-api/current/.env` (server):
    - `CORE_APP_ID=<DMAPI app id GUID>`
    - Optionally: `CORE_AUDIENCE=<GUID>,dailey-media-api`
  - Restart with correct CWD so dotenv loads: `pm2 restart dmapi-backend --update-env --cwd /opt/dailey-media-api/current`
- Verify JWKS locally resolves:
  - `CORE_JWKS_URL=https://core.dailey.cloud/.well-known/jwks.json`
  - `JWT_ISSUER=https://core.dailey.cloud` (Core also uses `dailey-core-auth`, which is allowed by default)
- Temporary diagnostics (optional):
  - `AUTH_LOG_DETAILS=true` to log allowed issuers/audiences and token header/payload summaries.
  - As a last resort (temporary only): `ALLOW_CORE_ANY_AUD=true` to accept any Core-issued token (issuer+signature only). Remove after audience is aligned.

Re-test:
```
# Get token from Core (replace credentials)
TOK=$(curl -sS -X POST https://core.dailey.cloud/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"admin@dailey.cloud","password":"***","app_id":"<GUID>"}' | jq -r .access_token)

# Call DMAPI through nginx
curl -s -o /dev/null -w 'status=%{http_code}\n' \
  -H "Authorization: Bearer $TOK" https://media.dailey.cloud/api/buckets
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

### 🔴 Issue: 526/SSL error on media.dailey.cloud

Symptoms:
- Cloudflare shows 526 or browser reports certificate mismatch.

Causes:
- Nginx presents the wrong certificate (e.g., Grafana’s) on the `media.dailey.cloud` vhost due to SNI/default order.

Fix checklist:
- Ensure the `media.dailey.cloud` server block listens as the default on 443:
  ```nginx
  server {
    listen 443 ssl http2 default_server;
    server_name media.dailey.cloud;
    # ssl_certificate ... for media.dailey.cloud
  }
  ```
- Avoid hosting Grafana under `media.dailey.cloud/grafana`. Use `https://grafana.dailey.cloud` with its own vhost and cert.
- Test origin and CF:
  ```bash
  curl -sk -I -H "Host: media.dailey.cloud" https://127.0.0.1/health
  curl -s -I https://media.dailey.cloud/health
  ```

---

### 🔴 Issue: 500 at site root due to rewrite loop

Symptoms:
- Nginx error: `rewrite or internal redirection cycle while internally redirecting to "/index.html"`

Causes:
- SPA assets are missing on the active release (`web/dist`), but the vhost `try_files` points to `/index.html`.

Solution:
1. Ensure the SPA is built and deployed to the active release path (e.g., `/opt/dailey-media-api/current/web/dist`).
2. Verify Nginx root and `try_files` reference the correct directory.
3. Reload Nginx and re-test `https://media.dailey.cloud/`.

---

### 🔴 Issue: 500 on POST /api/upload in production

Symptoms:
- Browser shows 500 when uploading, while GETs like `/api/upload/formats` succeed.
- PM2 error log contains `{"context":"auth.authenticateToken","message":"fetch failed"}`.
- No `[id] POST /api/upload - Started` lines appear in the out log for the failing request.

Causes:
- `DAILEY_CORE_URL` not reachable from the API host, so token validation fetch fails.
- JWKS URL points to dev (`core.dailey.dev`) while tokens are issued by prod (`core.dailey.cloud`).
- Proxy not forwarding `Authorization` to the backend, or the client did not send it.
- Testing the upstream with `https://127.0.0.1:4100` (port 4100 is plain HTTP).

Fix checklist:
- Ensure production auth env vars are set:
  - `DAILEY_CORE_URL=https://core.dailey.cloud`
  - `CORE_JWKS_URL=https://core.dailey.cloud/.well-known/jwks.json`
  - `JWT_ISSUER=https://core.dailey.cloud`
  - `JWT_AUDIENCE=dailey-media-api` (or your app ID)
- Nginx: explicitly forward the header (defensive):
  - In `/api/` and `/api/upload/` locations add `proxy_set_header Authorization $http_authorization;`
- Test from the server (use HTTP to the upstream):
  ```bash
  curl -s -i -X POST http://127.0.0.1:4100/api/upload \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@/etc/hosts"
  ```
- Verify Core and JWKS availability from the server:
  ```bash
  curl -s -i "$DAILEY_CORE_URL/api/docs/health"
  curl -s -i -H "Authorization: Bearer $TOKEN" "$DAILEY_CORE_URL/auth/validate"
  curl -s -i "$CORE_JWKS_URL"
  ```

Notes:
- Auth prefers local JWKS verification and returns 401 on unverifiable tokens to avoid generic 5xx.
- If using Cloudflare, temporarily disable security for `…/api/upload*` to rule out WAF interference with multipart.

---

### 🔴 Issue: "Not allowed by CORS" on browser requests

Symptoms:
- Browser POST to `/api/upload` fails with 500 and message `Not allowed by CORS`.
- Preflight (OPTIONS) may return 403 or lacks expected headers.

Fix checklist:
- Ensure the site origin is whitelisted:
  - Add `CORS_ORIGINS=https://media.dailey.cloud` (or your domain) to the API `.env`.
  - Restart pm2: `pm2 restart dmapi-backend --update-env`.
- Confirm preflight:
  ```bash
  curl -i -X OPTIONS https://<domain>/api/upload \
    -H "Origin: https://<domain>" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization,content-type"
  ```
- Verify request uses `multipart/form-data` with field name `file`.
- Ensure proxy forwards `Authorization` so the actual POST is accepted.

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
STORAGE_TYPE=s3
# Replace 127.0.0.1 with your Tailscale IP if other devices need access (e.g. http://100.105.97.19:9000)
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=dailey-media
S3_ACCESS_KEY_ID=dailey
S3_SECRET_ACCESS_KEY=dailey-secret
S3_FORCE_PATH_STYLE=
DISABLE_AUTH=true
LOG_LEVEL=debug
VIDEO_PROCESSING_ENABLED=false
CORS_ORIGINS=http://localhost:5174,http://YOUR_TAILSCALE_IP:5174
```

Need to populate MinIO with existing local files? Once MinIO is running and `.env` points at it, execute `npm run migrate:local-s3` (append `--dry-run` to preview, `--skip-existing` to avoid overwriting) to copy `./storage` into the bucket with matching metadata.

If you see repeated `connect ECONNREFUSED 127.0.0.1:6379` errors in PM2 logs, Redis isn’t running. Either start a Redis instance or leave `VIDEO_PROCESSING_ENABLED=false` so the video queue stays disabled during local development.

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
