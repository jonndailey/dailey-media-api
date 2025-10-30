import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import databaseService from '../services/databaseService.js';
import { logInfo, logError } from '../middleware/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { normalizeRelativePath } from '../utils/pathUtils.js';
import storageService from '../services/storageService.js';
import bucketService from '../services/bucketService.js';

const router = express.Router();

const canUseDatabase = (...methods) =>
  databaseService.isAvailable() && methods.every(name => typeof databaseService[name] === 'function');

// List user's buckets
router.get('/', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const appId = req.query.app_id || req.appId;
    let buckets = [];

    if (canUseDatabase('listBucketsByApplication') && appId) {
      try {
        buckets = await databaseService.listBucketsByApplication(appId);
      } catch (dbError) {
        logError(dbError, { context: 'buckets.list.database', userId: req.userId, appId });
      }
      // If DB has no records (e.g., legacy objects not yet migrated), fall back to storage scan
      if (!Array.isArray(buckets) || buckets.length === 0) {
        buckets = await storageService.listUserBuckets(req.userId);
      }
    } else if (canUseDatabase('getUserBuckets')) {
      try {
        buckets = await databaseService.getUserBuckets(req.userId);
      } catch (dbError) {
        logError(dbError, { context: 'buckets.list.userBuckets', userId: req.userId });
      }
      if (!Array.isArray(buckets) || buckets.length === 0) {
        buckets = await storageService.listUserBuckets(req.userId);
      }
    }

    if (!Array.isArray(buckets) || buckets.length === 0) {
      buckets = await storageService.listUserBuckets(req.userId);
    }

    res.json({
      success: true,
      buckets
    });
  } catch (error) {
    logError(error, { context: 'buckets.list', userId: req.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to list buckets'
    });
  }
});

// Create new bucket
router.post('/', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { name, description, is_public = false } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bucket name is required'
      });
    }
    
    // Sanitize bucket name (no special characters, spaces become dashes)
    const sanitizedName = name.trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    if (sanitizedName.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bucket name'
      });
    }
    
    if (canUseDatabase('getBucketByName', 'createBucket')) {
      // Check if bucket already exists
      const existingBucket = await databaseService.getBucketByName(req.userId, sanitizedName);
      if (existingBucket) {
        return res.status(409).json({
          success: false,
          error: 'Bucket already exists'
        });
      }
      
      const bucket = await databaseService.createBucket({
        user_id: req.userId,
        name: sanitizedName,
        description: description || '',
        is_public
      });
      
      bucketService.invalidate(req.userId, sanitizedName);

      res.status(201).json({
        success: true,
        bucket
      });
    } else {
      // Fallback: create directory
      const userStoragePath = path.join(process.cwd(), 'storage', 'files', req.userId);
      const bucketPath = path.join(userStoragePath, sanitizedName);
      
      // Check if bucket directory already exists
      try {
        await fs.access(bucketPath);
        return res.status(409).json({
          success: false,
          error: 'Bucket already exists'
        });
      } catch {
        // Directory doesn't exist, create it
      }
      
      // Ensure user directory exists
      await fs.mkdir(userStoragePath, { recursive: true });
      
      // Create bucket directory
      await fs.mkdir(bucketPath, { recursive: true });
      
      // Create bucket metadata file
      const bucketMeta = {
        id: sanitizedName,
        name: sanitizedName,
        original_name: name.trim(),
        description: description || '',
        is_public,
        user_id: req.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(bucketPath, '.bucket.meta.json'),
        JSON.stringify(bucketMeta, null, 2)
      );
      
      logInfo('Bucket created', { bucketName: sanitizedName, userId: req.userId });
      
      bucketService.invalidate(req.userId, sanitizedName);

      res.status(201).json({
        success: true,
        bucket: bucketMeta
      });
    }
  } catch (error) {
    logError(error, { context: 'buckets.create', userId: req.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to create bucket'
    });
  }
});

