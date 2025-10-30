import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import databaseService from '../services/databaseService.js';
import documentConversionService from '../services/documentConversionService.js';
import { logError } from '../middleware/logger.js';
import storageService from '../services/storageService.js';
import crypto from 'node:crypto';
import mime from 'mime-types';

const router = express.Router();

function canAccessFile(req, file) {
  if (!file) {
    return false;
  }

  const isOwner = file.user_id === req.userId;
  const isAdmin = Array.isArray(req.userRoles)
    ? req.userRoles.some(role => ['core.admin', 'tenant.admin', 'user.admin'].includes(role))
    : false;

  return isOwner || isAdmin;
}

/**
 * @swagger
 * /api/conversion/supported:
 *   get:
 *     tags: [Document Conversion]
 *     summary: Retrieve supported conversion formats and feature toggles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Supported conversions returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 supported:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: string
 *                   example:
 *                     docx: ['pdf']
 *                     md: ['html', 'pdf']
 *                 maxBatchSize:
 *                   type: integer
 *                   example: 10
 *                 features:
 *                   type: object
 *                   properties:
 *                     watermarking:
 *                       type: boolean
 *                     compression:
 *                       type: boolean
 *                     security:
 *                       type: boolean
 */
router.get('/supported', authenticateToken, requireScope('read'), (req, res) => {
  const supported = documentConversionService.getSupportedConversions();
  res.json({
    success: true,
    ...supported
  });
});

/**
 * @swagger
 * /api/conversion/{mediaFileId}/jobs:
 *   get:
 *     tags: [Document Conversion]
 *     summary: List conversion jobs for a media file
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: mediaFileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: media-123
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *     responses:
 *       200:
 *         description: Conversion jobs listed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ConversionJob'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Media file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:mediaFileId/jobs', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { mediaFileId } = req.params;
    const mediaFile = await databaseService.getMediaFile(mediaFileId);

    if (!mediaFile) {
      return res.status(404).json({
        success: false,
        error: 'Media file not found'
      });
    }

    if (!canAccessFile(req, mediaFile)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { limit = 20, offset = 0, status } = req.query;
    const results = await documentConversionService.listConversions(mediaFileId, {
      limit: Number(limit),
      offset: Number(offset),
      status: status ? String(status) : null
    });

    res.json({
      success: true,
      results,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: results.length === Number(limit)
      }
    });
  } catch (error) {
    logError(error, {
      context: 'conversion.list',
      mediaFileId: req.params.mediaFileId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversion history'
    });
  }
});

/**
 * @swagger
 * /api/conversion/jobs/{jobId}:
 *   get:
 *     tags: [Document Conversion]
 *     summary: Retrieve a single conversion job
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: jobId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: job_01JBDR3ZKX
 *     responses:
 *       200:
 *         description: Conversion job returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 job:
 *                   $ref: '#/components/schemas/ConversionJob'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Conversion job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/jobs/:jobId', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const job = await documentConversionService.getConversionJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Conversion job not found'
      });
    }

    const mediaFile = await databaseService.getMediaFile(job.media_file_id);
    if (!canAccessFile(req, mediaFile)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      job
    });
  } catch (error) {
    logError(error, {
      context: 'conversion.job.get',
      jobId: req.params.jobId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversion job'
    });
  }
});

/**
 * @swagger
 * /api/conversion/{mediaFileId}/convert:
 *   post:
 *     tags: [Document Conversion]
 *     summary: Convert a media file to a different format
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: mediaFileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: media-123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetFormat:
 *                 type: string
 *                 example: pdf
 *               options:
 *                 type: object
 *                 properties:
 *                   watermark:
 *                     type: string
 *                     example: CONFIDENTIAL
 *                   security:
 *                     type: object
 *                     properties:
 *                       stripMetadata:
 *                         type: boolean
 *                       access:
 *                         type: string
 *                         enum: [public, private]
 *     responses:
 *       200:
 *         description: Conversion completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 result:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                     mediaFileId:
 *                       type: string
 *                     sourceFormat:
 *                       type: string
 *                     targetFormat:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: completed
 *                     durationMs:
 *                       type: integer
 *                     output:
 *                       type: object
 *                       properties:
 *                         storageKey:
 *                           type: string
 *                         size:
 *                           type: integer
 *                         mimeType:
 *                           type: string
 *                         url:
 *                           type: string
 *                           nullable: true
 *                         signedUrl:
 *                           type: string
 *                           nullable: true
 *                         access:
 *                           type: string
 *                     metadata:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Media file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:mediaFileId/convert', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    const { mediaFileId } = req.params;
    const { targetFormat, options = {} } = req.body || {};

    if (!targetFormat) {
      return res.status(400).json({
        success: false,
        error: 'targetFormat is required'
      });
    }

    if (!databaseService.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const mediaFile = await databaseService.getMediaFile(mediaFileId);
    if (!mediaFile) {
      return res.status(404).json({
        success: false,
        error: 'Media file not found'
      });
    }

    if (!canAccessFile(req, mediaFile)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const result = await documentConversionService.convertMediaFile(
      mediaFileId,
      targetFormat,
      options,
      { requestingUserId: req.userId }
    );

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logError(error, {
      context: 'conversion.convert',
      mediaFileId: req.params.mediaFileId
    });

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to convert document'
    });
  }
});

/**
 * @swagger
 * /api/conversion/batch:
 *   post:
 *     tags: [Document Conversion]
 *     summary: Run a batch of conversions
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               options:
 *                 type: object
 *                 description: Default options applied to each conversion
 *               conversions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [mediaFileId, targetFormat]
 *                   properties:
 *                     mediaFileId:
 *                       type: string
 *                       example: media-123
 *                     targetFormat:
 *                       type: string
 *                       example: pdf
 *                     options:
 *                       type: object
 *                       description: Overrides for this conversion entry
 *     responses:
 *       200:
 *         description: Batch executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 batchId:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       jobId:
 *                         type: string
 *                       mediaFileId:
 *                         type: string
 *                       targetFormat:
 *                         type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.post('/batch', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    const { conversions = [], options = {} } = req.body || {};

    if (!Array.isArray(conversions) || conversions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'conversions array is required'
      });
    }

    if (!databaseService.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Access check for each media file
    for (const conversion of conversions) {
      const mediaFile = await databaseService.getMediaFile(conversion.mediaFileId);
      if (!mediaFile) {
        return res.status(404).json({
          success: false,
          error: `Media file not found: ${conversion.mediaFileId}`
        });
      }

      if (!canAccessFile(req, mediaFile)) {
        return res.status(403).json({
          success: false,
          error: `Access denied for media file ${conversion.mediaFileId}`
        });
      }
    }

    const result = await documentConversionService.convertBatch(
      conversions,
      options,
      req.userId
    );

    res.json({
      success: true,
      batchId: result.batchId,
      count: result.count,
      results: result.results
    });
  } catch (error) {
    logError(error, {
      context: 'conversion.batch',
      userId: req.userId
    });

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Batch conversion failed'
    });
  }
});

/**
 * @swagger
 * /api/conversion/from-url:
 *   post:
 *     tags: [Document Conversion]
 *     summary: Import a document from a URL and convert it in one step
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, targetFormat]
 *             properties:
 *               url:
 *                 type: string
 *               targetFormat:
 *                 type: string
 *               filename:
 *                 type: string
 *               options:
 *                 type: object
 *               access:
 *                 type: string
 *                 enum: [public, private]
 *               bucketId:
 *                 type: string
 *               folderPath:
 *                 type: string
 *     responses:
 *       200:
 *         description: Imported and converted
 */
