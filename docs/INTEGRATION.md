# Integrating With Dailey Media API (DMAPI)

This guide covers the essentials for building clients and backends that talk to DMAPI reliably in production.

## Authentication

- Use Bearer JWTs in the `Authorization` header:
  - `Authorization: Bearer <token>`
- Tokens are issued by DAILEY CORE. In production, the API verifies tokens locally with JWKS and falls back to CORE.
- Roles and scopes:
  - Read: requires one of `user`, `api.read`, `api.write`, `core.admin`, `tenant.admin`, `admin`
  - Upload: requires one of `user`, `api.write`, `core.admin`, `tenant.admin`, `admin`
- If deploying behind a proxy (Nginx, Cloudflare, etc.), ensure the `Authorization` header is forwarded to the origin:
  - `proxy_set_header Authorization $http_authorization;`

## CORS

- DMAPI enforces allowed origins via the `CORS_ORIGINS` env var (comma separated list).
- For browser apps hosted at `https://media.dailey.cloud`, set:
  - `CORS_ORIGINS=https://media.dailey.cloud`
- Preflight (OPTIONS) is supported. Expect:
  - `Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,X-API-Key`

## Uploading Files

- Endpoint: `POST /api/upload`
- Content-Type: `multipart/form-data`
- Required field name: `file`
- Optional fields:
  - `bucket_id` (default: `default`)
  - `folder_path` (relative path under the bucket)
- Example (browser):
```js
const fd = new FormData();
fd.append('file', fileInput.files[0]);
fd.append('bucket_id', 'default');
fd.append('folder_path', 'photos/2025');
const res = await fetch('/api/upload', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: fd
});
```
- Example (curl):
```bash
curl -s -i https://media.dailey.cloud/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/small.jpg" \
  -F "bucket_id=default" \
  -F "folder_path=photos/2025"
```

## Buckets and Browsing

- List buckets for an application:
  - `GET /api/buckets?app_id=dailey-media-api`
- Browse files within a bucket:
  - `GET /api/buckets/:bucketId/files?path=<relative>`
  - Paths are normalized (e.g., `/nested/` → `nested`).

## Common Pitfalls and Fixes

- 401 Unauthorized
  - Missing/invalid Bearer token or proxy not forwarding `Authorization`.
- 403 Forbidden on buckets
  - Token lacks the required role. Ensure the token has one of the read roles above.
- 500 “Not allowed by CORS”
  - Add your web app origin to `CORS_ORIGINS`, restart the API, and confirm preflight succeeds.
- 500 on upload before logs
  - Check Cloudflare WAF. Temporarily disable security for `…/api/upload*` to test.
- 301/HTTPS redirect loops on localhost checks
  - Port 4100 is plain HTTP. Use `http://127.0.0.1:4100` when testing locally.

## Recommended Environment Variables (Production)

```bash
DAILEY_CORE_URL=https://core.dailey.cloud
CORE_JWKS_URL=https://core.dailey.cloud/.well-known/jwks.json
JWT_ISSUER=https://core.dailey.cloud
JWT_AUDIENCE=dailey-media-api
CORS_ORIGINS=https://media.dailey.cloud
PORT=4100
HOST=0.0.0.0
```

## Nginx Tips

- Forward auth header and tune upload paths:
```nginx
location ^~ /api {
  proxy_set_header Authorization $http_authorization;
}
location ^~ /api/upload {
  proxy_request_buffering off;
  proxy_read_timeout 300s;
}
```

