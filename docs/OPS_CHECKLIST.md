# Operations Checklist: Core ↔ DMAPI

## Quick Health
- Core: `curl -s -I https://core.dailey.cloud/health`
- DMAPI (Nginx): `curl -s -I https://media.dailey.cloud/health`
- DMAPI→Core proxy: `curl -s https://media.dailey.cloud/api/core/health`

## Auth Path (E2E)
- Get token from Core (DMAPI app id):
  ```bash
  TOK=$(curl -sS -X POST https://core.dailey.cloud/auth/login \
    -H 'Content-Type: application/json' \
    --data '{"email":"<user>","password":"<pass>","app_id":"<DMAPI_APP_ID>"}' | jq -r .access_token)
  ```
- Validate via DMAPI (local JWKS):
  ```bash
  curl -sS -H "Authorization: Bearer $TOK" https://media.dailey.cloud/api/auth/validate | jq
  ```
- Call a protected route:
  ```bash
  curl -sS -H "Authorization: Bearer $TOK" https://media.dailey.cloud/api/buckets | jq
  ```

## Security Alignment
- DMAPI env (`/opt/dailey-media-api/current/.env`):
  - `DAILEY_CORE_URL=https://core.dailey.cloud`
  - `CORE_JWKS_URL=https://core.dailey.cloud/.well-known/jwks.json`
  - `JWT_ISSUER=https://core.dailey.cloud`
  - `CORE_APP_ID=<DMAPI app id GUID>`
  - `CORS_ORIGINS=https://media.dailey.cloud`
  - `PORT=4100` (prod)
- Frontend (`web/.env.production`):
  - `VITE_CORE_AUTH_URL=https://core.dailey.cloud`
  - `VITE_MEDIA_API_URL=https://media.dailey.cloud`
- Nginx (media):
  - Forward auth: `proxy_set_header Authorization $http_authorization;`
  - Force HTTPS; HSTS enabled

## Preflight Gates (DMAPI)
Runs on every production start/release:
- Port invariant: `PORT=4100`
- Core `/health` reachable
- JWKS valid and non-empty
- S3 access (HeadBucket or ListObjects)
- Frontend production env validated (HTTPS, dailey.cloud, no IPs/typos)

## PM2 Commands
```bash
pm2 delete dmapi-backend || true
PORT=4100 NODE_ENV=production pm2 start /opt/dailey-media-api/current/src/index.js \
  --name dmapi-backend --time --update-env --cwd /opt/dailey-media-api/current
pm2 logs dmapi-backend --lines 100
```

## Atomic Deployment
```bash
REL=dmapi-$(date -u +%Y%m%d%H%M%S)
RELEASE_DIR=/opt/dailey-media-api/releases/$REL
rsync -az --delete-excluded --exclude '.git' --exclude 'node_modules' . dmapiapp01:$RELEASE_DIR
ssh dmapiapp01 "set -e; cd $RELEASE_DIR; NODE_ENV=production npm ci; npm run -s preflight;\
  sudo ln -sfn $RELEASE_DIR /opt/dailey-media-api/current; \
  pm2 delete dmapi-backend || true; PORT=4100 NODE_ENV=production pm2 start /opt/dailey-media-api/current/src/index.js \
  --name dmapi-backend --time --update-env --cwd /opt/dailey-media-api/current"
```

## Database Cluster Checks (DMAPI)
On `dmapiapp01`:
```bash
node -e "(async()=>{require('dotenv').config({path:'/opt/dailey-media-api/current/.env'}); 
const mysql=require('/opt/dailey-media-api/current/node_modules/mysql2/promise'); 
const u=new URL(process.env.DATABASE_URL); 
const c=await mysql.createConnection({host:u.hostname,port:u.port||3306,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:u.pathname.slice(1)});
let [r]=await c.query('SELECT @@hostname host, @@read_only ro, @@version version'); console.log(r[0]);
try { [r]=await c.query('SHOW REPLICA STATUS'); console.log('replica_rows', r.length); } catch(e) { try { [r]=await c.query('SHOW SLAVE STATUS'); console.log('slave_rows', r.length); } catch(e2) { console.log('replica_status_not_permitted', e2.code||e2.message); }}
await c.end(); })()"
```
- `ro=0` on primary; `ro=1` on replicas.
- If privileges allow, `SHOW REPLICA/SLAVE STATUS` rows > 0 indicates replication configured. Check `Seconds_Behind_Master`.

## Cloudflare/SSL
- SSL mode: Full (strict) for both media and core
- Purge assets on frontend release: `/assets/*`

## Incident Runbook
- If login spins or 500s:
  - Check `/api/auth/validate` (should be 200)
  - Ensure `CORE_APP_ID` present in DMAPI env
  - Verify Core `/health` and JWKS; then re-run preflight
- If Mixed Content warnings:
  - Validate `web/.env.production` via preflight (must fail if any `http://` or IPs appear)

