import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import config from '../config/index.js';
import { logInfo, logError } from '../middleware/logger.js';

class StorageService {
  constructor() {
    this.s3Client = null;
    this.bucketName = config.storage.s3.bucket;
    this.cdnUrl = config.cdnUrl;
    this.storageType = config.storage.type;
    
    if (this.storageType === 's3') {
      this.initializeS3Client();
    }
  }

  initializeS3Client() {
    try {
      this.s3Client = new S3Client({
        ...(config.storage.s3.endpoint ? { endpoint: config.storage.s3.endpoint } : {}),
        region: config.storage.s3.region,
        credentials: {
          accessKeyId: config.storage.s3.accessKeyId,
          secretAccessKey: config.storage.s3.secretAccessKey,
        },
        forcePathStyle: config.storage.s3.forcePathStyle,
      });

      // Derive CDN URL if not explicitly set
      if (!this.cdnUrl) {
        this.cdnUrl = config.storage.s3.endpoint
          ? `${config.storage.s3.endpoint}/${this.bucketName}`
          : `https://${this.bucketName}.s3.${config.storage.s3.region}.amazonaws.com`;
      }

      logInfo('S3 client initialized', { 
        endpoint: config.storage.s3.endpoint, 
        bucket: this.bucketName,
        region: config.storage.s3.region
      });
    } catch (error) {
      logError(error, { context: 'StorageService.initializeS3Client' });
      throw error;
    }
  }

  /**
   * Upload a file buffer to storage
   */
  async uploadFile(buffer, key, contentType, metadata = {}) {
    if (this.storageType === 'local') {
      return this.uploadFileLocal(buffer, key, contentType, metadata);
    } else {
      return this.uploadFileS3(buffer, key, contentType, metadata);
    }
  }

