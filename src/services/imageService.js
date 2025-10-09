import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import storageService from './storageService.js';
import databaseService from './databaseService.js';
import { logInfo, logError } from '../middleware/logger.js';

// Professional format support mapping
const PROFESSIONAL_FORMATS = {
  // Image formats
  'heic': { name: 'HEIC', tool: 'iPhone/iOS', category: 'mobile' },
  'heif': { name: 'HEIF', tool: 'iPhone/iOS', category: 'mobile' },
  'avif': { name: 'AVIF', tool: 'Various', category: 'web' },
  
  // RAW formats
  'cr2': { name: 'Canon RAW v2', tool: 'Canon Camera', category: 'raw' },
  'cr3': { name: 'Canon RAW v3', tool: 'Canon Camera', category: 'raw' },
  'nef': { name: 'Nikon RAW', tool: 'Nikon Camera', category: 'raw' },
  'arw': { name: 'Sony RAW', tool: 'Sony Camera', category: 'raw' },
  'dng': { name: 'Adobe DNG', tool: 'Various', category: 'raw' },
  'raf': { name: 'Fujifilm RAW', tool: 'Fujifilm Camera', category: 'raw' },
  'orf': { name: 'Olympus RAW', tool: 'Olympus Camera', category: 'raw' },
  'rw2': { name: 'Panasonic RAW', tool: 'Panasonic Camera', category: 'raw' },
  'srw': { name: 'Samsung RAW', tool: 'Samsung Camera', category: 'raw' },
  'x3f': { name: 'Sigma RAW', tool: 'Sigma Camera', category: 'raw' },
  'raw': { name: 'Generic RAW', tool: 'Digital Camera', category: 'raw' },
  
  // Additional formats
  'tiff': { name: 'TIFF', tool: 'Various', category: 'professional' },
  'tif': { name: 'TIFF', tool: 'Various', category: 'professional' },
  'exr': { name: 'OpenEXR', tool: 'Various', category: 'hdr' },
  'hdr': { name: 'HDR', tool: 'Various', category: 'hdr' }
};

// Standard processing sizes
const SIZES = {
  sm: 640,
  md: 1280,
  lg: 1920,
};

class ImageService {
  /**
   * Get format information from file extension
   */
  getFormatInfo(filename) {
    const extension = path.extname(filename).toLowerCase().slice(1);
    const formatInfo = PROFESSIONAL_FORMATS[extension];
    
    if (formatInfo) {
      return {
        extension: extension.toUpperCase(),
        originalFormat: formatInfo.name,
        creationTool: formatInfo.tool,
        category: formatInfo.category,
        isProfessional: true
      };
    }
    
    // Standard formats
    const standardFormats = {
      'jpg': { name: 'JPEG', tool: 'Various' },
      'jpeg': { name: 'JPEG', tool: 'Various' },
      'png': { name: 'PNG', tool: 'Various' },
      'gif': { name: 'GIF', tool: 'Various' },
      'bmp': { name: 'BMP', tool: 'Various' },
      'webp': { name: 'WebP', tool: 'Various' }
    };
    
    const standardFormat = standardFormats[extension];
    if (standardFormat) {
      return {
        extension: extension.toUpperCase(),
        originalFormat: standardFormat.name,
        creationTool: standardFormat.tool,
        category: 'standard',
        isProfessional: false
      };
    }
    
    // Unknown format
    return {
      extension: extension.toUpperCase(),
      originalFormat: extension.toUpperCase(),
      creationTool: 'Unknown',
      category: 'unknown',
      isProfessional: false
    };
  }

