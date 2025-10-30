import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import hpp from 'hpp';
import compression from 'compression';
import { body, validationResult } from 'express-validator';

// Security headers configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

// Rate limiting configuration
export const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests') => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Rate limit exceeded',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    // In some proxy topologies, X-Forwarded-For may be set even if trust proxy
    // resolution is handled elsewhere. Disable strict validation to avoid hard errors.
    validate: { xForwardedForHeader: false },
    handler: (req, res) => {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Different rate limits for different endpoints
const GENERAL_RATE_LIMIT_WINDOW_MS = parseInt(process.env.GENERAL_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10);
const GENERAL_RATE_LIMIT_MAX = parseInt(process.env.GENERAL_RATE_LIMIT_MAX || '100', 10);
const AUTH_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10);
const AUTH_RATE_LIMIT_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10);
const UPLOAD_RATE_LIMIT_WINDOW_MS = parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS || String(60 * 1000), 10);
const UPLOAD_RATE_LIMIT_MAX = parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '10', 10);
const API_RATE_LIMIT_WINDOW_MS = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || String(60 * 1000), 10);
const API_RATE_LIMIT_MAX = parseInt(process.env.API_RATE_LIMIT_MAX || '1000', 10);

export const generalRateLimit = createRateLimit(GENERAL_RATE_LIMIT_WINDOW_MS, GENERAL_RATE_LIMIT_MAX, 'Too many requests from this IP');
export const authRateLimit = createRateLimit(AUTH_RATE_LIMIT_WINDOW_MS, AUTH_RATE_LIMIT_MAX, 'Too many authentication attempts');
export const uploadRateLimit = createRateLimit(UPLOAD_RATE_LIMIT_WINDOW_MS, UPLOAD_RATE_LIMIT_MAX, 'Too many upload attempts');
export const apiRateLimit = createRateLimit(API_RATE_LIMIT_WINDOW_MS, API_RATE_LIMIT_MAX, 'API rate limit exceeded');

// Speed limiting for heavy operations
export const uploadSpeedLimit = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5,
  delayMs: () => 500,
  maxDelayMs: 20000,
  validate: { delayMs: false }
});

// HTTP Parameter Pollution protection
export const parameterPollution = hpp({
  whitelist: ['tags', 'categories', 'sort', 'fields']
});

// Compression middleware
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
});

// Input validation helpers
export const validateEmail = body('email')
  .isEmail()
  .normalizeEmail()
  .withMessage('Please provide a valid email address');

export const validatePassword = body('password')
  .isLength({ min: 8, max: 128 })
  .withMessage('Password must be between 8 and 128 characters')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character');

export const validateApiKey = body('name')
  .isLength({ min: 1, max: 100 })
  .trim()
  .escape()
  .withMessage('API key name must be between 1 and 100 characters');

export const validateBucketName = body('name')
  .isLength({ min: 1, max: 63 })
  .matches(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/)
  .withMessage('Bucket name must be 1-63 characters, start and end with alphanumeric, and contain only lowercase letters, numbers, and hyphens');

export const validateFileUpload = [
  body('bucket_id')
    .optional()
    .isLength({ min: 1, max: 63 })
    .trim()
    .escape()
    .withMessage('Bucket ID must be between 1 and 63 characters'),
  body('folder_path')
    .optional()
    .isLength({ max: 255 })
    .trim()
    .matches(/^[a-zA-Z0-9\/\-_\.]*$/)
    .withMessage('Folder path contains invalid characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .isLength({ max: 50 })
    .trim()
    .escape()
    .withMessage('Each tag must be less than 50 characters')
];

// Validation result handler
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid input data',
      details: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// XSS protection middleware (since xss-clean is deprecated)
export const xssProtection = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
        .replace(/on\w+='[^']*'/gi, '');
    }
    if (typeof value === 'object' && value !== null) {
      for (const key in value) {
        value[key] = sanitizeValue(value[key]);
      }
    }
    return value;
  };

  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }

  next();
};

// CORS configuration for production
export const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
};

// Security audit logging
export const securityLogger = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration,
      userId: req.userId || null,
      contentLength: res.get('Content-Length') || 0
    };

    // Log suspicious activity
    if (res.statusCode === 429 || res.statusCode === 403 || res.statusCode === 401) {
      console.warn('Security Event:', logData);
    }

    // Log slow requests
    if (duration > 5000) {
      console.warn('Slow Request:', logData);
    }
  });

  next();
};

// Force HTTPS in production
export const forceHTTPS = (req, res, next) => {
  const exemptPaths = ['/health', '/metrics', '/api/core/health'];
  const isExempt = exemptPaths.some(p => req.originalUrl?.startsWith(p));
  if (process.env.NODE_ENV === 'production' && !isExempt && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  next();
};

export default {
  securityHeaders,
  generalRateLimit,
  authRateLimit,
  uploadRateLimit,
  apiRateLimit,
  uploadSpeedLimit,
  parameterPollution,
  compressionMiddleware,
  validateEmail,
  validatePassword,
  validateApiKey,
  validateBucketName,
  validateFileUpload,
  handleValidationErrors,
  xssProtection,
  corsOptions,
  securityLogger,
  forceHTTPS
};
