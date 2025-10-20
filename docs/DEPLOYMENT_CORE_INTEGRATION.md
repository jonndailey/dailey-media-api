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
Content-Type, Authorization, X-Application, X-App-Name, X-Client-Id
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

