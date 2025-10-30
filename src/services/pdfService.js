import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import databaseService from './databaseService.js';
import storageService from './storageService.js';
import fileService from './fileService.js';
import { logInfo, logError } from '../middleware/logger.js';
import path from 'path';

function normalizeExtension(ext) {
  return String(ext || '').replace(/^\./, '').toLowerCase();
}

function buildPdfOpsKey(baseId, op, suffix = 'pdf') {
  const ts = Date.now();
  return `pdfops/${baseId}/${ts}-${op}.${normalizeExtension(suffix)}`;
}

function parsePageRange(range, pageCount) {
  if (!range || typeof range !== 'string') return [];
  const parts = range.split(',').map(s => s.trim()).filter(Boolean);
  const indices = new Set();
  for (const part of parts) {
    if (part === 'all' || part === '*') {
      for (let i = 0; i < pageCount; i++) indices.add(i);
      continue;
    }
    const m = part.match(/^(\d+)(?:-(\d+)?)?$/);
    if (!m) continue;
    const start = Math.max(1, parseInt(m[1], 10));
    const end = m[2] ? (m[2] === '' ? pageCount : Math.min(parseInt(m[2], 10), pageCount)) : start;
    for (let p = start; p <= end; p++) indices.add(p - 1);
  }
  return Array.from(indices).sort((a, b) => a - b);
}

async function ensurePdfMedia(mediaFileId) {
  const media = await databaseService.getMediaFile(mediaFileId);
  if (!media) {
    const err = new Error('Media file not found');
    err.statusCode = 404;
    throw err;
  }
  const typeInfo = fileService.getFileTypeInfo(media.original_filename || media.storage_key);
  if (normalizeExtension(typeInfo.extension) !== 'pdf') {
    const err = new Error('Media file is not a PDF');
    err.statusCode = 400;
    throw err;
  }
  return { media, typeInfo };
}

class PdfService {
  getCapabilities() {
    return {
      operations: {
        merge: { supported: true },
        split: { supported: true, params: ['range list e.g. 1-3,5'] },
        rotate: { supported: true, params: ['pages', 'angle'] },
        compress: { supported: true, params: ['profile', 'imageDownsample'] },
        forms: {
          fields: true,
          fill: { supported: true, params: ['fields', 'flatten'] }
        },
        watermark: { supported: true, modes: ['text','image'] },
        stamp: { supported: true, params: ['text', 'imageMediaFileId', 'pageNumbers', 'position', 'margin'] },
        security: { supported: true, params: ['setPassword/removePassword', 'permissions'] }
      }
    };
  }

  async merge(mediaFileIds = [], options = {}, { requestingUserId = null } = {}) {
    if (!Array.isArray(mediaFileIds) || mediaFileIds.length < 2) {
      const err = new Error('At least two PDF file IDs are required');
      err.statusCode = 400;
      throw err;
    }

    const primaryId = mediaFileIds[0];
    const pdfDoc = await PDFDocument.create();
    let totalPages = 0;
    let accessLevel = 'private';
    let firstMedia = null;

    for (const id of mediaFileIds) {
      const { media } = await ensurePdfMedia(id);
      if (!firstMedia) firstMedia = media;
      accessLevel = media.is_public ? accessLevel : 'private';

      const buf = await storageService.getFileBuffer(media.storage_key);
      const src = await PDFDocument.load(buf);
      const pages = await pdfDoc.copyPages(src, src.getPageIndices());
      pages.forEach(p => pdfDoc.addPage(p));
      totalPages += pages.length;
    }

    const out = await pdfDoc.save();
    const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
    const storageKey = buildPdfOpsKey(primaryId, 'merge');
    const upload = await storageService.uploadFile(
      buffer,
      storageKey,
      'application/pdf',
      {
        operation: 'pdf.merge',
        sourceIds: mediaFileIds.join(','),
        totalPages,
        requestedBy: requestingUserId || firstMedia?.user_id,
        access: accessLevel
      },
      { access: accessLevel }
    );

    // Optionally register as a variant of the first file
    if (databaseService.isAvailable()) {
      try {
        await databaseService.createMediaVariant({
          media_file_id: primaryId,
          storage_key: storageKey,
          variant_type: 'custom',
          format: 'pdf',
          width: totalPages,
          height: 0,
          file_size: buffer.length,
          quality: null,
          processing_settings: { operation: 'merge', inputs: mediaFileIds }
        });
      } catch (e) {
        // Non-fatal
        logError(e, { context: 'PdfService.merge.createVariant', primaryId });
      }
    }

    logInfo('PDF merge completed', { count: mediaFileIds.length, pages: totalPages, key: storageKey });

    return {
      storageKey,
      size: buffer.length,
      mimeType: 'application/pdf',
      pageCount: totalPages,
      url: upload.url || null,
      signedUrl: upload.signedUrl || null,
      access: upload.access || accessLevel
    };
  }

