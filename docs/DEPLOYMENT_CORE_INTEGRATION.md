# Core Integration (Auth) – Production

This app uses DAILEY CORE for authentication. In production, the frontend calls CORE directly over HTTPS.

## Required Settings

1) Frontend env (web/.env.production)

```
VITE_CORE_AUTH_URL=https://core.dailey.cloud
VITE_MEDIA_API_URL=https://media.dailey.cloud
```

2) CORE CORS configuration

Allow origin `https://media.dailey.cloud` with credentials. Accept headers:

```
Content-Type, Authorization, X-Application, X-App-Name, X-Client-Id, X-Tenant-Slug
```

Allow methods: `GET, POST, OPTIONS` and return 204 for preflight (`OPTIONS`).

3) Cloudflare

- Set SSL/TLS mode to “Full (strict)” for both `core.dailey.cloud` and `media.dailey.cloud`.
- Avoid proxying CORE via the media origin to reduce TLS handshake edge cases and simplify routing.

4) Nginx (media origin)

Forward proxy headers to the backend:

```
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

Ensure UI routing:

```
location / {
  root /opt/dailey-media-api/current/web/dist;
  try_files $uri $uri/ /index.html;
}
```

## Notes

- If you temporarily need a `/core` proxy on the media origin, use SNI:

```
location ^~ /core/ {
  proxy_ssl_server_name on;
  proxy_ssl_name core.dailey.cloud;
  proxy_pass https://core.dailey.cloud/;
}
```

But prefer direct CORS for simplicity and security.

### Optional hardening

- Avoid stale SPA entrypoint after deploys by disabling cache on `index.html` only (hashed assets can remain long‑cached):

```
location = / {
  add_header Cache-Control "no-cache, no-store, must-revalidate" always;
  add_header Pragma "no-cache" always;
  add_header Expires "0" always;
  root /opt/dailey-media-api/current/web/dist;
  try_files $uri $uri/ /index.html;
}
```

- Configure DMAPI’s Core health check with `DAILEY_CORE_URL` on the backend host if the Core domain differs:

```
export DAILEY_CORE_URL=https://core.dailey.cloud
pm2 restart dmapi-backend --update-env
```

### WebAuthn (Passkeys)

- Required env on Core:
  - `WEBAUTHN_RP_ID=core.dailey.cloud`
  - `WEBAUTHN_ORIGIN=https://core.dailey.cloud`
- Routes used by the UI:
  - `POST /auth/webauthn/register/start|finish`
  - `POST /auth/webauthn/login/start|finish`
- Make sure start endpoints return JSON with string `challenge` and base64url credential IDs. If you use a typed buffer, convert to base64url before `res.json`.

### Password Management APIs

- Self‑service change: `POST /auth/password/change` (Bearer required)
- Admin set password: `POST /auth/password/admin-set` (admin roles)
- Both return `{ success: true }` on success and audit password operations.

### Preventing common production pitfalls

- Do not let the SPA intercept Core auth endpoints
  - On Core’s Nginx, add explicit locations that proxy to the backend for:
    - `location = /auth/login { ... }`
    - `location = /auth/logout { ... }`
    - `location = /auth/validate { ... }`
  - Keep a catch‑all `location /auth/ { try_files ... /index.html; }` only for GET/HEAD (UI), and route non‑GET to a named backend.

- CORS must allow both the media UI and the Core UI
  - Allowlist `https://media.dailey.cloud` and `https://core.dailey.cloud` (credentials true)
  - Ensure preflight (OPTIONS) on `/auth/login` returns 204 with `Access-Control-Allow-Methods: POST`

- DMAPI backend behind Nginx/Cloudflare
  - Enable `app.set('trust proxy', 1)` so rate limiting and client IPs are accurate
  - Configure `/api/core/health` as a same‑origin health proxy to avoid browser CORS during health checks

For a full runbook, see:

- Core HA Runbook: `docs/CORE_HA_RUNBOOK.md`
- DMAPI Deployment Checklist: `docs/DMAPI_DEPLOYMENT_RUNBOOK.md`

## Token Validation Strategy (Definitive)

- Validate RS256 tokens locally against Core’s JWKS at `/.well-known/jwks.json`.
- Treat `/auth/validate` as optional. DMAPI already falls back to JWKS verify when validate is unavailable.
- Claims to check: `exp`, `nbf`, `iss` (=`dailey-core-auth`); optionally enforce `aud` per app.

## Slug‑Based Login Pattern (for UI flows)

When your UI authenticates with Core, pass slugs, not a client id:

```bash
curl -sS -X POST "$VITE_CORE_AUTH_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -H "X-Client-Id: $APP_SLUG" \
  -H "X-Tenant-Slug: $TENANT_SLUG" \
  --data-binary '{
    "email": "user@example.com",
    "password": "<password>",
    "app_slug": "'$APP_SLUG'",
    "tenant_slug": "'$TENANT_SLUG'"
  }'
```

Then present the returned `access_token` as a Bearer token to DMAPI.
