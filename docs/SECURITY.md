# Dailey Core + DMAPI + Database Cluster Security Overview

## Executive Summary

The platform is secured along three dimensions: identity (Core), data plane (DMAPI), and persistence (MySQL primary/replica). Core issues RS256 JWTs with a published JWKS; DMAPI validates tokens locally against Core’s JWKS and enforces issuer/audience. Production builds enforce HTTPS-only configuration and preflight gating to prevent bad releases. The database cluster uses GTID replication with auto-position and keeps MySQL bound to localhost; an SSH-mode health job reads replica status without exposing ports.

---

## Identity and Authentication (Core)

- Tokens: RS256 JWT using an RSA private key; `kid` identifies the active key. Public keys are published at `https://core.dailey.cloud/.well-known/jwks.json`.
- Claims: `iss=https://core.dailey.cloud` (and legacy `dailey-core-auth`), `aud` is the application GUID (e.g., DMAPI app id), `sub` user id, plus `email`, `name`, `roles`, and `tenants`.
- Token issuance: `/auth/login` returns `access_token` and `refresh_token`. CORS allow list includes `https://media.dailey.cloud`.
- CORS: Minimal allow list; preflight verified for `Origin: https://media.dailey.cloud`.
- Operational safeguards: Core runs under PM2 with `NODE_ENV=production` and correct working directory so `.env` and key paths are loaded; health and JWKS endpoints are exposed for readiness checks.

### Security Properties
- Asymmetric signing (RS256) prevents server-side token forgery without private key.
- JWKS enables validation and key rotation without redeploys.
- CORS allow list limits browser origins.

---

## DMAPI (Media API)

### JWT Validation
- DMAPI validates tokens locally using Core’s JWKS:
  - Converts RSA JWK → PEM via Node crypto.
  - Enforces `iss` ∈ {`https://core.dailey.cloud`, legacy `dailey-core-auth`}.
  - Enforces `aud` ∈ {`CORE_APP_ID`, `CORE_AUDIENCE`, and default `dailey-media-api`}.
  - Accepts `alg=RS256`; clock tolerance applied for minor skew.
- Frontend now calls `/api/auth/validate` on DMAPI (not Core) to avoid browser CORS and dependency on Core at page load.

### Preflight Gate (Production)
Executed at startup when `NODE_ENV=production`:
1) Port invariant: `PORT=4100`.
2) Core health reachable: `GET https://core.dailey.cloud/health`.
3) JWKS valid/non-empty: `https://core.dailey.cloud/.well-known/jwks.json`.
4) S3 readiness: `HeadBucket` or `ListObjectsV2` with timeouts.
5) Frontend env validation: `web/.env.production` must use HTTPS; only `*.dailey.cloud` domains; no `http://`, IPs, or typos.

### HTTP Hardening
- Helmet (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, etc.).
- Force HTTPS behind proxy (`x-forwarded-proto`) except `/health` and `/metrics`.
- Rate limiting for general/API/auth and upload slow-down.
- XSS filtering on inputs and strict parsing limits.
- CORS restricted by `CORS_ORIGINS` (includes `https://media.dailey.cloud`).

### Operational Benefits
- Production builds fail fast when configuration is unsafe (preflight gate).
- Auth validation via JWKS avoids live dependency on Core for each request.
- Minimal logging of sensitive token fields; optional extended diagnostics are env-gated.

---

## Database Cluster (MySQL GTID)

### Topology
- Primary: `coredb1` (40.160.239.176)
- Replica: `coredb2` (40.160.239.175)
- Replication: GTID auto-position with SSL; `binlog_format=ROW`, `log_slave_updates=ON`.
- Read-only on replica: `read_only=ON`, `super_read_only=ON`.

### Security Controls
- MySQL bound to localhost; no external TCP listener.
- Replication user: `replicator` with strong password; limited to replication privileges.
- Monitor user (recommended): `replicator@localhost` with `REPLICATION CLIENT` for SSH-mode status.

### Seeding Additional Databases Safely
1) On primary: `mysqldump --single-transaction --set-gtid-purged=OFF --routines --triggers --events <db>` → copy to replica.
2) On replica: `STOP REPLICA SQL_THREAD; CREATE DATABASE IF NOT EXISTS <db>; import dump; START REPLICA SQL_THREAD;`.

### SSH‑Mode Health (No Port Exposure)
- PM2 job on coreapp: `/opt/dailey-core/backend/scripts/replica-health.sh`.
- For each host, via SSH: run `mysql -u replicator -p… -h 127.0.0.1` to collect:
  - `SELECT @@hostname,@@read_only,@@version;`
  - `SHOW REPLICA STATUS\G` (or `SHOW SLAVE STATUS\G`)
- Emits a single JSON line: `{host, server{ro,ver}, replica{IO,SQL,Seconds_Behind}}`.
- PM2 persisted with cron `*/2 * * * *`.

### Threat Model & Mitigations
- Replica poisoning: GTID consistency + ROW binlog + restricted users.
- Side-channel exfil: No MySQL ports exposed; SSH key authentication; least-privileged monitor.
- Data divergence: SQL thread status and Seconds_Behind monitored; alerts can be added on thresholds.

---

## Nginx / Cloudflare

- Enforce HTTPS; HSTS; forward `Authorization` header.
- Cloudflare set to Full (strict); purge `/assets/*` after frontend deploys.
- org/domain separation: `media.dailey.cloud` and `core.dailey.cloud` with explicit CORS; minimal cross-origin surface.

---

## Integration Guidance

1) Register your app in Core; use the returned `app_id` (GUID) as `aud` in tokens.
2) Validate JWTs using Core JWKS; enforce `iss` and `aud`.
3) For DMAPI calls, include the bearer token; ensure DMAPI’s `CORE_APP_ID` lists your app id.
4) Frontend builds must use HTTPS endpoints and canonical `*.dailey.cloud` domains; preflight enforces this for DMAPI.
5) Add your site to CORS allowlists where needed (Core and DMAPI).

---

## Operational Runbooks (Highlights)

- DMAPI production start: `npm run preflight` must pass, then PM2 start with `PORT=4100`.
- Core production start: PM2 with `NODE_ENV=production` and correct cwd; verify `/health` and JWKS.
- Replica health: PM2 tail; JSON line per run. Optional alerting on `Seconds_Behind > 5`.

