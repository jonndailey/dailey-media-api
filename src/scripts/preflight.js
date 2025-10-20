import { S3Client, HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import config from '../config/index.js';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

function env(key, fallback = undefined) {
  return typeof process.env[key] === 'string' && process.env[key].length ? process.env[key] : fallback;
}

function fail(message, details = {}) {
  console.error(`[preflight] FAIL: ${message}`);
  if (Object.keys(details).length) {
    console.error(`[preflight] details:`, details);
  }
  process.exitCode = 1;
}

function warn(message, details = {}) {
  console.warn(`[preflight] WARN: ${message}`);
  if (Object.keys(details).length) {
    console.warn(`[preflight] details:`, details);
  }
}

async function checkCore() {
  const coreBase = (env('DAILEY_CORE_URL', 'https://core.dailey.cloud') || '').replace(/\/$/, '');
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(`${coreBase}/health`, { signal: ac.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return fail('DAILEY CORE /health not OK', { status: res.status, url: `${coreBase}/health` });
  } catch (err) {
    return fail('Cannot reach DAILEY CORE', { url: `${coreBase}/health`, error: err?.message });
  }

  const jwksUrl = env('CORE_JWKS_URL', config.jwt.jwksUrl);
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(jwksUrl, { signal: ac.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    const body = await res.json();
    if (!Array.isArray(body?.keys) || body.keys.length === 0) {
      return fail('Invalid JWKS response', { jwksUrl });
    }
  } catch (err) {
    return fail('Cannot fetch JWKS', { jwksUrl, error: err?.message });
  }
}

async function checkS3() {
  if (config.storage.type !== 's3') {
    warn('Storage type is not s3; skipping S3 checks', { storageType: config.storage.type });
    return;
  }

  const bucket = config.storage.s3.bucket;
  const region = config.storage.s3.region;
  const endpoint = config.storage.s3.endpoint;
  const accessKeyId = config.storage.s3.accessKeyId;
  const secretAccessKey = config.storage.s3.secretAccessKey;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return fail('Missing S3 configuration', { bucket, region, endpoint, hasKey: Boolean(accessKeyId), hasSecret: Boolean(secretAccessKey) });
  }

  const s3 = new S3Client({
    ...(endpoint ? { endpoint } : {}),
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: config.storage.s3.forcePathStyle,
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    // Some providers forbid HeadBucket; try a lightweight ListObjects
    try {
      await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    } catch (listErr) {
      return fail('S3 access test failed', { error: listErr?.message });
    }
  }
}

async function checkWebEnv() {
  // Validate that production frontend env uses HTTPS and approved domains
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.resolve(here, '../../web/.env.production');
    let text;
    try {
      text = await fs.readFile(envPath, 'utf8');
    } catch (err) {
      // If web directory not present, skip
      return;
    }

    const kv = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) kv[m[1]] = m[2].trim();
    }

    const coreUrl = kv.VITE_CORE_AUTH_URL || '';
    const apiUrl = kv.VITE_MEDIA_API_URL || '';

    const isHttps = (u) => /^https:\/\//i.test(u);
    const isIP = (u) => /https?:\/\/(\d{1,3}\.){3}\d{1,3}(?::\d+)?(\/|$)/.test(u);
    const hasTypo = (u) => /dailey-cloud/i.test(u);
    const badProto = (u) => /^http:\/\//i.test(u);
    const allowedDomain = (u) => /https:\/\/([a-z0-9-]+\.)*dailey\.cloud(\/|$)/i.test(u);

    const problems = [];
    if (!coreUrl || !apiUrl) {
      problems.push('Missing VITE_CORE_AUTH_URL or VITE_MEDIA_API_URL');
    }
    if (coreUrl && (!isHttps(coreUrl) || badProto(coreUrl) || isIP(coreUrl) || hasTypo(coreUrl) || !allowedDomain(coreUrl))) {
      problems.push(`Invalid VITE_CORE_AUTH_URL: ${coreUrl}`);
    }
    if (apiUrl && (!isHttps(apiUrl) || badProto(apiUrl) || isIP(apiUrl) || hasTypo(apiUrl) || !allowedDomain(apiUrl))) {
      problems.push(`Invalid VITE_MEDIA_API_URL: ${apiUrl}`);
    }

    if (problems.length) {
      return fail('Frontend production env invalid', { envPath, problems, VITE_CORE_AUTH_URL: coreUrl, VITE_MEDIA_API_URL: apiUrl });
    }
  } catch (err) {
    return fail('Error checking frontend env', { error: err?.message });
  }
}

function checkProcessSettings() {
  if (config.isProduction && String(config.port) !== '4100') {
    return fail('PORT must be 4100 in production to match Nginx', { port: config.port });
  }
}

export async function runPreflight(opts = {}) {
  console.log('[preflight] Starting Dailey Media API preflight checks...');
  checkProcessSettings();
  await checkWebEnv();
  await checkCore();
  await checkS3();
  if (process.exitCode === 1 && opts.strict !== false) {
    throw new Error('Preflight failed');
  }
  console.log('[preflight] All critical checks passed');
}

// If invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPreflight({ strict: true }).catch((err) => {
    console.error('[preflight] Aborting start:', err?.message || err);
    process.exit(1);
  });
}
