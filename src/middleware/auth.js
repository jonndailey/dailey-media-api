import apiKeyService from '../services/apiKeyService.js';
import { logInfo, logError } from './logger.js';

// Rate limiting store (in-memory for development)
const rateLimitStore = new Map();

export const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = extractApiKey(req);
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
        message: 'Please provide a valid API key in the Authorization header or X-API-Key header'
      });
    }

    const validation = await apiKeyService.validateApiKey(apiKey);
    
    if (!validation.valid) {
      logInfo('API key validation failed', { 
        error: validation.error,
        keyPrefix: apiKey.substring(0, 10) + '...'
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        message: validation.error
      });
    }

    // Check rate limiting
    const rateLimitResult = await checkRateLimit(apiKey, validation.keyData.rateLimit);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${validation.keyData.rateLimit.maxRequests} per ${validation.keyData.rateLimit.windowMs / 1000} seconds`,
        retryAfter: Math.ceil(rateLimitResult.resetTime / 1000)
      });
    }

    // Attach key data to request
    req.apiKey = validation.keyData;
    req.userId = validation.keyData.userId;
    req.appId = validation.keyData.appId;

    logInfo('API key authenticated successfully', {
      keyId: validation.keyData.id,
      userId: validation.keyData.userId,
      appId: validation.keyData.appId
    });

    next();

  } catch (error) {
    logError(error, { context: 'auth.authenticateApiKey' });
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!apiKeyService.hasPermission(req.apiKey, permission)) {
      logInfo('Permission denied', {
        keyId: req.apiKey.id,
        requiredPermission: permission,
        userPermissions: req.apiKey.permissions
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `This operation requires '${permission}' permission`
      });
    }

    next();
  };
};

export const requireScope = (scope) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!apiKeyService.hasScope(req.apiKey, scope)) {
      logInfo('Scope access denied', {
        keyId: req.apiKey.id,
        requiredScope: scope,
        userScopes: req.apiKey.scopes
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient scope access',
        message: `This operation requires '${scope}' scope access`
      });
    }

    next();
  };
};

// Optional authentication - doesn't fail if no key provided
export const optionalAuth = async (req, res, next) => {
  try {
    const apiKey = extractApiKey(req);
    
    if (apiKey) {
      const validation = await apiKeyService.validateApiKey(apiKey);
      
      if (validation.valid) {
        req.apiKey = validation.keyData;
        req.userId = validation.keyData.userId;
        req.appId = validation.keyData.appId;
      }
    }

    next();
  } catch (error) {
    logError(error, { context: 'auth.optionalAuth' });
    next(); // Continue even if optional auth fails
  }
};

function extractApiKey(req) {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check X-API-Key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  // Check query parameter (less secure, for development only)
  if (req.query.api_key) {
    return req.query.api_key;
  }

  return null;
}

async function checkRateLimit(apiKey, rateLimit) {
  const now = Date.now();
  const windowMs = rateLimit.windowMs;
  const maxRequests = rateLimit.maxRequests;

  let keyData = rateLimitStore.get(apiKey);
  
  if (!keyData) {
    keyData = {
      requests: [],
      resetTime: now + windowMs
    };
    rateLimitStore.set(apiKey, keyData);
  }

  // Remove old requests outside the window
  keyData.requests = keyData.requests.filter(timestamp => timestamp > now - windowMs);

  // Check if limit exceeded
  if (keyData.requests.length >= maxRequests) {
    const oldestRequest = Math.min(...keyData.requests);
    const resetTime = oldestRequest + windowMs;
    
    return {
      allowed: false,
      resetTime: resetTime
    };
  }

  // Add current request
  keyData.requests.push(now);

  return {
    allowed: true,
    remaining: maxRequests - keyData.requests.length,
    resetTime: keyData.resetTime
  };
}

// Cleanup old rate limit data periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetTime < now - (24 * 60 * 60 * 1000)) { // 24 hours old
      rateLimitStore.delete(key);
    }
  }
}, 60 * 60 * 1000); // Run every hour