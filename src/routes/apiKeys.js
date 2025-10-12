import express from 'express';
import apiKeyService from '../services/apiKeyService.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { optionalAuth } from '../middleware/dailey-auth.js';
import { logInfo, logError } from '../middleware/logger.js';

const ADMIN_ROLES = ['core.admin', 'tenant.admin'];
const WRITE_ROLES = [...ADMIN_ROLES, 'api.write'];
const READ_ROLES = [...WRITE_ROLES, 'api.read'];

async function authenticateKeyOrToken(req, res, next) {
  try {
    await new Promise((resolve) => optionalAuth(req, res, resolve));
    if (req.user) {
      req.authType = 'token';
      return next();
    }

    authenticateApiKey(req, res, (err) => {
      if (err) {
        return next(err);
      }
      req.authType = 'api-key';
      next();
    });
  } catch (error) {
    logError(error, { context: 'apiKeys.auth' });
    res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
}

function hasRequiredRole(req, roles = []) {
  return (req.userRoles || []).some((role) => roles.includes(role));
}

function ensureReadAccess(req, res, next) {
  if (req.authType === 'token') {
    if (!hasRequiredRole(req, READ_ROLES)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: 'You need API Read or Admin access to view keys'
      });
    }
    return next();
  }

  if (req.apiKey) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Authentication required'
  });
}

function ensureWriteAccess(req, res, next) {
  if (req.authType === 'token') {
    if (!hasRequiredRole(req, WRITE_ROLES)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: 'You need API Write or Admin access to manage keys'
      });
    }
    return next();
  }

  if (req.apiKey && apiKeyService.hasPermission(req.apiKey, 'write')) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Insufficient permissions'
  });
}

function deriveActor(req) {
  const userId = req.userId || req.apiKey?.userId;
  const appId = req.appId || req.apiKey?.appId || 'dailey-media-api';
  return { userId, appId };
}

const router = express.Router();

// Get all API keys for the authenticated user
router.get('/', authenticateKeyOrToken, ensureReadAccess, async (req, res) => {
  try {
    const { limit, offset, include_inactive } = req.query;
    const { userId } = deriveActor(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const result = await apiKeyService.listApiKeys(userId, {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      includeInactive: include_inactive === 'true'
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    logError(error, { context: 'apiKeys.list', userId: req.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve API keys'
    });
  }
});

// Get specific API key details
router.get('/:keyId', authenticateKeyOrToken, ensureReadAccess, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { userId } = deriveActor(req);

    const keyData = await apiKeyService.getApiKey(keyId, userId);
    
    if (!keyData) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    res.json({
      success: true,
      key: keyData
    });

  } catch (error) {
    logError(error, { context: 'apiKeys.get', keyId: req.params.keyId, userId: req.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve API key'
    });
  }
});

// Create a new API key
router.post('/', authenticateKeyOrToken, ensureWriteAccess, async (req, res) => {
  try {
    const {
      name,
      permissions = ['read'],
      scopes = ['media'],
      rateLimit,
      expiresAt,
      metadata = {}
    } = req.body;

    const { userId, appId } = deriveActor(req);

    if (!userId || !appId) {
      return res.status(400).json({
        success: false,
        error: 'Unable to determine owner for API key'
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    // Validate permissions
    const allowedPermissions = ['read', 'write', 'admin'];
    if (!permissions.every(p => allowedPermissions.includes(p))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid permissions. Allowed: ' + allowedPermissions.join(', ')
      });
    }

    // Validate scopes
    const allowedScopes = ['upload', 'media', 'transform', '*'];
    if (!scopes.every(s => allowedScopes.includes(s))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid scopes. Allowed: ' + allowedScopes.join(', ')
      });
    }

    // Validate expiration date
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Expiration date must be in the future'
      });
    }

    const createdBy = req.authType === 'token'
      ? (req.user?.email || req.user?.id || 'unknown-user')
      : req.apiKey?.id;

    const newKey = await apiKeyService.createApiKey({
      name,
      userId,
      appId,
      permissions,
      scopes,
      rateLimit: rateLimit || { maxRequests: 100, windowMs: 15 * 60 * 1000 },
      expiresAt,
      metadata: {
        ...metadata,
        createdBy,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }
    });

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      key: newKey,
      warning: 'Store this API key securely. It will not be shown again.'
    });

  } catch (error) {
    logError(error, { context: 'apiKeys.create', userId: req.userId, body: req.body });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create API key'
    });
  }
});

// Update an existing API key
router.put('/:keyId', authenticateKeyOrToken, ensureWriteAccess, async (req, res) => {
  try {
    const { keyId } = req.params;
    const updates = req.body;
    const { userId } = deriveActor(req);

    // Remove fields that shouldn't be updated via this endpoint
    delete updates.key;
    delete updates.id;
    delete updates.userId;
    delete updates.appId;
    delete updates.createdAt;
    delete updates.usageCount;

    const updatedKey = await apiKeyService.updateApiKey(keyId, userId, updates);

    res.json({
      success: true,
      message: 'API key updated successfully',
      key: updatedKey
    });

  } catch (error) {
    logError(error, { context: 'apiKeys.update', keyId: req.params.keyId, userId: req.userId });
    
    if (error.message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }
    
    if (error.message === 'Permission denied') {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update API key'
    });
  }
});

// Delete an API key
router.delete('/:keyId', authenticateKeyOrToken, ensureWriteAccess, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { userId } = deriveActor(req);

    const result = await apiKeyService.deleteApiKey(keyId, userId);

    res.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    logError(error, { context: 'apiKeys.delete', keyId: req.params.keyId, userId: req.userId });
    
    if (error.message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }
    
    if (error.message === 'Permission denied') {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    if (error.message.includes('Cannot delete default')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

// Get usage statistics for an API key
router.get('/:keyId/usage', authenticateApiKey, async (req, res) => {
  try {
    const { keyId } = req.params;

    const usage = await apiKeyService.getUsageStats(keyId, req.userId);

    res.json({
      success: true,
      usage
    });

  } catch (error) {
    logError(error, { context: 'apiKeys.usage', keyId: req.params.keyId, userId: req.userId });
    
    if (error.message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }
    
    if (error.message === 'Permission denied') {
      return res.status(403).json({
        success: false,
        error: 'Permission denied'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to get usage statistics'
    });
  }
});

// Validate an API key (public endpoint for testing)
router.post('/validate', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    const validation = await apiKeyService.validateApiKey(apiKey);

    if (validation.valid) {
      res.json({
        success: true,
        valid: true,
        message: 'API key is valid',
        keyInfo: {
          id: validation.keyData.id,
          name: validation.keyData.name,
          permissions: validation.keyData.permissions,
          scopes: validation.keyData.scopes
        }
      });
    } else {
      res.status(401).json({
        success: false,
        valid: false,
        error: validation.error
      });
    }

  } catch (error) {
    logError(error, { context: 'apiKeys.validate' });
    res.status(500).json({
      success: false,
      error: 'Failed to validate API key'
    });
  }
});

export default router;
