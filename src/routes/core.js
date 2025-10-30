import express from 'express';
import { logError } from '../middleware/logger.js';

const router = express.Router();

// Lightweight proxy health for DAILEY CORE (avoids browser CORS)
// Uses DAILEY_CORE_URL when provided, otherwise defaults to production hostname.
router.get('/health', async (req, res) => {
  try {
    const base = (process.env.DAILEY_CORE_URL || 'https://core.dailey.cloud').replace(/\/$/, '');
    const response = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });
    if (!response.ok) {
      return res.status(200).json({ status: 'unhealthy', code: response.status });
    }
    let data = null;
    try { data = await response.json(); } catch (_) { /* ignore */ }
    const healthy = data?.status === 'healthy' || response.ok;
    res.json({ status: healthy ? 'healthy' : 'unhealthy' });
  } catch (error) {
    logError(error, { context: 'core.proxy.health' });
    res.status(200).json({ status: 'unhealthy' });
  }
});

export default router;
