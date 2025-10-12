import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { logInfo, logError } from '../middleware/logger.js';

class ApiKeyService {
  constructor() {
    // In-memory storage for development (replace with database in production)
    this.apiKeys = new Map();
    this.loadDefaultKeys();
  }

  loadDefaultKeys() {
    // Create a default API key for development
    const defaultKeyValue = process.env.DEFAULT_API_KEY || 'dmapi_dev_zR0XufVsrw2EIawIwnTV9HravIRQcKtI';

    const defaultKey = {
      id: 'default',
      name: 'Default Development Key',
      key: defaultKeyValue,
      prefix: 'dmapi_dev',
      userId: 'system',
      appId: 'dailey-media-api',
      permissions: ['read', 'write', 'admin'],
      scopes: ['upload', 'media', 'files', 'transform'],
      rateLimit: {
        maxRequests: 1000,
        windowMs: 15 * 60 * 1000 // 15 minutes
      },
      isActive: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      metadata: {
        description: 'Default API key for development and testing',
        environment: 'development'
      }
    };

    this.apiKeys.set(defaultKey.key, defaultKey);
    logInfo('Loaded default API key for development', { keyId: defaultKey.id });
  }

  generateApiKey(prefix = 'dmapi') {
    const timestamp = Date.now().toString(36);
    const random = nanoid(24);
    return `${prefix}_${timestamp}_${random}`;
  }

  async createApiKey(options = {}) {
    try {
      const {
        name,
        userId,
        appId,
        permissions = ['read'],
        scopes = ['media', 'files'],
        rateLimit = { maxRequests: 100, windowMs: 15 * 60 * 1000 },
        expiresAt = null,
        metadata = {}
      } = options;

      if (!name || !userId || !appId) {
        throw new Error('Name, userId, and appId are required');
      }

      const keyId = nanoid(12);
      const apiKey = this.generateApiKey();
      const prefix = apiKey.split('_')[0];

      const keyData = {
        id: keyId,
        name,
        key: apiKey,
        prefix,
        userId,
        appId,
        permissions,
        scopes,
        rateLimit,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt,
        usageCount: 0,
        metadata
      };

      this.apiKeys.set(apiKey, keyData);

      logInfo('Created new API key', {
        keyId,
        name,
        userId,
        appId,
        permissions,
        scopes
      });

      // Return key data without the actual key for security
      const { key: _, ...safeKeyData } = keyData;
      return {
        ...safeKeyData,
        key: apiKey // Only return the key on creation
      };

    } catch (error) {
      logError(error, { context: 'apiKey.create', options });
      throw error;
    }
  }