  /**
   * Upload file to S3
   */
  async uploadFileS3(buffer, key, contentType, metadata = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
        Metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          service: 'dailey-media-api'
        }
      });

      const result = await this.s3Client.send(command);

      logInfo('File uploaded to S3', { key, contentType, size: buffer.length });

      return {
        success: true,
        key,
        url: this.getPublicUrl(key),
        etag: result.ETag,
        storageType: 's3'
      };
    } catch (error) {
      logError(error, { context: 'StorageService.uploadFileS3', key, contentType });
      throw error;
    }
  }

  /**
   * Upload file to local storage
   */
  async uploadFileLocal(buffer, key, contentType, metadata = {}) {
    try {
      // Create local storage directory structure
      const storageDir = path.join(process.cwd(), 'storage');
      const filePath = path.join(storageDir, key);
      const fileDir = path.dirname(filePath);

      // Ensure directory exists
      fs.mkdirSync(fileDir, { recursive: true });

      // Write file
      fs.writeFileSync(filePath, buffer);

      // Store metadata alongside file
      const metadataPath = filePath + '.meta.json';
      fs.writeFileSync(metadataPath, JSON.stringify({
        contentType,
        size: buffer.length,
        uploadedAt: new Date().toISOString(),
        ...metadata
      }, null, 2));

      logInfo('File uploaded to local storage', { key, contentType, size: buffer.length });

      return {
        success: true,
        key,
        url: `/storage/${key}`,
        storageType: 'local'
      };
    } catch (error) {
      logError(error, { context: 'StorageService.uploadFileLocal', key, contentType });
      throw error;
    }
  }

  /**
   * Get a file buffer from storage
   */
  async getFileBuffer(key) {
    if (this.storageType === 'local') {
      return this.getFileBufferLocal(key);
    } else {
      return this.getFileBufferS3(key);
    }
  }

  /**
   * Get file buffer from S3
   */
  async getFileBufferS3(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const buffer = await this.streamToBuffer(response.Body);

      return buffer;
    } catch (error) {
      logError(error, { context: 'StorageService.getFileBufferS3', key });
      throw error;
    }
  }

  /**
   * Get file buffer from local storage
   */
  async getFileBufferLocal(key) {
    try {
      const filePath = path.join(process.cwd(), 'storage', key);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${key}`);
      }

      return fs.readFileSync(filePath);
    } catch (error) {
      logError(error, { context: 'StorageService.getFileBufferLocal', key });
      throw error;
    }
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(key) {
    if (this.storageType === 'local') {
      return this.deleteFileLocal(key);
    } else {
      return this.deleteFileS3(key);
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFileS3(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);

      logInfo('File deleted from S3', { key });

      return { success: true, key };
    } catch (error) {
      logError(error, { context: 'StorageService.deleteFileS3', key });
      throw error;
    }
  }

  /**
   * Delete file from local storage
   */
  async deleteFileLocal(key) {
    try {
      const filePath = path.join(process.cwd(), 'storage', key);
      const metadataPath = filePath + '.meta.json';

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }

      logInfo('File deleted from local storage', { key });

      return { success: true, key };
    } catch (error) {
      logError(error, { context: 'StorageService.deleteFileLocal', key });
      throw error;
    }
  }

  /**
   * Check if a file exists in storage
   */
  async fileExists(key) {
    if (this.storageType === 'local') {
      return this.fileExistsLocal(key);
    } else {
      return this.fileExistsS3(key);
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExistsS3(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if file exists locally
   */
  async fileExistsLocal(key) {
    const filePath = path.join(process.cwd(), 'storage', key);
    return fs.existsSync(filePath);
  }

  /**
   * Get a signed URL for temporary access (S3 only)
   */
  async getSignedUrl(key, expiresIn = 3600) {
    if (this.storageType === 'local') {
      // For local storage, return the direct URL
      return `/storage/${key}`;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      logError(error, { context: 'StorageService.getSignedUrl', key });
      throw error;
    }
  }

  /**
   * Generate a unique storage key for media files
   */
  generateMediaKey(userId, appId, originalFilename, variant = 'original') {
    const ext = path.extname(originalFilename).toLowerCase();
    const baseName = path.basename(originalFilename, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const uniqueId = nanoid(8);

    if (variant === 'original') {
      return `media/${appId}/${userId}/originals/${timestamp}-${uniqueId}-${baseName}${ext}`;
    } else {
      // Variants are typically JPEG
      return `media/${appId}/${userId}/variants/${variant}/${timestamp}-${uniqueId}-${baseName}.jpg`;
    }
  }

  /**
   * Get public URL for a storage key
   */
  getPublicUrl(key) {
    if (this.storageType === 'local') {
      return `/storage/${key}`;
    }
    return `${this.cdnUrl}/${key}`;
  }

  /**
   * Get content type from filename
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.jpe': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.avif': 'image/avif',
      '.bmp': 'image/bmp',
      '.tif': 'image/tiff',
      '.tiff': 'image/tiff',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      // RAW formats
      '.cr2': 'image/x-canon-cr2',
      '.cr3': 'image/x-canon-cr3',
      '.nef': 'image/x-nikon-nef',
      '.arw': 'image/x-sony-arw',
      '.dng': 'image/x-adobe-dng',
      '.raf': 'image/x-fuji-raf',
      '.orf': 'image/x-olympus-orf',
      '.rw2': 'image/x-panasonic-rw2',
      '.srw': 'image/x-samsung-srw',
      '.x3f': 'image/x-sigma-x3f',
      '.raw': 'image/x-raw'
    };
    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Helper: Convert stream to buffer
   */
  async streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Get storage health status
   */
  async getHealthStatus() {
    try {
      if (this.storageType === 'local') {
        // Check if storage directory is writable
        const storageDir = path.join(process.cwd(), 'storage');
        fs.mkdirSync(storageDir, { recursive: true });
        
        // Try to write a test file
        const testFile = path.join(storageDir, '.health-check');
        fs.writeFileSync(testFile, 'health-check');
        fs.unlinkSync(testFile);
        
        return { status: 'healthy', type: 'local' };
      } else {
        // Test S3 connection
        const command = new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: 'health-check-' + Date.now()
        });
        
        try {
          await this.s3Client.send(command);
        } catch (error) {
          // 404 is expected for non-existent file, means S3 is accessible
          if (error.$metadata?.httpStatusCode === 404) {
            return { status: 'healthy', type: 's3', bucket: this.bucketName };
          }
          throw error;
        }
        
        return { status: 'healthy', type: 's3', bucket: this.bucketName };
      }
    } catch (error) {
      logError(error, { context: 'StorageService.getHealthStatus' });
      return { status: 'unhealthy', type: this.storageType, error: error.message };
    }
  }
}

export default new StorageService();