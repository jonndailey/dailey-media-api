import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import databaseService from '../services/databaseService.js';
import storageService from '../services/storageService.js';
import fileService from '../services/fileService.js';
import { logInfo, logError } from '../middleware/logger.js';

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
      max_size
    } = req.query;

    // If database is available, use it
    if (databaseService.isAvailable()) {
      const filters = {
        user_id: req.userId,
        application_id: req.appId
      };

      if (search) filters.search = search;
      if (category) filters.category = category;
      if (mime_type) filters.mime_type = mime_type;
      if (min_size) filters.min_size = parseInt(min_size);
      if (max_size) filters.max_size = parseInt(max_size);

      const pagination = {
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset),
        orderBy: order_by,
        orderDirection: order_direction
      };

      const results = await databaseService.searchMediaFiles(filters, pagination);
      const totalCount = await databaseService.countMediaFiles(filters);

      // Add URLs and type info to each file
      const filesWithMetadata = await Promise.all(results.map(async file => {
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

      res.json({
        success: true,
        files: filesWithMetadata,
        pagination: {
          total: totalCount,
          limit: pagination.limit,
          offset: pagination.offset,
          has_more: (pagination.offset + results.length) < totalCount
        }
      });
    } else {
      // Return empty list if database not available
      res.json({
        success: true,
        files: [],
        pagination: {
          total: 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          has_more: false
        },
        message: 'Database not configured. Files are stored but not indexed.'
      });
    }
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

      const results = await databaseService.searchMediaFiles(filters, pagination);
      const totalCount = await databaseService.countMediaFiles(filters);

      res.json({
        success: true,
        query: q,
        results: await Promise.all(results.map(async file => {
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
          has_more: (pagination.offset + results.length) < totalCount
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

export default router;
