import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import databaseService from '../services/databaseService.js';
import storageService from '../services/storageService.js';
import fileService from '../services/fileService.js';
import { logInfo, logError } from '../middleware/logger.js';
import imageService from '../services/imageService.js';

const router = express.Router();

// List files with pagination and filtering
router.get('/', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const {
      limit = 24,
      offset = 0,
      order_by = 'uploaded_at',
      order_direction = 'DESC',
      search,
      category, // image, video, document, code, etc
      mime_type,
      min_size,
      max_size,
      user_id: queryUserId,
      storage_key
    } = req.query;

    // If database is available, use it; otherwise or on failure, fall back to storage scan
    if (databaseService.isAvailable()) {
      const applicationId = req.query.app_id || req.appId;

      // Fast path: lookup by storage_key returns a single DB record (when present)
      if (storage_key && typeof storage_key === 'string') {
        try {
          const file = await databaseService.getMediaFileByStorageKey(storage_key);
          if (!file) {
            return res.json({ success: true, files: [], pagination: { total: 0, limit: 0, offset: 0, has_more: false } });
          }
          const typeInfo = fileService.getFileTypeInfo(file.original_filename || file.storage_key);
          const accessDetails = await storageService.getAccessDetails(file.storage_key, { access: file.is_public ? 'public' : 'private' });
          const thumbnailAccess = file.thumbnail_key
            ? await storageService.getAccessDetails(file.thumbnail_key, { access: file.is_public ? 'public' : 'private' })
            : { publicUrl: null, signedUrl: null, access: accessDetails.access };
          const enriched = {
            ...file,
            category: typeInfo.category,
            access: accessDetails.access,
            public_url: accessDetails.publicUrl,
            signed_url: accessDetails.signedUrl,
            thumbnail_url: thumbnailAccess.publicUrl,
            thumbnail_signed_url: thumbnailAccess.signedUrl
          };
          return res.json({ success: true, files: [enriched], pagination: { total: 1, limit: 1, offset: 0, has_more: false } });
        } catch (e) {
          // fall through to normal listing
        }
      }

      const filters = {};
      if (applicationId) {
        filters.application_id = applicationId;
      }
      // Honor explicit user_id filter; otherwise fall back to token subject if present
      if (queryUserId) {
        filters.user_id = queryUserId;
      } else if (req.userId) {
        filters.user_id = req.userId;
      }

      if (search) filters.search = search;
      if (category) filters.category = category;
      if (mime_type) filters.mime_type = mime_type;

      const minSizeValue = min_size ? parseInt(min_size, 10) : undefined;
      const maxSizeValue = max_size ? parseInt(max_size, 10) : undefined;

      if (typeof minSizeValue === 'number' && !Number.isNaN(minSizeValue)) {
        filters.min_size = minSizeValue;
      }

      if (typeof maxSizeValue === 'number' && !Number.isNaN(maxSizeValue)) {
        filters.max_size = maxSizeValue;
      }

      const pagination = {
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset),
        orderBy: order_by,
        orderDirection: order_direction
      };

      try {
        const { files, total: totalCount, hasMore } = await databaseService.listMediaFiles(filters, pagination);

        const filesWithMetadata = await Promise.all(files.map(async file => {
          const typeInfo = fileService.getFileTypeInfo(file.original_filename || file.storage_key);
          const accessDetails = await storageService.getAccessDetails(file.storage_key, { access: file.is_public ? 'public' : 'private' });
          const thumbnailAccess = file.thumbnail_key
            ? await storageService.getAccessDetails(file.thumbnail_key, { access: file.is_public ? 'public' : 'private' })
            : { publicUrl: null, signedUrl: null, access: accessDetails.access };

          return {
            ...file,
            category: typeInfo.category,
            access: accessDetails.access,
            public_url: accessDetails.publicUrl,
            signed_url: accessDetails.signedUrl,
            thumbnail_url: thumbnailAccess.publicUrl,
            thumbnail_signed_url: thumbnailAccess.signedUrl
          };
        }));

        return res.json({
          success: true,
          files: filesWithMetadata,
          pagination: {
            total: totalCount,
            limit: pagination.limit,
            offset: pagination.offset,
            has_more: hasMore
          }
        });
      } catch (dbError) {
        // Fall back to storage scan if DB listing fails
        logError(dbError, { context: 'files.list.db', applicationId, userId: req.userId });
      }
    } else {
      // Return empty list if database not available
      // no immediate return; continue to storage fallback below
    }

    // Storage fallback: scan likely bucket/folder paths to provide a best-effort listing
    const userId = req.userId;
    const applicationId = req.query.app_id || req.appId;
    const candidateBuckets = Array.from(new Set([
      // Application-aware buckets (Castingly)
      ...(applicationId ? [`${applicationId}-public`, `${applicationId}-private`] : []),
      // Common buckets
      'castingly-public', 'castingly-private', 'default'
    ]));

    const candidatePaths = [];
    // Common Castingly layout
    if (userId) {
      candidatePaths.push('', 'actors', `actors/${userId}`,
        `actors/${userId}/headshots`, `actors/${userId}/reels`, `actors/${userId}/resume`,
        `actors/${userId}/resumes`, `actors/${userId}/voice-over`, `actors/${userId}/voice_over`,
        `actors/${userId}/self-tapes`, `actors/${userId}/self_tapes`, `actors/${userId}/documents`,
        `actors/${userId}/misc`
      );
    } else {
      candidatePaths.push('');
    }

    const collected = [];
    for (const bucketId of candidateBuckets) {
      for (const folderPath of candidatePaths) {
        try {
          const items = await storageService.listBucketFolder(userId || 'system', bucketId, folderPath);
          for (const it of items) {
            if (it && it.is_folder === false) {
              const typeInfo = fileService.getFileTypeInfo(it.original_filename || it.name || it.id || '');
              collected.push({
                id: it.id || it.name,
                original_filename: it.original_filename || it.name,
                file_size: it.file_size,
                mime_type: it.mime_type || typeInfo.mime,
                uploaded_at: it.uploaded_at || it.created_at || new Date().toISOString(),
                storage_key: it.storage_key,
                access: it.access,
                public_url: it.public_url,
                signed_url: it.signed_url,
                bucket_id: bucketId,
                folder_path: it.folder_path || folderPath,
                category: typeInfo.category,
              });
            }
          }
        } catch (_) {
          // ignore per-path errors
        }
      }
      if (collected.length >= parseInt(limit)) break;
    }

    // Apply pagination on collected
    const start = parseInt(offset) || 0;
    const end = start + Math.min(parseInt(limit) || 24, 100);
    const page = collected.slice(start, end);

    return res.json({
      success: true,
      files: page,
      pagination: {
        total: collected.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: end < collected.length
      },
      fallback: true
    });
  } catch (error) {
    logError(error, { 
      context: 'files.list',
      userId: req.userId 
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to list files'
    });
  }
});

