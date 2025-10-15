import db from '../database/connection.js';
import migrations from '../database/migrations.js';
import { logInfo, logError } from '../middleware/logger.js';
import { nanoid } from 'nanoid';

class DatabaseService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    try {
      if (this.initialized) return;

      await db.connect();
      
      if (db.isAvailable()) {
        await migrations.runMigrations();
        logInfo('Database service initialized successfully');
      } else {
        logInfo('Database service initialized in memory-only mode');
      }
      
      this.initialized = true;
    } catch (error) {
      logError(error, { context: 'databaseService.initialize' });
      // Don't throw - allow the service to continue without database
    }
  }

  isAvailable() {
    return db.isAvailable();
  }

  // Media Files operations
  async createMediaFile(mediaData) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Database not available');
      }

      const id = nanoid();
      const now = new Date().toISOString();

      const query = `
        INSERT INTO media_files (
          id, storage_key, original_filename, title, description, user_id, application_id,
          collection_id, file_size, mime_type, file_extension, content_hash,
          width, height, duration_seconds, frame_rate, color_space, has_transparency,
          camera_make, camera_model, lens_model, focal_length, aperture, shutter_speed,
          iso_speed, flash_used, white_balance, exposure_compensation, metering_mode,
          latitude, longitude, altitude, location_name, taken_at, uploaded_at,
          processing_status, is_public, keywords, categories, metadata, exif_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        mediaData.storage_key,
        mediaData.original_filename,
        mediaData.title || null,
        mediaData.description || null,
        mediaData.user_id,
        mediaData.application_id || null,
        mediaData.collection_id || null,
        mediaData.file_size,
        mediaData.mime_type,
        mediaData.file_extension,
        mediaData.content_hash || null,
        mediaData.width || null,
        mediaData.height || null,
        mediaData.duration_seconds || null,
        mediaData.frame_rate || null,
        mediaData.color_space || null,
        mediaData.has_transparency || false,
        mediaData.camera_make || null,
        mediaData.camera_model || null,
        mediaData.lens_model || null,
        mediaData.focal_length || null,
        mediaData.aperture || null,
        mediaData.shutter_speed || null,
        mediaData.iso_speed || null,
        mediaData.flash_used || null,
        mediaData.white_balance || null,
        mediaData.exposure_compensation || null,
        mediaData.metering_mode || null,
        mediaData.latitude || null,
        mediaData.longitude || null,
        mediaData.altitude || null,
        mediaData.location_name || null,
        mediaData.taken_at || null,
        now,
        mediaData.processing_status || 'pending',
        mediaData.is_public || false,
        mediaData.keywords || null,
        JSON.stringify(mediaData.categories || []),
        JSON.stringify(mediaData.metadata || {}),
        JSON.stringify(mediaData.exif_data || {})
      ];

      await db.query(query, params);

      logInfo('Media file created in database', { id, storage_key: mediaData.storage_key });
      return id;

    } catch (error) {
      logError(error, { context: 'databaseService.createMediaFile', storage_key: mediaData?.storage_key });
      throw error;
    }
  }

  async getMediaFile(id) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const query = `
        SELECT * FROM media_files 
        WHERE id = ? AND is_deleted = FALSE
      `;

      const results = await db.query(query, [id]);
      
      if (results.length === 0) {
        return null;
      }

      const media = results[0];
      
      // Parse JSON fields
      media.categories = JSON.parse(media.categories || '[]');
      media.metadata = JSON.parse(media.metadata || '{}');
      media.exif_data = JSON.parse(media.exif_data || '{}');

      return media;

    } catch (error) {
      logError(error, { context: 'databaseService.getMediaFile', id });
      throw error;
    }
  }

  async getMediaFileByStorageKey(storageKey) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const query = `
        SELECT * FROM media_files 
        WHERE storage_key = ? AND is_deleted = FALSE
      `;

      const results = await db.query(query, [storageKey]);
      
      if (results.length === 0) {
        return null;
      }

      const media = results[0];
      
      // Parse JSON fields
      media.categories = JSON.parse(media.categories || '[]');
      media.metadata = JSON.parse(media.metadata || '{}');
      media.exif_data = JSON.parse(media.exif_data || '{}');

      return media;

    } catch (error) {
      logError(error, { context: 'databaseService.getMediaFileByStorageKey', storageKey });
      throw error;
    }
  }

  async listMediaFiles(filters = {}, pagination = {}) {
    try {
      if (!this.isAvailable()) {
        return { files: [], total: 0, hasMore: false };
      }

      const {
        user_id,
        application_id,
        collection_id,
        mime_type,
        processing_status,
        is_public,
        search,
        min_width,
        max_width,
        min_height,
        max_height,
        start_date,
        end_date,
        tags
      } = filters;

      const {
        limit = 50,
        offset = 0,
        orderBy = 'uploaded_at',
        orderDirection = 'DESC'
      } = pagination;

      // Build the base query
      let baseQuery = `
        SELECT 
          mf.*,
          COUNT(*) OVER() as total_count
        FROM media_files mf
        WHERE mf.is_deleted = FALSE
      `;

      const params = [];

      // Add filters
      if (user_id) {
        baseQuery += ` AND mf.user_id = ?`;
        params.push(user_id);
      }

      if (application_id) {
        baseQuery += ` AND mf.application_id = ?`;
        params.push(application_id);
      }

      if (collection_id) {
        baseQuery += ` AND mf.collection_id = ?`;
        params.push(collection_id);
      }

      if (mime_type) {
        if (Array.isArray(mime_type)) {
          baseQuery += ` AND mf.mime_type IN (${mime_type.map(() => '?').join(', ')})`;
          params.push(...mime_type);
        } else {
          baseQuery += ` AND mf.mime_type LIKE ?`;
          params.push(`${mime_type}%`);
        }
      }

      if (processing_status) {
        baseQuery += ` AND mf.processing_status = ?`;
        params.push(processing_status);
      }

      if (is_public !== undefined) {
        baseQuery += ` AND mf.is_public = ?`;
        params.push(is_public);
      }

      if (search) {
        baseQuery += ` AND (
          MATCH(mf.original_filename, mf.title, mf.description, mf.keywords) AGAINST(? IN NATURAL LANGUAGE MODE)
          OR mf.original_filename LIKE ?
          OR mf.title LIKE ?
        )`;
        params.push(search, `%${search}%`, `%${search}%`);
      }

      if (min_width) {
        baseQuery += ` AND mf.width >= ?`;
        params.push(min_width);
      }

      if (max_width) {
        baseQuery += ` AND mf.width <= ?`;
        params.push(max_width);
      }

      if (min_height) {
        baseQuery += ` AND mf.height >= ?`;
        params.push(min_height);
      }

      if (max_height) {
        baseQuery += ` AND mf.height <= ?`;
        params.push(max_height);
      }

      if (start_date) {
        baseQuery += ` AND mf.uploaded_at >= ?`;
        params.push(start_date);
      }

      if (end_date) {
        baseQuery += ` AND mf.uploaded_at <= ?`;
        params.push(end_date);
      }

      // Add tags filter if provided
      if (tags && tags.length > 0) {
        baseQuery += ` AND mf.id IN (
          SELECT mft.media_file_id 
          FROM media_file_tags mft 
          JOIN media_tags mt ON mft.tag_id = mt.id 
          WHERE mt.slug IN (${tags.map(() => '?').join(', ')})
          GROUP BY mft.media_file_id 
          HAVING COUNT(DISTINCT mt.id) = ?
        )`;
        params.push(...tags, tags.length);
      }

      // Add ordering and pagination
      const validOrderBy = ['uploaded_at', 'created_at', 'file_size', 'original_filename', 'taken_at'];
      const orderColumn = validOrderBy.includes(orderBy) ? orderBy : 'uploaded_at';
      const direction = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const finalQuery = `
        ${baseQuery}
        ORDER BY mf.${orderColumn} ${direction}
        LIMIT ? OFFSET ?
      `;

      params.push(parseInt(limit), parseInt(offset));

      const results = await db.query(finalQuery, params);

      const files = results.map(row => {
        const { total_count, ...media } = row;
        media.categories = JSON.parse(media.categories || '[]');
        media.metadata = JSON.parse(media.metadata || '{}');
        media.exif_data = JSON.parse(media.exif_data || '{}');
        return media;
      });

      const total = results.length > 0 ? parseInt(results[0].total_count) : 0;
      const hasMore = offset + limit < total;

      return { files, total, hasMore };

    } catch (error) {
      logError(error, { context: 'databaseService.listMediaFiles', filters, pagination });
      throw error;
    }
  }

  async updateMediaFile(id, updates) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Database not available');
      }

      const allowedFields = [
        'title', 'description', 'collection_id', 'processing_status', 'processing_error',
        'is_public', 'keywords', 'categories', 'metadata', 'location_name'
      ];

      const updatePairs = [];
      const params = [];

      for (const [field, value] of Object.entries(updates)) {
        if (allowedFields.includes(field) && value !== undefined) {
          updatePairs.push(`${field} = ?`);
          
          if (field === 'categories' || field === 'metadata') {
            params.push(JSON.stringify(value));
          } else {
            params.push(value);
          }
        }
      }

      if (updatePairs.length === 0) {
        return false;
      }

      updatePairs.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);

      const query = `
        UPDATE media_files 
        SET ${updatePairs.join(', ')}
        WHERE id = ? AND is_deleted = FALSE
      `;

      const result = await db.query(query, params);
      
      logInfo('Media file updated', { id, fieldsUpdated: updatePairs.length - 1 });
      return result.affectedRows > 0;

    } catch (error) {
      logError(error, { context: 'databaseService.updateMediaFile', id });
      throw error;
    }
  }

  async deleteMediaFile(id, softDelete = true) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Database not available');
      }

      let query;
      const params = [id];

      if (softDelete) {
        query = `
          UPDATE media_files 
          SET is_deleted = TRUE, deleted_at = ?
          WHERE id = ?
        `;
        params.unshift(new Date().toISOString());
      } else {
        query = `DELETE FROM media_files WHERE id = ?`;
      }

      const result = await db.query(query, params);
      
      logInfo('Media file deleted', { id, softDelete });
      return result.affectedRows > 0;

    } catch (error) {
      logError(error, { context: 'databaseService.deleteMediaFile', id });
      throw error;
    }
  }

  // Media Variants operations
  async createMediaVariant(variantData) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Database not available');
      }

      const id = nanoid();

      const query = `
        INSERT INTO media_variants (
          id, media_file_id, storage_key, variant_type, format,
          width, height, file_size, quality, processing_settings
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        variantData.media_file_id,
        variantData.storage_key,
        variantData.variant_type,
        variantData.format,
        variantData.width,
        variantData.height,
        variantData.file_size,
        variantData.quality || null,
        JSON.stringify(variantData.processing_settings || {})
      ];

      await db.query(query, params);

      logInfo('Media variant created', { id, media_file_id: variantData.media_file_id, variant_type: variantData.variant_type });
      return id;

    } catch (error) {
      logError(error, { context: 'databaseService.createMediaVariant', media_file_id: variantData?.media_file_id });
      throw error;
    }
  }

  async getMediaVariants(mediaFileId) {
    try {
      if (!this.isAvailable()) {
        return [];
      }

      const query = `
        SELECT * FROM media_variants 
        WHERE media_file_id = ? AND is_available = TRUE
        ORDER BY variant_type, width ASC
      `;

      const results = await db.query(query, [mediaFileId]);
      
      return results.map(variant => ({
        ...variant,
        processing_settings: JSON.parse(variant.processing_settings || '{}')
      }));

    } catch (error) {
      logError(error, { context: 'databaseService.getMediaVariants', mediaFileId });
      throw error;
    }
  }

  formatOcrResult(row) {
    if (!row) {
      return null;
    }

    return {
      ...row,
      languages: this.safeParseJson(row.languages, []),
      confidence_summary: this.safeParseJson(row.confidence_summary, {}),
      request_options: this.safeParseJson(row.request_options, {}),
      metadata: this.safeParseJson(row.metadata, {}),
      average_confidence: typeof row.average_confidence === 'number'
        ? Number(row.average_confidence)
        : (row.average_confidence ? Number(row.average_confidence) : null)
    };
  }

  safeParseJson(value, fallback) {
    if (!value) {
      return fallback;
    }

    try {
      if (typeof value === 'object') {
        return value;
      }
      return JSON.parse(value);
    } catch (error) {
      logError(error, { context: 'databaseService.safeParseJson' });
      return fallback;
    }
  }

  async saveOcrResult(resultData) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const id = nanoid();
      const query = `
        INSERT INTO media_ocr_results (
          id, media_file_id, languages, text, average_confidence,
          confidence_summary, word_count, line_count, pdf_storage_key,
          request_options, metadata, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        resultData.media_file_id,
        JSON.stringify(resultData.languages || []),
        resultData.text || null,
        typeof resultData.average_confidence === 'number'
          ? Number(resultData.average_confidence.toFixed(2))
          : null,
        JSON.stringify(resultData.confidence_summary || {}),
        resultData.word_count ?? 0,
        resultData.line_count ?? 0,
        resultData.pdf_storage_key || null,
        JSON.stringify(resultData.request_options || {}),
        JSON.stringify(resultData.metadata || {}),
        resultData.created_by || null
      ];

      await db.query(query, params);
      logInfo('OCR result saved', {
        id,
        media_file_id: resultData.media_file_id,
        pdf_storage_key: resultData.pdf_storage_key || null
      });

      return id;
    } catch (error) {
      logError(error, { context: 'databaseService.saveOcrResult', media_file_id: resultData?.media_file_id });
      throw error;
    }
  }

  async getOcrResult(resultId) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const query = `
        SELECT *
        FROM media_ocr_results
        WHERE id = ?
      `;

      const results = await db.query(query, [resultId]);
      if (!results.length) {
        return null;
      }

      return this.formatOcrResult(results[0]);
    } catch (error) {
      logError(error, { context: 'databaseService.getOcrResult', resultId });
      throw error;
    }
  }

  async getLatestOcrResult(mediaFileId) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const query = `
        SELECT *
        FROM media_ocr_results
        WHERE media_file_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const results = await db.query(query, [mediaFileId]);
      if (!results.length) {
        return null;
      }

      return this.formatOcrResult(results[0]);
    } catch (error) {
      logError(error, { context: 'databaseService.getLatestOcrResult', mediaFileId });
      throw error;
    }
  }

  async listOcrResults(mediaFileId, options = {}) {
    try {
      if (!this.isAvailable()) {
        return [];
      }

      const limit = Math.min(options.limit || 20, 100);
      const offset = Math.max(options.offset || 0, 0);

      const query = `
        SELECT *
        FROM media_ocr_results
        WHERE media_file_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
      `;

      const results = await db.query(query, [mediaFileId, limit, offset]);
      return results.map(row => this.formatOcrResult(row));
    } catch (error) {
      logError(error, { context: 'databaseService.listOcrResults', mediaFileId });
      throw error;
    }
  }

  // Analytics operations
  async recordMediaEvent(eventData) {
    try {
      if (!this.isAvailable()) {
        return;
      }

      const id = nanoid();

      const query = `
        INSERT INTO media_analytics (
          id, media_file_id, event_type, user_id, application_id,
          ip_address, user_agent, referer, variant_type, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        eventData.media_file_id,
        eventData.event_type,
        eventData.user_id || null,
        eventData.application_id || null,
        eventData.ip_address || null,
        eventData.user_agent || null,
        eventData.referer || null,
        eventData.variant_type || null,
        JSON.stringify(eventData.metadata || {})
      ];

      await db.query(query, params);

    } catch (error) {
      logError(error, { context: 'databaseService.recordMediaEvent', event_type: eventData?.event_type });
      // Don't throw - analytics should not break the main flow
    }
  }

  // Tag operations
  async getTags(filters = {}) {
    try {
      if (!this.isAvailable()) {
        return [];
      }

      const { user_id, application_id } = filters;
      let query = `SELECT * FROM media_tags WHERE 1=1`;
      const params = [];

      if (user_id) {
        query += ` AND (user_id = ? OR user_id IS NULL)`;
        params.push(user_id);
      }

      if (application_id) {
        query += ` AND (application_id = ? OR application_id IS NULL)`;
        params.push(application_id);
      }

      query += ` ORDER BY usage_count DESC, name ASC`;

      return await db.query(query, params);

    } catch (error) {
      logError(error, { context: 'databaseService.getTags', filters });
      throw error;
    }
  }

  async getStats(userId, applicationId) {
    try {
      if (!this.isAvailable()) {
        return {
          totalFiles: 0,
          totalSize: 0,
          byMimeType: {},
          recentUploads: []
        };
      }

      // Get basic stats
      const statsQuery = `
        SELECT 
          COUNT(*) as total_files,
          SUM(file_size) as total_size,
          mime_type,
          COUNT(*) as count_by_type
        FROM media_files 
        WHERE user_id = ? AND application_id = ? AND is_deleted = FALSE
        GROUP BY mime_type
      `;

      const stats = await db.query(statsQuery, [userId, applicationId]);
      
      const totalFiles = stats.reduce((sum, row) => sum + parseInt(row.count_by_type), 0);
      const totalSize = stats.reduce((sum, row) => sum + parseInt(row.total_size || 0), 0);
      
      const byMimeType = {};
      stats.forEach(row => {
        byMimeType[row.mime_type] = parseInt(row.count_by_type);
      });

      // Get recent uploads
      const recentQuery = `
        SELECT id, original_filename, file_size, mime_type, uploaded_at
        FROM media_files 
        WHERE user_id = ? AND application_id = ? AND is_deleted = FALSE
        ORDER BY uploaded_at DESC 
        LIMIT 10
      `;

      const recentUploads = await db.query(recentQuery, [userId, applicationId]);

      return {
        totalFiles,
        totalSize,
        byMimeType,
        recentUploads
      };

    } catch (error) {
      logError(error, { context: 'databaseService.getStats', userId, applicationId });
      throw error;
    }
  }
}

export default new DatabaseService();