  /**
   * Try to extract or generate thumbnails for professional formats using ImageMagick
   */
  async tryGenerateProfessionalThumbnail(filePath, formatInfo, outputPath, width = 640) {
    const { spawn } = await import('node:child_process');
    
    return new Promise((resolve) => {
      // Try ImageMagick first for broader format support
      const magick = spawn('magick', [
        filePath + '[0]', // [0] gets first page/layer for PSD, PDF, etc.
        '-thumbnail', `${width}x${width}>`,
        '-quality', '82',
        outputPath
      ]);
      
      magick.on('close', (code) => {
        if (code === 0) {
          logInfo('Generated thumbnail using ImageMagick', { format: formatInfo.originalFormat, width });
          resolve(true);
        } else {
          // Try convert command as fallback
          const convert = spawn('convert', [
            filePath + '[0]',
            '-thumbnail', `${width}x${width}>`,
            '-quality', '82',
            outputPath
          ]);
          
          convert.on('close', (convertCode) => {
            if (convertCode === 0) {
              logInfo('Generated thumbnail using convert', { format: formatInfo.originalFormat, width });
              resolve(true);
            } else {
              logError(new Error(`Could not generate thumbnail for ${formatInfo.originalFormat}`), { 
                context: 'ImageService.tryGenerateProfessionalThumbnail',
                format: formatInfo.originalFormat 
              });
              resolve(false);
            }
          });
          
          convert.on('error', () => resolve(false));
        }
      });
      
      magick.on('error', () => {
        // If ImageMagick isn't available, resolve as false
        resolve(false);
      });
    });
  }

  /**
   * Convert professional formats to processable formats
   */
  async convertProfessionalFormat(filePath, formatInfo) {
    const { default: sharp } = await import('sharp');
    
    try {
      // For most RAW and professional formats, Sharp can handle them directly
      // If Sharp fails, we return the original path and let it fail gracefully
      switch (formatInfo.category) {
        case 'mobile': // HEIC/HEIF
          // Sharp can handle HEIC natively (with libvips-heif)
          return filePath;
          
        case 'design': // PSD, AI, etc.
          // For PSD files, Sharp can extract the composite layer
          if (formatInfo.extension.toLowerCase() === 'psd') {
            return filePath; // Sharp can handle PSD composite
          }
          // For AI files, we'll let Sharp try to process them
          return filePath;
          
        case 'raw': // Camera RAW formats
          // Sharp can handle most RAW formats with libraw
          return filePath;
          
        case 'professional': // TIFF, etc.
          return filePath;
          
        default:
          return filePath;
      }
    } catch (error) {
      logError(error, { 
        context: 'ImageService.convertProfessionalFormat',
        format: formatInfo.originalFormat 
      });
      return filePath; // Return original and let downstream handle it
    }
  }

