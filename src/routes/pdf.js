import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import databaseService from '../services/databaseService.js';
import pdfService from '../services/pdfService.js';
import { logError } from '../middleware/logger.js';

const router = express.Router();

function canAccessFile(req, file) {
  if (!file) return false;
  const isOwner = file.user_id === req.userId;
  const isAdmin = Array.isArray(req.userRoles)
    ? req.userRoles.some(role => ['core.admin', 'tenant.admin', 'user.admin'].includes(role))
    : false;
  return isOwner || isAdmin;
}

// Capabilities
router.get('/capabilities', authenticateToken, requireScope('read'), (req, res) => {
  try {
    const caps = pdfService.getCapabilities();
    res.json({ success: true, ...caps });
  } catch (error) {
    logError(error, { context: 'pdf.capabilities' });
    res.status(500).json({ success: false, error: 'Failed to get PDF capabilities' });
  }
});

// Merge multiple PDFs
router.post('/merge', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { files = [], options = {} } = req.body || {};
    if (!Array.isArray(files) || files.length < 2) {
      return res.status(400).json({ success: false, error: 'files array with at least two IDs is required' });
    }

    // Access check for each file
    for (const id of files) {
      const media = await databaseService.getMediaFile(id);
      if (!media) {
        return res.status(404).json({ success: false, error: `Media file not found: ${id}` });
      }
      if (!canAccessFile(req, media)) {
        return res.status(403).json({ success: false, error: `Access denied for media file ${id}` });
      }
    }

    const result = await pdfService.merge(files, options, { requestingUserId: req.userId });
    res.json({ success: true, result });
  } catch (error) {
    logError(error, { context: 'pdf.merge' });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to merge PDFs' });
  }
});

// Split a PDF into parts
router.post('/split/:mediaFileId', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { parts = [], options = {} } = req.body || {};
    const result = await pdfService.split(mediaFileId, parts, options, { requestingUserId: req.userId });
    res.json({ success: true, ...result });
  } catch (error) {
    logError(error, { context: 'pdf.split', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to split PDF' });
  }
});

// List form fields
router.get('/forms/:mediaFileId/fields', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }
    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const fields = await pdfService.listFormFields(mediaFileId);
    res.json({ success: true, fields });
  } catch (error) {
    logError(error, { context: 'pdf.forms.fields', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to list form fields' });
  }
});

// Fill form fields
router.post('/forms/:mediaFileId/fill', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }
    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { fields = {}, flatten = false, options = {} } = req.body || {};
    const result = await pdfService.fillFormFields(mediaFileId, fields, { ...options, flatten }, { requestingUserId: req.userId });
    res.json({ success: true, result });
  } catch (error) {
    logError(error, { context: 'pdf.forms.fill', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to fill PDF form' });
  }
});

// Watermark text on pages
router.post('/watermark/:mediaFileId', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { text, pages = 'all', opacity = 0.2, size = null, position = 'center', angle = -35 } = req.body || {};
    const result = await pdfService.watermark(
      mediaFileId,
      { text, pages, opacity, size, position, angle },
      { requestingUserId: req.userId }
    );
    res.json({ success: true, result });
  } catch (error) {
    logError(error, { context: 'pdf.watermark', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to watermark PDF' });
  }
});

// Flatten forms and/or annotations
router.post('/flatten/:mediaFileId', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { what = 'forms' } = req.body || {};
    const result = await pdfService.flatten(mediaFileId, { what }, { requestingUserId: req.userId });
    res.json({ success: true, result });
  } catch (error) {
    logError(error, { context: 'pdf.flatten', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to flatten PDF' });
  }
});

// Export PDF pages to images
router.post('/images/:mediaFileId', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { format = 'png', dpi = 144, pages = 'all', quality = 85 } = req.body || {};
    const result = await pdfService.renderImages(
      mediaFileId,
      { format, dpi, pages, quality },
      { requestingUserId: req.userId }
    );
    res.json({ success: true, ...result });
  } catch (error) {
    logError(error, { context: 'pdf.images', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to render PDF pages' });
  }
});

// Rotate pages
router.post('/rotate/:mediaFileId', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { pages = 'all', angle = 90 } = req.body || {};
    const result = await pdfService.rotate(mediaFileId, { pages, angle }, { requestingUserId: req.userId });
    res.json({ success: true, result });
  } catch (error) {
    logError(error, { context: 'pdf.rotate', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to rotate PDF pages' });
  }
});

// Compress/optimize PDF
router.post('/compress/:mediaFileId', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { profile = 'ebook', imageDownsample = 144 } = req.body || {};
    const result = await pdfService.compress(
      mediaFileId,
      { profile, imageDownsample },
      { requestingUserId: req.userId }
    );
    res.json({ success: true, result });
  } catch (error) {
    logError(error, { context: 'pdf.compress', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to compress PDF' });
  }
});

// Stamp header/footer/page numbers and/or image
router.post('/stamp/:mediaFileId', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { text = null, imageMediaFileId = null, pages = 'all', position = 'header', margin = 36, pageNumbers = null, opacity = 1, fontSize = 12 } = req.body || {};
    const result = await pdfService.stamp(
      mediaFileId,
      { text, imageMediaFileId, pages, position, margin, pageNumbers, opacity, fontSize },
      { requestingUserId: req.userId }
    );
    res.json({ success: true, result });
  } catch (error) {
    logError(error, { context: 'pdf.stamp', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to stamp PDF' });
  }
});

// Security: set/remove password, set permissions
router.post('/security/:mediaFileId', authenticateToken, requireScope('write'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    const { mediaFileId } = req.params;
    const media = await databaseService.getMediaFile(mediaFileId);
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }
    if (!canAccessFile(req, media)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { action = 'set', userPassword = '', ownerPassword = '', permissions = {}, currentPassword = '' } = req.body || {};
    const result = await pdfService.security(
      mediaFileId,
      { action, userPassword, ownerPassword, permissions, currentPassword },
      { requestingUserId: req.userId }
    );
    res.json({ success: true, result });
  } catch (error) {
    logError(error, { context: 'pdf.security', mediaFileId: req.params.mediaFileId });
    res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to update PDF security' });
  }
});

export default router;
