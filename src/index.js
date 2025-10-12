import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import config from './config/index.js';
import { specs } from './config/swagger.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import mediaRoutes from './routes/media.js';
import filesRoutes from './routes/files.js';
import uploadRoutes from './routes/upload.js';
import bucketsRoutes from './routes/buckets.js';
import apiKeyRoutes from './routes/apiKeys.js';
import analyticsRoutes from './routes/analytics.js';
import serveRoutes from './routes/serve.js';
import { errorHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';
import databaseService from './services/databaseService.js';
import analyticsService from './services/analyticsService.js';
import {
  securityHeaders,
  generalRateLimit,
  authRateLimit,
  apiRateLimit,
  uploadSpeedLimit,
  parameterPollution,
  compressionMiddleware,
  xssProtection,
  corsOptions,
  securityLogger,
  forceHTTPS
} from './middleware/security.js';

const app = express();

// Initialize database service
await databaseService.initialize();

// Force HTTPS in production
app.use(forceHTTPS);

// Security middleware stack
app.use(securityHeaders);
app.use(compressionMiddleware);
app.use(cors(corsOptions));
app.use(parameterPollution);
app.use(xssProtection);

// Rate limiting
app.use('/api/auth', authRateLimit);
app.use('/api/upload', uploadSpeedLimit);
app.use('/api', apiRateLimit);
app.use(generalRateLimit);

// Body parsing middleware with security limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook verification if needed
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(securityLogger);
app.use(requestLogger);

// API Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Dailey Media API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true
  }
}));

// API routes
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);       // Authentication and MFA
app.use('/api/keys', apiKeyRoutes);
app.use('/api/files', filesRoutes);     // New comprehensive files endpoint
app.use('/api/media', mediaRoutes);     // Kept for backwards compatibility
app.use('/api/upload', uploadRoutes);
app.use('/api/buckets', bucketsRoutes); // Bucket/folder management
app.use('/api/analytics', analyticsRoutes); // Analytics and stats
app.use('/api/serve', serveRoutes);     // File serving and public links

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Dailey Media API',
    version: '2.1.0',
    description: 'Secure, scalable media storage API for the DAILEY ecosystem',
    endpoints: {
      health: '/health',
      auth: '/api/auth',         // Authentication and MFA
      files: '/api/files',       // All file types
      media: '/api/media',       // Legacy media endpoint
      upload: '/api/upload',     // Upload any file type
      buckets: '/api/buckets',   // Bucket management
      analytics: '/api/analytics', // Usage statistics
      serve: '/api/serve'        // File serving and public links
    },
    features: [
      'Accepts ALL file types',
      'Image processing and thumbnails',
      'File categorization and metadata extraction',
      'Nested folder organization',
      'Public and private bucket support',
      'DAILEY CORE authentication & RBAC',
      'Multi-factor authentication (MFA)',
      'Rate limiting and security hardening',
      'Content serving and streaming',
      'Advanced analytics and monitoring'
    ],
    security: {
      authentication: 'Bearer JWT tokens',
      mfa: 'TOTP-based multi-factor authentication',
      rate_limiting: 'Per-user and per-endpoint',
      encryption: 'TLS 1.2+ in transit, AES-256 at rest',
      headers: 'Comprehensive security headers',
      validation: 'Input sanitization and validation'
    },
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
