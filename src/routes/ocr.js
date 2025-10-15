import express from 'express';
import { authenticateToken, requireScope } from '../middleware/dailey-auth.js';
import databaseService from '../services/databaseService.js';
import ocrService from '../services/ocrService.js';
import storageService from '../services/storageService.js';
import { logError, logInfo } from '../middleware/logger.js';

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

function attachSuggestions(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const suggestions = result.metadata?.receiptSuggestions || null;
  return {
    ...result,
    suggestions: suggestions || null
  };
}

router.get('/languages', authenticateToken, requireScope('read'), (req, res) => {
  const languages = ocrService.getSupportedLanguages();
  const capabilities = ocrService.getCapabilities();

  res.json({
    success: true,
    languages,
    defaults: {
      languages: languages.filter(language => language.default).map(language => language.code),
      maxLanguagesPerRequest: capabilities.maxLanguagesPerRequest
    },
    capabilities
  });
});

router.post('/:mediaFileId/extract', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    const { mediaFileId } = req.params;
    const {
      languages,
      output,
      force = false,
      persist = true
    } = req.body || {};

    if (!databaseService.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Database not available',
        message: 'OCR requires database access for media metadata'
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

    if (!force) {
      const existing = await databaseService.getLatestOcrResult(mediaFileId);
      if (existing) {
        logInfo('Returning cached OCR result', { mediaFileId });
        return res.json({
          success: true,
          cached: true,
          result: attachSuggestions(existing)
        });
      }
    }

    const result = await ocrService.performOcr(mediaFileId, {
      languages,
      output,
      persist,
      requestingUserId: req.userId
    });

    res.json({
      success: true,
      cached: false,
      result: {
        ...result,
        suggestions: result.suggestions || null
      }
    });
  } catch (error) {
    logError(error, {
      context: 'ocr.extract',
      mediaFileId: req.params.mediaFileId
    });

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to process OCR request'
    });
  }
});

router.get('/:mediaFileId/results', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { mediaFileId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

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

    const results = await databaseService.listOcrResults(mediaFileId, {
      limit: Number(limit),
      offset: Number(offset)
    });

    res.json({
      success: true,
      results: results.map(attachSuggestions),
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: results.length === Number(limit)
      }
    });
  } catch (error) {
    logError(error, {
      context: 'ocr.list',
      mediaFileId: req.params.mediaFileId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve OCR results'
    });
  }
});

router.get('/:mediaFileId/results/latest', authenticateToken, requireScope('read'), async (req, res) => {
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

    const result = await databaseService.getLatestOcrResult(mediaFileId);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No OCR results found'
      });
    }

    res.json({
      success: true,
      result: attachSuggestions(result)
    });
  } catch (error) {
    logError(error, {
      context: 'ocr.latest',
      mediaFileId: req.params.mediaFileId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve OCR result'
    });
  }
});

router.get('/results/:resultId/pdf', authenticateToken, requireScope('read'), async (req, res) => {
  try {
    if (!databaseService.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const { resultId } = req.params;
    const result = await databaseService.getOcrResult(resultId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'OCR result not found'
      });
    }

    const mediaFile = await databaseService.getMediaFile(result.media_file_id);
    if (!canAccessFile(req, mediaFile)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if (!result.pdf_storage_key) {
      return res.status(404).json({
        success: false,
        error: 'No searchable PDF stored for this OCR result'
      });
    }

    const accessDetails = await storageService.getAccessDetails(result.pdf_storage_key, {
      access: mediaFile.is_public ? 'public' : 'private'
    });

    res.json({
      success: true,
      pdf: {
        storageKey: result.pdf_storage_key,
        url: accessDetails.publicUrl,
        signedUrl: accessDetails.signedUrl,
        access: accessDetails.access
      }
    });
  } catch (error) {
    logError(error, {
      context: 'ocr.pdf',
      resultId: req.params.resultId
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve searchable PDF'
    });
  }
});

export default router;
