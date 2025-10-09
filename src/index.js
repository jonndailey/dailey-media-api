import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/index.js';
import healthRoutes from './routes/health.js';
import mediaRoutes from './routes/media.js';
import filesRoutes from './routes/files.js';
import uploadRoutes from './routes/upload.js';
// import apiKeyRoutes from './routes/apiKeys.js'; // Replaced by DAILEY CORE auth
import analyticsRoutes from './routes/analytics.js';
import { errorHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';
import databaseService from './services/databaseService.js';
import analyticsService from './services/analyticsService.js';

const app = express();

// Initialize database service
await databaseService.initialize();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.isDevelopment ? true : process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan(config.isDevelopment ? 'dev' : 'combined'));
app.use(requestLogger);

// API routes
app.use('/health', healthRoutes);
// app.use('/api/keys', apiKeyRoutes); // Replaced by DAILEY CORE auth
app.use('/api/files', filesRoutes);  // New comprehensive files endpoint
app.use('/api/media', mediaRoutes);   // Kept for backwards compatibility
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);  // Analytics and stats

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Dailey Storage API',
    version: '2.0.0',
    description: 'Universal file storage API for the DAILEY ecosystem',
    endpoints: {
      health: '/health',
      files: '/api/files',     // All file types
      media: '/api/media',     // Legacy media endpoint
      upload: '/api/upload',   // Upload any file type
      analytics: '/api/analytics'  // Usage statistics
    },
    features: [
      'Accepts ALL file types',
      'Image processing and thumbnails',
      'File categorization',
      'Metadata extraction',
'DAILEY CORE authentication & RBAC'
    ],
    timestamp: new Date().toISOString()
  });
});

// Development debug endpoint for auth service status
if (config.isDevelopment) {
  app.get('/debug/auth-status', async (req, res) => {
    try {
      const { checkAuthServiceHealth } = await import('./middleware/dailey-auth.js');
      const isHealthy = await checkAuthServiceHealth();
      res.json({
        success: true,
        dailey_core_status: isHealthy ? 'healthy' : 'unavailable',
        auth_service_url: process.env.DAILEY_CORE_URL || 'http://localhost:3002',
        message: 'This endpoint is only available in development mode'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to check auth service status',
        details: error.message
      });
    }
  });
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, config.host, () => {
  console.log(`🚀 Dailey Media API listening on http://${config.host}:${config.port}`);
  console.log(`📡 Environment: ${config.nodeEnv}`);
  console.log(`💾 Storage type: ${config.storage.type}`);
  
  if (config.isDevelopment) {
    console.log(`🔗 Tailscale accessible at http://100.105.97.19:${config.port}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

export default app;