  async split(mediaFileId, parts = [], options = {}, { requestingUserId = null } = {}) {
    const { media } = await ensurePdfMedia(mediaFileId);
    const srcBuf = await storageService.getFileBuffer(media.storage_key);
    const src = await PDFDocument.load(srcBuf);
    const pageCount = src.getPageCount();

    // Default: each page a part
    const normalizedParts = Array.isArray(parts) && parts.length
      ? parts
      : Array.from({ length: pageCount }, (_, i) => ({ range: String(i + 1) }));

    const results = [];
    let index = 0;
    for (const p of normalizedParts) {
      index += 1;
      const indices = parsePageRange(p.range, pageCount);
      if (!indices.length) continue;

      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(src, indices);
      copied.forEach(pg => outDoc.addPage(pg));
      const out = await outDoc.save();
      const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
      const storageKey = buildPdfOpsKey(mediaFileId, `split-part${String(index).padStart(2, '0')}`);

      const upload = await storageService.uploadFile(
        buffer,
        storageKey,
        'application/pdf',
        {
          operation: 'pdf.split',
          sourceId: mediaFileId,
          range: p.range,
          partIndex: index,
          partPages: indices.length,
          requestedBy: requestingUserId || media.user_id,
          access: media.is_public ? 'public' : 'private'
        },
        { access: media.is_public ? 'public' : 'private' }
      );

      if (databaseService.isAvailable()) {
        try {
          await databaseService.createMediaVariant({
            media_file_id: mediaFileId,
            storage_key: storageKey,
            variant_type: 'custom',
            format: 'pdf',
            width: indices.length,
            height: index,
            file_size: buffer.length,
            quality: null,
            processing_settings: { operation: 'split', range: p.range, partIndex: index }
          });
        } catch (e) {
          logError(e, { context: 'PdfService.split.createVariant', mediaFileId });
        }
      }

      results.push({
        storageKey,
        size: buffer.length,
        mimeType: 'application/pdf',
        pageCount: indices.length,
        url: upload.url || null,
        signedUrl: upload.signedUrl || null,
        access: upload.access || (media.is_public ? 'public' : 'private')
      });
    }

    logInfo('PDF split completed', { mediaFileId, parts: results.length });
    return { count: results.length, results };
  }

  async listFormFields(mediaFileId) {
    const { media } = await ensurePdfMedia(mediaFileId);
    const buf = await storageService.getFileBuffer(media.storage_key);
    const pdfDoc = await PDFDocument.load(buf);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    const summarize = (field) => {
      const name = field.getName();
      const ctor = field?.constructor?.name || 'Unknown';
      let type = 'unknown';
      if (/TextField/i.test(ctor)) type = 'text';
      else if (/CheckBox/i.test(ctor)) type = 'checkbox';
      else if (/RadioGroup/i.test(ctor)) type = 'radio';
      else if (/Dropdown/i.test(ctor)) type = 'dropdown';
      else if (/OptionList/i.test(ctor)) type = 'list';
      else if (/Button/i.test(ctor)) type = 'button';
      else if (/Signature/i.test(ctor)) type = 'signature';

      let value = null;
      try {
        if (type === 'text' && typeof field.getText === 'function') value = field.getText();
        else if (type === 'checkbox' && typeof field.isChecked === 'function') value = field.isChecked();
        else if (type === 'radio' && typeof field.getSelected === 'function') value = field.getSelected();
        else if ((type === 'dropdown' || type === 'list') && typeof field.getSelected === 'function') value = field.getSelected();
      } catch (_) {
        value = null;
      }

      return {
        name,
        type,
        value,
        page: null,
        rect: null,
        readonly: false,
        required: false
      };
    };

    return fields.map(summarize);
  }

