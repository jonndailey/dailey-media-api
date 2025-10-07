import { nanoid } from 'nanoid';
import config from '../config/index.js';

export function requestLogger(req, res, next) {
  // Generate unique request ID
  req.id = nanoid(10);
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.id);
  
  // Log request start
  const startTime = Date.now();
  
  console.log(`[${req.id}] ${req.method} ${req.originalUrl} - Started`);
  
  // Override res.end to log completion
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    console.log(`[${req.id}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    originalEnd.apply(this, args);
  };
  
  next();
}

export function logError(error, context = {}) {
  const logEntry = {
    level: 'error',
    timestamp: new Date().toISOString(),
    message: error.message,
    stack: error.stack,
    ...context
  };
  
  console.error(JSON.stringify(logEntry));
}

export function logInfo(message, context = {}) {
  const logEntry = {
    level: 'info',
    timestamp: new Date().toISOString(),
    message,
    ...context
  };
  
  console.log(JSON.stringify(logEntry));
}

export function logWarning(message, context = {}) {
  const logEntry = {
    level: 'warning',
    timestamp: new Date().toISOString(),
    message,
    ...context
  };
  
  console.warn(JSON.stringify(logEntry));
}