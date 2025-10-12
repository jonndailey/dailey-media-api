import fs from 'fs/promises';
import path from 'path';
import databaseService from './databaseService.js';
import { logError } from '../middleware/logger.js';

/**
 * Lightweight helper for retrieving bucket metadata. Falls back to local
 * filesystem-backed metadata when the database is not available.
 */
class BucketService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Return cached key identifier.
   */
  getCacheKey(userId, bucketId) {
    return `${userId || 'anon'}:${bucketId || 'default'}`;
  }

  /**
   * Retrieve bucket metadata for a given user/bucket combination.
   * @param {string} userId
   * @param {string} bucketId
   * @returns {Promise<{id: string, name: string, description?: string, is_public: boolean, user_id?: string}>}
   */
  async getBucket(userId, bucketId = 'default') {
    const cacheKey = this.getCacheKey(userId, bucketId);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      let bucket = null;

      if (
        databaseService.isAvailable &&
        typeof databaseService.isAvailable === 'function' &&
        databaseService.isAvailable() &&
        typeof databaseService.getBucket === 'function'
      ) {
        bucket = await databaseService.getBucket(bucketId);
        if (bucket && bucket.user_id !== userId) {
          bucket = null;
        }
      }

      if (!bucket) {
        bucket = await this.getBucketFromFilesystem(userId, bucketId);
      }

      this.cache.set(cacheKey, bucket);
      return bucket;
    } catch (error) {
      logError(error, { context: 'bucketService.getBucket', userId, bucketId });
      throw error;
    }
  }

  /**
   * Invalidate cached entry for bucket.
   */
  invalidate(userId, bucketId = 'default') {
    this.cache.delete(this.getCacheKey(userId, bucketId));
  }

  async getBucketFromFilesystem(userId, bucketId) {
    const bucketPath = path.join(process.cwd(), 'storage', 'files', userId || 'system', bucketId);

    try {
      const metaPath = path.join(bucketPath, '.bucket.meta.json');
      const metaContent = await fs.readFile(metaPath, 'utf8');
      const metadata = JSON.parse(metaContent);
      return {
        id: bucketId,
        name: metadata.name || bucketId,
        description: metadata.description || '',
        is_public: Boolean(metadata.is_public),
        user_id: metadata.user_id || userId
      };
    } catch {
      return {
        id: bucketId,
        name: bucketId,
        description: bucketId === 'default' ? 'Default storage bucket' : '',
        is_public: bucketId === 'public',
        user_id: userId
      };
    }
  }
}

export default new BucketService();