  async fillFormFields(mediaFileId, fields = {}, options = {}, { requestingUserId = null } = {}) {
    const { media } = await ensurePdfMedia(mediaFileId);
    const buf = await storageService.getFileBuffer(media.storage_key);
    const pdfDoc = await PDFDocument.load(buf);
    const form = pdfDoc.getForm();

    // Apply field values
    for (const [name, value] of Object.entries(fields || {})) {
      try {
        const field = form.getField(name);
        const ctor = field?.constructor?.name || '';

        if (/TextField/i.test(ctor) && typeof field.setText === 'function') {
          field.setText(String(value ?? ''));
        } else if (/CheckBox/i.test(ctor)) {
          if (value) field.check(); else field.uncheck();
        } else if (/RadioGroup/i.test(ctor) && typeof field.select === 'function') {
          field.select(String(value));
        } else if ((/Dropdown|OptionList/i.test(ctor)) && typeof field.select === 'function') {
          if (Array.isArray(value)) {
            for (const v of value) field.select(String(v));
          } else {
            field.select(String(value));
          }
        }
      } catch (e) {
        logError(e, { context: 'PdfService.fillFormFields.apply', name });
      }
    }

    if (options.flatten) {
      try { form.flatten(); } catch (e) { /* ignore */ }
    }

    const out = await pdfDoc.save();
    const outBuffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
    const storageKey = buildPdfOpsKey(mediaFileId, 'fill');
    const access = media.is_public ? 'public' : 'private';
    const upload = await storageService.uploadFile(
      outBuffer,
      storageKey,
      'application/pdf',
      {
        operation: 'pdf.forms.fill',
        sourceId: mediaFileId,
        fields: Object.keys(fields || {}),
        flattened: Boolean(options.flatten),
        requestedBy: requestingUserId || media.user_id,
        access
      },
      { access }
    );

    if (databaseService.isAvailable()) {
      try {
        await databaseService.createMediaVariant({
          media_file_id: mediaFileId,
          storage_key: storageKey,
          variant_type: 'custom',
          format: 'pdf',
          width: 0,
          height: 0,
          file_size: outBuffer.length,
          quality: null,
          processing_settings: { operation: 'forms.fill', flattened: Boolean(options.flatten) }
        });
      } catch (e) {
        logError(e, { context: 'PdfService.fillFormFields.createVariant', mediaFileId });
      }
    }

    logInfo('PDF form fill completed', { mediaFileId, fields: Object.keys(fields || {}).length });

    return {
      storageKey,
      size: outBuffer.length,
      mimeType: 'application/pdf',
      url: upload.url || null,
      signedUrl: upload.signedUrl || null,
      access: upload.access || access
    };
  }

  async rotate(mediaFileId, { pages = 'all', angle = 90 } = {}, { requestingUserId = null } = {}) {
    const { media } = await ensurePdfMedia(mediaFileId);
    const buf = await storageService.getFileBuffer(media.storage_key);
    const doc = await PDFDocument.load(buf);

    const pageCount = doc.getPageCount();
    const indices = pages === 'all' ? Array.from({ length: pageCount }, (_, i) => i) : parsePageRange(String(pages), pageCount);
    const rotation = ((Number(angle) % 360) + 360) % 360; // normalize 0-359

    indices.forEach(i => {
      const page = doc.getPage(i);
      if (!page) return;
      page.setRotation(degrees(rotation));
    });

    const out = await doc.save();
    const outBuffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
    const storageKey = buildPdfOpsKey(mediaFileId, 'rotate');
    const access = media.is_public ? 'public' : 'private';
    const upload = await storageService.uploadFile(
      outBuffer,
      storageKey,
      'application/pdf',
      {
        operation: 'pdf.rotate',
        sourceId: mediaFileId,
        pages,
        angle: rotation,
        requestedBy: requestingUserId || media.user_id,
        access
      },
      { access }
    );

    if (databaseService.isAvailable()) {
      try {
        await databaseService.createMediaVariant({
          media_file_id: mediaFileId,
          storage_key: storageKey,
          variant_type: 'custom',
          format: 'pdf',
          width: Array.isArray(indices) ? indices.length : 0,
          height: rotation,
          file_size: outBuffer.length,
          quality: null,
          processing_settings: { operation: 'rotate', pages, angle: rotation }
        });
      } catch (e) {
        logError(e, { context: 'PdfService.rotate.createVariant', mediaFileId });
      }
    }

    logInfo('PDF rotation completed', { mediaFileId, pages: pages || 'all', angle: rotation });
    return {
      storageKey,
      size: outBuffer.length,
      mimeType: 'application/pdf',
      url: upload.url || null,
      signedUrl: upload.signedUrl || null,
      access: upload.access || access
    };
  }

