import { logInfo, logError } from './logger.js';

const DAILEY_CORE_URL = process.env.DAILEY_CORE_URL || 'http://localhost:3002';

// Rate limiting store (in-memory for development)
const rateLimitStore = new Map();

export const authenticateToken = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please provide a valid authentication token in the Authorization header'
      });
    }

    // Validate token with DAILEY CORE
    const authResponse = await fetch(`${DAILEY_CORE_URL}/auth/validate`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'X-Application': 'Dailey Media API',
        'X-App-Name': 'Dailey Media API'
      }
    });

    if (!authResponse.ok) {
      logInfo('Token validation failed', { 
        status: authResponse.status,
        statusText: authResponse.statusText
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Token validation failed'
      });
    }

    const userData = await authResponse.json();
    
    if (!userData.valid) {
      logInfo('Token validation returned invalid', { 
        tokenPrefix: token.substring(0, 10) + '...'
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Token is not valid'
      });
    }

    // Check rate limiting based on user ID
    const userId = userData.user?.id;
    if (userId) {
      const rateLimitResult = await checkRateLimit(userId, {
        maxRequests: 1000, // 1000 requests per hour
        windowMs: 60 * 60 * 1000 // 1 hour
      });
      
      if (!rateLimitResult.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Limit: 1000 per hour`,
          retryAfter: Math.ceil(rateLimitResult.resetTime / 1000)
        });
      }
    }

    // Attach user data to request
    req.user = userData.user;
    req.userRoles = userData.roles || [];
    req.userTenants = userData.tenants || [];
    req.userId = userData.user?.id;
    req.appId = 'dailey-media-api'; // Default app ID for this service

    logInfo('User authenticated successfully', {
      userId: userData.user?.id,
      email: userData.user?.email,
      roles: userData.roles
    });

    next();

  } catch (error) {
    logError(error, { context: 'auth.authenticateToken' });
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.userRoles) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!req.userRoles.includes(role)) {
      logInfo('Role access denied', {
        userId: req.user?.id,
        requiredRole: role,
        userRoles: req.userRoles
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `This operation requires '${role}' role`,
        required: role,
        user_roles: req.userRoles
      });
    }

    next();
  };
};

export const requireAnyRole = (roles) => {
  return (req, res, next) => {
    if (!req.userRoles) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const hasAccess = roles.some(role => req.userRoles.includes(role));
    
    if (!hasAccess) {
      logInfo('Role access denied', {
        userId: req.user?.id,
        requiredRoles: roles,
        userRoles: req.userRoles
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `This operation requires one of: ${roles.join(', ')}`,
        required_any: roles,
        user_roles: req.userRoles
      });
    }

    next();
  };
};

// Scope-based authorization (mapped from roles)
export const requireScope = (scope) => {
  const scopeRoleMap = {
    'upload': ['user', 'api.write', 'core.admin', 'tenant.admin'],
    'read': ['user', 'api.read', 'api.write', 'core.admin', 'tenant.admin'],
    'admin': ['core.admin', 'tenant.admin', 'user.admin'],
    'analytics': ['core.admin', 'tenant.admin', 'analytics.viewer']
  };

  const requiredRoles = scopeRoleMap[scope] || [scope];
  return requireAnyRole(requiredRoles);
};

// Optional authentication - doesn't fail if no token provided
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const authResponse = await fetch(`${DAILEY_CORE_URL}/auth/validate`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Application': 'Dailey Media API'
        }
      });
      
      if (authResponse.ok) {
        const userData = await authResponse.json();
        
        if (userData.valid) {
          req.user = userData.user;
          req.userRoles = userData.roles || [];
          req.userTenants = userData.tenants || [];
          req.userId = userData.user?.id;
          req.appId = 'dailey-media-api';
        }
      }
    }

    next();
  } catch (error) {
    logError(error, { context: 'auth.optionalAuth' });
    next(); // Continue even if optional auth fails
  }
};

// Tenant access verification
export const requireTenantAccess = (tenantId) => {
  return (req, res, next) => {
    if (!req.userTenants) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const hasAccess = req.userTenants.some(tenant => 
      tenant.id === tenantId && tenant.membership_status === 'active'
    );
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Tenant access denied',
        tenant_id: tenantId
      });
    }
    
    next();
  };
};

function extractToken(req) {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check X-API-Key header for backward compatibility
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  // Check query parameter (less secure, for development only)
  if (req.query.token) {
    return req.query.token;
  }

  return null;
}

async function checkRateLimit(userId, rateLimit) {
  const now = Date.now();
  const windowMs = rateLimit.windowMs;
  const maxRequests = rateLimit.maxRequests;

  let keyData = rateLimitStore.get(userId);
  
  if (!keyData) {
    keyData = {
      requests: [],
      resetTime: now + windowMs
    };
    rateLimitStore.set(userId, keyData);
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

// Health check for DAILEY CORE connection
export const checkAuthServiceHealth = async () => {
  try {
    const response = await fetch(`${DAILEY_CORE_URL}/api/docs/health`);
    return response.ok;
  } catch (error) {
    logError(error, { context: 'auth.healthCheck' });
    return false;
  }
};