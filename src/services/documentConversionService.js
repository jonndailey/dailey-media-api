import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { constants as fsConstants } from 'fs';
import libre from 'libreoffice-convert';
import { marked } from 'marked';
import PDFDocument from 'pdfkit';
import { parse as parseHtml } from 'node-html-parser';
import { PDFDocument as PdfLibDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import mime from 'mime-types';
import config from '../config/index.js';
import databaseService from './databaseService.js';
import storageService from './storageService.js';
import fileService from './fileService.js';
import { logInfo, logError, logWarning } from '../middleware/logger.js';

libre.convertAsync = promisify(libre.convert);

const DEFAULT_FONT = 'Helvetica';
const BOLD_FONT = 'Helvetica-Bold';
const ITALIC_FONT = 'Helvetica-Oblique';
const MONO_FONT = 'Courier';

const SUPPORTED_OFFICE_EXTENSIONS = new Set([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp'
]);

function normalizeExtension(extension) {
  if (!extension) return '';
  return extension.replace(/^\./, '').toLowerCase();
}

async function ensureDirectory(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function createTempFile(prefix, extension) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dmapi-'));
  const filename = `${prefix}-${Date.now()}-${nanoid(6)}.${normalizeExtension(extension)}`;
  const filePath = path.join(tempDir, filename);
  return { tempDir, filePath };
}

async function cleanupTempDir(tempDir) {
  if (!tempDir) return;
  try {
    await fsp.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    logWarning('Failed to remove temp directory', { tempDir, error: error.message });
  }
}

function extractTextContent(node) {
  if (!node) return '';
  if (node.nodeType === 3) {
    return node.rawText || '';
  }

  if (!node.childNodes?.length) {
    return node.text || '';
  }

  return node.childNodes.map(child => extractTextContent(child)).join('');
}

function renderHtmlList(doc, listNode, options = {}, depth = 0) {
  const indent = depth * 14;
  const bullet = listNode.tagName === 'ol' ? null : '•';

  listNode.childNodes
    .filter(child => child.tagName === 'li')
    .forEach((itemNode, index) => {
      const text = extractTextContent(itemNode).trim();
      if (!text) return;

      doc.moveDown(0.15);
      doc.font(DEFAULT_FONT).fontSize(12);
      if (bullet) {
        doc.text(`${bullet} ${text}`, {
          indent,
          continued: false,
          paragraphGap: 2
        });
      } else {
        doc.text(`${index + 1}. ${text}`, {
          indent,
          continued: false,
          paragraphGap: 2
        });
      }

      // Handle nested lists
      itemNode.childNodes
        .filter(child => child.tagName === 'ul' || child.tagName === 'ol')
        .forEach(childList => renderHtmlList(doc, childList, options, depth + 1));
    });
}

function renderHtmlNode(doc, node) {
  if (node.nodeType === 3) {
    const text = node.rawText.trim();
    if (text) {
      doc.font(DEFAULT_FONT).fontSize(12).text(text, { paragraphGap: 4 });
    }
    return;
  }

  if (!node.tagName) {
    return;
  }

  const tag = node.tagName.toLowerCase();
  const textContent = extractTextContent(node).trim();

  switch (tag) {
    case 'h1':
      doc.moveDown(0.5);
      doc.font(BOLD_FONT).fontSize(26).text(textContent, { paragraphGap: 6 });
      doc.font(DEFAULT_FONT).fontSize(12);
      break;
    case 'h2':
      doc.moveDown(0.4);
      doc.font(BOLD_FONT).fontSize(22).text(textContent, { paragraphGap: 6 });
      doc.font(DEFAULT_FONT).fontSize(12);
      break;
    case 'h3':
      doc.moveDown(0.3);
      doc.font(BOLD_FONT).fontSize(18).text(textContent, { paragraphGap: 4 });
      doc.font(DEFAULT_FONT).fontSize(12);
      break;
    case 'h4':
    case 'h5':
    case 'h6':
      doc.moveDown(0.2);
      doc.font(BOLD_FONT).fontSize(16).text(textContent, { paragraphGap: 4 });
      doc.font(DEFAULT_FONT).fontSize(12);
      break;
    case 'p':
      if (textContent) {
        doc.moveDown(0.2);
        doc.font(DEFAULT_FONT).fontSize(12).text(textContent, { paragraphGap: 6 });
      }
      break;
    case 'blockquote':
      if (textContent) {
        doc.moveDown(0.2);
        doc.font(ITALIC_FONT).fontSize(12).text(textContent, {
          indent: 18,
          paragraphGap: 6
        });
        doc.font(DEFAULT_FONT);
      }
      break;
    case 'code':
    case 'pre':
      if (textContent) {
        doc.moveDown(0.2);
        doc.font(MONO_FONT).fontSize(10).text(textContent, {
          paragraphGap: 6,
          lineGap: 2,
          characterSpacing: 0.2
        });
        doc.font(DEFAULT_FONT);
      }
      break;
    case 'ul':
    case 'ol':
      renderHtmlList(doc, node);
      break;
    case 'table':
      doc.moveDown(0.2);
      const rows = node.childNodes.filter(child => child.tagName === 'tr');
      rows.forEach((rowNode, rowIndex) => {
        const cells = rowNode.childNodes.filter(child => child.tagName === 'td' || child.tagName === 'th');
        const cellTexts = cells.map(cell => extractTextContent(cell).trim());

        doc.font(rowIndex === 0 ? BOLD_FONT : DEFAULT_FONT).fontSize(12);
        doc.text(cellTexts.join(' | '), { paragraphGap: 4 });
      });
      doc.font(DEFAULT_FONT);
      break;
    default:
      if (textContent) {
        doc.font(DEFAULT_FONT).fontSize(12).text(textContent, { paragraphGap: 6 });
      }
      break;
  }
}

async function renderHtmlToPdf(html, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        compress: options.compress !== false
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const root = parseHtml(html);
      const body = root.querySelector('body');
      const nodes = body ? body.childNodes : root.childNodes;

      doc.font(DEFAULT_FONT).fontSize(12);
      nodes.forEach(node => renderHtmlNode(doc, node));

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function applyWatermark(buffer, text) {
  if (!text) {
    return buffer;
  }

  try {
    const pdfDoc = await PdfLibDocument.load(buffer);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    pdfDoc.getPages().forEach(page => {
      const { width, height } = page.getSize();
      page.drawText(text, {
        x: width / 4,
        y: height / 2,
        size: Math.max(32, width / 12),
        opacity: 0.2,
        font,
        color: rgb(0.6, 0.6, 0.6),
        rotate: degrees(-35)
      });
    });

    const data = await pdfDoc.save();
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  } catch (error) {
    logWarning('Failed to apply watermark to PDF', { error: error.message });
    return buffer;
  }
}

async function applySecurityOptions(buffer, securityOptions = {}) {
  if (!securityOptions || Object.keys(securityOptions).length === 0) {
    return buffer;
  }

  try {
    const pdfDoc = await PdfLibDocument.load(buffer);

    if (securityOptions.stripMetadata) {
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('');
      pdfDoc.setCreator('');
    }

    if (securityOptions.customMetadata) {
      const { title, author, subject, keywords } = securityOptions.customMetadata;
      if (title) pdfDoc.setTitle(title);
      if (author) pdfDoc.setAuthor(author);
      if (subject) pdfDoc.setSubject(subject);
      if (Array.isArray(keywords)) pdfDoc.setKeywords(keywords);
    }

    const data = await pdfDoc.save();
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  } catch (error) {
    logWarning('Failed to apply security options to PDF', { error: error.message });
    return buffer;
  }
}

class DocumentConversionService {
  constructor() {
    this.supportedTargets = config.conversion.supportedTargets;
    this.libreOfficeAvailable = null;
    this.cachedLibreOfficePath = null;
  }

  getSupportedConversions() {
    return {
      supported: this.supportedTargets,
      maxBatchSize: config.conversion.maxBatchSize,
      features: {
        watermarking: config.conversion.enableWatermarking,
        compression: config.conversion.enableCompression,
        security: config.conversion.enableSecurityOptions
      }
    };
  }

  async ensureLibreOfficeAvailable() {
    if (this.libreOfficeAvailable !== null) {
      return this.libreOfficeAvailable;
    }

    const customPath = config.conversion.libreOfficePath;
    if (customPath) {
      try {
        await fsp.access(customPath, fsConstants.X_OK);
        process.env.LIBREOFFICE_BIN = customPath;
        this.cachedLibreOfficePath = customPath;
        this.libreOfficeAvailable = true;
        return true;
      } catch (error) {
        logWarning('Configured LibreOffice binary not accessible', {
          path: customPath,
          error: error.message
        });
      }
    }

    try {
      const { default: which } = await import('which');
      const pathToBinary = await which('soffice');
      if (pathToBinary) {
        process.env.LIBREOFFICE_BIN = pathToBinary;
        this.cachedLibreOfficePath = pathToBinary;
        this.libreOfficeAvailable = true;
        return true;
      }
    } catch (error) {
      logWarning('LibreOffice not found on PATH', { error: error.message });
    }

    this.libreOfficeAvailable = false;
    return false;
  }

  isTargetSupported(sourceExtension, targetExtension) {
    const normalizedSource = normalizeExtension(sourceExtension);
    const normalizedTarget = normalizeExtension(targetExtension);

    const targets = this.supportedTargets[normalizedSource];
    if (!targets) {
      return false;
    }

    return targets.includes(normalizedTarget);
  }

  async convertWithLibreOffice(buffer, sourceExtension, targetExtension, filter = undefined) {
    const available = await this.ensureLibreOfficeAvailable();
    if (!available) {
      const error = new Error('LibreOffice conversion engine not available');
      error.statusCode = 503;
      throw error;
    }

    try {
      const converted = await libre.convertAsync(buffer, `.${normalizeExtension(targetExtension)}`, filter);
      return {
        buffer: converted,
        metadata: {
          engine: 'libreoffice',
          sourceExtension: normalizeExtension(sourceExtension)
        }
      };
    } catch (error) {
      logError(error, {
        context: 'documentConversion.convertWithLibreOffice',
        sourceExtension,
        targetExtension
      });
      error.statusCode = 500;
      throw error;
    }
  }

  async convertMarkdown(buffer, targetExtension, options = {}) {
    const markdown = buffer.toString('utf8');
    const html = marked(markdown, {
      gfm: true,
      breaks: true,
      headerIds: true,
      mangle: false
    });

    if (normalizeExtension(targetExtension) === 'html') {
      return {
        buffer: Buffer.from(html, 'utf8'),
        metadata: {
          engine: 'marked',
          format: 'html'
        }
      };
    }

    const pdfBuffer = await renderHtmlToPdf(`<html><body>${html}</body></html>`, {
      compress: options.compress ?? config.conversion.enableCompression
    });

    return {
      buffer: pdfBuffer,
      metadata: {
        engine: 'pdfkit',
        format: 'pdf'
      }
    };
  }

  async convertHtml(buffer, targetExtension, options = {}) {
    const html = buffer.toString('utf8');
    const normalizedTarget = normalizeExtension(targetExtension);

    if (normalizedTarget === 'html') {
      return {
        buffer,
        metadata: {
          engine: 'passthrough',
          format: 'html'
        }
      };
    }

    if (normalizedTarget !== 'pdf') {
      const error = new Error(`Unsupported target format for HTML: ${targetExtension}`);
      error.statusCode = 400;
      throw error;
    }

    const pdfBuffer = await renderHtmlToPdf(html, {
      compress: options.compress ?? config.conversion.enableCompression
    });

    return {
      buffer: pdfBuffer,
      metadata: {
        engine: 'pdfkit',
        format: 'pdf'
      }
    };
  }

  determineMimeType(extension) {
    return mime.lookup(extension) || 'application/octet-stream';
  }

  buildStorageKey(mediaFileId, targetExtension) {
    return `conversions/${mediaFileId}/${Date.now()}-${nanoid(6)}.${normalizeExtension(targetExtension)}`;
  }

  async convertBuffer(buffer, sourceExtension, targetExtension, options = {}) {
    const normalizedSource = normalizeExtension(sourceExtension);
    const normalizedTarget = normalizeExtension(targetExtension);

    if (!this.isTargetSupported(normalizedSource, normalizedTarget)) {
      const error = new Error(`Conversion from ${normalizedSource} to ${normalizedTarget} is not supported`);
      error.statusCode = 400;
      throw error;
    }

    if (normalizedTarget === 'pdf' && SUPPORTED_OFFICE_EXTENSIONS.has(normalizedSource)) {
      return this.convertWithLibreOffice(buffer, normalizedSource, normalizedTarget);
    }

    if (normalizedSource === 'md' || normalizedSource === 'markdown') {
      return this.convertMarkdown(buffer, normalizedTarget, options);
    }

    if (normalizedSource === 'html' || normalizedSource === 'htm') {
      return this.convertHtml(buffer, normalizedTarget, options);
    }

    // If source format already matches target, just return original
    if (normalizedSource === normalizedTarget) {
      return {
        buffer,
        metadata: {
          engine: 'passthrough',
          format: normalizedTarget
        }
      };
    }

    const error = new Error(`No conversion strategy available for ${normalizedSource} -> ${normalizedTarget}`);
    error.statusCode = 400;
    throw error;
  }

  async postProcessOutput(buffer, targetExtension, options = {}) {
    const normalizedTarget = normalizeExtension(targetExtension);
    if (normalizedTarget !== 'pdf') {
      return buffer;
    }

    let processed = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    const watermarkText = options.watermark ?? config.conversion.defaultWatermark;
    if (config.conversion.enableWatermarking && watermarkText) {
      processed = await applyWatermark(processed, watermarkText);
    }

    if (config.conversion.enableSecurityOptions && options.security) {
      processed = await applySecurityOptions(processed, options.security);
    }

    return Buffer.isBuffer(processed) ? processed : Buffer.from(processed);
  }

  buildJobMetadata(conversionMetadata = {}, additional = {}) {
    return {
      ...conversionMetadata,
      ...additional
    };
  }

  buildStorageMetadata(mediaFile, sourceExtension, targetExtension, options = {}, conversionMetadata = {}) {
    return {
      source_media_id: mediaFile.id || mediaFile.media_file_id || mediaFile.mediaFileId,
      type: `conversion.${normalizeExtension(targetExtension)}`,
      source_extension: normalizeExtension(sourceExtension),
      target_extension: normalizeExtension(targetExtension),
      watermarked: Boolean(options.watermark),
      batch_id: options.batchId || null,
      conversion_engine: conversionMetadata.engine || null
    };
  }

  async convertMediaFile(mediaFileId, targetFormat, options = {}, { requestingUserId = null, batchId = null } = {}) {
    const normalizedTarget = normalizeExtension(targetFormat);
    const conversionOptions = { ...options };
    const start = Date.now();

    const mediaFile = await databaseService.getMediaFile(mediaFileId);
    if (!mediaFile) {
      const error = new Error('Media file not found');
      error.statusCode = 404;
      throw error;
    }

    const typeInfo = fileService.getFileTypeInfo(mediaFile.original_filename || mediaFile.storage_key);
    const sourceExtension = normalizeExtension(typeInfo.extension);

    if (!this.isTargetSupported(sourceExtension, normalizedTarget)) {
      const error = new Error(`Conversion from ${sourceExtension} to ${normalizedTarget} is not supported`);
      error.statusCode = 400;
      throw error;
    }

    let jobId = null;
    if (databaseService.isAvailable()) {
      jobId = await databaseService.createConversionJob({
        media_file_id: mediaFileId,
        source_format: sourceExtension,
        target_format: normalizedTarget,
        status: 'processing',
        options: conversionOptions,
        metadata: {
          requested_by: requestingUserId,
          batch_id: batchId
        },
        batch_id: batchId || null,
        created_by: requestingUserId || mediaFile.user_id
      });
    }

    try {
      const originalBuffer = await storageService.getFileBuffer(mediaFile.storage_key);
      const { buffer: convertedBuffer, metadata: conversionMetadata } = await this.convertBuffer(
        originalBuffer,
        sourceExtension,
        normalizedTarget,
        conversionOptions
      );

      let finalBuffer = await this.postProcessOutput(convertedBuffer, normalizedTarget, conversionOptions);

      const durationMs = Date.now() - start;
      const storageKey = this.buildStorageKey(mediaFileId, normalizedTarget);
      const mimeType = this.determineMimeType(normalizedTarget);

      const storageMetadata = this.buildStorageMetadata(
        mediaFile,
        sourceExtension,
        normalizedTarget,
        { ...conversionOptions, batchId },
        conversionMetadata
      );

      const accessLevel = conversionOptions.security?.access === 'public'
        ? 'public'
        : 'private';

      const upload = await storageService.uploadFile(
        finalBuffer,
        storageKey,
        mimeType,
        storageMetadata,
        { access: accessLevel }
      );

      const response = {
        jobId,
        mediaFileId,
        sourceFormat: sourceExtension,
        targetFormat: normalizedTarget,
        status: 'completed',
        durationMs,
        output: {
          storageKey,
          size: finalBuffer.length,
          mimeType,
          url: upload.url || null,
          signedUrl: upload.signedUrl || null,
          access: upload.access || accessLevel
        },
        metadata: this.buildJobMetadata(conversionMetadata, {
          watermarkApplied: Boolean(conversionOptions.watermark),
          securityApplied: Boolean(conversionOptions.security),
          batchId
        })
      };

      if (jobId && databaseService.isAvailable()) {
        await databaseService.updateConversionJob(jobId, {
          status: 'completed',
          output_storage_key: storageKey,
          output_file_size: finalBuffer.length,
          output_mime_type: mimeType,
          duration_ms: durationMs,
          metadata: response.metadata,
          completed_at: new Date().toISOString()
        });
      }

      logInfo('Document conversion completed', {
        mediaFileId,
        targetFormat: normalizedTarget,
        durationMs,
        jobId
      });

      return response;
    } catch (error) {
      if (jobId && databaseService.isAvailable()) {
        await databaseService.updateConversionJob(jobId, {
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        });
      }

      logError(error, {
        context: 'documentConversion.convertMediaFile',
        mediaFileId,
        targetFormat: normalizedTarget
      });

      throw error;
    }
  }

  async convertBatch(conversionRequests = [], options = {}, requestingUserId = null) {
    if (!Array.isArray(conversionRequests) || conversionRequests.length === 0) {
      const error = new Error('At least one conversion request is required');
      error.statusCode = 400;
      throw error;
    }

    if (conversionRequests.length > config.conversion.maxBatchSize) {
      const error = new Error(`Batch size exceeds maximum of ${config.conversion.maxBatchSize}`);
      error.statusCode = 400;
      throw error;
    }

    const batchId = nanoid();
    const results = [];

    for (const request of conversionRequests) {
      const { mediaFileId, targetFormat, options: requestOptions = {} } = request;
      if (!mediaFileId || !targetFormat) {
        const error = new Error('Each conversion request requires mediaFileId and targetFormat');
        error.statusCode = 400;
        throw error;
      }

      const mergedOptions = {
        ...options,
        ...requestOptions,
        batchId
      };

      const result = await this.convertMediaFile(
        mediaFileId,
        targetFormat,
        mergedOptions,
        {
          requestingUserId,
          batchId
        }
      );

      results.push(result);
    }

    logInfo('Document conversion batch completed', {
      batchId,
      count: results.length
    });

    return {
      batchId,
      count: results.length,
      results
    };
  }

  async listConversions(mediaFileId, options = {}) {
    if (!databaseService.isAvailable()) {
      return [];
    }

    const results = await databaseService.listConversionJobs(mediaFileId, options);
    return results;
  }

  async getConversionJob(jobId) {
    if (!databaseService.isAvailable()) {
      return null;
    }

    return databaseService.getConversionJob(jobId);
  }
}

export default new DocumentConversionService();
