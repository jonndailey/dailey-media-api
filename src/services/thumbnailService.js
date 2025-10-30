import sharp from 'sharp';
import path from 'path';
import { nanoid } from 'nanoid';
import storageService from './storageService.js';
import databaseService from './databaseService.js';
import { logInfo, logError } from '../middleware/logger.js';

// Predefined thumbnail sizes
const THUMBNAIL_SIZES = {
  thumbnail: { width: 150, height: 150, fit: 'cover' },
  small: { width: 320, height: 320, fit: 'inside' },
  medium: { width: 640, height: 640, fit: 'inside' },
  large: { width: 1280, height: 1280, fit: 'inside' },
  xlarge: { width: 1920, height: 1920, fit: 'inside' }
};

class ThumbnailService {
  constructor() {
    this.processingQueue = new Map();
  }

  async generateThumbnails(mediaFileId, originalImageBuffer, options = {}) {
    try {
      const {
        sizes = ['thumbnail', 'small', 'medium'],
        formats = ['webp', 'jpeg'],
        quality = 85
      } = options;

      const results = [];
      const media = await databaseService.getMediaFile(mediaFileId);
      
      if (!media) {
        throw new Error('Media file not found');
      }

      logInfo('Generating thumbnails', { 
        mediaFileId, 
        sizes, 
        formats,
        originalSize: originalImageBuffer.length 
      });

      // Get image metadata
      const imageInfo = await sharp(originalImageBuffer).metadata();
      
      for (const sizeName of sizes) {
        const sizeConfig = THUMBNAIL_SIZES[sizeName];
        if (!sizeConfig) continue;

        for (const format of formats) {
          try {
            const variant = await this.generateSingleThumbnail(
              originalImageBuffer,
              media,
              sizeName,
              format,
              sizeConfig,
              quality,
              imageInfo
            );
            
            if (variant) {
              results.push(variant);
            }
          } catch (error) {
            logError(error, { 
              context: 'thumbnail.generateSingle',
              mediaFileId,
              size: sizeName,
              format 
            });
            // Continue with other thumbnails even if one fails
          }
        }
      }

      logInfo('Thumbnail generation completed', { 
        mediaFileId, 
        generated: results.length 
      });

      return results;

    } catch (error) {
      logError(error, { context: 'thumbnail.generate', mediaFileId });
      throw error;
    }
  }

