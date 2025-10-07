import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/index.js';
import healthRoutes from './routes/health.js';
import mediaRoutes from './routes/media.js';
import uploadRoutes from './routes/upload.js';
import { errorHandler } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';

const app = express();

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
app.use('/api/media', mediaRoutes);
app.use('/api/upload', uploadRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Dailey Media API',
    version: '1.0.0',
    description: 'Standalone media API for the DAILEY ecosystem',
    endpoints: {
      health: '/health',
      media: '/api/media',
      upload: '/api/upload'
    },
    timestamp: new Date().toISOString()
  });
});

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