  /**
   * Process and store image with variants
   */
  async processAndStoreImage(buffer, filename, userId, appId, metadata = {}) {
    const { default: sharp } = await import('sharp');
    const exifrModule = await import('exifr');
    const parseExif = exifrModule.default?.parse || exifrModule.parse;
    
    try {
      // Get format information
      const formatInfo = this.getFormatInfo(filename);
      const uniqueId = nanoid(8);
      const timestamp = Date.now();
      
      // Generate storage keys
      const originalKey = storageService.generateMediaKey(userId, appId, filename, 'original');
      
      // Store original file
      const originalResult = await storageService.uploadFile(
        buffer,
        originalKey,
        storageService.getContentType(filename),
        {
          userId,
          appId,
          originalName: filename,
          formatInfo: JSON.stringify(formatInfo),
          ...metadata
        }
      );

      let processedMetadata = {
        width: null,
        height: null,
        orientation: 'landscape',
        dominant: null,
        placeholderBase64: null,
        takenAt: null,
        exifData: null
      };

      let variantResults = [];

      try {
        // Try to process with Sharp
        const image = sharp(buffer);
        const meta = await image.metadata();
        
        // Extract comprehensive EXIF data
        const exif = await (parseExif ? parseExif(buffer, {
          pick: ['Make', 'Model', 'Software', 'DateTime', 'DateTimeOriginal', 'DateTimeDigitized',
                 'ExposureTime', 'FNumber', 'ISO', 'ExposureProgram', 'ExposureBiasValue',
                 'MeteringMode', 'Flash', 'FocalLength', 'FocalLengthIn35mmFormat',
                 'WhiteBalance', 'ColorSpace', 'ExposureMode', 'SceneType', 'LensModel',
                 'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSDateTime', 
                 'ImageWidth', 'ImageHeight', 'Orientation', 'XResolution', 'YResolution',
                 'ResolutionUnit', 'Artist', 'Copyright', 'UserComment']
        }) : Promise.resolve({})).catch(() => ({}));

        processedMetadata.width = meta.width;
        processedMetadata.height = meta.height;
        processedMetadata.orientation = (meta.orientation && meta.orientation >= 5 && meta.orientation <= 8)
          ? (meta.width >= meta.height ? 'portrait' : 'landscape')
          : (meta.width >= meta.height ? 'landscape' : 'portrait');
        
        processedMetadata.takenAt = exif?.DateTimeOriginal || exif?.DateTime ? 
          new Date(exif.DateTimeOriginal || exif.DateTime) : null;
        
        processedMetadata.exifData = exif && Object.keys(exif).length > 0 ? exif : null;

        // Get dominant color
        try {
          const stats = await sharp(buffer).stats();
          const c = stats.dominant;
          processedMetadata.dominant = `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
        } catch (colorError) {
          logError(colorError, { context: 'ImageService.processAndStoreImage.dominantColor' });
        }

        // Generate placeholder
        try {
          const placeholder = await sharp(buffer).resize(20).blur(2).toBuffer();
          processedMetadata.placeholderBase64 = `data:${meta.format === 'png' ? 'image/png' : 'image/jpeg'};base64,${placeholder.toString('base64')}`;
        } catch (placeholderError) {
          logError(placeholderError, { context: 'ImageService.processAndStoreImage.placeholder' });
        }

        // Generate variants
        const variantPromises = Object.entries(SIZES).map(async ([key, width]) => {
          try {
            const variantBuffer = await sharp(buffer)
              .rotate()
              .resize({ width, withoutEnlargement: true })
              .jpeg({ quality: 82 })
              .toBuffer();
            
            const variantKey = storageService.generateMediaKey(userId, appId, filename, key);
            const variantResult = await storageService.uploadFile(
              variantBuffer,
              variantKey,
              'image/jpeg',
              {
                userId,
                appId,
                originalName: filename,
                variant: key,
                width,
                ...metadata
              }
            );
            
            return {
              size: key,
              width,
              ...variantResult
            };
          } catch (variantError) {
            logError(variantError, { 
              context: 'ImageService.processAndStoreImage.variant',
              variant: key,
              width 
            });
            return null;
          }
        });

        variantResults = (await Promise.all(variantPromises)).filter(Boolean);

      } catch (sharpError) {
        logError(sharpError, { 
          context: 'ImageService.processAndStoreImage.sharp',
          format: formatInfo.originalFormat 
        });
        
        // For unsupported formats, try ImageMagick thumbnails
        if (formatInfo.isProfessional) {
          logInfo('Attempting ImageMagick processing for professional format', { 
            format: formatInfo.originalFormat 
          });
          
          // Create temp file for ImageMagick processing
          const tempPath = `/tmp/${uniqueId}-${filename}`;
          fs.writeFileSync(tempPath, buffer);
          
          try {
            const magickPromises = Object.entries(SIZES).map(async ([key, width]) => {
              const tempOutput = `/tmp/${uniqueId}-${key}.jpg`;
              
              const success = await this.tryGenerateProfessionalThumbnail(
                tempPath, 
                formatInfo, 
                tempOutput, 
                width
              );
              
              if (success && fs.existsSync(tempOutput)) {
                try {
                  const variantBuffer = fs.readFileSync(tempOutput);
                  const variantKey = storageService.generateMediaKey(userId, appId, filename, key);
                  
                  const variantResult = await storageService.uploadFile(
                    variantBuffer,
                    variantKey,
                    'image/jpeg',
                    {
                      userId,
                      appId,
                      originalName: filename,
                      variant: key,
                      width,
                      generatedBy: 'imagemagick',
                      ...metadata
                    }
                  );
                  
                  // Clean up temp file
                  fs.unlinkSync(tempOutput);
                  
                  return {
                    size: key,
                    width,
                    ...variantResult
                  };
                } catch (uploadError) {
                  logError(uploadError, { 
                    context: 'ImageService.processAndStoreImage.magickUpload',
                    variant: key 
                  });
                  return null;
                }
              }
              return null;
            });
            
            variantResults = (await Promise.all(magickPromises)).filter(Boolean);
            
            // Try to get basic metadata from first variant
            if (variantResults.length > 0) {
              try {
                const firstVariantBuffer = await storageService.getFileBuffer(variantResults[0].key);
                const variantImage = sharp(firstVariantBuffer);
                const variantMeta = await variantImage.metadata();
                
                processedMetadata.width = variantMeta.width;
                processedMetadata.height = variantMeta.height;
                
                // Generate placeholder from thumbnail
                const placeholder = await sharp(firstVariantBuffer).resize(20).blur(2).toBuffer();
                processedMetadata.placeholderBase64 = `data:image/jpeg;base64,${placeholder.toString('base64')}`;
              } catch (metaError) {
                logError(metaError, { context: 'ImageService.processAndStoreImage.variantMeta' });
              }
            }
          } finally {
            // Clean up temp original file
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }
        }
      }

      // Use default placeholder for unsupported formats
      if (!processedMetadata.placeholderBase64) {
        processedMetadata.placeholderBase64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSIjZjNmNGY2Ii8+CjxwYXRoIGQ9Ik0xMCA2VjE0TTYgMTBIMTQiIHN0cm9rZT0iIzlDQTNBRiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9zdmc+';
      }

      logInfo('Image processed successfully', {
        filename,
        format: formatInfo.originalFormat,
        variants: variantResults.length,
        width: processedMetadata.width,
        height: processedMetadata.height
      });

      return {
        original: originalResult,
        variants: variantResults,
        metadata: {
          ...processedMetadata,
          formatInfo,
          bytes: buffer.length,
          mime: storageService.getContentType(filename)
        }
      };

    } catch (error) {
      logError(error, { 
        context: 'ImageService.processAndStoreImage',
        filename,
        userId,
        appId 
      });
      throw error;
    }
  }

  /**
   * Transform image on-demand
   */
  async transformImage(sourceKey, options = {}) {
    const { default: sharp } = await import('sharp');
    const { width, height, quality = 85, format = 'jpeg', fit = 'inside' } = options;
    
    try {
      // Get source file
      const sourceBuffer = await storageService.getFileBuffer(sourceKey);
      
      let transformer = sharp(sourceBuffer);
      
      // Apply transformations
      if (width || height) {
        transformer = transformer.resize({
          width: width ? parseInt(width) : undefined,
          height: height ? parseInt(height) : undefined,
          fit,
          withoutEnlargement: true
        });
      }
      
      // Apply format and quality
      switch (format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          transformer = transformer.jpeg({ quality: parseInt(quality) });
          break;
        case 'png':
          transformer = transformer.png({ quality: parseInt(quality) });
          break;
        case 'webp':
          transformer = transformer.webp({ quality: parseInt(quality) });
          break;
        case 'avif':
          transformer = transformer.avif({ quality: parseInt(quality) });
          break;
        default:
          transformer = transformer.jpeg({ quality: parseInt(quality) });
      }
      
      const transformedBuffer = await transformer.toBuffer();
      
      logInfo('Image transformed successfully', {
        sourceKey,
        width,
        height,
        quality,
        format,
        originalSize: sourceBuffer.length,
        transformedSize: transformedBuffer.length
      });
      
      return {
        buffer: transformedBuffer,
        contentType: storageService.getContentType(`.${format}`),
        size: transformedBuffer.length
      };
      
    } catch (error) {
      logError(error, { 
        context: 'ImageService.transformImage',
        sourceKey,
        options 
      });
      throw error;
    }
  }

  /**
   * Delete image and all variants
   */
  async deleteImage(originalKey, variantKeys = []) {
    try {
      const deletePromises = [
        storageService.deleteFile(originalKey),
        ...variantKeys.map(key => storageService.deleteFile(key))
      ];
      
      const results = await Promise.allSettled(deletePromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      logInfo('Image deletion completed', {
        originalKey,
        totalFiles: deletePromises.length,
        successful,
        failed
      });
      
      return {
        success: failed === 0,
        deleted: successful,
        failed
      };
      
    } catch (error) {
      logError(error, { 
        context: 'ImageService.deleteImage',
        originalKey,
        variantCount: variantKeys.length 
      });
      throw error;
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats() {
    return {
      professional: PROFESSIONAL_FORMATS,
      standard: {
        'jpg': { name: 'JPEG', tool: 'Various' },
        'jpeg': { name: 'JPEG', tool: 'Various' },
        'png': { name: 'PNG', tool: 'Various' },
        'gif': { name: 'GIF', tool: 'Various' },
        'bmp': { name: 'BMP', tool: 'Various' },
        'webp': { name: 'WebP', tool: 'Various' }
      },
      sizes: SIZES
    };
  }

  /**
   * Validate file format
   */
  isValidImageFormat(filename) {
    const formatInfo = this.getFormatInfo(filename);
    return formatInfo.category !== 'unknown';
  }
}

export default new ImageService();