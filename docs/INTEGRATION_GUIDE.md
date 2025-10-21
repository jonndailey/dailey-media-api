# Integration Guide: Apps with Core + DMAPI

This guide explains how to register an app with Core, obtain tokens, validate them, and call DMAPI securely.

## 1) Register Your App in Core

- Create an application in Core and record its `app_id` (GUID) and slug.
- Example: `ca7c3e96-b8cd-4fa9-8222-30ead3b95186` for DMAPI.

## 2) Authenticate and Obtain Tokens

```
POST https://core.dailey.cloud/auth/login
Content-Type: application/json
{
  "email": "user@example.com",
  "password": "********",
  "app_id": "<YOUR_APP_GUID>"
}
```

Response contains `access_token` (JWT RS256) and `refresh_token`.

## 3) Validate JWTs (Server)

- Fetch JWKS: `https://core.dailey.cloud/.well-known/jwks.json`
- Verify RS256 signature and enforce:
  - `iss=https://core.dailey.cloud`
  - `aud=<YOUR_APP_GUID>`
- In Node.js, convert JWK → PEM and call `jsonwebtoken.verify` with issuer and audience checks.

## 4) Configure DMAPI to Accept Your Audience

- On DMAPI’s environment: set `CORE_APP_ID=<YOUR_APP_GUID>` (or list in `CORE_AUDIENCE`).
- DMAPI validates tokens against Core JWKS and enforces allowed audiences.

## 5) Call DMAPI

Include the bearer token in every request:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" https://media.dailey.cloud/api/buckets
```

## 6) Browser + CORS

- Core and DMAPI allow `https://media.dailey.cloud`. If you host from another origin, add it to CORS allow lists.
- DMAPI frontend builds must use HTTPS endpoints and canonical dailey.cloud domains; preflight will block misconfigured builds.

## 7) Error Handling

- 401 Unauthorized: invalid or unverifiable token; ensure audience matches and token is not expired.
- 403 Forbidden: insufficient role/scope.
- 429 Rate limit exceeded: back off and retry based on headers.

## 8) Health & Preflight

- DMAPI production start runs a preflight that ensures Core health, JWKS validity, S3 readiness, HTTPS frontend env, and port invariants.
- Core exposes `/health` and JWKS for readiness checks. Use `curl -I https://core.dailey.cloud/health`.