  async compress(mediaFileId, { profile = 'ebook', imageDownsample = 144 } = {}, { requestingUserId = null } = {}) {
    const { media } = await ensurePdfMedia(mediaFileId);
    const { tempDir, filePath, cleanup } = await storageService.downloadToTempFile(media.storage_key, { prefix: 'pdfsrc', extension: 'pdf' });
    const outPath = path.join(tempDir, `out-${Date.now()}.pdf`);

    const gsProfile = String(profile).toLowerCase();
    const pdfSetting = gsProfile === 'screen' ? '/screen' : gsProfile === 'prepress' ? '/prepress' : '/ebook';

    let usedGhostscript = false;
    try {
      const { spawn } = await import('node:child_process');
      const args = [
        '-sDEVICE=pdfwrite',
        `-dPDFSETTINGS=${pdfSetting}`,
        '-dCompatibilityLevel=1.4',
        '-dNOPAUSE',
        '-dBATCH',
        '-dQUIET',
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSubsetFonts=true',
        '-dAutoRotatePages=/None',
        `-dDownsampleColorImages=${imageDownsample ? 'true' : 'false'}`,
        `-dColorImageResolution=${Number(imageDownsample) || 144}`,
        `-dGrayImageResolution=${Number(imageDownsample) || 144}`,
        `-dMonoImageResolution=${Number(imageDownsample) || 144}`,
        `-sOutputFile=${outPath}`,
        filePath
      ];
      await new Promise((resolve, reject) => {
        const p = spawn('gs', args);
        p.on('error', reject);
        p.on('close', code => (code === 0 ? resolve() : reject(new Error(`gs exited ${code}`))));
      });
      usedGhostscript = true;
    } catch (e) {
      logError(e, { context: 'PdfService.compress.gs', mediaFileId });
    }

    let outBuffer;
    if (usedGhostscript) {
      try {
        outBuffer = await (await import('node:fs')).promises.readFile(outPath);
      } catch (e) {
        logError(e, { context: 'PdfService.compress.readOut', mediaFileId });
      }
    }

    // Fallback to pass-through when compression not available
    if (!outBuffer) {
      try {
        const srcBuf = await storageService.getFileBuffer(media.storage_key);
        outBuffer = Buffer.from(srcBuf);
      } catch (e) {
        await cleanup();
        throw e;
      }
    }

    const storageKey = buildPdfOpsKey(mediaFileId, 'compress');
    const access = media.is_public ? 'public' : 'private';
    const upload = await storageService.uploadFile(
      outBuffer,
      storageKey,
      'application/pdf',
      {
        operation: 'pdf.compress',
        sourceId: mediaFileId,
        profile: pdfSetting,
        downsample: Number(imageDownsample) || null,
        usedGhostscript,
        requestedBy: requestingUserId || media.user_id,
        access
      },
      { access }
    );

    if (databaseService.isAvailable()) {
      try {
        await databaseService.createMediaVariant({
          media_file_id: mediaFileId,
          storage_key: storageKey,
          variant_type: 'custom',
          format: 'pdf',
          width: 0,
          height: 0,
          file_size: outBuffer.length,
          quality: null,
          processing_settings: { operation: 'compress', profile: pdfSetting, usedGhostscript }
        });
      } catch (e) {
        logError(e, { context: 'PdfService.compress.createVariant', mediaFileId });
      }
    }

    await cleanup();
    logInfo('PDF compression completed', { mediaFileId, usedGhostscript, size: outBuffer.length });
    return {
      storageKey,
      size: outBuffer.length,
      mimeType: 'application/pdf',
      url: upload.url || null,
      signedUrl: upload.signedUrl || null,
      access: upload.access || access
    };
  }