  async validateApiKey(apiKey) {
    try {
      if (!apiKey || typeof apiKey !== 'string') {
        return { valid: false, error: 'Invalid API key format' };
      }

      const keyData = this.apiKeys.get(apiKey);
      if (!keyData) {
        return { valid: false, error: 'API key not found' };
      }

      if (!keyData.isActive) {
        return { valid: false, error: 'API key is deactivated' };
      }

      if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
        return { valid: false, error: 'API key has expired' };
      }

      // Update last used timestamp and usage count
      keyData.lastUsedAt = new Date().toISOString();
      keyData.usageCount += 1;

      return {
        valid: true,
        keyData: {
          id: keyData.id,
          name: keyData.name,
          userId: keyData.userId,
          appId: keyData.appId,
          permissions: keyData.permissions,
          scopes: keyData.scopes,
          rateLimit: keyData.rateLimit
        }
      };

    } catch (error) {
      logError(error, { context: 'apiKey.validate', apiKey: apiKey?.substring(0, 10) + '...' });
      return { valid: false, error: 'Validation error' };
    }
  }

  async listApiKeys(userId, options = {}) {
    try {
      const { includeInactive = false, limit = 50, offset = 0 } = options;

      let keys = Array.from(this.apiKeys.values());

      // Filter by userId if not admin
      if (userId !== 'system') {
        keys = keys.filter(key => key.userId === userId);
      }

      // Filter out inactive keys unless requested
      if (!includeInactive) {
        keys = keys.filter(key => key.isActive);
      }

      // Sort by creation date (newest first)
      keys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply pagination
      const total = keys.length;
      const paginatedKeys = keys.slice(offset, offset + limit);

      // Remove sensitive data
      const safeKeys = paginatedKeys.map(({ key, ...keyData }) => keyData);

      return {
        keys: safeKeys,
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };

    } catch (error) {
      logError(error, { context: 'apiKey.list', userId });
      throw error;
    }
  }

  async getApiKey(keyId, userId) {
    try {
      const keyData = Array.from(this.apiKeys.values()).find(key => key.id === keyId);
      
      if (!keyData) {
        return null;
      }

      // Check permissions - users can only see their own keys unless they're admin
      if (userId !== 'system' && keyData.userId !== userId) {
        return null;
      }

      // Return without the actual key
      const { key, ...safeKeyData } = keyData;
      return safeKeyData;

    } catch (error) {
      logError(error, { context: 'apiKey.get', keyId, userId });
      throw error;
    }
  }

  async updateApiKey(keyId, userId, updates) {
    try {
      const keyData = Array.from(this.apiKeys.values()).find(key => key.id === keyId);
      
      if (!keyData) {
        throw new Error('API key not found');
      }

      // Check permissions
      if (userId !== 'system' && keyData.userId !== userId) {
        throw new Error('Permission denied');
      }

      // Allowed update fields
      const allowedFields = ['name', 'permissions', 'scopes', 'rateLimit', 'isActive', 'expiresAt', 'metadata'];
      const filteredUpdates = {};

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = value;
        }
      }

      // Apply updates
      Object.assign(keyData, filteredUpdates);
      keyData.updatedAt = new Date().toISOString();

      logInfo('Updated API key', { keyId, userId, updates: Object.keys(filteredUpdates) });

      // Return updated data without the actual key
      const { key, ...safeKeyData } = keyData;
      return safeKeyData;

    } catch (error) {
      logError(error, { context: 'apiKey.update', keyId, userId });
      throw error;
    }
  }

  async deleteApiKey(keyId, userId) {
    try {
      const keyEntry = Array.from(this.apiKeys.entries()).find(([, keyData]) => keyData.id === keyId);
      
      if (!keyEntry) {
        throw new Error('API key not found');
      }

      const [apiKey, keyData] = keyEntry;

      // Check permissions
      if (userId !== 'system' && keyData.userId !== userId) {
        throw new Error('Permission denied');
      }

      // Don't allow deleting the default key in development
      if (keyData.id === 'default') {
        throw new Error('Cannot delete default development key');
      }

      this.apiKeys.delete(apiKey);

      logInfo('Deleted API key', { keyId, userId, name: keyData.name });

      return { success: true, message: 'API key deleted successfully' };

    } catch (error) {
      logError(error, { context: 'apiKey.delete', keyId, userId });
      throw error;
    }
  }

  async getUsageStats(keyId, userId) {
    try {
      const keyData = Array.from(this.apiKeys.values()).find(key => key.id === keyId);
      
      if (!keyData) {
        throw new Error('API key not found');
      }

      // Check permissions
      if (userId !== 'system' && keyData.userId !== userId) {
        throw new Error('Permission denied');
      }

      return {
        keyId: keyData.id,
        name: keyData.name,
        usageCount: keyData.usageCount,
        lastUsedAt: keyData.lastUsedAt,
        createdAt: keyData.createdAt,
        isActive: keyData.isActive,
        rateLimit: keyData.rateLimit
      };

    } catch (error) {
      logError(error, { context: 'apiKey.usage', keyId, userId });
      throw error;
    }
  }

  // Helper method to check if a user has permission
  hasPermission(keyData, permission) {
    return keyData.permissions.includes(permission) || keyData.permissions.includes('admin');
  }

  // Helper method to check if a user has scope access
  hasScope(keyData, scope) {
    return keyData.scopes.includes(scope) || keyData.scopes.includes('*');
  }
}

// Export a singleton instance
export default new ApiKeyService();
