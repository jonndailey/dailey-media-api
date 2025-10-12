import express from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import fileService from '../services/fileService.js';
import databaseService from '../services/databaseService.js';
import thumbnailService from '../services/thumbnailService.js';
import analyticsService from '../services/analyticsService.js';
import { logInfo, logError } from '../middleware/logger.js';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import { normalizeRelativePath } from '../utils/pathUtils.js';
import bucketService from '../services/bucketService.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Accept ALL file types
    cb(null, true);
  }
});

// Upload single file
router.post('/', authenticateToken, requireScope('upload'), upload.single('file'), async (req, res) => {
  try {
    // Use authenticated user's info if not provided in body
    const user_id = req.body.user_id || req.userId;
    const app_id = req.body.app_id || req.appId;
    const bucket_id = req.body.bucket_id || 'default';
    const folder_path = normalizeRelativePath(req.body.folder_path || '');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }
    
    let bucketInfo = null;
    try {
      bucketInfo = await bucketService.getBucket(user_id, bucket_id);
    } catch (bucketError) {
      logError(bucketError, { context: 'upload.resolveBucket', userId: user_id, bucketId: bucket_id });
    }

    const bucketAccess = bucketInfo?.is_public ? 'public' : 'private';

    const uploadId = nanoid();
    
    logInfo('Processing single file upload', {
      uploadId,
      filename: req.file.originalname,
      size: req.file.size,
      userId: user_id,
      appId: app_id,
      bucketId: bucket_id,
      folderPath: folder_path
    });
    
    // Process and store the file
    const result = await fileService.processAndStoreFile(
      req.file.buffer,
      req.file.originalname,
      user_id,
      app_id,
      {
        uploadId,
        bucketId: bucket_id,
        folderPath: folder_path,
        bucketAccess,
        isPublic: bucketAccess === 'public',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        mimeType: req.file.mimetype
      }
    );

    // Store in database if available
    let mediaId = null;
    if (databaseService.isAvailable() && result.original) {
      try {
        mediaId = await databaseService.createMediaFile({
          storage_key: result.original.key,
          original_filename: req.file.originalname,
          user_id,
          application_id: app_id,
          bucket_id,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          file_extension: result.original.extension,
          content_hash: result.original.hash,
          width: result.metadata?.width,
          height: result.metadata?.height,
          processing_status: 'completed',
          is_public: bucketAccess === 'public',
          folder_path: folder_path,
          metadata: {
            uploadId,
            bucketId: bucket_id,
            folderPath: folder_path,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            ...result.metadata
          },
          exif_data: result.metadata?.exif || {}
        });

        // Generate thumbnails in the background
        if (mediaId && result.metadata?.width && result.metadata?.height) {
          thumbnailService.generateThumbnails(mediaId, req.file.buffer, {
            sizes: ['thumbnail', 'small', 'medium'],
            formats: ['webp', 'jpeg']
          }).catch(error => {
            logError(error, { context: 'upload.thumbnails', mediaId });
          });
        }
      } catch (dbError) {
        logError(dbError, { context: 'upload.database', uploadId });
        // Continue without database - don't fail the upload
      }
    }

    // Track analytics
    try {
      const userContext = {
        userId: req.userId,
        user: req.user,
        email: req.user?.email,
        roles: req.userRoles,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      };

      await analyticsService.trackFileUpload({
        size: req.file.size,
        category: result.metadata?.category || 'other',
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        isPublic: bucketAccess === 'public'
      }, userContext);
    } catch (analyticsError) {
      logError(analyticsError, { context: 'upload.analytics', uploadId });
      // Don't fail the upload if analytics fails
    }
    
    res.json({
      success: true,
      uploadId,
      mediaId,
      file: {
        original: result.original,
        variants: result.variants,
        metadata: {
          filename: req.file.originalname,
          size: req.file.size,
          ...result.metadata
        }
      }
    });
    
  } catch (error) {
    logError(error, { 
      context: 'upload.single',
      filename: req.file?.originalname,
      size: req.file?.size
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload multiple files
router.post('/batch', authenticateToken, requireScope('upload'), upload.array('files', 10), async (req, res) => {
  try {
    // Use authenticated user's info if not provided in body
    const user_id = req.body.user_id || req.userId;
    const app_id = req.body.app_id || req.appId;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }
    
    const uploadId = nanoid();
    
    logInfo('Processing batch file upload', {
      uploadId,
      fileCount: req.files.length,
      totalSize: req.files.reduce((sum, file) => sum + file.size, 0),
      userId: user_id,
      appId: app_id
    });
    
    // Process all files concurrently
    const uploadPromises = req.files.map(async (file, index) => {
      try {
        const result = await fileService.processAndStoreFile(
          file.buffer,
          file.originalname,
          user_id,
          app_id,
          {
            uploadId,
            batchIndex: index,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            mimeType: file.mimetype
          }
        );
        
        return {
          success: true,
          filename: file.originalname,
          size: file.size,
          original: result.original,
          variants: result.variants,
          metadata: result.metadata
        };
      } catch (fileError) {
        logError(fileError, {
          context: 'upload.batch.file',
          filename: file.originalname,
          uploadId,
          batchIndex: index
        });
        
        return {
          success: false,
          filename: file.originalname,
          error: fileError.message
        };
      }
    });
    
    const results = await Promise.all(uploadPromises);
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    res.json({
      success: failed.length === 0,
      uploadId,
      summary: {
        total: req.files.length,
        successful: successful.length,
        failed: failed.length
      },
      files: results
    });
    
  } catch (error) {
    logError(error, { 
      context: 'upload.batch',
      fileCount: req.files?.length || 0
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get upload status (placeholder for future implementation)
router.get('/status/:uploadId', (req, res) => {
  res.json({
    uploadId: req.params.uploadId,
    status: 'completed', // In the future, this could track async processing
    message: 'Upload status tracking not yet implemented'
  });
});

// Get supported formats
router.get('/formats', (req, res) => {
  const formats = fileService.getSupportedFormats();
  res.json({
    success: true,
    formats,
    message: 'All file types are accepted for storage'
  });
});

export default router;
