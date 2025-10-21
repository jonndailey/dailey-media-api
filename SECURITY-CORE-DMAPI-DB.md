# Core, DMAPI, and Database Cluster: Architecture & Security Deep Dive

This document summarizes how the system works, how services connect, and the security posture across Core, DMAPI, and the database cluster. It consolidates the material from docs/ and adds an operational narrative suitable for onboarding and audits.

## Architecture Overview

- Core (Auth/API): Issues JWTs (RS256), publishes JWKS, enforces CORS, exposes `/health`.
- DMAPI (Media API): Validates tokens locally via Core JWKS; serves storage ops; production start gated by preflight.
- Database (MySQL): coredb1 (primary) → coredb2 (replica), GTID, auto-position; MySQL bound to localhost; replication via `replicator`.
- Nginx/Cloudflare: TLS termination, HSTS, header forwarding, CORS/scopes; Cloudflare set to Full (strict).

### Connections
- DMAPI → Core: HTTPS only; health and JWKS; optional validate fallback removed from browser.
- Clients → DMAPI: Bearer tokens from Core; DMAPI verifies RS256 signature, `iss`, and `aud`.
- Replica → Primary: MySQL GTID replication with SSL; internal network only.
- Health (replica): coreapp SSHes into DB hosts and runs `mysql` locally as `replicator`@localhost (REPLICATION CLIENT).

## Security Posture

### Identity (Core)
- RS256 with kid; JWKS at `/.well-known/jwks.json`.
- Claims enforceable (`iss`, `aud`); app GUID used as audience.
- CORS allow list minimal (e.g., `https://media.dailey.cloud`).
- PM2 with production env + cwd; `/health` and `/metrics` enabled.

### DMAPI
- JWKS fast path (no network calls on each request) and strict claim checks.
- Preflight gate in production:
  - Port invariants (`PORT=4100`).
  - Core `/health` and JWKS sanity.
  - S3 access minimal probes with timeouts.
  - Frontend `.env.production` must use HTTPS and dailey.cloud.
- HTTP hardening: Helmet, CSP, HSTS, strict redirects, CORS allow list, rate limits.

### Database Cluster
- GTID, ROW binlog, `log_slave_updates=ON` on replica; read-only enforced on replica.
- MySQL bound to localhost; replication user is limited.
- SSH-mode replica health with REPLICATION CLIENT only; no sudo/ports required.
- Seeding: primary dump `--set-gtid-purged=OFF`, replica import with SQL thread paused.

## Operational Recipes

### Core
- Restart with PM2 (production + cwd): ensure `.env` loads RSA key path; verify `/health` and JWKS.
- Add CORS origins carefully; confirm preflight.

### DMAPI
- `npm run preflight` must succeed; in prod, server refuses to start on failures.
- Verify JWKS path, issuer, audience env; ensure S3 access.

### Replication
- Verify: `SHOW REPLICA STATUS\G` → IO/SQL running, lag (Seconds_Behind) small/zero.
- PM2 job `core-replica-health` logs one JSON line every 2 minutes.

## Integration for New Apps

1) Register app in Core; record `app_id` (GUID).
2) Validate JWTs using Core JWKS (RS256). Enforce `iss`, `aud`.
3) Set `CORE_APP_ID` on DMAPI to include your GUID.
4) Use HTTPS endpoints (`*.dailey.cloud`), and add CORS origins where needed.
5) Rely on DMAPI `/api/auth/validate` for browser validation to avoid CORS issues.

## Appendix: Environment Keys

### Core
- `JWT_PRIVATE_KEY_FILE`, `JWT_ACTIVE_KID`
- `ALLOWED_ORIGINS`

### DMAPI
- `CORE_JWKS_URL=https://core.dailey.cloud/.well-known/jwks.json`
- `JWT_ISSUER=https://core.dailey.cloud`
- `CORE_APP_ID=<APP_GUID>` (or `CORE_AUDIENCE=...`)
- `DAILEY_CORE_URL=https://core.dailey.cloud`
- `CORS_ORIGINS=https://media.dailey.cloud`
- S3 keys/endpoint in `config.storage.s3`
- Production: `PORT=4100`

### Replica Health (PM2)
- `REPL_SSH_USER=ubuntu`
- `REPL_SSH_HOSTS=40.160.239.176,40.160.239.175`
- `REPL_SQL_USER=replicator`
- `REPL_SQL_PASS=<replicator_password>`