router.post('/from-url', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { url, targetFormat, filename, options = {}, access = 'private', bucketId = 'default', folderPath = '' } = req.body || {};
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ success: false, error: 'Valid url is required' });
    }
    if (!targetFormat) {
      return res.status(400).json({ success: false, error: 'targetFormat is required' });
    }

    // Download file
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({ success: false, error: `Failed to fetch URL (status ${response.status})` });
    }
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // Determine filename/extension
    const urlPath = (() => { try { return new URL(url).pathname; } catch { return ''; } })();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const headerExt = mime.extension(contentType) || 'bin';
    const derivedName = filename || (urlPath && urlPath.split('/').pop()) || `download.${headerExt}`;
    const ext = (derivedName.includes('.') ? derivedName.split('.').pop() : headerExt) || 'bin';

    // Store original
    const appId = req.appId || 'dailey-media-api';
    const userId = req.userId || 'system';
    const originalKey = storageService.generateMediaKey(userId, appId, derivedName, 'original');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    await storageService.uploadFile(buffer, originalKey, storageService.getContentType(derivedName), {
      originalFilename: derivedName,
      userId,
      appId,
      bucketId,
      folderPath,
      access,
      hash,
    }, { access });

    // Create DB record
    const mediaId = await databaseService.createMediaFile({
      storage_key: originalKey,
      original_filename: derivedName,
      title: null,
      description: null,
      user_id: userId,
      application_id: req.appId || null,
      collection_id: null,
      file_size: buffer.length,
      mime_type: storageService.getContentType(derivedName),
      file_extension: ext,
      content_hash: hash,
      processing_status: 'completed',
      is_public: access === 'public',
      keywords: null,
      categories: [],
      metadata: { importedFromUrl: url, bucketId, folderPath, access },
      exif_data: {}
    });

    // Convert
    const result = await documentConversionService.convertMediaFile(
      mediaId,
      String(targetFormat),
      options,
      { requestingUserId: req.userId }
    );

    res.json({ success: true, importedMediaId: mediaId, conversion: result });
  } catch (error) {
    logError(error, { context: 'conversion.fromUrl', userId: req.userId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to import and convert' });
  }
});

export default router;
