import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import databaseService from '../services/databaseService.js';
import storageService from '../services/storageService.js';
import { logInfo, logError } from '../middleware/logger.js';

const router = express.Router();

// List media items with pagination and filtering
router.get('/', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const {
      limit = 24,
      offset = 0,
      order_by = 'uploaded_at',
      order_direction = 'DESC',
      search,
      mime_type,
      processing_status
    } = req.query;

    // If database is available, use it
    if (databaseService.isAvailable()) {
      const filters = {
        user_id: req.userId,
        application_id: req.appId
      };

      if (search) filters.search = search;
      if (mime_type) filters.mime_type = mime_type;
      if (processing_status) filters.processing_status = processing_status;

      const pagination = {
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset),
        orderBy: order_by,
        orderDirection: order_direction
      };

      const results = await databaseService.searchMediaFiles(filters, pagination);
      const totalCount = await databaseService.countMediaFiles(filters);

      // Add URLs to each media file
      const filesWithUrls = await Promise.all(results.map(async file => {
        const accessDetails = await storageService.getAccessDetails(file.storage_key, { access: file.is_public ? 'public' : 'private' });
        const thumbnailAccess = file.thumbnail_key
          ? await storageService.getAccessDetails(file.thumbnail_key, { access: file.is_public ? 'public' : 'private' })
          : { publicUrl: null, signedUrl: null, access: accessDetails.access };

        return {
          ...file,
          access: accessDetails.access,
          public_url: accessDetails.publicUrl,
          signed_url: accessDetails.signedUrl,
          thumbnail_url: thumbnailAccess.publicUrl,
          thumbnail_signed_url: thumbnailAccess.signedUrl
        };
      }));

      res.json({
        success: true,
        files: filesWithUrls,
        pagination: {
          total: totalCount,
          limit: pagination.limit,
          offset: pagination.offset,
          has_more: (pagination.offset + results.length) < totalCount
        }
      });
    } else {
      // Fallback: scan filesystem when database not available
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const userStoragePath = path.join(process.cwd(), 'storage', 'files', req.userId);
        
        let files = [];
        try {
          const entries = await fs.readdir(userStoragePath, { withFileTypes: true });
          
          // Get all files (not directories) and their metadata
          const filePromises = entries
            .filter(entry => entry.isFile() && !entry.name.endsWith('.meta.json'))
            .map(async (entry) => {
              try {
                const filePath = path.join(userStoragePath, entry.name);
                const stats = await fs.stat(filePath);
                
                // Try to get metadata from .meta.json file
                let metadata = {};
                try {
                  const metaPath = filePath + '.meta.json';
                  const metaContent = await fs.readFile(metaPath, 'utf8');
                  metadata = JSON.parse(metaContent);
                } catch {
                  // No metadata file, use basic info
                }
                
                // Extract info from filename if no metadata
                const originalFilename = metadata.originalFilename || entry.name;
                const mimeType = metadata.mimeType || 'application/octet-stream';
                const bucketId = metadata.bucketId || 'default';
                
                const storageKey = `files/${req.userId}/${bucketId}/${entry.name}`;
                const accessDetails = await storageService.getAccessDetails(storageKey, { access: metadata.access });

                return {
                  id: entry.name,
                  original_filename: originalFilename,
                  file_size: stats.size,
                  mime_type: mimeType,
                  uploaded_at: stats.mtime,
                  storage_key: storageKey,
                  access: accessDetails.access,
                  public_url: accessDetails.publicUrl || `/api/serve/files/${req.userId}/${bucketId}/${entry.name}`,
                  signed_url: accessDetails.signedUrl,
                  bucket_id: bucketId,
                  metadata: metadata
                };
              } catch (err) {
                logError(err, { context: 'media.list.filesystem.file', file: entry.name });
                return null;
              }
            });
            
          const resolvedFiles = await Promise.all(filePromises);
          files = resolvedFiles.filter(file => file !== null);
          
          // Sort by upload date (newest first)
          files.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
          
          // Apply pagination
          const startIndex = parseInt(offset);
          const endIndex = startIndex + parseInt(limit);
          const paginatedFiles = files.slice(startIndex, endIndex);
          
          logInfo('Listed files from filesystem', { 
            count: paginatedFiles.length, 
            total: files.length, 
            userId: req.userId 
          });
          
          res.json({
            success: true,
            files: paginatedFiles,
            pagination: {
              total: files.length,
              limit: parseInt(limit),
              offset: parseInt(offset),
              has_more: endIndex < files.length
            }
          });
          
        } catch (dirError) {
          // Directory doesn't exist or is empty
          logInfo('No user storage directory found', { userId: req.userId, error: dirError.message });
          res.json({
            success: true,
            files: [],
            pagination: {
              total: 0,
              limit: parseInt(limit),
              offset: parseInt(offset),
              has_more: false
            }
          });
        }
        
      } catch (fsError) {
        logError(fsError, { context: 'media.list.filesystem' });
        res.json({
          success: true,
          files: [],
          pagination: {
            total: 0,
            limit: parseInt(limit),
            offset: parseInt(offset),
            has_more: false
          }
        });
      }
    }
  } catch (error) {
    logError(error, { 
      context: 'media.list',
      userId: req.userId 
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to list media files'
    });
  }
});

