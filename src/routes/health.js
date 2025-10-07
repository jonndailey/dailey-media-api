import express from 'express';
import config from '../config/index.js';

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: config.nodeEnv
  });
});

// Detailed health check with service dependencies
router.get('/detailed', async (req, res) => {
  const healthChecks = {
    api: 'healthy',
    database: 'unknown',
    storage: 'unknown',
    redis: 'unknown'
  };

  let overallStatus = 'healthy';

  // Database health check
  try {
    // TODO: Add database connection check
    healthChecks.database = 'healthy';
  } catch (error) {
    healthChecks.database = 'unhealthy';
    overallStatus = 'degraded';
  }

  // Storage health check
  try {
    // TODO: Add S3/storage connection check
    healthChecks.storage = 'healthy';
  } catch (error) {
    healthChecks.storage = 'unhealthy';
    overallStatus = 'degraded';
  }

  // Redis health check
  try {
    // TODO: Add Redis connection check
    healthChecks.redis = 'healthy';
  } catch (error) {
    healthChecks.redis = 'unhealthy';
    overallStatus = 'degraded';
  }

  const responseCode = overallStatus === 'healthy' ? 200 : 503;

  res.status(responseCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: config.nodeEnv,
    checks: healthChecks,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024)
    },
    config: {
      storageType: config.storage.type,
      maxFileSize: config.upload.maxFileSize,
      allowedFormats: config.upload.allowedFormats.length,
      variantSizes: Object.keys(config.upload.variantSizes)
    }
  });
});

// Readiness check for Kubernetes
router.get('/ready', (req, res) => {
  // TODO: Add checks for required services (database, storage)
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

// Liveness check for Kubernetes
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;