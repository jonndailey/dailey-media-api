import { logInfo, logError } from './logger.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/index.js';

// Prefer production hostname by default to avoid localhost fallbacks in prod
const DAILEY_CORE_URL = (process.env.DAILEY_CORE_URL || 'https://core.dailey.cloud').replace(/\/$/, '');
const AUTH_LOG_DETAILS = String(process.env.AUTH_LOG_DETAILS || '').toLowerCase() === 'true' || process.env.AUTH_LOG_DETAILS === '1';

function debugAuth(message, context = {}) {
  if (AUTH_LOG_DETAILS) {
    logInfo(message, context);
  }
}

// Rate limiting store (in-memory for development)
const rateLimitStore = new Map();

export const authenticateToken = async (req, res, next) => {
  const token = extractToken(req);
  try {
    // Skip authentication in development if DISABLE_AUTH is true
    if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'development') {
      // Set default test user data
      req.user = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User'
      };
      req.userRoles = ['user', 'api.write', 'api.read', 'analytics.viewer'];
      req.userTenants = [];
      req.userId = 'test-user-id';
      req.appId = 'dailey-media-api';
      return next();
    }

    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please provide a valid authentication token in the Authorization header'
      });
    }

    // Prefer local JWT verification via JWKS (fast path, no network)
    try {
      const local = await verifyLocallyWithJwks(token);
      if (local && local.valid) {
        req.user = local.user;
        req.userRoles = local.roles || [];
        req.userTenants = local.tenants || [];
        req.userId = local.user?.id;
        req.appId = local.appId || 'dailey-media-api';
        debugAuth('User authenticated via JWKS', { userId: req.userId });
        return next();
      }
    } catch (e) {
      // Continue to CORE validation as a fallback
      debugAuth('Local JWKS verification failed, falling back to CORE', { message: e?.message });
    }

    // Fallback: Validate token with DAILEY CORE
    const authResponse = await fetch(`${DAILEY_CORE_URL}/auth/validate`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'X-Application': 'Dailey Media API',
        'X-App-Name': 'Dailey Media API'
      }
    });

    if (!authResponse.ok) {
      debugAuth('Token validation failed', {
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
    // Derive appId from token claims if available (aud/app_id), fallback to default
    try {
      const decoded = jwt.decode(token) || {};
      let appId = decoded.app_id || null;
      const aud = decoded.aud;
      if (!appId) {
        if (Array.isArray(aud)) appId = aud[0];
        else if (typeof aud === 'string') appId = aud;
      }
      req.appId = appId || 'dailey-media-api';
    } catch (_) {
      req.appId = 'dailey-media-api';
    }

    debugAuth('User authenticated via CORE validate', {
      userId: userData.user?.id,
      email: userData.user?.email,
      roles: userData.roles
    });

    next();

  } catch (error) {
    logError(error, { context: 'auth.authenticateToken' });
    // On failure to validate (network error or otherwise), respond 401 instead of 5xx
    // to avoid surfacing generic 500s to clients when auth is down.
    return res.status(401).json({
      success: false,
      error: 'Invalid or unverifiable token',
      message: 'Authentication failed. Please sign in again.'
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

// Simple in-memory JWKS cache
let cachedJwks = null;
let jwksFetchedAt = 0;
const JWKS_TTL_MS = 10 * 60 * 1000;

async function fetchJwks() {
  const now = Date.now();
  if (cachedJwks && (now - jwksFetchedAt) < JWKS_TTL_MS) {
    return cachedJwks;
  }
  const url = process.env.CORE_JWKS_URL || config.jwt.jwksUrl;
  const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) throw new Error(`Failed to fetch JWKS: ${resp.status}`);
  const data = await resp.json();
  if (!data || !Array.isArray(data.keys)) throw new Error('Invalid JWKS');
  cachedJwks = data;
  jwksFetchedAt = now;
  debugAuth('JWKS fetched', { keys: Array.isArray(cachedJwks.keys) ? cachedJwks.keys.map(k => ({ kid: k.kid, kty: k.kty, use: k.use })) : [] });
  return cachedJwks;
}

function findJwkForKid(jwks, kid) {
  if (kid) {
    const k = jwks.keys.find(k => k.kid === kid);
    if (k) return k;
  }
  // fallback to first RSA key
  return jwks.keys.find(k => k.kty === 'RSA') || null;
}

async function verifyLocallyWithJwks(token) {
  if (!token) return null;
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header) return null;
  const { kid, alg } = decoded.header;
  const jwks = await fetchJwks();
  const jwk = findJwkForKid(jwks, kid);
  if (!jwk) throw new Error('No matching JWK');
  // Convert JWK to PEM using Node crypto
  const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const pem = keyObject.export({ type: 'spki', format: 'pem' });
  // Allow multiple issuers/audiences for compatibility with Core
  const allowedIssuers = [
    process.env.JWT_ISSUER,
    process.env.CORE_ISSUER,
    config.jwt.issuer,
    'https://core.dailey.cloud',
    'dailey-core-auth'
  ].filter(Boolean);
  const audienceList = [];
  const envAud = process.env.JWT_AUDIENCE || config.jwt.audience;
  if (envAud) audienceList.push(...String(envAud).split(',').map(s => s.trim()).filter(Boolean));
  if (process.env.CORE_APP_ID) audienceList.push(process.env.CORE_APP_ID);
  if (process.env.CORE_AUDIENCE) audienceList.push(...String(process.env.CORE_AUDIENCE).split(',').map(s => s.trim()).filter(Boolean));
  // sensible defaults
  audienceList.push('dailey-media-api');
  const allowedAudiences = Array.from(new Set(audienceList));

  debugAuth('Attempting local JWT verify', {
    kid,
    alg: alg || 'RS256',
    allowedIssuers,
    allowedAudiences
  });

  let verified;
  try {
    verified = jwt.verify(token, pem, {
      algorithms: [alg || 'RS256'],
      issuer: allowedIssuers,
      audience: allowedAudiences,
      clockTolerance: 5 // seconds of clock skew tolerance
    });
  } catch (e) {
    // Include selected header fields for easier diagnosis
    const hdr = decoded && decoded.header ? { kid: decoded.header.kid, alg: decoded.header.alg } : {};
    const pl = decoded && decoded.payload ? { iss: decoded.payload.iss, aud: decoded.payload.aud, iat: decoded.payload.iat, exp: decoded.payload.exp } : {};
    debugAuth('Local JWT verify failed', { error: e?.message, header: hdr, payload: pl, allowedIssuers, allowedAudiences });
    // Optional relaxed audience mode: if enabled, accept any Core-issued token (signature + issuer only)
    const allowAnyAud = String(process.env.ALLOW_CORE_ANY_AUD || '').toLowerCase() === 'true';
    if (allowAnyAud) {
      try {
        verified = jwt.verify(token, pem, {
          algorithms: [alg || 'RS256'],
          issuer: allowedIssuers,
          clockTolerance: 5
        });
        debugAuth('Local JWT verify succeeded with relaxed audience', { header: hdr, payload: pl });
      } catch (e2) {
        debugAuth('Relaxed verify also failed', { error: e2?.message });
        throw e;
      }
    } else {
      throw e;
    }
  }
  // Map minimal user data
  const user = {
    id: verified.sub || verified.user_id || verified.uid || null,
    email: verified.email || null,
    name: verified.name || (verified.email ? verified.email.split('@')[0] : null)
  };
  const roles = Array.isArray(verified.roles) ? verified.roles : [];
  const tenants = Array.isArray(verified.tenants) ? verified.tenants : [];
  // appId from claims (aud/app_id)
  let appId = verified.app_id || null;
  const aud = verified.aud;
  if (!appId) {
    if (Array.isArray(aud)) appId = aud[0];
    else if (typeof aud === 'string') appId = aud;
  }
  return { valid: true, user, roles, tenants, appId };
}

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
    // Include generic 'admin' to accommodate tokens that grant broad admin
    // without the more granular role names.
    'upload': ['user', 'api.write', 'core.admin', 'tenant.admin', 'admin'],
    'read': ['user', 'api.read', 'api.write', 'core.admin', 'tenant.admin', 'admin'],
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
      // Try local verification first
      try {
        const local = await verifyLocallyWithJwks(token);
        if (local && local.valid) {
          req.user = local.user;
          req.userRoles = local.roles || [];
          req.userTenants = local.tenants || [];
          req.userId = local.user?.id;
          req.appId = local.appId || 'dailey-media-api';
        } else {
          // Fall back to CORE validate (best-effort)
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
              try {
                const decoded = jwt.decode(token) || {};
                let appId = decoded.app_id || null;
                const aud = decoded.aud;
                if (!appId) {
                  if (Array.isArray(aud)) appId = aud[0];
                  else if (typeof aud === 'string') appId = aud;
                }
                req.appId = appId || 'dailey-media-api';
              } catch (_) {
                req.appId = 'dailey-media-api';
              }
            }
          }
        }
      } catch (e) {
        // Ignore optional auth failures
      }
    }

    next();
  } catch (error) {
    // Do not fail the request if optional auth cannot reach CORE
    logError(error, { context: 'auth.optionalAuth' });
    next();
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
    // Core exposes a lightweight /health endpoint
    const response = await fetch(`${DAILEY_CORE_URL}/health`, { headers: { 'Accept': 'application/json' } });
    return response.ok;
  } catch (error) {
    logError(error, { context: 'auth.healthCheck' });
    return false;
  }
};
