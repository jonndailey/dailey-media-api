import { createWorker } from 'tesseract.js';
import { nanoid } from 'nanoid';
import storageService from './storageService.js';
import databaseService from './databaseService.js';
import fileService from './fileService.js';
import { logInfo, logError, logWarning } from '../middleware/logger.js';
import { renderPdfFirstPage } from '../utils/pdfUtils.js';
import { parseReceiptSuggestions } from '../utils/receiptParser.js';
import config from '../config/index.js';
import { getLanguageMetadataByCode } from '../config/ocrLanguages.js';
import buildStructuredOcrData from '../utils/structuredOcr.js';

const SUPPORTED_LANGUAGES = config.ocr.supportedLanguages;
const DEFAULT_LANGUAGES = config.ocr.defaultLanguages;
const MAX_LANGUAGES_PER_REQUEST = config.ocr.maxLanguagesPerRequest;
const SEARCHABLE_PDF_ENABLED = config.ocr.enableSearchablePdf !== false;
const STRUCTURED_DATA_ENABLED = config.ocr.enableStructuredData !== false;
const WORKER_CACHE = new Map();

function normalizeLanguages(languages) {
  let requested = [];

  if (!languages) {
    requested = [...DEFAULT_LANGUAGES];
  } else if (typeof languages === 'string') {
    requested = languages
      .split(/[\s,;+]+/)
      .map(code => code.trim().toLowerCase())
      .filter(Boolean);
  } else if (Array.isArray(languages)) {
    requested = languages
      .map(code => (code || '').toString().trim().toLowerCase())
      .filter(Boolean);
  } else {
    requested = [...DEFAULT_LANGUAGES];
  }

  if (!requested.length) {
    requested = [...DEFAULT_LANGUAGES];
  }

  const unique = Array.from(new Set(requested));

  const unsupported = unique.filter(code => !SUPPORTED_LANGUAGES.includes(code));
  const supported = unique.filter(code => SUPPORTED_LANGUAGES.includes(code));

  if (!supported.length) {
    const error = new Error(`Unsupported OCR languages requested: ${unique.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  if (unsupported.length) {
    logWarning('Requested OCR languages include unsupported codes', {
      unsupported,
      supported
    });
  }

  if (supported.length > MAX_LANGUAGES_PER_REQUEST) {
    const error = new Error(
      `Too many OCR languages requested. Maximum allowed is ${MAX_LANGUAGES_PER_REQUEST}`
    );
    error.statusCode = 400;
    throw error;
  }

  return supported;
}

function getLanguageKey(languages) {
  return Array.from(new Set(languages)).sort().join('+');
}

async function getWorker(languageKey) {
  if (WORKER_CACHE.has(languageKey)) {
    return WORKER_CACHE.get(languageKey);
  }

  const worker = await createWorker(
    languageKey || DEFAULT_LANGUAGES.join('+'),
    undefined,
    {
      logger: message => {
        if (message.status === 'recognizing text') {
          logInfo('OCR progress', {
            status: message.status,
            progress: Number((message.progress * 100).toFixed(2)),
            languages: languageKey
          });
        }
      },
      errorHandler: error => {
        logError(new Error(error?.message || String(error)), {
          context: 'ocr.worker',
          languages: languageKey
        });
      }
    }
  );

  await worker.reinitialize(languageKey);

  WORKER_CACHE.set(languageKey, worker);

  logInfo('OCR worker created', { languages: languageKey });
  return worker;
}
function buildConfidenceSummary(words = []) {
  if (!words.length) {
    return {
      average: null,
      min: null,
      max: null
    };
  }

  const confidences = words
    .map(word => typeof word.confidence === 'number' ? word.confidence : null)
    .filter(value => value !== null);

  if (!confidences.length) {
    return {
      average: null,
      min: null,
      max: null
    };
  }

  const total = confidences.reduce((sum, value) => sum + value, 0);

  return {
    average: Number((total / confidences.length).toFixed(2)),
    min: Number(Math.min(...confidences).toFixed(2)),
    max: Number(Math.max(...confidences).toFixed(2))
  };
}

function extractWordData(word) {
  return {
    text: word.text,
    confidence: typeof word.confidence === 'number'
      ? Number(word.confidence.toFixed(2))
      : null,
    boundingBox: word.bbox,
    baseline: word.baseline || null,
    isNumeric: /^[0-9]+$/.test(word.text || ''),
    isUppercase: !!word.text && word.text === word.text.toUpperCase(),
    page: word.page || 0,
    block: word.block || 0,
    paragraph: word.paragraph || 0,
    line: word.line || 0,
    word: word.word || 0
  };
}

function extractLineData(line) {
  return {
    text: (line.text || '').trim(),
    confidence: typeof line.confidence === 'number'
      ? Number(line.confidence.toFixed(2))
      : null,
    boundingBox: line.bbox,
    baseline: line.baseline || null,
    page: line.page || 0,
    block: line.block || 0,
    paragraph: line.paragraph || 0,
    line: line.line || 0,
    words: Array.isArray(line.words)
      ? line.words.map(extractWordData)
      : undefined
  };
}

class OcrService {
  getSupportedLanguages() {
    return SUPPORTED_LANGUAGES.map(code => {
      const metadata = getLanguageMetadataByCode(code);

      return {
        code,
        name: metadata?.name || code,
        nativeName: metadata?.nativeName || metadata?.name || code,
        default: DEFAULT_LANGUAGES.includes(code)
      };
    });
  }

  getCapabilities() {
    return {
      maxLanguagesPerRequest: MAX_LANGUAGES_PER_REQUEST,
      searchablePdf: SEARCHABLE_PDF_ENABLED,
      structuredData: STRUCTURED_DATA_ENABLED
    };
  }

  async performOcr(mediaFileId, options = {}) {
    const {
      languages: requestedLanguages,
      output = {},
      persist = true,
      requestingUserId = null
    } = options;

    if (!mediaFileId) {
      throw new Error('mediaFileId is required for OCR');
    }

    const mediaFile = await databaseService.getMediaFile(mediaFileId);

    if (!mediaFile) {
      const error = new Error('Media file not found');
      error.statusCode = 404;
      throw error;
    }

    if (requestingUserId && mediaFile.user_id !== requestingUserId) {
      logWarning('OCR attempt on file owned by another user', {
        mediaFileId,
        ownerId: mediaFile.user_id,
        requestingUserId
      });
    }

    const typeInfo = fileService.getFileTypeInfo(mediaFile.original_filename || mediaFile.storage_key);

    if (typeInfo.category !== 'image' && typeInfo.extension !== 'pdf' && typeInfo.extension !== 'tif' && typeInfo.extension !== 'tiff') {
      const error = new Error('Unsupported file type for OCR processing');
      error.statusCode = 400;
      throw error;
    }

    if (typeInfo.extension === 'pdf') {
      logWarning('PDF OCR not fully supported yet - extracting first page only', {
        mediaFileId
      });
    }

    const languages = normalizeLanguages(requestedLanguages);
    const languageKey = getLanguageKey(languages.length ? languages : DEFAULT_LANGUAGES);

    const resolvedOutput = {
      plainText: output.plainText !== false,
      confidence: output.confidence !== false,
      hocr: Boolean(output.hocr),
      tsv: Boolean(output.tsv),
      searchablePDF: Boolean(output.searchablePDF) && SEARCHABLE_PDF_ENABLED,
      structured: output.structured !== false && STRUCTURED_DATA_ENABLED
    };

    if (output.searchablePDF && !SEARCHABLE_PDF_ENABLED) {
      logWarning('Searchable PDF generation requested but disabled in configuration', {
        mediaFileId
      });
    }

    if (output.structured === true && !STRUCTURED_DATA_ENABLED) {
      logWarning('Structured OCR data requested but disabled in configuration', {
        mediaFileId
      });
    }

    const worker = await getWorker(languageKey);

    const originalBuffer = await storageService.getFileBuffer(mediaFile.storage_key);
    let processingBuffer = originalBuffer;
    let derivedMetadata = {};

    if (typeInfo.extension === 'pdf') {
      try {
        const rendered = await renderPdfFirstPage(originalBuffer, options.pdfScale || 2);
        processingBuffer = rendered.buffer;
        derivedMetadata = {
          ...derivedMetadata,
          renderedWidth: rendered.width,
          renderedHeight: rendered.height,
          renderedScale: options.pdfScale || 2
        };
      } catch (error) {
        logError(error, {
          context: 'ocrService.renderPdf',
          mediaFileId
        });

        const responseError = new Error('Failed to render PDF for OCR processing');
        responseError.statusCode = 422;
        throw responseError;
      }
    }

    const recognitionOptions = {
      ...(options.tesseract || {})
    };

    const start = Date.now();
    let recognizeResult;
    try {
      recognizeResult = await worker.recognize(processingBuffer, recognitionOptions);
    } catch (error) {
      logError(error, {
        context: 'ocrService.recognize',
        mediaFileId,
        languages: languageKey
      });

      const responseError = new Error(
        error?.message?.includes('Pdf reading is not supported')
          ? 'PDF OCR is not supported by the current Tesseract build'
          : 'Failed to process OCR request'
      );
      responseError.statusCode = error?.message?.includes('Pdf reading is not supported') ? 422 : 500;
      throw responseError;
    }

    const { data } = recognizeResult;
    const durationMs = Date.now() - start;

    const plainText = (data.text || '').trim();
    const lines = Array.isArray(data.lines) ? data.lines.map(extractLineData) : [];
    const words = Array.isArray(data.words) ? data.words.map(extractWordData) : [];
    const confidenceSummary = buildConfidenceSummary(words);

    let pdfUpload = null;
    if (resolvedOutput.searchablePDF) {
      if (typeof worker.getPDF === 'function') {
        try {
          const pdfResult = await worker.getPDF(`dmapi-ocr-${mediaFileId}`);
          const pdfBuffer = Buffer.from(pdfResult.data);
          const pdfKey = `ocr/${mediaFileId}/searchable-${Date.now()}-${nanoid(8)}.pdf`;

          pdfUpload = await storageService.uploadFile(
            pdfBuffer,
            pdfKey,
            'application/pdf',
            {
              source_media_id: mediaFileId,
              type: 'ocr.searchable-pdf',
              languages: languages.join(',')
            },
            { access: mediaFile.is_public ? 'public' : 'private' }
          );
        } catch (error) {
          logError(error, {
            context: 'ocrService.generatePdf',
            mediaFileId
          });
        }
      } else {
        logWarning('Searchable PDF generation not supported by current Tesseract build', {
          mediaFileId
        });
      }
    }

    const suggestions = parseReceiptSuggestions(plainText);
    let structured = null;

    if (resolvedOutput.structured) {
      structured = buildStructuredOcrData({
        lines,
        words,
        text: plainText
      });
    }

    const response = {
      mediaFileId,
      languages,
      text: plainText,
      durationMs,
      confidence: {
        average: typeof data.confidence === 'number'
          ? Number(data.confidence.toFixed(2))
          : confidenceSummary.average,
        ...confidenceSummary
      },
      metadata: {
        script: data.script || null,
        scriptConfidence: typeof data.script_confidence === 'number'
          ? Number(data.script_confidence.toFixed(2))
          : null,
        orientation: data.orientation_degrees || null,
        blocks: Array.isArray(data.blocks) ? data.blocks.length : 0,
        paragraphs: Array.isArray(data.paragraphs) ? data.paragraphs.length : 0,
        lines: lines.length,
        words: words.length,
        ...derivedMetadata
      },
      output: resolvedOutput,
      suggestions
    };

    if (structured) {
      response.structured = structured;
      derivedMetadata = {
        ...derivedMetadata,
        structuredSummary: {
          keyValuePairs: structured.keyValuePairs.length,
          tables: structured.tables.length,
          formFields: structured.formFields.length
        }
      };
    }

    if (response.output.confidence) {
      response.words = words;
      response.lines = lines;
    }

    if (response.output.hocr && data.hocr) {
      response.hocr = data.hocr;
    }

    if (response.output.tsv && data.tsv) {
      response.tsv = data.tsv;
    }

    if (pdfUpload) {
      response.searchablePdf = {
        storageKey: pdfUpload.key,
        url: pdfUpload.url || null,
        signedUrl: pdfUpload.signedUrl || null,
        access: pdfUpload.access || 'private'
      };
    }

    if (databaseService.isAvailable() && persist) {
      try {
        await databaseService.saveOcrResult({
          media_file_id: mediaFileId,
          languages,
          text: plainText,
          average_confidence: response.confidence.average,
          confidence_summary: response.confidence,
          word_count: words.length,
          line_count: lines.length,
          pdf_storage_key: pdfUpload ? pdfUpload.key : null,
          request_options: response.output,
          metadata: {
            durationMs,
            script: data.script || null,
            scriptConfidence: response.metadata.scriptConfidence,
            orientation: response.metadata.orientation,
            blocks: response.metadata.blocks,
            paragraphs: response.metadata.paragraphs,
            ...derivedMetadata,
            receiptSuggestions: suggestions
          },
          created_by: requestingUserId || mediaFile.user_id
        });
      } catch (error) {
        logError(error, {
          context: 'ocrService.persistResult',
          mediaFileId
        });
      }
    }

    logInfo('OCR processing completed', {
      mediaFileId,
      durationMs,
      languages: languageKey,
      wordCount: words.length
    });

    return response;
  }

  async getLatestResult(mediaFileId) {
    if (!databaseService.isAvailable()) {
      return null;
    }

    return databaseService.getLatestOcrResult(mediaFileId);
  }

  async listResults(mediaFileId, options = {}) {
    if (!databaseService.isAvailable()) {
      return [];
    }

    return databaseService.listOcrResults(mediaFileId, options);
  }
}

export default new OcrService();
