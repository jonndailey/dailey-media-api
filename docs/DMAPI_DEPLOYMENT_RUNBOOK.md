# Dailey Media API — Deployment Checklist & Ops Notes

This guide covers reliable deployments of the Media API (DMAPI) and its web UI, plus the Core integration details that tend to cause production friction.

## Summary

- Services:
  - `dmapi-backend` (port 4100) — API + UI host
  - `dmapi-heavy` (port 4101) — heavy PDF/conversion endpoints
- Frontend: Vite SPA served by Nginx from `/opt/dailey-media-api/current/web/dist`
- Reverse proxy: Nginx → `127.0.0.1:4100/4101`
- Auth: Trusts JWT from Dailey Core over HTTPS

## Critical Config

- Backend `.env`
  - `DAILEY_CORE_URL=https://core.dailey.cloud` (server‑side auth validation)
  - `PORT=4100`, `HOST=0.0.0.0`
  - Storage/DB as per your environment
  - Rate‑limit and security settings

- Frontend env (build‑time)
  - `VITE_CORE_AUTH_URL=https://core.dailey.cloud`
  - `VITE_MEDIA_API_URL=https://media.dailey.cloud`

- Express trust proxy
  - Ensure `app.set('trust proxy', 1)` is enabled so rate‑limiters and IP logging work behind Nginx/Cloudflare

## Nginx (DMAPI)

- UI and API
  - `location / { root /opt/dailey-media-api/current/web/dist; try_files $uri $uri/ /index.html; }`
  - Add no‑cache headers for `index.html` to avoid stale SPAs after deploys:
    - `add_header Cache-Control "no-cache, no-store, must-revalidate" always;`
    - `add_header Pragma "no-cache" always;`
    - `add_header Expires "0" always;`
  - Proxy `/api/*` to `127.0.0.1:4100`; `/api/pdf|/api/conversion` to `127.0.0.1:4101`

## Deploy Steps

1) Backend (if code changed)
   - `rsync -az src/ dmapiapp01:/opt/dailey-media-api/current/src/`
   - `ssh dmapiapp01 'pm2 restart dmapi-backend dmapi-heavy --update-env'`

2) Frontend (always on UI changes)
   - `cd web && VITE_CORE_AUTH_URL=... VITE_MEDIA_API_URL=... npm run build`
   - `rsync -az --delete web/dist/ dmapiapp01:/opt/dailey-media-api/current/web/dist/`
   - Optional: purge Cloudflare cache to flush stale `index.html`

## Health & Smoke

- DMAPI: `curl -I https://media.dailey.cloud/health` → 200
- Core via DMAPI (server‑to‑server health): `curl -s https://media.dailey.cloud/api/core/health` → `{status:"healthy"}`
- Browser: hard refresh (Cmd/Ctrl+Shift+R) after deploys to pull the new SPA

## Core Integration (must‑haves)

- CORS on Core allows origin `https://media.dailey.cloud` (credentials true)
- DMAPI server uses `DAILEY_CORE_URL` to validate tokens; do not point to localhost in production
- Keep UI health pointing at `/api/core/health` (same‑origin) to avoid any residual CORS during health checks

## Incident Quick Wins

- DMAPI shows “Service Unavailable”
  - Likely a stale SPA bundle or Core outage; hard refresh and/or purge CF cache; then check Core health
- 500 on `/api/buckets` after login
  - Usually invalid token or Core validate failing; verify `https://core.dailey.cloud/auth/validate` returns 200/401 JSON (not HTML), and ACAO header is present
- Rate‑limit warning in logs about `X-Forwarded-For`
  - Verify `app.set('trust proxy', 1)` is present

## Runbook Commands

- PM2
  - `pm2 status`
  - `pm2 logs dmapi-backend --lines 200`
  - `pm2 restart dmapi-backend --update-env`

- Nginx
  - `sudo nginx -t && sudo systemctl reload nginx`
  - `sudo tail -n 200 /var/log/nginx/error.log`

