# DMAPI Deployment Guide

This runbook describes deploying Dailey Media API to production.

## Pre-reqs

- Node.js ≥ 20
- PM2 installed globally
- Nginx in front of the Node app
- Cloud provider/Cloudflare configured for your domain

## Server Environment

Critical env vars (`.env`):

```bash
PORT=4100
HOST=0.0.0.0
NODE_ENV=production

DAILEY_CORE_URL=https://core.dailey.cloud
CORE_JWKS_URL=https://core.dailey.cloud/.well-known/jwks.json
JWT_ISSUER=https://core.dailey.cloud
JWT_AUDIENCE=dailey-media-api

CORS_ORIGINS=https://media.dailey.cloud

STORAGE_TYPE=s3
S3_ENDPOINT=...           # if using S3-compatible storage (OVH, MinIO)
S3_BUCKET=dailey-media-api-storage
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true   # for most S3-compatible endpoints
```

## Nginx

Upstreams:

```nginx
upstream dmapi_api   { server 127.0.0.1:4100; }
upstream dmapi_heavy { server 127.0.0.1:4101; }
```

Authorization forwarding (important):

```nginx
location ^~ /api {
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Authorization $http_authorization;
  proxy_pass http://dmapi_api;
}

location ^~ /api/upload {
  proxy_buffering off;
  proxy_request_buffering off;
  proxy_read_timeout 300s;
  proxy_set_header Authorization $http_authorization;
  proxy_pass http://dmapi_api;
}
```

Test and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## PM2

Start/Restart:

```bash
pm2 start ecosystem.config.cjs --only dmapi-backend
pm2 restart dmapi-backend --update-env
pm2 logs dmapi-backend --lines 100
```

## Health and Smoke Tests

```bash
curl -s -i https://media.dailey.cloud/health
curl -s -i https://media.dailey.cloud/api/upload/formats
curl -s -i -X POST https://media.dailey.cloud/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/etc/hosts"
```

If CURL returns 401 for authenticated routes, confirm Authorization is forwarded by Nginx and the token is valid.

## Cloudflare

- If upload fails before reaching origin, temporarily disable Security (WAF) for `https://<domain>/api/upload*` to test.
- Re-enable after confirming origin behavior.

## Release Pattern

Typical rolling release structure:

```
/opt/dailey-media-api/
  releases/
    dmapi-YYYYmmddHHMMSS/
  current -> releases/dmapi-YYYYmmddHHMMSS
  shared/.env
```

Steps:
1) rsync/scp code into `releases/dmapi-<timestamp>`
2) copy or symlink `.env` from `shared/`
3) `npm ci --omit=dev`
4) point `current` to the new release
5) `pm2 restart dmapi-backend --update-env`

