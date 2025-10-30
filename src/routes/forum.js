import express from 'express';
import { authenticateToken } from '../middleware/dailey-auth.js';
import { logInfo, logError } from '../middleware/logger.js';

const router = express.Router();

function getCoreBaseUrl() {
  return (process.env.CASTINGLY_CORE_URL || process.env.DAILEY_CORE_URL || 'https://core.dailey.cloud').replace(/\/$/, '');
}

async function tryFetchJson(url, headers) {
  const resp = await fetch(url, { headers: { 'Accept': 'application/json', ...headers } });
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* ignore parse error */ }
  return { ok: resp.ok, status: resp.status, data };
}

// GET /api/forum/activity/:actorId?limit=5
router.get('/activity/:actorId', authenticateToken, async (req, res) => {
  const { actorId } = req.params;
  const { limit } = req.query;
  try {
    const coreBase = getCoreBaseUrl();
    const qs = typeof limit !== 'undefined' ? `?limit=${encodeURIComponent(limit)}` : '';
    const authHeader = req.headers.authorization ? { Authorization: req.headers.authorization } : {};

    const candidates = [
      `${coreBase}/api/forum/activity/${encodeURIComponent(actorId)}${qs}`,
      `${coreBase}/forum/activity/${encodeURIComponent(actorId)}${qs}`
    ];

    for (const url of candidates) {
      try {
        const { ok, status, data } = await tryFetchJson(url, authHeader);
        if (ok) {
          logInfo('Forum activity proxied from CORE', { url, actorId });
          return res.status(200).json(data);
        }
        // Non-OK status: if upstream says 401/403, bubble it; if 404 or 500, fall back gracefully
        if (status === 401 || status === 403) {
          return res.status(status).json(data || { success: false, error: 'Unauthorized' });
        }
      } catch (_) { /* try next */ }
    }

    // Graceful fallback: empty activity so the UI can render
    return res.status(200).json({ success: true, activity: [], fallback: true });
  } catch (error) {
    logError(error, { context: 'forum.activity', actorId });
    return res.status(200).json({ success: true, activity: [], fallback: true });
  }
});

export default router;