  async watermark(mediaFileId, { text = '', pages = 'all', opacity = 0.2, size = null, position = 'center', angle = -35 } = {}, { requestingUserId = null } = {}) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      const err = new Error('Watermark text is required');
      err.statusCode = 400;
      throw err;
    }

    const { media } = await ensurePdfMedia(mediaFileId);
    const buf = await storageService.getFileBuffer(media.storage_key);
    const pdfDoc = await PDFDocument.load(buf);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageCount = pdfDoc.getPageCount();
    const indices = pages === 'all' ? Array.from({ length: pageCount }, (_, i) => i) : parsePageRange(String(pages), pageCount);

    const posKey = String(position || 'center').toLowerCase();
    for (const i of indices) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      const fontSize = size ? Number(size) : Math.max(32, Math.floor(Math.min(width, height) / 12));

      let x = width / 2;
      let y = height / 2;
      const margin = Math.max(24, Math.floor(Math.min(width, height) / 20));
      if (posKey === 'top-left') { x = margin; y = height - margin; }
      else if (posKey === 'top-right') { x = width - margin; y = height - margin; }
      else if (posKey === 'bottom-left') { x = margin; y = margin; }
      else if (posKey === 'bottom-right') { x = width - margin; y = margin; }

      page.drawText(text, {
        x: x - (posKey === 'center' ? font.widthOfTextAtSize(text, fontSize) / 2 : 0),
        y: y - (posKey === 'center' ? fontSize / 2 : 0),
        size: fontSize,
        opacity: Math.max(0.01, Math.min(1, Number(opacity) || 0.2)),
        font,
        color: rgb(0.6, 0.6, 0.6),
        rotate: degrees(Number(angle) || 0)
      });
    }

    const out = await pdfDoc.save();
    const outBuffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
    const storageKey = buildPdfOpsKey(mediaFileId, 'watermark');
    const access = media.is_public ? 'public' : 'private';
    const upload = await storageService.uploadFile(
      outBuffer,
      storageKey,
      'application/pdf',
      {
        operation: 'pdf.watermark',
        sourceId: mediaFileId,
        text,
        pages,
        position: posKey,
        opacity: Number(opacity) || 0.2,
        angle: Number(angle) || 0,
        requestedBy: requestingUserId || media.user_id,
        access
      },
      { access }
    );

    if (databaseService.isAvailable()) {
      try {
        await databaseService.createMediaVariant({
          media_file_id: mediaFileId,
          storage_key: storageKey,
          variant_type: 'custom',
          format: 'pdf',
          width: 0,
          height: 0,
          file_size: outBuffer.length,
          quality: null,
          processing_settings: { operation: 'watermark', text, pages, position: posKey }
        });
      } catch (e) {
        logError(e, { context: 'PdfService.watermark.createVariant', mediaFileId });
      }
    }

    logInfo('PDF watermark applied', { mediaFileId, pages: pages || 'all' });
    return {
      storageKey,
      size: outBuffer.length,
      mimeType: 'application/pdf',
      url: upload.url || null,
      signedUrl: upload.signedUrl || null,
      access: upload.access || access
    };
  }

  async flatten(mediaFileId, { what = 'forms' } = {}, { requestingUserId = null } = {}) {
    const { media } = await ensurePdfMedia(mediaFileId);
    const access = media.is_public ? 'public' : 'private';
    const srcBuf = await storageService.getFileBuffer(media.storage_key);
    const doc = await PDFDocument.load(srcBuf);

    let bufferToUpload = null;
    let usedGhostscript = false;

    // Always flatten forms if requested or 'all'
    if (what === 'forms' || what === 'all') {
      try { doc.getForm().flatten(); } catch (_) {}
    }

    if (what === 'annotations' || what === 'all') {
      // Attempt a Ghostscript rewrite which often bakes annotations
      const { tempDir, filePath, cleanup } = await storageService.downloadToTempFile(media.storage_key, { prefix: 'pdfflat', extension: 'pdf' });
      const outPath = path.join(tempDir, `out-${Date.now()}.pdf`);
      try {
        const { spawn } = await import('node:child_process');
        const args = [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.4',
          '-dNOPAUSE',
          '-dBATCH',
          '-dQUIET',
          `-sOutputFile=${outPath}`,
          filePath
        ];
        await new Promise((resolve, reject) => {
          const p = spawn('gs', args);
          p.on('error', reject);
          p.on('close', code => (code === 0 ? resolve() : reject(new Error(`gs exited ${code}`))));
        });
        usedGhostscript = true;
        bufferToUpload = await (await import('node:fs')).promises.readFile(outPath);
      } catch (e) {
        logError(e, { context: 'PdfService.flatten.gs', mediaFileId });
      } finally {
        try { await (await import('node:fs')).promises.rm(tempDir, { recursive: true, force: true }); } catch (_) {}
      }
    }

    if (!bufferToUpload) {
      const saved = await doc.save();
      bufferToUpload = Buffer.isBuffer(saved) ? saved : Buffer.from(saved);
    }

    const storageKey = buildPdfOpsKey(mediaFileId, 'flatten');
    const upload = await storageService.uploadFile(
      bufferToUpload,
      storageKey,
      'application/pdf',
      {
        operation: 'pdf.flatten',
        sourceId: mediaFileId,
        what,
        usedGhostscript,
        requestedBy: requestingUserId || media.user_id,
        access
      },
      { access }
    );

    if (databaseService.isAvailable()) {
      try {
        await databaseService.createMediaVariant({
          media_file_id: mediaFileId,
          storage_key: storageKey,
          variant_type: 'custom',
          format: 'pdf',
          width: 0,
          height: 0,
          file_size: bufferToUpload.length,
          quality: null,
          processing_settings: { operation: 'flatten', what, usedGhostscript }
        });
      } catch (e) {
        logError(e, { context: 'PdfService.flatten.createVariant', mediaFileId });
      }
    }

    logInfo('PDF flatten completed', { mediaFileId, what });
    return {
      storageKey,
      size: bufferToUpload.length,
      mimeType: 'application/pdf',
      url: upload.url || null,
      signedUrl: upload.signedUrl || null,
      access: upload.access || access
    };
  }

  async renderImages(mediaFileId, { format = 'png', dpi = 144, pages = 'all', quality = 85 } = {}, { requestingUserId = null } = {}) {
    const { media } = await ensurePdfMedia(mediaFileId);
    const srcBuf = await storageService.getFileBuffer(media.storage_key);
    const doc = await PDFDocument.load(srcBuf);
    const pageCount = doc.getPageCount();
    const indices = pages === 'all' ? Array.from({ length: pageCount }, (_, i) => i) : parsePageRange(String(pages), pageCount);

    const { tempDir, filePath, cleanup } = await storageService.downloadToTempFile(media.storage_key, { prefix: 'pdfrender', extension: 'pdf' });
    const results = [];
    const fmt = String(format).toLowerCase() === 'jpg' ? 'jpg' : String(format).toLowerCase() === 'jpeg' ? 'jpg' : 'png';

    try {
      for (const idx of indices) {
        const pageOneBased = idx + 1;
        const outPath = path.join(tempDir, `page-${pageOneBased}.${fmt}`);
        const argsMagick = [
          '-density', String(Number(dpi) || 144),
          `${filePath}[${idx}]`,
          '-quality', String(Number(quality) || 85),
        ];
        // Additional args for PNG/JPG outputs
        if (fmt === 'png') {
          argsMagick.push('-strip');
        } else {
          argsMagick.push('-strip');
          argsMagick.push('-interlace', 'Plane');
        }
        argsMagick.push(outPath);

        let ok = false;
        try {
          const { spawn } = await import('node:child_process');
          await new Promise((resolve, reject) => {
            const p = spawn('magick', argsMagick);
            p.on('error', reject);
            p.on('close', code => (code === 0 ? resolve() : reject(new Error(`magick exited ${code}`))));
          });
          ok = true;
        } catch (e) {
          try {
            const { spawn } = await import('node:child_process');
            await new Promise((resolve, reject) => {
              const p = spawn('convert', argsMagick);
              p.on('error', reject);
              p.on('close', code => (code === 0 ? resolve() : reject(new Error(`convert exited ${code}`))));
            });
            ok = true;
          } catch (e2) {
            logError(e2, { context: 'PdfService.renderImages.convert', mediaFileId, page: pageOneBased });
          }
        }

        if (!ok) continue;

        // Upload generated image
        let metaWidth = 0;
        let metaHeight = 0;
        try {
          const sharpMod = await import('sharp');
          const metadata = await sharpMod.default(outPath).metadata();
          metaWidth = metadata.width || 0;
          metaHeight = metadata.height || 0;
        } catch (_) {}

        const storageKey = buildPdfOpsKey(mediaFileId, `page-${pageOneBased}.${fmt}`);
        const contentType = fmt === 'png' ? 'image/png' : 'image/jpeg';
        const upload = await storageService.uploadFileFromPath(outPath, storageKey, contentType, {
          operation: 'pdf.to-image',
          sourceId: mediaFileId,
          page: pageOneBased,
          dpi: Number(dpi) || 144,
          format: fmt,
          access: media.is_public ? 'public' : 'private',
          requestedBy: requestingUserId || media.user_id
        }, { access: media.is_public ? 'public' : 'private' });

        if (databaseService.isAvailable()) {
          try {
            await databaseService.createMediaVariant({
              media_file_id: mediaFileId,
              storage_key: storageKey,
              variant_type: 'custom',
              format: fmt,
              width: metaWidth || 0,
              height: metaHeight || 0,
              file_size: 0,
              quality: fmt === 'jpg' ? Number(quality) || 85 : null,
              processing_settings: { operation: 'pdf.to-image', page: pageOneBased, dpi: Number(dpi) || 144, format: fmt }
            });
          } catch (e) {
            logError(e, { context: 'PdfService.renderImages.createVariant', mediaFileId, page: pageOneBased });
          }
        }

        results.push({ page: pageOneBased, storageKey, url: upload.url || null, signedUrl: upload.signedUrl || null, format: fmt, width: metaWidth || null, height: metaHeight || null });
      }
    } finally {
      await cleanup();
    }

    logInfo('PDF to images completed', { mediaFileId, count: results.length, format: fmt, dpi });
    return { count: results.length, results };
  }

  async stamp(mediaFileId, options = {}, { requestingUserId = null } = {}) {
    const { text = null, imageMediaFileId = null, pages = 'all', position = 'header', margin = 36, pageNumbers = null, opacity = 1, fontSize = 12 } = options || {};
    const { media } = await ensurePdfMedia(mediaFileId);
    const access = media.is_public ? 'public' : 'private';
    const buf = await storageService.getFileBuffer(media.storage_key);
    const pdfDoc = await PDFDocument.load(buf);
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Image stamp support
    let embeddedImage = null;
    if (imageMediaFileId) {
      try {
        const imgMedia = await databaseService.getMediaFile(imageMediaFileId);
        if (imgMedia) {
          const imgBuf = await storageService.getFileBuffer(imgMedia.storage_key);
          try { embeddedImage = await pdfDoc.embedPng(imgBuf); } catch { /* try jpg */ }
          if (!embeddedImage) {
            try { embeddedImage = await pdfDoc.embedJpg(imgBuf); } catch { /* ignore */ }
          }
        }
      } catch (e) {
        logError(e, { context: 'PdfService.stamp.embedImage', imageMediaFileId });
      }
    }

    const pageCount = pdfDoc.getPageCount();
    const indices = pages === 'all' ? Array.from({ length: pageCount }, (_, i) => i) : parsePageRange(String(pages), pageCount);

    indices.forEach(i => {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      const m = Math.max(0, Number(margin) || 0);

      // Header/Footer placement
      const yHeader = height - m - fontSize;
      const yFooter = m;

      if (text) {
        let x = m;
        let y = position === 'footer' ? yFooter : (position === 'center' ? height / 2 : yHeader);
        if (position === 'center') {
          const tw = helv.widthOfTextAtSize(text, fontSize);
          x = (width - tw) / 2;
        }
        page.drawText(text, { x, y, size: fontSize, font: helv, opacity: Math.max(0.01, Math.min(1, Number(opacity) || 1)), color: rgb(0,0,0) });
      }

      if (embeddedImage) {
        const imgDims = embeddedImage.scale(1);
        const maxW = width - m * 2;
        const targetW = Math.min(maxW, imgDims.width);
        const scale = targetW / imgDims.width;
        const targetH = imgDims.height * scale;
        const ix = m;
        const iy = position === 'footer' ? yFooter : yHeader - targetH + fontSize;
        page.drawImage(embeddedImage, { x: ix, y: iy, width: targetW, height: targetH, opacity: Math.max(0.01, Math.min(1, Number(opacity) || 1)) });
      }

      // Page numbers
      if (pageNumbers && (pageNumbers.enabled ?? true)) {
        const fmt = pageNumbers.format || '{page}/{total}';
        const txt = String(fmt).replace('{page}', String(i + 1)).replace('{total}', String(pageCount));
        const size = Number(pageNumbers.fontSize) || fontSize;
        const y = Number.isFinite(pageNumbers.margin) ? Number(pageNumbers.margin) : m;
        const pos = (pageNumbers.position || 'footer-right').toLowerCase();
        let x = m;
        if (pos.endsWith('center')) {
          const tw = helv.widthOfTextAtSize(txt, size);
          x = (width - tw) / 2;
        } else if (pos.endsWith('right')) {
          const tw = helv.widthOfTextAtSize(txt, size);
          x = width - m - tw;
        }
        const yy = pos.startsWith('header') ? height - y - size : y;
        page.drawText(txt, { x, y: yy, size, font: helv, color: rgb(0,0,0) });
      }
    });

    const out = await pdfDoc.save();
    const outBuffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
    const storageKey = buildPdfOpsKey(mediaFileId, 'stamp');
    const upload = await storageService.uploadFile(
      outBuffer,
      storageKey,
      'application/pdf',
      {
        operation: 'pdf.stamp',
        sourceId: mediaFileId,
        hasText: Boolean(text),
        hasImage: Boolean(embeddedImage),
        pageNumbers: Boolean(pageNumbers),
        position,
        requestedBy: requestingUserId || media.user_id,
        access
      },
      { access }
    );

    if (databaseService.isAvailable()) {
      try {
        await databaseService.createMediaVariant({
          media_file_id: mediaFileId,
          storage_key: storageKey,
          variant_type: 'custom',
          format: 'pdf',
          width: 0,
          height: 0,
          file_size: outBuffer.length,
          quality: null,
          processing_settings: { operation: 'stamp', text: Boolean(text), image: Boolean(embeddedImage), pageNumbers: Boolean(pageNumbers) }
        });
      } catch (e) {
        logError(e, { context: 'PdfService.stamp.createVariant', mediaFileId });
      }
    }

    logInfo('PDF stamp applied', { mediaFileId, text: Boolean(text), image: Boolean(embeddedImage) });
    return {
      storageKey,
      size: outBuffer.length,
      mimeType: 'application/pdf',
      url: upload.url || null,
      signedUrl: upload.signedUrl || null,
      access: upload.access || access
    };
  }

  buildPermissionsMask(perms = {}) {
    // Map boolean permissions to Ghostscript numeric mask (sum of allowed operations)
    const map = {
      print: 4,
      modify: 8,
      copy: 16,
      annotate: 32,
      fillForms: 256,
      extract: 512,
      assemble: 1024,
      highResPrint: 2048
    };
    let mask = 0;
    for (const [k, v] of Object.entries(perms || {})) {
      if (v && map[k]) mask += map[k];
    }
    return mask || 0;
  }

  async security(mediaFileId, { action = 'set', userPassword = '', ownerPassword = '', permissions = {}, currentPassword = '' } = {}, { requestingUserId = null } = {}) {
    const { media } = await ensurePdfMedia(mediaFileId);
    const { tempDir, filePath, cleanup } = await storageService.downloadToTempFile(media.storage_key, { prefix: 'pdfsec', extension: 'pdf' });
    const outPath = path.join(tempDir, `out-${Date.now()}.pdf`);

    const args = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.7',
      '-dNOPAUSE',
      '-dBATCH',
      '-dQUIET'
    ];

    if (currentPassword) {
      args.push(`-sPDFPassword=${currentPassword}`);
    }

    if (action === 'set') {
      const mask = this.buildPermissionsMask(permissions);
      if (ownerPassword) args.push(`-sOwnerPassword=${ownerPassword}`);
      if (userPassword) args.push(`-sUserPassword=${userPassword}`);
      // 128-bit encryption
      args.push('-dEncryptionR=3');
      args.push('-dKeyLength=128');
      if (mask) args.push(`-dPermissions=${mask}`);
    }
    // For remove, do not pass encryption flags; just rewrite

    args.push(`-sOutputFile=${outPath}`);
    args.push(filePath);

    let usedGhostscript = false;
    try {
      const { spawn } = await import('node:child_process');
      await new Promise((resolve, reject) => {
        const p = spawn('gs', args);
        p.on('error', reject);
        p.on('close', code => (code === 0 ? resolve() : reject(new Error(`gs exited ${code}`))));
      });
      usedGhostscript = true;
    } catch (e) {
      await cleanup();
      logError(e, { context: 'PdfService.security.gs', mediaFileId });
      const err = new Error('PDF security operation failed');
      err.statusCode = 422;
      throw err;
    }

    let outBuffer = null;
    try {
      outBuffer = await (await import('node:fs')).promises.readFile(outPath);
    } finally {
      await cleanup();
    }

    const storageKey = buildPdfOpsKey(mediaFileId, 'security');
    const access = media.is_public ? 'public' : 'private';
    const upload = await storageService.uploadFile(
      outBuffer,
      storageKey,
      'application/pdf',
      {
        operation: 'pdf.security',
        sourceId: mediaFileId,
        action,
        usedGhostscript,
        requestedBy: requestingUserId || media.user_id,
        access
      },
      { access }
    );

    if (databaseService.isAvailable()) {
      try {
        await databaseService.createMediaVariant({
          media_file_id: mediaFileId,
          storage_key: storageKey,
          variant_type: 'custom',
          format: 'pdf',
          width: 0,
          height: 0,
          file_size: outBuffer.length,
          quality: null,
          processing_settings: { operation: 'security', action }
        });
      } catch (e) {
        logError(e, { context: 'PdfService.security.createVariant', mediaFileId });
      }
    }

    logInfo('PDF security updated', { mediaFileId, action });
    return {
      storageKey,
      size: outBuffer.length,
      mimeType: 'application/pdf',
      url: upload.url || null,
      signedUrl: upload.signedUrl || null,
      access: upload.access || access
    };
  }
}

export default new PdfService();