// Create folder in bucket
router.post('/:bucketId/folders', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { bucketId } = req.params;
    const rawFolderPath = req.body.path;
    
    if (!rawFolderPath || rawFolderPath.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Folder path is required'
      });
    }
    
    const sanitizedPath = normalizeRelativePath(rawFolderPath);
    
    if (sanitizedPath.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid folder path'
      });
    }
    
    // Create the folder directory
    const userStoragePath = path.join(process.cwd(), 'storage', 'files', req.userId, bucketId);
    const folderFullPath = path.join(userStoragePath, sanitizedPath);
    
    try {
      // Ensure bucket directory exists
      await fs.mkdir(userStoragePath, { recursive: true });
      
      // Create folder directory
      await fs.mkdir(folderFullPath, { recursive: true });
      
      // Create folder metadata
      const folderMeta = {
        name: sanitizedPath.split('/').pop(),
        path: sanitizedPath,
        is_folder: true,
        created_at: new Date().toISOString(),
        created_by: req.userId
      };
      
      await fs.writeFile(
        path.join(folderFullPath, '.folder.meta.json'),
        JSON.stringify(folderMeta, null, 2)
      );
      
      logInfo('Folder created', { folderPath: sanitizedPath, bucketId, userId: req.userId });
      
      res.status(201).json({
        success: true,
        folder: folderMeta
      });
      
    } catch (fsError) {
      if (fsError.code === 'EEXIST') {
        return res.status(409).json({
          success: false,
          error: 'Folder already exists'
        });
      }
      throw fsError;
    }
    
  } catch (error) {
    logError(error, { context: 'buckets.createFolder', bucketId: req.params.bucketId });
    res.status(500).json({
      success: false,
      error: 'Failed to create folder'
    });
  }
});

// Get bucket files and folders with optional path
router.get('/:bucketId/files', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const { bucketId } = req.params;
    const { path: requestPath = '', user_id: explicitUserId } = req.query;
    const appId = req.query.app_id || req.appId;
    const normalizedPath = normalizeRelativePath(typeof requestPath === 'string' ? requestPath : '');
    const hasDatabase = typeof databaseService.isAvailable === 'function' && databaseService.isAvailable();

    // Root listing: show user scopes when we have application context
    if (!normalizedPath && !explicitUserId && hasDatabase && typeof databaseService.getBucketUsersByApplication === 'function' && appId) {
      try {
        const users = await databaseService.getBucketUsersByApplication(appId, bucketId);
        if (users.length > 0) {
          const folders = users.map(user => ({
            id: user.user_id,
            name: user.user_id,
            is_folder: true,
            file_count: user.file_count,
            uploaded_at: user.last_uploaded_at,
            created_at: user.first_uploaded_at,
            bucket_id: bucketId,
            metadata: {
              userId: user.user_id,
              fileCount: user.file_count,
              firstUploadedAt: user.first_uploaded_at,
              lastUploadedAt: user.last_uploaded_at
            }
          }));

          return res.json({
            success: true,
            files: folders,
            current_path: '',
            bucket_id: bucketId
          });
        }
      } catch (userError) {
        logError(userError, {
          context: 'buckets.getFiles.bucketUsers',
          bucketId,
          appId
        });
      }
    }

    // Determine which user scope to inspect
    let targetUserId = explicitUserId || '';
    let folderPath = normalizedPath;

    if (normalizedPath) {
      const segments = normalizedPath.split('/').filter(Boolean);
      if (segments.length) {
        // Only derive targetUserId from path when not explicitly provided via query
        if (!targetUserId) {
          targetUserId = segments.shift();
        }
        folderPath = segments.join('/');
      }
    }

    if (!targetUserId) {
      targetUserId = req.userId;
    }

    if (!targetUserId) {
      return res.json({
        success: true,
        files: [],
        current_path: normalizedPath,
        bucket_id: bucketId
      });
    }

    try {
      const items = await storageService.listBucketFolder(targetUserId, bucketId, folderPath);
      const files = items.map(item => ({
        ...item,
        user_id: targetUserId,
        bucket_id: bucketId,
        folder_path: folderPath,
        path: folderPath ? `${targetUserId}/${folderPath}` : targetUserId
      }));

      res.json({
        success: true,
        files,
        current_path: normalizedPath,
        bucket_id: bucketId
      });
    } catch (dirError) {
      if (dirError.code === 'ENOENT') {
        return res.status(404).json({
          success: false,
          error: 'Folder not found'
        });
      }
      throw dirError;
    }
  } catch (error) {
    logError(error, { context: 'buckets.getFiles', bucketId: req.params.bucketId });
    res.status(500).json({
      success: false,
      error: 'Failed to get files'
    });
  }
});