// Get file by ID
router.get('/:id', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (databaseService.isAvailable()) {
      const file = await databaseService.getMediaFile(id);
      
      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Check access permissions
      if (file.user_id !== req.userId && !req.apiKey.permissions.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Get variants if any
      const variants = await databaseService.getMediaVariants(id);
      const variantsWithUrls = await Promise.all(variants.map(async v => {
        const variantAccess = await storageService.getAccessDetails(v.storage_key, { access: file.is_public ? 'public' : 'private' });
        return {
          ...v,
          access: variantAccess.access,
          url: variantAccess.publicUrl,
          signed_url: variantAccess.signedUrl
        };
      }));

      // Get type info
      const typeInfo = fileService.getFileTypeInfo(file.original_filename || file.storage_key);

      const accessDetails = await storageService.getAccessDetails(file.storage_key, { access: file.is_public ? 'public' : 'private' });

      res.json({
        success: true,
        file: {
          ...file,
          category: typeInfo.category,
          mime: typeInfo.mime,
          access: accessDetails.access,
          public_url: accessDetails.publicUrl,
          signed_url: accessDetails.signedUrl,
          variants: variantsWithUrls
        }
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
  } catch (error) {
    logError(error, {
      context: 'files.getById',
      id: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve file'
    });
  }
});

// Transform image on demand and stream
router.get('/:id/transform', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const { id } = req.params;
    const { width, height, quality = 85, format = 'jpeg', fit = 'inside' } = req.query;

    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const file = await databaseService.getMediaFile(id);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    // Permission check
    const isOwner = file.user_id === req.userId;
    const isAdmin = Array.isArray(req.userRoles)
      ? req.userRoles.some(role => ['core.admin', 'tenant.admin', 'user.admin'].includes(role))
      : false;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const typeInfo = fileService.getFileTypeInfo(file.original_filename || file.storage_key);
    if (typeInfo.category !== 'image' || !typeInfo.isSupported) {
      return res.status(400).json({ success: false, error: 'Transform only supported for images' });
    }

    const { buffer, contentType, size } = await imageService.transformImage(file.storage_key, {
      width,
      height,
      quality,
      format,
      fit
    });

    // Basic caching headers
    const etag = `W/\"${Buffer.from(`${file.id}:${file.storage_key}:${width||''}x${height||''}:${quality}:${format}:${fit}`).toString('base64')}\"`;
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Length', size);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', file.is_public ? 'public, max-age=86400' : 'private, max-age=0, no-store');

    // Conditional request support
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.status(200).send(buffer);
  } catch (error) {
    logError(error, { context: 'files.transform', id: req.params.id, query: req.query });
    res.status(500).json({ success: false, error: 'Failed to transform image' });
  }
});

