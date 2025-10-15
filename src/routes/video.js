import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import databaseService from '../services/databaseService.js';
import videoProcessingService from '../services/videoProcessingService.js';
import { logError } from '../middleware/logger.js';

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
 * /api/video/presets:
 *   get:
 *     tags: [Video Processing]
 *     summary: List available video processing presets
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available presets returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 presets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       format:
 *                         type: string
 *                       videoCodec:
 *                         type: string
 *                       audioCodec:
 *                         type: string
 *                       resolution:
 *                         type: string
 *                       bitrate:
 *                         type: string
 *                       audioBitrate:
 *                         type: string
 */
router.get('/presets', authenticateToken, requireScope('read'), (req, res) => {
  const presets = videoProcessingService.getSupportedOutputs();
  res.json({
    success: true,
    presets
  });
});

/**
 * @swagger
 * /api/video/{mediaFileId}/jobs:
 *   get:
 *     tags: [Video Processing]
 *     summary: List video processing jobs for a media file
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: mediaFileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
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
 *           enum: [queued, processing, completed, failed, cancelled]
 *     responses:
 *       200:
 *         description: Video jobs listed
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
 *                     type: object
 *                 pagination:
 *                   type: object
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
    const results = await videoProcessingService.listJobs(mediaFileId, {
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
      context: 'videoProcessing.list',
      mediaFileId: req.params.mediaFileId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve video processing jobs'
    });
  }
});

/**
 * @swagger
 * /api/video/jobs/{jobId}:
 *   get:
 *     tags: [Video Processing]
 *     summary: Retrieve video processing job status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: jobId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 job:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Job not found
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

    const job = await videoProcessingService.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Processing job not found'
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
      context: 'videoProcessing.getJob',
      jobId: req.params.jobId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve processing job'
    });
  }
});

/**
 * @swagger
 * /api/video/{mediaFileId}/process:
 *   post:
 *     tags: [Video Processing]
 *     summary: Queue a video for processing/transcoding
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: mediaFileId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               outputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     preset:
 *                       type: string
 *                     format:
 *                       type: string
 *                     videoCodec:
 *                       type: string
 *                     audioCodec:
 *                       type: string
 *                     resolution:
 *                       type: string
 *                     bitrate:
 *                       type: string
 *                     audioBitrate:
 *                       type: string
 *               webhookUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       202:
 *         description: Job queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 job:
 *                   type: object
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
router.post('/:mediaFileId/process', authenticateToken, requireScope('write'), async (req, res) => {
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

    const job = await videoProcessingService.createJob(
      mediaFileId,
      {
        outputs: req.body?.outputs,
        webhookUrl: req.body?.webhookUrl
      },
      {
        requestingUserId: req.userId
      }
    );

    res.status(202).json({
      success: true,
      job
    });
  } catch (error) {
    logError(error, {
      context: 'videoProcessing.createJob',
      mediaFileId: req.params.mediaFileId
    });

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to queue video processing job'
    });
  }
});

export default router;