// Delete file from bucket
router.delete('/:bucketId/files/:fileId', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { bucketId, fileId } = req.params;
    
    // For filesystem-based storage (when database not available)
    try {
      await storageService.deleteFileFromBucket(req.userId, bucketId, fileId);
      
      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (deleteError) {
      if (deleteError.code === 'ENOENT') {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }
      throw deleteError;
    }
  } catch (error) {
    logError(error, { 
      context: 'buckets.deleteFile', 
      bucketId: req.params.bucketId,
      fileId: req.params.fileId 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete file'
    });
  }
});

// Get bucket details
router.get('/:bucketId', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const { bucketId } = req.params;
    
    if (canUseDatabase('getBucket', 'getBucketFiles')) {
      const bucket = await databaseService.getBucket(bucketId);
      
      if (!bucket || bucket.user_id !== req.userId) {
        return res.status(404).json({
          success: false,
          error: 'Bucket not found'
        });
      }
      
      // Get files in bucket
      const files = await databaseService.getBucketFiles(bucketId);
      
      res.json({
        success: true,
        bucket: {
          ...bucket,
          files
        }
      });
    } else {
      // Fallback: read from filesystem
      const bucketPath = path.join(process.cwd(), 'storage', 'files', req.userId, bucketId);
      
      try {
        await fs.access(bucketPath);
        
        // Read bucket metadata
        let bucketMeta = {};
        try {
          const metaContent = await fs.readFile(path.join(bucketPath, '.bucket.meta.json'), 'utf8');
          bucketMeta = JSON.parse(metaContent);
        } catch {
          // No metadata file, create basic info
          bucketMeta = {
            id: bucketId,
            name: bucketId,
            description: `Bucket: ${bucketId}`,
            is_public: false,
            user_id: req.userId
          };
        }
        
        // Get files in bucket
        const entries = await fs.readdir(bucketPath, { withFileTypes: true });
        const files = [];
        
        for (const entry of entries) {
          if (entry.isFile() && !entry.name.startsWith('.') && !entry.name.endsWith('.meta.json')) {
            const filePath = path.join(bucketPath, entry.name);
            const stats = await fs.stat(filePath);
            
            // Try to get file metadata
            let metadata = {};
            try {
              const metaPath = filePath + '.meta.json';
              const metaContent = await fs.readFile(metaPath, 'utf8');
              metadata = JSON.parse(metaContent);
            } catch {
              // No metadata
            }
            
            const storageKey = `files/${req.userId}/${bucketId}/${entry.name}`;
            const accessDetails = await storageService.getAccessDetails(storageKey, { access: metadata.access });

            files.push({
              id: entry.name,
              original_filename: metadata.originalFilename || entry.name,
              file_size: stats.size,
              mime_type: metadata.mimeType || 'application/octet-stream',
              uploaded_at: stats.mtime,
              storage_key: storageKey,
              public_url: accessDetails.publicUrl || `/api/serve/files/${req.userId}/${bucketId}/${entry.name}`,
              signed_url: accessDetails.signedUrl,
              access: accessDetails.access,
              bucket_id: bucketId
            });
          }
        }
        
        res.json({
          success: true,
          bucket: {
            ...bucketMeta,
            files
          }
        });
        
      } catch {
        return res.status(404).json({
          success: false,
          error: 'Bucket not found'
        });
      }
    }
  } catch (error) {
    logError(error, { context: 'buckets.get', bucketId: req.params.bucketId });
    res.status(500).json({
      success: false,
      error: 'Failed to get bucket'
    });
  }
});

