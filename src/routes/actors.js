import express from 'express';
import { authenticateToken } from '../middleware/dailey-auth.js';
import storageService from '../services/storageService.js';
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

async function buildMinimalActorProfile(actorId, viewer) {
  try {
    const id = actorId;
    const name = viewer?.id === id && (viewer?.name || viewer?.email) ? (viewer.name || viewer.email) : `Actor ${String(id).slice(0, 8)}`;

    const candidateBuckets = ['castingly-public', 'castingly-private', 'public', 'private', 'default'];
    const candidateHeadshotFolders = [
      `actors/${id}/headshots`,
      `actors/${id}/avatars`,
      `actors/${id}`
    ];
    const candidateResumeFolders = [
      `actors/${id}/resumes`,
      `actors/${id}/resume`,
      `actors/${id}/documents`
    ];

    let headshots = [];
    let avatarUrl = null;
    let resumeKey = null;

    for (const bucketId of candidateBuckets) {
      // Headshots first
      for (const folder of candidateHeadshotFolders) {
        try {
          const items = await storageService.listBucketFolder(id, bucketId, folder);
          const images = (items || []).filter(it => it && it.is_folder === false && String(it.mime_type || '').startsWith('image/'));
          if (images.length) {
            // Prefer public url, otherwise signed
            headshots = images.map(img => img.public_url || img.signed_url || null).filter(Boolean);
            if (!avatarUrl) {
              avatarUrl = headshots[0] || null;
            }
            break;
          }
        } catch (_) { /* try next folder */ }
      }
      if (headshots.length) break;
    }

    for (const bucketId of candidateBuckets) {
      for (const folder of candidateResumeFolders) {
        try {
          const items = await storageService.listBucketFolder(id, bucketId, folder);
          const pdf = (items || []).find(it => it && it.is_folder === false && String(it.mime_type || '').includes('pdf'));
          if (pdf) {
            resumeKey = pdf.storage_key;
            break;
          }
        } catch (_) { /* ignore */ }
      }
      if (resumeKey) break;
    }

    const resumeUrl = resumeKey ? `/api/media/proxy?key=${encodeURIComponent(resumeKey)}` : null;

    return {
      success: true,
      fallback: true,
      actor: {
        id,
        name,
        display_name: name,
        email: viewer?.id === id ? (viewer?.email || null) : null,
        avatar_url: avatarUrl,
        headshots,
        resume_url: resumeUrl
      }
    };
  } catch (error) {
    logError(error, { context: 'actors.minimalProfile', actorId });
    return { success: false, fallback: true, actor: null };
  }
}

// GET /api/actors/:id
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const coreBase = getCoreBaseUrl();
    const authHeader = req.headers.authorization ? { Authorization: req.headers.authorization } : {};

    // Try Core under common path conventions
    const candidates = [
      `${coreBase}/api/actors/${encodeURIComponent(id)}`,
      `${coreBase}/actors/${encodeURIComponent(id)}`
    ];

    for (const url of candidates) {
      try {
        const { ok, status, data } = await tryFetchJson(url, authHeader);
        if (ok) {
          logInfo('Actors proxy served from CORE', { url, id });
          return res.status(200).json(data);
        }
        if (status && status !== 404) {
          // Non-404 error from CORE: bubble through status and message if available
          if (data) return res.status(status).json(data);
          return res.status(status).json({ success: false, error: 'Upstream error', status });
        }
      } catch (e) {
        // Network or parse error: continue to next candidate
      }
    }

    // Fallback: build a minimal profile from storage
    const minimal = await buildMinimalActorProfile(id, req.user);
    if (minimal && minimal.actor) {
      logInfo('Actors endpoint served minimal fallback', { id });
      return res.status(200).json(minimal);
    }

    return res.status(404).json({ success: false, error: 'Actor not found' });
  } catch (error) {
    logError(error, { context: 'actors.getById', id });
    return res.status(500).json({ success: false, error: 'Failed to retrieve actor' });
  }
});

export default router;

