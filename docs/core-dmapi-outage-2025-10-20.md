# Postmortem: Core + DMAPI outage (2025-10-20)

## Summary
- Impact: Users could not log in; DMAPI `/api/core/health` returned 502; Core login hung/500; DMAPI UI would immediately log out post-login.
- Root causes:
  1) Core process started without correct env/cwd, so `.env` was not loaded and RSA signing key was not applied. JWT signing attempted with a non-RSA secret under RS256 → 500s on `/auth/login`.
  2) Prior partial edits introduced transient CORS and code issues (duplicated blocks) that temporarily broke Core.
  3) DMAPI built and deployed ok, but its backend JWT audience check did not include Core’s app-id audience for DMAPI, causing 401s on DMAPI API calls immediately after the UI stored the token.

## Timeline (UTC)
- 22:16: DMAPI reported 502 on `/api/core/health`. PM2 showed `dmapi-backend` not listening on 4100 (metrics file mismatch from prior partial deploy).
- 22:18: Patched DMAPI metrics export in-place, restarted → 4100 listening; Nginx proxy returned 200; `/api/core/health` healthy.
- 22:25: Core `/auth/login` direct returned 200 with tokens via loopback, but over Cloudflare and some flows hung/500; logs showed signing errors earlier in day when .env wasn’t loaded.
- 22:32–22:41: Cleaned Core CORS, added `https://media.dailey.cloud`, validated preflight 204; reverted accidental edits that introduced syntax errors; restored stable server.
- 22:44–22:47: Confirmed Core DB connectivity; login still 500 due to env/cwd drift under PM2; restarted Core with NODE_ENV=production and CWD=/opt/dailey-core/backend; health 200; `/auth/login` 200.
- 23:01: Final verification: Core login 200; DMAPI `/api/core/health` 200; UI still logged out immediately (see below).

## Technical details

### Core
- Symptom: `Login error: Error: secretOrPrivateKey must be an asymmetric key when using RS256`
- Cause: Process not loading `.env` → `JWT_PRIVATE_KEY_FILE` ignored; RS256 used with wrong secret → verify/sign failures.
- Fix:
  - Run Core under PM2 with:
    - `NODE_ENV=production`
    - `BIND_ADDR=127.0.0.1` (as designed)
    - `--cwd /opt/dailey-core/backend` so `dotenv` loads `.env` and key file path resolves.
  - Reverted ad‑hoc server.js CORS edits to a clean working state, then added `https://media.dailey.cloud` to allowed origins in a minimal, single CORS block.
  - Verified health and login:
    - `curl http://127.0.0.1:3002/health` → 200
    - `curl -X POST http://127.0.0.1:3002/auth/login …` → 200 with tokens (correct `kid`).

### DMAPI
- Symptom: 502 initially on `/api/core/health` (Nginx). Cause: dmapi-backend wasn’t listening due to a stale metrics file export; fixed by aligning metrics exports and restarting.
- After fix: `/api/core/health` 200.
- Remaining issue: “logs me out immediately” post-login.
  - Likely cause: JWT audience mismatch on DMAPI backend verification. Core issues tokens with `aud` equal to the DMAPI app ID (e.g., `ca7c3e96-b8cd-4fa9-8222-30ead3b95186`), while DMAPI backend allows `dailey-media-api` by default and only additionally trusts `process.env.CORE_APP_ID`/`CORE_AUDIENCE`.
  - Result: DMAPI API calls with the new token get 401 (audience not allowed), and the UI logs out.
  - Fix (operations): set on DMAPI host (pm2 env or `.env`):
    - `CORE_APP_ID=ca7c3e96-b8cd-4fa9-8222-30ead3b95186` (the DMAPI app id in Core)
    - or `CORE_AUDIENCE=ca7c3e96-b8cd-4fa9-8222-30ead3b95186,dailey-media-api`
    - Restart dmapi-backend; token will verify locally via JWKS with allowed audiences.
  - Alternative (Core-side): ask Core to issue `aud=dailey-media-api` for DMAPI (set `app_id` or `audience` accordingly in the login payload), but DMAPI already sends a GUID app_id. Ops env is the simpler, explicit solution.

## What we changed (DMAPI repo)
- Added production-safe defaults and preflight gate:
  - `src/middleware/dailey-auth.js`: default `DAILEY_CORE_URL=https://core.dailey.cloud`; health uses `/health`.
  - `src/config/index.js`: default JWT issuer and JWKS URL → `https://core.dailey.cloud`.
  - New `src/scripts/preflight.js`: checks Core `/health`, JWKS validity, S3 bucket access, and enforces `PORT=4100` in production; wired in `src/index.js` (production only).
  - `ecosystem.config.cjs`: set `env_production.PORT=4100`.
  - `package.json`: added `preflight`, `start:preflight` scripts.

