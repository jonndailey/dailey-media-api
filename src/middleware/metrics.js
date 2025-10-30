import client from 'prom-client';

// Use the global default registry so AggregatorRegistry can merge across workers
client.collectDefaultMetrics();

// HTTP request duration histogram
export const httpRequestDuration = new client.Histogram({
  name: 'dmapi_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});
client.register.registerMetric(httpRequestDuration);

// HTTP bytes in/out counters (approximate, based on headers or bytes written)
export const httpRequestBytesTotal = new client.Counter({
  name: 'dmapi_http_request_bytes_total',
  help: 'Total HTTP request bytes received',
  labelNames: ['method', 'route']
});
client.register.registerMetric(httpRequestBytesTotal);

export const httpResponseBytesTotal = new client.Counter({
  name: 'dmapi_http_response_bytes_total',
  help: 'Total HTTP response bytes sent',
  labelNames: ['method', 'route', 'status_code']
});
client.register.registerMetric(httpResponseBytesTotal);

// Upload counters
export const uploadsTotal = new client.Counter({
  name: 'dmapi_uploads_total',
  help: 'Total successful uploads'
});
client.register.registerMetric(uploadsTotal);

export const uploadErrorsTotal = new client.Counter({
  name: 'dmapi_upload_errors_total',
  help: 'Total failed uploads'
});
client.register.registerMetric(uploadErrorsTotal);

// Upload ingress bytes (client -> DMAPI)
export const uploadBytesTotal = new client.Counter({
  name: 'dmapi_upload_bytes_total',
  help: 'Total uploaded bytes accepted by DMAPI',
  labelNames: ['bucket_id', 'app_id', 'access']
});
client.register.registerMetric(uploadBytesTotal);

// Storage write/delete counters and current gauges
export const storageWriteBytesTotal = new client.Counter({
  name: 'dmapi_storage_write_bytes_total',
  help: 'Total bytes written to backing storage',
  labelNames: ['bucket_id', 'app_id', 'access', 'kind']
});
client.register.registerMetric(storageWriteBytesTotal);

export const storageWriteObjectsTotal = new client.Counter({
  name: 'dmapi_storage_write_objects_total',
  help: 'Total objects written to backing storage',
  labelNames: ['bucket_id', 'app_id', 'access', 'kind']
});
client.register.registerMetric(storageWriteObjectsTotal);

export const storageDeleteBytesTotal = new client.Counter({
  name: 'dmapi_storage_delete_bytes_total',
  help: 'Total bytes deleted from backing storage',
  labelNames: ['bucket_id', 'app_id', 'access', 'kind']
});
client.register.registerMetric(storageDeleteBytesTotal);

export const storageDeleteObjectsTotal = new client.Counter({
  name: 'dmapi_storage_delete_objects_total',
  help: 'Total objects deleted from backing storage',
  labelNames: ['bucket_id', 'app_id', 'access', 'kind']
});
client.register.registerMetric(storageDeleteObjectsTotal);

export const storageCurrentBytes = new client.Gauge({
  name: 'dmapi_storage_bytes',
  help: 'Current stored bytes (best-effort; resets on process restart)',
  labelNames: ['bucket_id', 'app_id', 'access']
});
client.register.registerMetric(storageCurrentBytes);

export const storageCurrentObjects = new client.Gauge({
  name: 'dmapi_storage_objects',
  help: 'Current stored objects (best-effort; resets on process restart)',
  labelNames: ['bucket_id', 'app_id', 'access']
});
client.register.registerMetric(storageCurrentObjects);

// Middleware to time requests
export function metricsMiddleware(req, res, next) {
  // capture request size from header (may be undefined for chunked)
  const reqLenHeader = req.headers['content-length'];
  const reqBytesHeader = reqLenHeader ? parseInt(reqLenHeader, 10) : 0;

  const start = process.hrtime.bigint();
  const origEnd = res.end;
  const origWrite = res.write;
  let bytesOut = 0;

  // Track bytes written when Content-Length is not set
  res.write = function (chunk, encoding, cb) {
    try {
      if (chunk) {
        const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
        bytesOut += size;
      }
    } catch { /* ignore */ }
    return origWrite.apply(this, arguments);
  };

  res.end = function (...args) {
    const diffNs = Number(process.hrtime.bigint() - start);
    const seconds = diffNs / 1e9;
    // Prefer stable route label: baseUrl + route path
    let route = 'unknown';
    try {
      const base = req.baseUrl || '';
      const path = req.route?.path || '';
      const combined = `${base}${path ? (path.startsWith('/') ? path : '/' + path) : ''}`;
      route = combined || req.originalUrl.split('?')[0] || 'unknown';
      // Normalize multiple slashes and strip trailing slash except root
      route = route.replace(/\/+/g, '/');
      if (route.length > 1 && route.endsWith('/')) route = route.slice(0, -1);
    } catch (_) { /* ignore */ }
    httpRequestDuration.labels(req.method, route, String(res.statusCode)).observe(seconds);

    // request bytes
    if (reqBytesHeader > 0) {
      httpRequestBytesTotal.labels(req.method, route).inc(reqBytesHeader);
    }

    // response bytes (prefer header, fallback to counted)
    const resLenHeader = res.getHeader('content-length');
    const resBytesHeader = resLenHeader ? parseInt(String(resLenHeader), 10) : 0;
    const out = resBytesHeader > 0 ? resBytesHeader : bytesOut;
    if (out > 0) {
      httpResponseBytesTotal.labels(req.method, route, String(res.statusCode)).inc(out);
    }
    origEnd.apply(this, args);
  };
  next();
}

// /metrics handler
export async function metricsHandler(req, res) {
  try {
    // Try cluster aggregation first (PM2 cluster / Node cluster)
    try {
      const aggregatorRegistry = new client.AggregatorRegistry();
      res.set('Content-Type', aggregatorRegistry.contentType);
      const body = await aggregatorRegistry.clusterMetrics();
      if (body && body.length) {
        res.end(body);
        return;
      }
    } catch (_) {
      // fall back to process-local registry
    }
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).send(err.message);
  }
}

export default {
  metricsMiddleware,
  metricsHandler,
  uploadsTotal,
  uploadErrorsTotal,
  httpRequestDuration,
  httpRequestBytesTotal,
  httpResponseBytesTotal,
  uploadBytesTotal,
  storageWriteBytesTotal,
  storageWriteObjectsTotal,
  storageDeleteBytesTotal,
  storageDeleteObjectsTotal,
  storageCurrentBytes,
  storageCurrentObjects
};