// Update bucket
router.put('/:bucketId', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { bucketId } = req.params;
    const { name, description, is_public } = req.body;
    
    if (canUseDatabase('getBucket', 'updateBucket')) {
      const bucket = await databaseService.getBucket(bucketId);
      
      if (!bucket || bucket.user_id !== req.userId) {
        return res.status(404).json({
          success: false,
          error: 'Bucket not found'
        });
      }
      
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (is_public !== undefined) updates.is_public = is_public;
      
      const updatedBucket = await databaseService.updateBucket(bucketId, updates);
      
      bucketService.invalidate(req.userId, bucketId);

      res.json({
        success: true,
        bucket: updatedBucket
      });
    } else {
      // Fallback: update metadata file
      const bucketPath = path.join(process.cwd(), 'storage', 'files', req.userId, bucketId);
      const metaPath = path.join(bucketPath, '.bucket.meta.json');
      
      try {
        await fs.access(bucketPath);
        
        let bucketMeta = {};
        try {
          const metaContent = await fs.readFile(metaPath, 'utf8');
          bucketMeta = JSON.parse(metaContent);
        } catch {
          bucketMeta = {
            id: bucketId,
            name: bucketId,
            user_id: req.userId,
            created_at: new Date().toISOString()
          };
        }
        
        // Update fields
        if (name !== undefined) bucketMeta.name = name;
        if (description !== undefined) bucketMeta.description = description;
        if (is_public !== undefined) bucketMeta.is_public = is_public;
        bucketMeta.updated_at = new Date().toISOString();
        
        await fs.writeFile(metaPath, JSON.stringify(bucketMeta, null, 2));
        
        bucketService.invalidate(req.userId, bucketId);

        res.json({
          success: true,
          bucket: bucketMeta
        });
        
      } catch {
        return res.status(404).json({
          success: false,
          error: 'Bucket not found'
        });
      }
    }
  } catch (error) {
    logError(error, { context: 'buckets.update', bucketId: req.params.bucketId });
    res.status(500).json({
      success: false,
      error: 'Failed to update bucket'
    });
  }
});

// Delete bucket
router.delete('/:bucketId', authenticateToken, requireScope('upload'), async (req, res) => {
  try {
    const { bucketId } = req.params;
    const { force = false } = req.query;
    
    if (bucketId === 'default') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete default bucket'
      });
    }
    
    if (canUseDatabase('getBucket', 'deleteBucket', 'getBucketFileCount')) {
      const bucket = await databaseService.getBucket(bucketId);
      
      if (!bucket || bucket.user_id !== req.userId) {
        return res.status(404).json({
          success: false,
          error: 'Bucket not found'
        });
      }
      
      // Check if bucket has files
      const fileCount = await databaseService.getBucketFileCount(bucketId);
      if (fileCount > 0 && !force) {
        return res.status(400).json({
          success: false,
          error: 'Bucket contains files. Use ?force=true to delete anyway.',
          file_count: fileCount
        });
      }
      
      await databaseService.deleteBucket(bucketId, force);
      bucketService.invalidate(req.userId, bucketId);
      
      res.json({
        success: true,
        message: 'Bucket deleted successfully'
      });
    } else {
      // Fallback: delete directory
      const bucketPath = path.join(process.cwd(), 'storage', 'files', req.userId, bucketId);
      
      try {
        await fs.access(bucketPath);
        
        // Check if bucket has files
        const entries = await fs.readdir(bucketPath);
        const fileCount = entries.filter(f => !f.startsWith('.') && !f.endsWith('.meta.json')).length;
        
        if (fileCount > 0 && !force) {
          return res.status(400).json({
            success: false,
            error: 'Bucket contains files. Use ?force=true to delete anyway.',
            file_count: fileCount
          });
        }
        
        // Delete bucket directory and all contents
        await fs.rm(bucketPath, { recursive: true, force: true });
        
        logInfo('Bucket deleted', { bucketId, userId: req.userId });
        bucketService.invalidate(req.userId, bucketId);
        
        res.json({
          success: true,
          message: 'Bucket deleted successfully'
        });
        
      } catch {
        return res.status(404).json({
          success: false,
          error: 'Bucket not found'
        });
      }
    }
  } catch (error) {
    logError(error, { context: 'buckets.delete', bucketId: req.params.bucketId });
    res.status(500).json({
      success: false,
      error: 'Failed to delete bucket'
    });
  }
});

export default router;
