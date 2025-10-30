# Monitoring and Observability

This document describes how to run a central Grafana + Prometheus on the DMAPI
server and ingest metrics from multiple apps/servers (DMAPI, Core, etc.).

## Architecture (recommended)
- Central Grafana: https://grafana.dailey.cloud (subdomain, TLS at Nginx)
- Single Prometheus on the DMAPI server (dmapiapp01) scraping:
  - DMAPI application metrics at `127.0.0.1:4100/metrics`
  - Node Exporter at `localhost:9100`
  - Additional remote targets (Core, others) via private network (Tailscale, LAN) or
    firewall exceptions restricted to the DMAPI server.

Why this approach
- One place to view dashboards and alerts.
- Minimal moving parts: Prometheus pulls metrics over HTTP; no agent required beyond exporters.

## DMAPI server (central)
- Prometheus config file: `/etc/prometheus/prometheus.yml`
- Example with DMAPI + Node + remote Core (replace addresses as needed):

```
global:
  scrape_interval: 15s

scrape_configs:
  # Prometheus itself
  - job_name: prometheus
    scrape_interval: 5s
    static_configs:
      - targets: ["localhost:9090"]

  # DMAPI app
  - job_name: dmapi
    metrics_path: /metrics
    static_configs:
      - targets: ["127.0.0.1:4100"]

  # DMAPI node exporter
  - job_name: node
    static_configs:
      - targets: ["localhost:9100"]

  # Core app (application metrics)
  - job_name: core_app
    metrics_path: /metrics
    static_configs:
      - targets: ["<coreapp-ip-or-tailscale>:3002"] # replace port/path as needed

  # Core node exporter
  - job_name: core_node
    static_configs:
      - targets: ["<coreapp-ip-or-tailscale>:9100"]
```

Reload Prometheus after editing:
- `sudo systemctl restart prometheus`

## Onboarding a new app/server (Core example)
1) On the remote server (`coreapp`):
   - Install Node Exporter (system metrics)
     - Ubuntu: `sudo apt-get install -y prometheus-node-exporter`
     - Service runs on `:9100`
   - Expose your application metrics
     - The app should serve Prometheus text format on `/metrics` over HTTP.
     - If the app is behind Nginx/Cloudflare, prefer a private listener (LAN/Tailscale) for Prometheus.
   - Restrict firewall to allow scrapes only from DMAPI’s Prometheus host
     - Example (UFW on `coreapp`):
       - `sudo ufw allow from 15.204.227.163 to any port 9100 proto tcp # node exporter`
       - `sudo ufw allow from 15.204.227.163 to any port 3002 proto tcp # core app metrics`
       - `sudo ufw status`

2) On the DMAPI server (`dmapiapp01`):
   - Add the remote targets to `/etc/prometheus/prometheus.yml` (see above).
   - `sudo systemctl restart prometheus`
   - Validate targets are `up`:
     - `curl -s http://127.0.0.1:9090/api/v1/targets` and check `core_app` and `core_node`.

## Networking notes
- Prefer private connectivity:
  - Tailscale IPs or private LAN addresses are ideal (no Internet exposure, no CF).
- If you must expose metrics ports to the Internet, lock down with UFW to a single source IP (the Prometheus host).
- Avoid scraping through Cloudflare. CF adds indirection and can block or cache unexpectedly.

## Grafana
- Central Grafana is hosted at: `https://grafana.dailey.cloud`
- Provisioned datasource: Prometheus at `http://localhost:9090`
- Dashboards are loaded from: `/var/lib/grafana/dashboards`
  - Repo dashboard: `monitoring/grafana/dashboards/dmapi.json`
  - Optional: `monitoring/grafana/dashboards/core_overview.json` (Core node stats)
  - Optional: `monitoring/grafana/dashboards/core_app_overview.json` (Core app metrics)
  - Optional: `monitoring/grafana/dashboards/core_auth_overview.json` (Core auth/accounts)
  - Provisioning file: `/etc/grafana/provisioning/dashboards/dmapi.yml`

### Grafana provisioning (repo / docker-compose)
- Datasource provisioning file: `monitoring/grafana/datasources/prometheus.yml`
  - Points to `http://prometheus:9090` (the compose service name)
- Dashboard provisioning directory: `monitoring/grafana/dashboards`
- When running `docker-compose --profile monitoring up -d`, Grafana auto-loads both the Prometheus datasource and bundled dashboards.

### DMAPI metrics of interest
- Request metrics
  - `dmapi_http_request_duration_seconds_*` (histogram) → RPS, p95 latency by route
  - `dmapi_http_request_bytes_total` / `dmapi_http_response_bytes_total` → ingress/egress bandwidth by route
- Upload metrics
  - `dmapi_uploads_total`, `dmapi_upload_errors_total`
  - `dmapi_upload_bytes_total{bucket_id,app_id,access}` → upload bandwidth per bucket/app
- Storage metrics (best‑effort gauges; reset on restart)
  - `dmapi_storage_bytes{bucket_id,app_id,access}`
  - `dmapi_storage_objects{bucket_id,app_id,access}`
  - Counters: `dmapi_storage_write_*`, `dmapi_storage_delete_*` for auditing writes/deletes

## Labels and consistency
- Use `job` and `instance` to distinguish apps/hosts.
- Add `app` and `env` labels if needed (via `relabel_configs`) to align queries across apps.

## Alerting (optional quick start)
- In Grafana, configure Alerting → Contact points (email/Slack) and Alert rules.
- Common rules:
  - High error rate over 5m
  - p95 latency above threshold
  - Node exporter CPU > 90% for sustained period

## Troubleshooting
- No data in dashboard
  - Check Prometheus targets API: `curl -s http://127.0.0.1:9090/api/v1/targets`
  - Query a metric directly in Grafana Explore (Prometheus datasource).
- 526/SSL errors on media.dailey.cloud
  - Ensure the vhost for `media.dailey.cloud` presents the correct certificate; prefer it as the 443 default_server.
  - Do not host Grafana under `media.dailey.cloud/grafana`; use `grafana.dailey.cloud` instead so SNI and certs remain unambiguous.
- Grafana access
  - Prefer a dedicated subdomain (e.g., `grafana.dailey.cloud`) over subpaths.
  - If behind Cloudflare, set DNS-only and avoid Page Rules that alter assets.

### Nginx 500 at root (rewrite loop)
- Symptom: `rewrite or internal redirection cycle while internally redirecting to "/index.html"`
- Cause: SPA build missing on the server (no `web/dist`), but Nginx `try_files` points to `/index.html`.
- Fix: deploy the SPA build into the active release (e.g., `/opt/dailey-media-api/current/web/dist`) or adjust the Nginx root for static assets.