// Update file metadata
router.put('/:id', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (databaseService.isAvailable()) {
      const file = await databaseService.getMediaFile(id);
      
      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Check permissions
      if (file.user_id !== req.userId && !req.apiKey.permissions.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Update allowed fields
      const allowedUpdates = ['title', 'description', 'alt_text', 'is_public', 'tags', 'metadata'];
      const filteredUpdates = {};
      
      for (const field of allowedUpdates) {
        if (field in updates) {
          filteredUpdates[field] = updates[field];
        }
      }

      await databaseService.updateMediaFile(id, filteredUpdates);
      const updatedFile = await databaseService.getMediaFile(id);

      res.json({
        success: true,
        file: updatedFile
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
  } catch (error) {
    logError(error, {
      context: 'files.update',
      id: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to update file'
    });
  }
});

// Delete file
router.delete('/:id', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;
    
    if (databaseService.isAvailable()) {
      const file = await databaseService.getMediaFile(id);
      
      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Check permissions
      if (file.user_id !== req.userId && !req.apiKey.permissions.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      if (permanent) {
        // Delete from storage
        await fileService.deleteFile(file.storage_key);
        
        // Delete variants
        const variants = await databaseService.getMediaVariants(id);
        for (const variant of variants) {
          await storageService.deleteFile(variant.storage_key);
        }
        
        // Delete from database
        await databaseService.deleteMediaFile(id, true);
      } else {
        // Soft delete
        await databaseService.deleteMediaFile(id, false);
      }

      res.json({
        success: true,
        message: permanent ? 'File permanently deleted' : 'File moved to trash'
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
  } catch (error) {
    logError(error, {
      context: 'files.delete',
      id: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete file'
    });
  }
});

// Batch operations
router.post('/batch', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { operation, file_ids, data } = req.body;
    
    if (!operation || !file_ids || !Array.isArray(file_ids)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid batch operation request'
      });
    }

    if (databaseService.isAvailable()) {
      const results = [];
      const errors = [];

      for (const fileId of file_ids) {
        try {
          const file = await databaseService.getMediaFile(fileId);
          
          if (!file || file.user_id !== req.userId) {
            errors.push({ id: fileId, error: 'Not found or access denied' });
            continue;
          }

          switch (operation) {
            case 'delete':
              await databaseService.deleteMediaFile(fileId, false);
              results.push({ id: fileId, success: true });
              break;
            
            case 'update':
              if (data) {
                const allowedUpdates = ['is_public', 'collection_id', 'tags'];
                const updates = {};
                for (const field of allowedUpdates) {
                  if (field in data) updates[field] = data[field];
                }
                await databaseService.updateMediaFile(fileId, updates);
                results.push({ id: fileId, success: true });
              }
              break;
              
            case 'move':
              if (data && data.collection_id) {
                await databaseService.updateMediaFile(fileId, { 
                  collection_id: data.collection_id 
                });
                results.push({ id: fileId, success: true });
              }
              break;
            
            default:
              errors.push({ id: fileId, error: 'Unknown operation' });
          }
        } catch (error) {
          errors.push({ id: fileId, error: error.message });
        }
      }

      res.json({
        success: errors.length === 0,
        results,
        errors
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
  } catch (error) {
    logError(error, {
      context: 'files.batch',
      operation: req.body.operation
    });
    
    res.status(500).json({
      success: false,
      error: 'Batch operation failed'
    });
  }
});

// Search files
router.get('/search', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const {
      q,
      category,
      type,
      limit = 50,
      offset = 0
    } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query required'
      });
    }

    if (databaseService.isAvailable()) {
      const filters = {
        user_id: req.userId,
        search: q
      };

      if (category) filters.category = category;
      if (type) filters.mime_type = type;

      const pagination = {
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset)
      };

      const {
        files,
        total: totalCount,
        hasMore
      } = await databaseService.listMediaFiles(filters, pagination);

      res.json({
        success: true,
        query: q,
        results: await Promise.all(files.map(async file => {
          const typeInfo = fileService.getFileTypeInfo(file.original_filename || file.storage_key);
          const accessDetails = await storageService.getAccessDetails(file.storage_key, { access: file.is_public ? 'public' : 'private' });
          return {
            ...file,
            category: typeInfo.category,
            access: accessDetails.access,
            public_url: accessDetails.publicUrl,
            signed_url: accessDetails.signedUrl
          };
        })),
        pagination: {
          total: totalCount,
          limit: pagination.limit,
          offset: pagination.offset,
          has_more: hasMore
        }
      });
    } else {
      res.json({
        success: true,
        query: q,
        results: [],
        pagination: {
          total: 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          has_more: false
        }
      });
    }
  } catch (error) {
    logError(error, {
      context: 'files.search',
      query: req.query.q
    });
    
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Get file statistics
router.get('/stats', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    if (databaseService.isAvailable()) {
      const stats = await databaseService.getMediaStatistics(req.userId);
      
      // Group by category
      const byCategory = {};
      if (stats.by_type) {
        for (const [mime, count] of Object.entries(stats.by_type)) {
          // Determine category from mime type
          let category = 'other';
          if (mime.startsWith('image/')) category = 'image';
          else if (mime.startsWith('video/')) category = 'video';
          else if (mime.startsWith('audio/')) category = 'audio';
          else if (mime.startsWith('text/')) category = 'text';
          else if (mime.includes('document')) category = 'document';
          else if (mime.includes('zip') || mime.includes('compress')) category = 'archive';
          
          byCategory[category] = (byCategory[category] || 0) + count;
        }
      }
      
      res.json({
        success: true,
        stats: {
          ...stats,
          by_category: byCategory
        }
      });
    } else {
      res.json({
        success: true,
        stats: {
          total_files: 0,
          total_size: 0,
          by_type: {},
          by_category: {},
          recent_uploads: []
        }
      });
    }
  } catch (error) {
    logError(error, {
      context: 'files.stats',
      userId: req.userId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

// Get file categories
router.get('/categories', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const formats = fileService.getSupportedFormats();
    
    res.json({
      success: true,
      categories: Object.keys(formats).map(category => ({
        name: category,
        formats: formats[category].length,
        examples: formats[category].slice(0, 5).map(f => f.extension)
      }))
    });
  } catch (error) {
    logError(error, {
      context: 'files.categories'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get categories'
    });
  }
});

// Update metadata by storage_key (admin/owner)
router.patch('/by-storage-key', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { storage_key, metadata, categories } = req.body || {}
    if (!storage_key || typeof storage_key !== 'string') {
      return res.status(400).json({ success: false, error: 'storage_key is required' })
    }

    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' })
    }

    const file = await databaseService.getMediaFileByStorageKey(storage_key)
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' })
    }

    // Permission: owner or admin
    const isOwner = file.user_id === req.userId
    const isAdmin = Array.isArray(req.userRoles)
      ? req.userRoles.some((r) => ['core.admin', 'tenant.admin', 'user.admin'].includes(String(r)))
      : false
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' })
    }

    const currentMeta = typeof file.metadata === 'object' ? file.metadata : {}
    const nextMeta = metadata && typeof metadata === 'object' ? { ...currentMeta, ...metadata } : currentMeta
    const currentCats = Array.isArray(file.categories) ? file.categories : []
    const nextCats = Array.isArray(categories) && categories.length > 0
      ? Array.from(new Set([...currentCats, ...categories]))
      : currentCats

    await databaseService.updateMediaFile(file.id, { metadata: nextMeta, categories: nextCats })
    return res.json({ success: true, id: file.id })
  } catch (error) {
    logError(error, { context: 'files.updateByStorageKey' })
    return res.status(500).json({ success: false, error: 'Failed to update metadata' })
  }
})

export default router;
