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

  // Analytics operations
  async recordAnalyticsEvent({ mediaFileId, eventType, userId = null, applicationId = null, ip = null, userAgent = null, referer = null, variantType = null, metadata = {} }) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Database not available');
      }

      const q = `
        INSERT INTO media_analytics (
          media_file_id, event_type, user_id, application_id, ip_address, user_agent, referer, variant_type, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        mediaFileId,
        eventType,
        userId || null,
        applicationId || null,
        ip || null,
        userAgent || null,
        referer || null,
        variantType || null,
        JSON.stringify(metadata || {})
      ];
      await db.query(q, params);
      return true;
    } catch (error) {
      logError(error, { context: 'databaseService.recordAnalyticsEvent', mediaFileId, eventType });
      throw error;
    }
  }

  async getOverviewStats() {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const filesRows = await db.query('SELECT COUNT(*) AS totalFiles, COALESCE(SUM(file_size),0) AS totalSize FROM media_files');
      const accessRows = await db.query("SELECT COUNT(*) AS totalAccesses, COUNT(DISTINCT user_id) AS uniqueUsers FROM media_analytics WHERE event_type IN ('view','download')");

      return {
        totalFiles: Number(filesRows?.[0]?.totalFiles || 0),
        totalSize: Number(filesRows?.[0]?.totalSize || 0),
        totalAccesses: Number(accessRows?.[0]?.totalAccesses || 0),
        uniqueUsers: Number(accessRows?.[0]?.uniqueUsers || 0)
      };
    } catch (error) {
      logError(error, { context: 'databaseService.getOverviewStats' });
      throw error;
    }
  }

  async getDailyUploadsSince(startDate) {
    try {
      if (!this.isAvailable()) return [];
      const rows = await db.query(
        'SELECT DATE(uploaded_at) AS day, COUNT(*) AS uploads, COALESCE(SUM(file_size),0) AS total_size FROM media_files WHERE uploaded_at >= ? GROUP BY day ORDER BY day ASC',
        [startDate]
      );
      return rows.map(r => ({ day: r.day, uploads: Number(r.uploads || 0), totalSize: Number(r.total_size || 0) }));
    } catch (error) {
      logError(error, { context: 'databaseService.getDailyUploadsSince' });
      throw error;
    }
  }

  async getDailyAccessesSince(startDate) {
    try {
      if (!this.isAvailable()) return [];
      const rows = await db.query(
        "SELECT DATE(timestamp) AS day, COUNT(*) AS accesses, COALESCE(SUM(COALESCE(JSON_EXTRACT(metadata, '$.bytes'), 0)),0) AS bandwidth, COUNT(DISTINCT user_id) AS uniqueUsers FROM media_analytics WHERE timestamp >= ? AND event_type IN ('view','download') GROUP BY day ORDER BY day ASC",
        [startDate]
      );
      return rows.map(r => ({ day: r.day, accesses: Number(r.accesses || 0), bandwidth: Number(r.bandwidth || 0), uniqueUsers: Number(r.uniqueUsers || 0) }));
    } catch (error) {
      logError(error, { context: 'databaseService.getDailyAccessesSince' });
      throw error;
    }
  }

  async getHourlyAccessesSince(startDate) {
    try {
      if (!this.isAvailable()) return Array(24).fill(0);
      const rows = await db.query(
        "SELECT HOUR(timestamp) AS hour, COUNT(*) AS cnt FROM media_analytics WHERE timestamp >= ? AND event_type IN ('view','download') GROUP BY HOUR(timestamp) ORDER BY hour",
        [startDate]
      );
      const arr = Array(24).fill(0);
      rows.forEach(r => { const h = Number(r.hour); if (!Number.isNaN(h) && h >= 0 && h <= 23) arr[h] = Number(r.cnt || 0); });
      return arr;
    } catch (error) {
      logError(error, { context: 'databaseService.getHourlyAccessesSince' });
      throw error;
    }
  }

  async getTopFilesSince(startDate, limit = 5) {
    try {
      if (!this.isAvailable()) return [];
      const rows = await db.query(
        'SELECT media_file_id, COUNT(*) AS accesses, COUNT(DISTINCT user_id) AS uniqueUsers, MAX(timestamp) AS lastAccessed FROM media_analytics WHERE timestamp >= ? AND event_type IN (\'view\',\'download\') GROUP BY media_file_id ORDER BY accesses DESC LIMIT ?',
        [startDate, Number(limit)]
      );
      return rows;
    } catch (error) {
      logError(error, { context: 'databaseService.getTopFilesSince' });
      throw error;
    }
  }

  async getFileTypesBreakdown() {
    try {
      if (!this.isAvailable()) return [];
      // Approximate categories from mime types
      const rows = await db.query('SELECT mime_type, COUNT(*) AS cnt, COALESCE(SUM(file_size),0) AS size FROM media_files GROUP BY mime_type');
      return rows.map(r => ({ mimeType: r.mime_type, count: Number(r.cnt || 0), size: Number(r.size || 0) }));
    } catch (error) {
      logError(error, { context: 'databaseService.getFileTypesBreakdown' });
      throw error;
    }
  }

  // Media Files operations
  async createMediaFile(mediaData) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Database not available');
      }

      // Ensure user exists to satisfy FK constraints
      try {
        await db.query(
          `INSERT IGNORE INTO users (id, external_id, email, display_name, metadata)
           VALUES (?, ?, ?, ?, JSON_OBJECT('source','dmapi'))`,
          [
            mediaData.user_id,
            mediaData.user_id,
            mediaData.user_email || null,
            mediaData.user_name || null
          ]
        );
      } catch (ensureErr) {
        logError(ensureErr, { context: 'databaseService.ensureUser', userId: mediaData.user_id });
      }

      const id = nanoid();
      const now = new Date();

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
      
      // Parse JSON fields safely (tolerate legacy bad JSON)
      media.categories = this.safeParseJson(media.categories, []);
      media.metadata = this.safeParseJson(media.metadata, {});
      media.exif_data = this.safeParseJson(media.exif_data, {});

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
      
      // Parse JSON fields safely
      media.categories = this.safeParseJson(media.categories, []);
      media.metadata = this.safeParseJson(media.metadata, {});
      media.exif_data = this.safeParseJson(media.exif_data, {});

      return media;

    } catch (error) {
      logError(error, { context: 'databaseService.getMediaFileByStorageKey', storageKey });
      throw error;
    }
  }

  async getMediaFileByContentHash(contentHash) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const query = `
        SELECT *
        FROM media_files
        WHERE content_hash = ?
          AND is_deleted = FALSE
        LIMIT 1
      `;

      const results = await db.query(query, [contentHash]);

      if (!results.length) {
        return null;
      }

      const media = results[0];
      media.categories = this.safeParseJson(media.categories, []);
      media.metadata = this.safeParseJson(media.metadata, {});
      media.exif_data = this.safeParseJson(media.exif_data, {});

      return media;

    } catch (error) {
      logError(error, { context: 'databaseService.getMediaFileByContentHash', contentHash });
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
        tags,
        min_size,
        max_size,
        category
      } = filters;

      const {
        limit = 50,
        offset = 0,
        orderBy = 'uploaded_at',
        orderDirection = 'DESC'
      } = pagination;

      // Build the base filter fragment (reused for count + page queries)
      let where = `WHERE mf.is_deleted = FALSE`;
      
      const params = [];

      // Add filters
      if (user_id) {
        where += ` AND mf.user_id = ?`;
        params.push(user_id);
      }

      if (application_id) {
        where += ` AND mf.application_id = ?`;
        params.push(application_id);
      }

      if (collection_id) {
        where += ` AND mf.collection_id = ?`;
        params.push(collection_id);
      }

      if (mime_type) {
        if (Array.isArray(mime_type)) {
          where += ` AND mf.mime_type IN (${mime_type.map(() => '?').join(', ')})`;
          params.push(...mime_type);
        } else {
          where += ` AND mf.mime_type LIKE ?`;
          params.push(`${mime_type}%`);
        }
      }

      if (processing_status) {
        where += ` AND mf.processing_status = ?`;
        params.push(processing_status);
      }

      if (is_public !== undefined) {
        where += ` AND mf.is_public = ?`;
        params.push(is_public);
      }

      if (search) {
        where += ` AND (
          MATCH(mf.original_filename, mf.title, mf.description, mf.keywords) AGAINST(? IN NATURAL LANGUAGE MODE)
          OR mf.original_filename LIKE ?
          OR mf.title LIKE ?
        )`;
        params.push(search, `%${search}%`, `%${search}%`);
      }

      if (min_width) {
        where += ` AND mf.width >= ?`;
        params.push(min_width);
      }

      if (max_width) {
        where += ` AND mf.width <= ?`;
        params.push(max_width);
      }

      if (min_height) {
        where += ` AND mf.height >= ?`;
        params.push(min_height);
      }

      if (max_height) {
        where += ` AND mf.height <= ?`;
        params.push(max_height);
      }

      if (start_date) {
        where += ` AND mf.uploaded_at >= ?`;
        params.push(start_date);
      }

      if (end_date) {
        where += ` AND mf.uploaded_at <= ?`;
        params.push(end_date);
      }

      if (min_size) {
        where += ` AND mf.file_size >= ?`;
        params.push(parseInt(min_size));
      }

      if (max_size) {
        where += ` AND mf.file_size <= ?`;
        params.push(parseInt(max_size));
      }

      if (category) {
        where += ` AND (
          JSON_CONTAINS(mf.categories, JSON_QUOTE(?))
          OR JSON_EXTRACT(mf.metadata, '$.category') = ?
        )`;
        params.push(category, category);
      }

      // Add tags filter if provided
      if (tags && tags.length > 0) {
        where += ` AND mf.id IN (
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

      // Count total separately (avoids COUNT(*) OVER issues)
      const countQuery = `SELECT COUNT(*) AS total FROM media_files mf ${where}`;
      const countRows = await db.query(countQuery, params);
      const total = parseInt(countRows?.[0]?.total || 0);

      // Page query
      const pageQuery = `
        SELECT mf.*
        FROM media_files mf
        ${where}
        ORDER BY mf.${orderColumn} ${direction}
        LIMIT ? OFFSET ?
      `;

      const pageParams = params.slice();
      pageParams.push(parseInt(limit), parseInt(offset));
      const results = await db.query(pageQuery, pageParams);

      const files = results.map(row => ({
        ...row,
        categories: JSON.parse(row.categories || '[]'),
        metadata: JSON.parse(row.metadata || '{}'),
        exif_data: JSON.parse(row.exif_data || '{}'),
      }));

      const hasMore = offset + limit < total;

      return { files, total, hasMore };

    } catch (error) {
      logError(error, { context: 'databaseService.listMediaFiles', filters, pagination });
      throw error;
    }
  }

  async listBucketsByApplication(applicationId) {
    try {
      if (!this.isAvailable() || !applicationId) {
        return [];
      }

      const query = `
        SELECT
          COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.bucketId')), ''), 'default') AS bucket_id,
          COUNT(*) AS file_count,
          MIN(uploaded_at) AS first_uploaded_at,
          MAX(uploaded_at) AS last_uploaded_at,
          MAX(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.bucketAccess'))) AS bucket_access
        FROM media_files
        WHERE application_id = ?
          AND is_deleted = FALSE
        GROUP BY bucket_id
        ORDER BY bucket_id ASC
      `;

      const rows = await db.query(query, [applicationId]);

      return rows.map(row => {
        const bucketId = row.bucket_id || 'default';
        const access = typeof row.bucket_access === 'string'
          ? row.bucket_access.toLowerCase()
          : '';

        return {
          id: bucketId,
          name: bucketId,
          description: `Bucket: ${bucketId}`,
          is_public: access === 'public',
          file_count: Number(row.file_count) || 0,
          created_at: row.first_uploaded_at,
          updated_at: row.last_uploaded_at
        };
      });
    } catch (error) {
      logError(error, { context: 'databaseService.listBucketsByApplication', applicationId });
      throw error;
    }
  }

  async getBucketUsersByApplication(applicationId, bucketId) {
    try {
      if (!this.isAvailable() || !applicationId || !bucketId) {
        return [];
      }

      const query = `
        SELECT
          user_id,
          COUNT(*) AS file_count,
          MIN(uploaded_at) AS first_uploaded_at,
          MAX(uploaded_at) AS last_uploaded_at
        FROM media_files
        WHERE application_id = ?
          AND is_deleted = FALSE
          AND COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.bucketId')), ''), 'default') = ?
        GROUP BY user_id
        ORDER BY last_uploaded_at DESC
      `;

      const rows = await db.query(query, [applicationId, bucketId]);

      return rows.map(row => ({
        user_id: row.user_id,
        file_count: Number(row.file_count) || 0,
        first_uploaded_at: row.first_uploaded_at,
        last_uploaded_at: row.last_uploaded_at
      }));
    } catch (error) {
      logError(error, { context: 'databaseService.getBucketUsersByApplication', applicationId, bucketId });
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

  async updateMediaFileByStorageKey(storageKey, updates) {
    try {
      if (!this.isAvailable()) {
        throw new Error('Database not available');
      }

      if (!storageKey) throw new Error('storageKey is required')

      const allowedFields = [
        'title', 'description', 'collection_id', 'processing_status', 'processing_error',
        'is_public', 'keywords', 'categories', 'metadata', 'location_name'
      ];

      const updatePairs = [];
      const params = [];

      for (const [field, value] of Object.entries(updates || {})) {
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
      params.push(storageKey);

      const query = `
        UPDATE media_files
        SET ${updatePairs.join(', ')}
        WHERE storage_key = ? AND is_deleted = FALSE
      `;

      const result = await db.query(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      logError(error, { context: 'databaseService.updateMediaFileByStorageKey', storageKey });
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

  formatConversionJob(row) {
    if (!row) {
      return null;
    }

    return {
      ...row,
      options: this.safeParseJson(row.options, {}),
      metadata: this.safeParseJson(row.metadata, {})
    };
  }

  async createConversionJob(jobData) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const id = jobData.id || nanoid();
      const query = `
        INSERT INTO media_conversion_jobs (
          id, media_file_id, source_format, target_format, status,
          options, metadata, batch_id, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        jobData.media_file_id,
        jobData.source_format,
        jobData.target_format,
        jobData.status || 'pending',
        JSON.stringify(jobData.options || {}),
        JSON.stringify(jobData.metadata || {}),
        jobData.batch_id || null,
        jobData.created_by || null
      ];

      await db.query(query, params);
      logInfo('Document conversion job created', {
        id,
        media_file_id: jobData.media_file_id,
        target_format: jobData.target_format
      });

      return id;
    } catch (error) {
      logError(error, { context: 'databaseService.createConversionJob', media_file_id: jobData?.media_file_id });
      throw error;
    }
  }

  async updateConversionJob(jobId, updates = {}) {
    try {
      if (!this.isAvailable()) {
        return false;
      }

      const fields = [];
      const params = [];

      const addField = (column, value, transform) => {
        fields.push(`${column} = ?`);
        params.push(transform ? transform(value) : value);
      };

      if (typeof updates.status === 'string') {
        addField('status', updates.status);
      }

      if (typeof updates.output_storage_key !== 'undefined') {
        addField('output_storage_key', updates.output_storage_key || null);
      }

      if (typeof updates.output_file_size !== 'undefined') {
        addField('output_file_size', updates.output_file_size || null);
      }

      if (typeof updates.output_mime_type !== 'undefined') {
        addField('output_mime_type', updates.output_mime_type || null);
      }

      if (typeof updates.duration_ms !== 'undefined') {
        addField('duration_ms', updates.duration_ms || null);
      }

      if (typeof updates.completed_at !== 'undefined') {
        addField('completed_at', updates.completed_at || null);
      }

      if (typeof updates.batch_id !== 'undefined') {
        addField('batch_id', updates.batch_id || null);
      }

      if (typeof updates.error_message !== 'undefined') {
        addField('error_message', updates.error_message || null);
      }

      if (typeof updates.options !== 'undefined') {
        addField('options', JSON.stringify(updates.options || {}));
      }

      if (typeof updates.metadata !== 'undefined') {
        addField('metadata', JSON.stringify(updates.metadata || {}));
      }

      if (!fields.length) {
        return false;
      }

      params.push(jobId);

      const query = `
        UPDATE media_conversion_jobs
        SET ${fields.join(', ')}
        WHERE id = ?
      `;

      await db.query(query, params);
      logInfo('Document conversion job updated', { jobId });
      return true;
    } catch (error) {
      logError(error, { context: 'databaseService.updateConversionJob', jobId });
      throw error;
    }
  }

  async getConversionJob(jobId) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const query = `
        SELECT *
        FROM media_conversion_jobs
        WHERE id = ?
      `;

      const results = await db.query(query, [jobId]);
      if (!results.length) {
        return null;
      }

      return this.formatConversionJob(results[0]);
    } catch (error) {
      logError(error, { context: 'databaseService.getConversionJob', jobId });
      throw error;
    }
  }

  async listConversionJobs(mediaFileId, options = {}) {
    try {
      if (!this.isAvailable()) {
        return [];
      }

      const { limit = 20, offset = 0, status = null } = options;
      const params = [mediaFileId];
      let query = `
        SELECT *
        FROM media_conversion_jobs
        WHERE media_file_id = ?
      `;

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += `
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
      `;

      params.push(Number(limit));
      params.push(Number(offset));

      const results = await db.query(query, params);
      return results.map(row => this.formatConversionJob(row));
    } catch (error) {
      logError(error, { context: 'databaseService.listConversionJobs', mediaFileId });
      throw error;
    }
  }


  formatProcessingJob(row) {
    if (!row) {
      return null;
    }

    return {
      ...row,
      requested_outputs: this.safeParseJson(row.requested_outputs, []),
      generated_outputs: this.safeParseJson(row.generated_outputs, []),
      metadata: this.safeParseJson(row.metadata, {}),
      progress: typeof row.progress === 'number'
        ? Number(row.progress)
        : (row.progress ? Number(row.progress) : 0)
    };
  }

  async createProcessingJob(jobData) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const id = jobData.id || nanoid();
      const query = `
        INSERT INTO media_processing_jobs (
          id, media_file_id, type, status, progress,
          input_storage_key, requested_outputs, metadata,
          webhook_url, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        jobData.media_file_id,
        jobData.type || 'video.transcode',
        jobData.status || 'queued',
        typeof jobData.progress === 'number'
          ? Number(jobData.progress.toFixed(2))
          : 0,
        jobData.input_storage_key,
        JSON.stringify(jobData.requested_outputs || []),
        JSON.stringify(jobData.metadata || {}),
        jobData.webhook_url || null,
        jobData.created_by || null
      ];

      await db.query(query, params);
      logInfo('Processing job created', {
        id,
        media_file_id: jobData.media_file_id,
        type: jobData.type || 'video.transcode'
      });

      return id;
    } catch (error) {
      logError(error, { context: 'databaseService.createProcessingJob', media_file_id: jobData?.media_file_id });
      throw error;
    }
  }

  async updateProcessingJob(jobId, updates = {}) {
    try {
      if (!this.isAvailable()) {
        return false;
      }

      const fields = [];
      const params = [];

      const addField = (column, value, transform) => {
        fields.push(`${column} = ?`);
        params.push(transform ? transform(value) : value);
      };

      if (typeof updates.status === 'string') {
        addField('status', updates.status);
      }

      if (typeof updates.progress !== 'undefined') {
        const progressValue = typeof updates.progress === 'number'
          ? Number(updates.progress.toFixed(2))
          : null;
        addField('progress', progressValue);
      }

      if (typeof updates.generated_outputs !== 'undefined') {
        addField('generated_outputs', JSON.stringify(updates.generated_outputs || []));
      }

      if (typeof updates.requested_outputs !== 'undefined') {
        addField('requested_outputs', JSON.stringify(updates.requested_outputs || []));
      }

      if (typeof updates.metadata !== 'undefined') {
        addField('metadata', JSON.stringify(updates.metadata || {}));
      }

      if (typeof updates.error_message !== 'undefined') {
        addField('error_message', updates.error_message || null);
      }

      if (typeof updates.webhook_url !== 'undefined') {
        addField('webhook_url', updates.webhook_url || null);
      }

      if (typeof updates.retry_count !== 'undefined') {
        addField('retry_count', updates.retry_count);
      }

      if (typeof updates.completed_at !== 'undefined') {
        addField('completed_at', updates.completed_at || null);
      }

      if (!fields.length) {
        return false;
      }

      params.push(jobId);

      const query = `
        UPDATE media_processing_jobs
        SET ${fields.join(', ')}
        WHERE id = ?
      `;

      await db.query(query, params);
      return true;
    } catch (error) {
      logError(error, { context: 'databaseService.updateProcessingJob', jobId });
      throw error;
    }
  }

  async getProcessingJob(jobId) {
    try {
      if (!this.isAvailable()) {
        return null;
      }

      const query = `
        SELECT *
        FROM media_processing_jobs
        WHERE id = ?
      `;

      const results = await db.query(query, [jobId]);
      if (!results.length) {
        return null;
      }

      return this.formatProcessingJob(results[0]);
    } catch (error) {
      logError(error, { context: 'databaseService.getProcessingJob', jobId });
      throw error;
    }
  }

  async listProcessingJobs(mediaFileId, options = {}) {
    try {
      if (!this.isAvailable()) {
        return [];
      }

      const { limit = 20, offset = 0, status = null } = options;
      const params = [mediaFileId];
      let query = `
        SELECT *
        FROM media_processing_jobs
        WHERE media_file_id = ?
      `;

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += `
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
      `;

      params.push(Number(limit));
      params.push(Number(offset));

      const results = await db.query(query, params);
      return results.map(row => this.formatProcessingJob(row));
    } catch (error) {
      logError(error, { context: 'databaseService.listProcessingJobs', mediaFileId });
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
