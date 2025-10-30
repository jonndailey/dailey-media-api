# Dailey Core — Production Deployment & HA Runbook

Dailey Core is the auth/control plane for the platform. Treat it as a tier‑0 service: if Core is unavailable, dependent apps (Media API, admin UIs, SDKs) will fail. This runbook captures a proven deployment shape, zero‑downtime patterns, CORS/Nginx pitfalls, and a triage checklist.

## Architecture Summary

- Process: Node.js + Express behind Nginx, managed by PM2 in cluster mode
- Bind: Core listens on `127.0.0.1:3002`; Nginx terminates TLS and proxies to localhost
- Auth: JWT + WebAuthn, stateless (no sticky sessions required)
- DB: MySQL/MariaDB (Core + Core Auth schemas)
- TLS: Let’s Encrypt on the Nginx edge; Cloudflare proxy (Full/Strict)

## Critical Configuration

- Env (backend `.env`)
  - `PORT=3002`
  - `BIND_ADDR=127.0.0.1`
  - `FRONTEND_URL=https://media.dailey.cloud` (UI origin allowed by CORS)
  - `CLOUD_URL=https://media.dailey.cloud` (same as above; both are honored)
  - `AUTH_DB_HOST`, `AUTH_DB_PORT`, `AUTH_DB_USER`, `AUTH_DB_PASSWORD`, `AUTH_DB_NAME`
  - `WEBAUTHN_RP_ID=core.dailey.cloud`, `WEBAUTHN_ORIGIN=https://core.dailey.cloud`
  - JWT RSA keys on disk; match `JWT_PRIVATE_KEY_FILE` and `JWT_ACTIVE_KID`

- CORS (backend)
  - Allow origins: `https://media.dailey.cloud` and `https://core.dailey.cloud`
  - Always set `Access-Control-Allow-Origin` for allowed origins; include `Access-Control-Allow-Credentials: true`
  - Allow methods: `GET, POST, OPTIONS`; allow headers: `Content-Type, Authorization, X-Application, X-App-Name, X-Client-Id`

## Nginx Reference (Core)

Key points: serve SPA at `/`, but explicitly proxy authentication endpoints so they never hit the SPA shell.

```
server {
  server_name core.dailey.cloud;

  # SPA shell
  root /opt/dailey-core/frontend/build;
  index index.html;
  location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-cache, must-revalidate"; expires -1; }

  # Backend API targets
  location = /.well-known/jwks.json { proxy_pass http://127.0.0.1:3002; include proxy_params; }
  location /api/                     { proxy_pass http://127.0.0.1:3002; include proxy_params; }
  # Explicit auth endpoints (avoid SPA intercepts)
  location = /auth/login             { proxy_pass http://127.0.0.1:3002; include proxy_params; }
  location = /auth/logout            { proxy_pass http://127.0.0.1:3002; include proxy_params; }
  location = /auth/validate          { proxy_pass http://127.0.0.1:3002; include proxy_params; }
  location /auth/ { try_files $uri $uri/ /index.html; error_page 405 = @auth_backend; if ($request_method !~ ^(GET|HEAD)$) { return 405; } }
  location @auth_backend { proxy_pass http://127.0.0.1:3002; include proxy_params; }

  # Health
  location /health { proxy_pass http://127.0.0.1:3002; include proxy_params; }

  # TLS blocks... (Let’s Encrypt)
}

# /etc/nginx/proxy_params (recommended)
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

## PM2 (Process Manager)

- Start/restart
  - `pm2 start src/server.js -i max --name core-backend --node-args="--enable-source-maps"`
  - `pm2 restart core-backend --update-env`
  - `pm2 save && pm2 startup`
- Zero‑downtime: prefer `pm2 reload core-backend` for code updates
- Logs: `pm2 logs core-backend --lines 200`

## Health & Smoke Tests

- Basic health
  - `curl -I https://core.dailey.cloud/health` → 200
- CORS preflight and auth
  - `curl -i -X OPTIONS -H 'Origin: https://core.dailey.cloud' -H 'Access-Control-Request-Method: POST' https://core.dailey.cloud/auth/login` → 204
  - `curl -i -X POST -H 'Origin: https://core.dailey.cloud' -H 'Content-Type: application/json' -d '{"email":"x@y","password":"no"}' https://core.dailey.cloud/auth/login` → 401 (bad creds) or MFA/200
- Validate path must return JSON, not HTML
  - `curl -i -H 'Origin: https://media.dailey.cloud' -H 'Authorization: Bearer invalid' https://core.dailey.cloud/auth/validate` → 401 JSON with `Access-Control-Allow-Origin`

## High Availability (HA)

- Nodes: run Core on ≥2 nodes behind Cloudflare or an OVH Load Balancer
- Each node: Nginx TLS → Node (127.0.0.1:3002) via proxy
- DB: external managed MySQL (HA), not co‑located
- JWT: stateless; share JWKS via `.well-known/jwks.json`, keep RSA keys synced and rotate via `JWT_ACTIVE_KID`
- Health checks: LB should probe `/health`
- Zero‑downtime deploy: `pm2 reload` per node; stagger nodes

## Triage Checklist (fast)

- 502 on `/auth/*`
  - `ss -ltnp | grep 3002` (backend listening?)
  - Nginx: explicit `location = /auth/login|logout|validate` present? 502 usually means backend not listening or wrong path hitting SPA
  - Cloudflare Origin status (gray‑cloud to test origin)
- 403 on `/auth/login`
  - CORS: allow `https://core.dailey.cloud` origin; ensure `Access-Control-Allow-Credentials: true`
- `/auth/validate` returns HTML
  - SPA taking the path: add explicit Nginx location for validate to backend
- WebAuthn: “Server did not return a challenge”
  - Cause: options include binary `challenge`/`id` values; JSON serializes to `{}`
  - Fix: normalize to base64url strings before `res.json` on `register/login start`
  - Verify: `challenge` is a string; `excludeCredentials[].id`/`allowCredentials[].id` are strings
- DMAPI shows 500 after login
  - Validate Core first (401 for bad token, 200 for good)
- Logs to consult
  - `pm2 logs core-backend`
  - `/var/log/nginx/error.log`
  - Cloudflare/WAF events

## Pre‑Deploy Checklist

- CORS: includes both media + core origins
- Nginx: explicit auth locations; `/health` and `/.well-known/jwks.json` proxied
- TLS: certs valid; Cloudflare Full/Strict
- PM2: cluster mode; `pm2 save`; startup configured
- DB: migrations applied; functions present (ignore optional metrics proc if unused)
- WebAuthn env: `WEBAUTHN_RP_ID=core.dailey.cloud`, `WEBAUTHN_ORIGIN=https://core.dailey.cloud`

## Post‑Deploy Smoke

- Health: `/health` → 200
- Auth preflight: `/auth/login` OPTIONS → 204
- Validate (invalid token): `/auth/validate` → 401 JSON with ACAO
- UI loads without stale bundle (or set `Cache-Control: no-cache` on `index.html`)
- WebAuthn register/login start: returns options with a string `challenge`

## Operational: Password Management

- Self‑service change (no email)
  - `POST /auth/password/change`
  - Auth: Bearer token
  - Body: `{ "current_password": "old", "new_password": "newStrong!234" }`
  - Audits: `password.change` (info)

- Admin set password
  - `POST /auth/password/admin-set`
  - Auth: Bearer token with `core.admin` or `tenant.admin`
  - Body: `{ "user_id": "..." | "email": "...", "new_password": "..." }`
  - Audits: `password.set` (warn) with target user
