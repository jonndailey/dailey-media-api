import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import storageService from './storageService.js';
import { logInfo, logError } from '../middleware/logger.js';

// Comprehensive file type mapping
const FILE_TYPES = {
  // Images
  'jpg': { category: 'image', mime: 'image/jpeg', processable: true },
  'jpeg': { category: 'image', mime: 'image/jpeg', processable: true },
  'png': { category: 'image', mime: 'image/png', processable: true },
  'gif': { category: 'image', mime: 'image/gif', processable: true },
  'webp': { category: 'image', mime: 'image/webp', processable: true },
  'svg': { category: 'image', mime: 'image/svg+xml', processable: false },
  'ico': { category: 'image', mime: 'image/x-icon', processable: false },
  'bmp': { category: 'image', mime: 'image/bmp', processable: true },
  'tiff': { category: 'image', mime: 'image/tiff', processable: true },
  'tif': { category: 'image', mime: 'image/tiff', processable: true },
  'heic': { category: 'image', mime: 'image/heic', processable: true },
  'heif': { category: 'image', mime: 'image/heif', processable: true },
  'avif': { category: 'image', mime: 'image/avif', processable: true },
  
  // RAW Images
  'cr2': { category: 'raw', mime: 'image/x-canon-cr2', processable: false },
  'cr3': { category: 'raw', mime: 'image/x-canon-cr3', processable: false },
  'nef': { category: 'raw', mime: 'image/x-nikon-nef', processable: false },
  'arw': { category: 'raw', mime: 'image/x-sony-arw', processable: false },
  'dng': { category: 'raw', mime: 'image/x-adobe-dng', processable: false },
  'raf': { category: 'raw', mime: 'image/x-fuji-raf', processable: false },
  'orf': { category: 'raw', mime: 'image/x-olympus-orf', processable: false },
  'rw2': { category: 'raw', mime: 'image/x-panasonic-rw2', processable: false },
  
  // Videos
  'mp4': { category: 'video', mime: 'video/mp4', processable: false },
  'avi': { category: 'video', mime: 'video/x-msvideo', processable: false },
  'mov': { category: 'video', mime: 'video/quicktime', processable: false },
  'wmv': { category: 'video', mime: 'video/x-ms-wmv', processable: false },
  'flv': { category: 'video', mime: 'video/x-flv', processable: false },
  'mkv': { category: 'video', mime: 'video/x-matroska', processable: false },
  'webm': { category: 'video', mime: 'video/webm', processable: false },
  'm4v': { category: 'video', mime: 'video/x-m4v', processable: false },
  'mpg': { category: 'video', mime: 'video/mpeg', processable: false },
  'mpeg': { category: 'video', mime: 'video/mpeg', processable: false },
  '3gp': { category: 'video', mime: 'video/3gpp', processable: false },
  
  // Audio
  'mp3': { category: 'audio', mime: 'audio/mpeg', processable: false },
  'wav': { category: 'audio', mime: 'audio/wav', processable: false },
  'flac': { category: 'audio', mime: 'audio/flac', processable: false },
  'aac': { category: 'audio', mime: 'audio/aac', processable: false },
  'ogg': { category: 'audio', mime: 'audio/ogg', processable: false },
  'wma': { category: 'audio', mime: 'audio/x-ms-wma', processable: false },
  'm4a': { category: 'audio', mime: 'audio/x-m4a', processable: false },
  'opus': { category: 'audio', mime: 'audio/opus', processable: false },
  
  // Documents
  'pdf': { category: 'document', mime: 'application/pdf', processable: false },
  'doc': { category: 'document', mime: 'application/msword', processable: false },
  'docx': { category: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', processable: false },
  'xls': { category: 'document', mime: 'application/vnd.ms-excel', processable: false },
  'xlsx': { category: 'document', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', processable: false },
  'ppt': { category: 'document', mime: 'application/vnd.ms-powerpoint', processable: false },
  'pptx': { category: 'document', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', processable: false },
  'odt': { category: 'document', mime: 'application/vnd.oasis.opendocument.text', processable: false },
  'ods': { category: 'document', mime: 'application/vnd.oasis.opendocument.spreadsheet', processable: false },
  'odp': { category: 'document', mime: 'application/vnd.oasis.opendocument.presentation', processable: false },
  'rtf': { category: 'document', mime: 'application/rtf', processable: false },
  'tex': { category: 'document', mime: 'application/x-tex', processable: false },
  
  // Text
  'txt': { category: 'text', mime: 'text/plain', processable: false },
  'md': { category: 'text', mime: 'text/markdown', processable: false },
  'csv': { category: 'text', mime: 'text/csv', processable: false },
  'log': { category: 'text', mime: 'text/plain', processable: false },
  'json': { category: 'text', mime: 'application/json', processable: false },
  'xml': { category: 'text', mime: 'application/xml', processable: false },
  'yaml': { category: 'text', mime: 'text/yaml', processable: false },
  'yml': { category: 'text', mime: 'text/yaml', processable: false },
  
  // Code
  'js': { category: 'code', mime: 'text/javascript', processable: false },
  'ts': { category: 'code', mime: 'text/typescript', processable: false },
  'jsx': { category: 'code', mime: 'text/jsx', processable: false },
  'tsx': { category: 'code', mime: 'text/tsx', processable: false },
  'py': { category: 'code', mime: 'text/x-python', processable: false },
  'java': { category: 'code', mime: 'text/x-java', processable: false },
  'c': { category: 'code', mime: 'text/x-c', processable: false },
  'cpp': { category: 'code', mime: 'text/x-c++', processable: false },
  'h': { category: 'code', mime: 'text/x-c', processable: false },
  'cs': { category: 'code', mime: 'text/x-csharp', processable: false },
  'php': { category: 'code', mime: 'text/x-php', processable: false },
  'rb': { category: 'code', mime: 'text/x-ruby', processable: false },
  'go': { category: 'code', mime: 'text/x-go', processable: false },
  'rs': { category: 'code', mime: 'text/x-rust', processable: false },
  'swift': { category: 'code', mime: 'text/x-swift', processable: false },
  'kt': { category: 'code', mime: 'text/x-kotlin', processable: false },
  'scala': { category: 'code', mime: 'text/x-scala', processable: false },
  'sh': { category: 'code', mime: 'text/x-shellscript', processable: false },
  'bash': { category: 'code', mime: 'text/x-shellscript', processable: false },
  'ps1': { category: 'code', mime: 'text/x-powershell', processable: false },
  'sql': { category: 'code', mime: 'application/sql', processable: false },
  'html': { category: 'code', mime: 'text/html', processable: false },
  'css': { category: 'code', mime: 'text/css', processable: false },
  'scss': { category: 'code', mime: 'text/x-scss', processable: false },
  'sass': { category: 'code', mime: 'text/x-sass', processable: false },
  'less': { category: 'code', mime: 'text/x-less', processable: false },
  
  // Archives
  'zip': { category: 'archive', mime: 'application/zip', processable: false },
  'rar': { category: 'archive', mime: 'application/x-rar-compressed', processable: false },
  '7z': { category: 'archive', mime: 'application/x-7z-compressed', processable: false },
  'tar': { category: 'archive', mime: 'application/x-tar', processable: false },
  'gz': { category: 'archive', mime: 'application/gzip', processable: false },
  'bz2': { category: 'archive', mime: 'application/x-bzip2', processable: false },
  'xz': { category: 'archive', mime: 'application/x-xz', processable: false },
  
  // Data
  'sqlite': { category: 'data', mime: 'application/x-sqlite3', processable: false },
  'db': { category: 'data', mime: 'application/x-sqlite3', processable: false },
  'sql': { category: 'data', mime: 'application/sql', processable: false },
  
  // Fonts
  'ttf': { category: 'font', mime: 'font/ttf', processable: false },
  'otf': { category: 'font', mime: 'font/otf', processable: false },
  'woff': { category: 'font', mime: 'font/woff', processable: false },
  'woff2': { category: 'font', mime: 'font/woff2', processable: false },
  'eot': { category: 'font', mime: 'application/vnd.ms-fontobject', processable: false },
  
  // Other
  'apk': { category: 'application', mime: 'application/vnd.android.package-archive', processable: false },
  'ipa': { category: 'application', mime: 'application/octet-stream', processable: false },
  'exe': { category: 'application', mime: 'application/x-msdownload', processable: false },
  'msi': { category: 'application', mime: 'application/x-msi', processable: false },
  'dmg': { category: 'application', mime: 'application/x-apple-diskimage', processable: false },
  'deb': { category: 'application', mime: 'application/x-debian-package', processable: false },
  'rpm': { category: 'application', mime: 'application/x-rpm', processable: false },
  'iso': { category: 'application', mime: 'application/x-iso9660-image', processable: false },
  'torrent': { category: 'application', mime: 'application/x-bittorrent', processable: false }
};

// Processing sizes for images
const IMAGE_SIZES = {
  thumbnail: { width: 150, height: 150, fit: 'cover' },
  small: { width: 320, height: 320, fit: 'inside' },
  medium: { width: 640, height: 640, fit: 'inside' },
  large: { width: 1280, height: 1280, fit: 'inside' }
};

class FileService {
  /**
   * Get file type information from extension
   */
  getFileTypeInfo(filename) {
    const extension = path.extname(filename).toLowerCase().slice(1);
    const typeInfo = FILE_TYPES[extension];
    
    if (typeInfo) {
      return {
        extension,
        ...typeInfo,
        isSupported: true
      };
    }
    
    // Unknown file type - still accept it
    return {
      extension: extension || 'unknown',
      category: 'other',
      mime: 'application/octet-stream',
      processable: false,
      isSupported: true // Accept ALL files
    };
  }

  /**
   * Check if file is valid (we accept everything now)
   */
  isValidFile(filename) {
    return true; // Accept all files
  }

  /**
   * Get supported formats grouped by category
   */
  getSupportedFormats() {
    const grouped = {};
    
    for (const [ext, info] of Object.entries(FILE_TYPES)) {
      if (!grouped[info.category]) {
        grouped[info.category] = [];
      }
      grouped[info.category].push({
        extension: ext,
        mime: info.mime,
        processable: info.processable
      });
    }
    
    // Add a general category for unknown types
    grouped['other'] = [{
      extension: '*',
      mime: 'application/octet-stream',
      processable: false,
      description: 'Any other file type'
    }];
    
    return grouped;
  }

  /**
   * Process and store any file
   */
  async processAndStoreFile(buffer, filename, userId = 'system', appId = 'dailey-media-api', metadata = {}) {
    try {
      const fileInfo = this.getFileTypeInfo(filename);
      const fileId = nanoid();
      const timestamp = Date.now();
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      
      // Generate storage key
      const storageKey = `files/${userId}/${timestamp}_${fileId}.${fileInfo.extension}`;
      
      // Store original file
      await storageService.uploadFile(buffer, storageKey, fileInfo.mime);
      
      logInfo('Stored file', {
        filename,
        category: fileInfo.category,
        size: buffer.length,
        storageKey
      });

      const result = {
        original: {
          key: storageKey,
          url: storageService.getPublicUrl(storageKey),
          size: buffer.length,
          mime: fileInfo.mime,
          extension: fileInfo.extension,
          hash
        },
        variants: [],
        metadata: {
          ...metadata,
          category: fileInfo.category,
          processable: fileInfo.processable,
          originalName: filename,
          uploadedAt: new Date().toISOString()
        }
      };

      // If it's a processable image, extract metadata and create variants
      if (fileInfo.processable && fileInfo.category === 'image') {
        try {
          const imageMetadata = await this.extractImageMetadata(buffer);
          result.metadata = { ...result.metadata, ...imageMetadata };
          
          // Generate common variants for images
          if (imageMetadata.width > 320) {
            const variants = await this.generateImageVariants(buffer, storageKey, userId);
            result.variants = variants;
          }
        } catch (err) {
          logError(err, { context: 'fileService.imageProcessing', filename });
          // Continue without variants
        }
      }
      
      // Extract text content for text files
      if (['text', 'code', 'document'].includes(fileInfo.category) && buffer.length < 10 * 1024 * 1024) { // < 10MB
        try {
          const textPreview = buffer.toString('utf8').substring(0, 1000);
          result.metadata.textPreview = textPreview;
          result.metadata.lineCount = buffer.toString('utf8').split('\n').length;
        } catch (err) {
          // Not a text file, skip
        }
      }

      return result;
      
    } catch (error) {
      logError(error, { context: 'fileService.processAndStore', filename });
      throw error;
    }
  }

  /**
   * Extract image metadata using sharp
   */
  async extractImageMetadata(buffer) {
    try {
      const metadata = await sharp(buffer).metadata();
      
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        space: metadata.space,
        channels: metadata.channels,
        depth: metadata.depth,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
        exif: metadata.exif ? this.parseExifData(metadata.exif) : null
      };
    } catch (error) {
      logError(error, { context: 'fileService.extractMetadata' });
      return {};
    }
  }

  /**
   * Generate image variants
   */
  async generateImageVariants(buffer, originalKey, userId) {
    const variants = [];
    
    for (const [sizeName, sizeConfig] of Object.entries(IMAGE_SIZES)) {
      try {
        let processor = sharp(buffer);
        
        if (sizeConfig.fit === 'cover') {
          processor = processor.resize(sizeConfig.width, sizeConfig.height, {
            fit: 'cover',
            position: 'centre'
          });
        } else {
          processor = processor.resize(sizeConfig.width, sizeConfig.height, {
            fit: 'inside',
            withoutEnlargement: true
          });
        }
        
        const variantBuffer = await processor.webp({ quality: 85 }).toBuffer();
        const variantKey = originalKey.replace(/\.[^.]+$/, `_${sizeName}.webp`);
        
        await storageService.uploadFile(variantBuffer, variantKey, 'image/webp');
        
        variants.push({
          size: sizeName,
          key: variantKey,
          url: storageService.getPublicUrl(variantKey),
          width: sizeConfig.width,
          height: sizeConfig.height,
          format: 'webp'
        });
        
      } catch (err) {
        logError(err, { context: 'fileService.generateVariant', size: sizeName });
      }
    }
    
    return variants;
  }

  /**
   * Parse EXIF data
   */
  parseExifData(exifBuffer) {
    try {
      // Basic EXIF parsing - expand as needed
      return {
        raw: exifBuffer.toString('base64').substring(0, 100) + '...' // Truncate for storage
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get file by storage key
   */
  async getFile(storageKey) {
    try {
      const exists = await storageService.fileExists(storageKey);
      if (!exists) return null;
      
      const buffer = await storageService.getFileBuffer(storageKey);
      const stats = await storageService.getFileStats(storageKey);
      
      return {
        buffer,
        stats,
        url: storageService.getPublicUrl(storageKey)
      };
    } catch (error) {
      logError(error, { context: 'fileService.getFile', storageKey });
      return null;
    }
  }

  /**
   * Delete file and its variants
   */
  async deleteFile(storageKey, variants = []) {
    try {
      // Delete original
      await storageService.deleteFile(storageKey);
      
      // Delete variants
      for (const variant of variants) {
        try {
          await storageService.deleteFile(variant.key);
        } catch (err) {
          logError(err, { context: 'fileService.deleteVariant', key: variant.key });
        }
      }
      
      return true;
    } catch (error) {
      logError(error, { context: 'fileService.deleteFile', storageKey });
      throw error;
    }
  }
}

export default new FileService();