  async generateSingleThumbnail(imageBuffer, media, sizeName, format, sizeConfig, quality, originalMeta) {
    try {
      // Create transformer pipeline
      let transformer = sharp(imageBuffer).rotate(); // honor EXIF orientation consistently

      // Apply size transformation
      if (sizeConfig.fit === 'cover') {
        transformer = transformer.resize(sizeConfig.width, sizeConfig.height, {
          fit: 'cover',
          position: 'centre'
        });
      } else {
        transformer = transformer.resize(sizeConfig.width, sizeConfig.height, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Apply format and quality settings
      switch (format) {
        case 'webp':
          transformer = transformer.webp({ quality });
          break;
        case 'png':
          transformer = transformer.png({ compressionLevel: 6 });
          break;
        case 'jpeg':
        default:
          transformer = transformer.jpeg({ quality, progressive: true });
          break;
      }

      // Generate the thumbnail
      const { data, info } = await transformer.toBuffer({ resolveWithObject: true });

      // Generate storage key
      const timestamp = Date.now();
      const fileExtension = format === 'jpeg' ? 'jpg' : format;
      const storageKey = `thumbnails/${media.user_id}/${media.id}/${sizeName}_${sizeConfig.width}x${sizeConfig.height}.${fileExtension}`;

      // Store the thumbnail
      const accessLevel = media.is_public ? 'public' : 'private';
      await storageService.uploadFile(
        data,
        storageKey,
        `image/${format}`,
        {
          mediaId: media.id,
          variantType: sizeName,
          access: accessLevel
        },
        { access: accessLevel }
      );

      // Save variant to database
      const variantId = await databaseService.createMediaVariant({
        media_file_id: media.id,
        storage_key: storageKey,
        variant_type: sizeName,
        format: format,
        width: info.width,
        height: info.height,
        file_size: info.size,
        quality: format !== 'png' ? quality : null,
        processing_settings: {
          original_width: originalMeta.width,
          original_height: originalMeta.height,
          fit: sizeConfig.fit,
          target_width: sizeConfig.width,
          target_height: sizeConfig.height,
          generated_at: new Date().toISOString()
        }
      });

      const accessDetails = await storageService.getAccessDetails(storageKey, { access: accessLevel });

      return {
        id: variantId,
        storage_key: storageKey,
        variant_type: sizeName,
        format: format,
        width: info.width,
        height: info.height,
        file_size: info.size,
        url: accessDetails.publicUrl,
        signedUrl: accessDetails.signedUrl,
        access: accessDetails.access
      };

    } catch (error) {
      logError(error, { 
        context: 'thumbnail.generateSingle',
        mediaId: media.id,
        size: sizeName,
        format 
      });
      throw error;
    }
  }

  async getThumbnail(mediaFileId, size = 'small', format = 'webp') {
    try {
      const variants = await databaseService.getMediaVariants(mediaFileId);
      
      // Find the requested thumbnail
      const thumbnail = variants.find(v => 
        v.variant_type === size && v.format === format
      );

      if (thumbnail) {
        const accessDetails = await storageService.getAccessDetails(thumbnail.storage_key);
        return {
          ...thumbnail,
          url: accessDetails.publicUrl,
          signedUrl: accessDetails.signedUrl,
          access: accessDetails.access
        };
      }

      // If thumbnail doesn't exist, check if we can generate it
      const media = await databaseService.getMediaFile(mediaFileId);
      if (!media) {
        return null;
      }

      // Try to generate thumbnail on-demand
      try {
        const originalBuffer = await storageService.getFileBuffer(media.storage_key);
        const sizeConfig = THUMBNAIL_SIZES[size];
        
        if (!sizeConfig) {
          throw new Error(`Invalid thumbnail size: ${size}`);
        }

        const generated = await this.generateSingleThumbnail(
          originalBuffer,
          media,
          size,
          format,
          sizeConfig,
          85,
          { width: media.width, height: media.height }
        );

        return generated;

      } catch (generateError) {
        logError(generateError, { 
          context: 'thumbnail.generateOnDemand',
          mediaFileId,
          size,
          format 
        });
        return null;
      }

    } catch (error) {
      logError(error, { context: 'thumbnail.get', mediaFileId, size, format });
      return null;
    }
  }

  async generateCustomThumbnail(mediaFileId, options = {}) {
    try {
      const {
        width,
        height,
        fit = 'inside',
        format = 'webp',
        quality = 85
      } = options;

      if (!width || !height) {
        throw new Error('Width and height are required for custom thumbnails');
      }

      const media = await databaseService.getMediaFile(mediaFileId);
      if (!media) {
        throw new Error('Media file not found');
      }

      const originalBuffer = await storageService.getFileBuffer(media.storage_key);
      
      // Check if this exact variant already exists
      const variants = await databaseService.getMediaVariants(mediaFileId);
      const existing = variants.find(v => 
        v.variant_type === 'custom' && 
        v.width === width && 
        v.height === height && 
        v.format === format
      );

      if (existing) {
        const accessDetails = await storageService.getAccessDetails(existing.storage_key);
        return {
          ...existing,
          url: accessDetails.publicUrl,
          signedUrl: accessDetails.signedUrl,
          access: accessDetails.access
        };
      }

      // Generate custom thumbnail
      const customConfig = { width, height, fit };
      const originalMeta = { width: media.width, height: media.height };

      const generated = await this.generateSingleThumbnail(
        originalBuffer,
        media,
        'custom',
        format,
        customConfig,
        quality,
        originalMeta
      );

      return generated;

    } catch (error) {
      logError(error, { context: 'thumbnail.generateCustom', mediaFileId, options });
      throw error;
    }
  }

  async batchGenerateThumbnails(mediaFileIds, options = {}) {
    try {
      const results = [];
      const errors = [];

      logInfo('Starting batch thumbnail generation', { 
        count: mediaFileIds.length,
        options 
      });

      // Process in batches to avoid overwhelming the system
      const batchSize = 5;
      for (let i = 0; i < mediaFileIds.length; i += batchSize) {
        const batch = mediaFileIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (mediaFileId) => {
          try {
            const media = await databaseService.getMediaFile(mediaFileId);
            if (!media) {
              throw new Error('Media file not found');
            }

            const originalBuffer = await storageService.getFileBuffer(media.storage_key);
            const thumbnails = await this.generateThumbnails(mediaFileId, originalBuffer, options);
            
            return { mediaFileId, thumbnails, success: true };
          } catch (error) {
            logError(error, { context: 'thumbnail.batchGenerate.item', mediaFileId });
            errors.push({ mediaFileId, error: error.message });
            return { mediaFileId, success: false, error: error.message };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches
        if (i + batchSize < mediaFileIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      logInfo('Batch thumbnail generation completed', {
        total: mediaFileIds.length,
        successful: successful.length,
        failed: failed.length
      });

      return {
        total: mediaFileIds.length,
        successful: successful.length,
        failed: failed.length,
        results,
        errors
      };

    } catch (error) {
      logError(error, { context: 'thumbnail.batchGenerate', count: mediaFileIds.length });
      throw error;
    }
  }

  getSupportedSizes() {
    return Object.keys(THUMBNAIL_SIZES).map(key => ({
      name: key,
      ...THUMBNAIL_SIZES[key]
    }));
  }

  getSupportedFormats() {
    return ['webp', 'jpeg', 'png'];
  }

  async cleanupOrphanedThumbnails(mediaFileId) {
    try {
      const variants = await databaseService.getMediaVariants(mediaFileId);
      
      for (const variant of variants) {
        try {
          const exists = await storageService.fileExists(variant.storage_key);
          if (!exists) {
            // Mark variant as unavailable if file doesn't exist
            await databaseService.query(
              'UPDATE media_variants SET is_available = FALSE WHERE id = ?',
              [variant.id]
            );
          }
        } catch (error) {
          logError(error, { 
            context: 'thumbnail.cleanup',
            variantId: variant.id,
            storageKey: variant.storage_key 
          });
        }
      }
    } catch (error) {
      logError(error, { context: 'thumbnail.cleanupOrphaned', mediaFileId });
    }
  }
}

export default new ThumbnailService();