## Runbooks

### Core (PM2)
1) Ensure env:
   - `/opt/dailey-core/backend/.env` contains DB creds, `JWT_PRIVATE_KEY_FILE`, and any `ALLOWED_ORIGINS` entries.
2) Start/Restart:
   - `pm2 delete core-backend || true`
   - `PORT=3002 NODE_ENV=production BIND_ADDR=127.0.0.1 pm2 start /opt/dailey-core/backend/src/server.js --name core-backend --time --update-env --cwd /opt/dailey-core/backend`
3) Validate:
   - `curl http://127.0.0.1:3002/health` → 200
   - `curl -X OPTIONS https://core.dailey.cloud/auth/login -H 'Origin: https://media.dailey.cloud' -H 'Access-Control-Request-Method: POST'` → 204 with ACAO
   - `curl -X POST http://127.0.0.1:3002/auth/login …` → 200

### DMAPI (PM2)
1) Ensure env:
   - `.env` includes `CORE_APP_ID=<DMAPI app id from Core>` or `CORE_AUDIENCE` containing that id; `JWT_ISSUER`/`CORE_JWKS_URL` point to `https://core.dailey.cloud`.
   - `PORT=4100` in production.
2) Preflight (local): `npm run preflight` (fails if Core/S3 invalid).
3) Start/Restart:
   - `pm2 delete dmapi-backend || true`
   - `PORT=4100 NODE_ENV=production pm2 start /opt/dailey-media-api/current/src/index.js --name dmapi-backend --time --update-env`
4) Validate:
   - `curl http://127.0.0.1:4100/health` → 200
   - `curl -k https://127.0.0.1/api/core/health -H 'Host: media.dailey.cloud'` → 200

## Preventing recurrence
1) Preflight gates
   - DMAPI: Already added. Run on every deploy/start; fail-fast on missing Core/S3/port invariants.
   - Core: Add a simple preflight (can be a small script) to check: DB connection, presence of `JWT_PRIVATE_KEY_FILE` or `JWT_PRIVATE_KEY`, and `/health` endpoint binding.

2) PM2 process hygiene
   - Always run Core with `--cwd /opt/dailey-core/backend` and NODE_ENV=production; without correct cwd, dotenv may not load and key paths can fail.
   - For DMAPI, enforce `PORT=4100` in production to match Nginx upstream.

3) CORS configuration
   - Keep CORS in a single, minimal block; avoid multiple overlapping `corsOptions` declarations. Add `https://media.dailey.cloud` explicitly and/or drive via `ALLOWED_ORIGINS` in `.env`.

4) JWT audience alignment
   - Decide a single convention:
     - Either use app-id GUID as `aud` and set `CORE_APP_ID` in DMAPI backend env; or
     - Standardize on `aud=dailey-media-api` and have DMAPI UI/Core honor that.
   - Document the choice in both repos’ README/docs.

5) Atomic deploys
   - Stage releases under `/opt/.../releases/<timestamp>`; run `npm ci` + preflight; switch `current` symlink; reload PM2 using the symlink.
   - Roll back by switching symlink back if preflight fails.

## Open follow-up
- DMAPI UI immediate logout: set `CORE_APP_ID` (or `CORE_AUDIENCE`) on DMAPI to include the audience used by Core tokens for DMAPI (current app-id GUID). Then restart dmapi-backend. This aligns audience validation and stops the UI from logging out.

## Appendix: Environment keys (quick reference)

### Core `.env`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_PRIVATE_KEY_FILE` (or `JWT_PRIVATE_KEY`)
- `JWT_ACTIVE_KID`
- `ALLOWED_ORIGINS` (comma-separated; include `https://media.dailey.cloud`)

### DMAPI `.env`
- `PORT=4100`, `HOST=0.0.0.0`, `NODE_ENV=production`
- `DAILEY_CORE_URL=https://core.dailey.cloud`
- `CORE_JWKS_URL=https://core.dailey.cloud/.well-known/jwks.json`
- `JWT_ISSUER=https://core.dailey.cloud`
- `CORE_APP_ID=<DMAPI app id GUID from Core>` (or `CORE_AUDIENCE=<GUID>,dailey-media-api`)
- S3 settings: `STORAGE_TYPE=s3`, `S3_*` as configured