// Get media item by ID
router.get('/files/:id', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (databaseService.isAvailable()) {
      const media = await databaseService.getMediaFile(id);
      
      if (!media) {
        return res.status(404).json({
          success: false,
          error: 'Media not found'
        });
      }

      // Check access permissions
      if (media.user_id !== req.userId && !req.userRoles.some(role => ['core.admin', 'tenant.admin'].includes(role))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Get variants
      const variants = await databaseService.getMediaVariants(id);
      const variantsWithUrls = await Promise.all(variants.map(async v => {
        const variantAccess = await storageService.getAccessDetails(v.storage_key, { access: media.is_public ? 'public' : 'private' });
        return {
          ...v,
          access: variantAccess.access,
          url: variantAccess.publicUrl,
          signed_url: variantAccess.signedUrl
        };
      }));

      // Track file access analytics
      try {
        const userContext = {
          userId: req.userId,
          user: req.user,
          email: req.user?.email,
          roles: req.userRoles,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        };
        
        await analyticsService.trackFileAccess(id, userContext);
      } catch (analyticsError) {
        logError(analyticsError, { context: 'media.access.analytics', mediaId: id });
        // Don't fail the request if analytics fails
      }

      const accessDetails = await storageService.getAccessDetails(media.storage_key, { access: media.is_public ? 'public' : 'private' });

      res.json({
        success: true,
        media: {
          ...media,
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
      context: 'media.getById',
      id: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve media'
    });
  }
});

// Update media item
router.put('/files/:id', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (databaseService.isAvailable()) {
      const media = await databaseService.getMediaFile(id);
      
      if (!media) {
        return res.status(404).json({
          success: false,
          error: 'Media not found'
        });
      }

      // Check permissions
      if (media.user_id !== req.userId && !req.userRoles.some(role => ['core.admin', 'tenant.admin'].includes(role))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Update allowed fields
      const allowedUpdates = ['title', 'description', 'alt_text', 'is_public'];
      const filteredUpdates = {};
      
      for (const field of allowedUpdates) {
        if (field in updates) {
          filteredUpdates[field] = updates[field];
        }
      }

      await databaseService.updateMediaFile(id, filteredUpdates);
      const updatedMedia = await databaseService.getMediaFile(id);

      res.json({
        success: true,
        media: updatedMedia
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
  } catch (error) {
    logError(error, {
      context: 'media.update',
      id: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to update media'
    });
  }
});

// Delete media item
router.delete('/files/:id', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;
    
    if (databaseService.isAvailable()) {
      const media = await databaseService.getMediaFile(id);
      
      if (!media) {
        return res.status(404).json({
          success: false,
          error: 'Media not found'
        });
      }

      // Check permissions
      if (media.user_id !== req.userId && !req.userRoles.some(role => ['core.admin', 'tenant.admin'].includes(role))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      if (permanent) {
        // Delete from storage
        await storageService.deleteFile(media.storage_key);
        
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
        message: permanent ? 'Media permanently deleted' : 'Media moved to trash'
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
  } catch (error) {
    logError(error, {
      context: 'media.delete',
      id: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete media'
    });
  }
});

// Batch operations
router.post('/batch', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { operation, media_ids, data } = req.body;
    
    if (!operation || !media_ids || !Array.isArray(media_ids)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid batch operation request'
      });
    }

    if (databaseService.isAvailable()) {
      const results = [];
      const errors = [];

      for (const mediaId of media_ids) {
        try {
          const media = await databaseService.getMediaFile(mediaId);
          
          if (!media || media.user_id !== req.userId) {
            errors.push({ id: mediaId, error: 'Not found or access denied' });
            continue;
          }

          switch (operation) {
            case 'delete':
              await databaseService.deleteMediaFile(mediaId, false);
              results.push({ id: mediaId, success: true });
              break;
            
            case 'update':
              if (data) {
                const allowedUpdates = ['is_public', 'collection_id'];
                const updates = {};
                for (const field of allowedUpdates) {
                  if (field in data) updates[field] = data[field];
                }
                await databaseService.updateMediaFile(mediaId, updates);
                results.push({ id: mediaId, success: true });
              }
              break;
            
            default:
              errors.push({ id: mediaId, error: 'Unknown operation' });
          }
        } catch (error) {
          errors.push({ id: mediaId, error: error.message });
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
      context: 'media.batch',
      operation: req.body.operation
    });
    
    res.status(500).json({
      success: false,
      error: 'Batch operation failed'
    });
  }
});

// Search media
router.get('/search', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const {
      q,
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
          const accessDetails = await storageService.getAccessDetails(file.storage_key, { access: file.is_public ? 'public' : 'private' });
          return {
            ...file,
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
      context: 'media.search',
      query: req.query.q
    });
    
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Get media statistics
router.get('/stats', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    if (databaseService.isAvailable()) {
      const stats = await databaseService.getMediaStatistics(req.userId);
      
      res.json({
        success: true,
        stats
      });
    } else {
      res.json({
        success: true,
        stats: {
          total_files: 0,
          total_size: 0,
          by_type: {},
          recent_uploads: []
        }
      });
    }
  } catch (error) {
    logError(error, {
      context: 'media.stats',
      userId: req.userId
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

export default router;
