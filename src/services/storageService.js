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
  async uploadFile(buffer, key, contentType, metadata = {}, options = {}) {
    if (this.storageType === 'local') {
      return this.uploadFileLocal(buffer, key, contentType, metadata, options);
    } else {
      return this.uploadFileS3(buffer, key, contentType, metadata, options);
    }
  }

  /**
   * Upload file to S3
   */
  async uploadFileS3(buffer, key, contentType, metadata = {}, options = {}) {
    try {
      const access = options.access || metadata.access || 'private';
      metadata.access = access;

      const metadataPayload = this.buildMetadataPayload(contentType, buffer.length, metadata);
      const s3Metadata = this.convertToS3Metadata(metadataPayload);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: access === 'public' ? 'public, max-age=31536000' : 'private, max-age=0, no-transform, s-maxage=0',
        Metadata: s3Metadata
      });

      const result = await this.s3Client.send(command);

      await this.uploadMetadataSidecarS3(key, metadataPayload);

      logInfo('File uploaded to S3', { key, contentType, size: buffer.length });

      const accessDetails = await this.getAccessDetails(key, { access });

      return {
        success: true,
        key,
        url: accessDetails.publicUrl,
        signedUrl: accessDetails.signedUrl,
        access: accessDetails.access,
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
  async uploadFileLocal(buffer, key, contentType, metadata = {}, options = {}) {
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
      const access = options.access || metadata.access || 'private';
      metadata.access = access;

      const metadataPayload = this.buildMetadataPayload(contentType, buffer.length, metadata);
      fs.writeFileSync(metadataPath, JSON.stringify(metadataPayload, null, 2));

      logInfo('File uploaded to local storage', { key, contentType, size: buffer.length });

      const accessDetails = await this.getAccessDetails(key, { access });

      return {
        success: true,
        key,
        url: accessDetails.publicUrl || `/storage/${key}`,
        signedUrl: accessDetails.signedUrl,
        access: accessDetails.access,
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
      return this.buildLocalServeUrl(key);
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
   * Retrieve public/signed access details for a storage key.
   */
  async getAccessDetails(key, options = {}) {
    const access = await this.resolveAccessLevel(key, options.access);
    let publicUrl = null;
    let signedUrl = null;

    if (this.storageType === 'local') {
      if (access === 'public') {
        publicUrl = `/storage/${key}`;
      } else {
        signedUrl = this.buildLocalServeUrl(key);
      }
    } else {
      if (access === 'public') {
        publicUrl = this.getPublicUrl(key);
      } else {
        try {
          signedUrl = await this.getSignedUrl(key, options.expiresIn || 3600);
        } catch (error) {
          logError(error, { context: 'StorageService.getAccessDetails.signedUrl', key });
        }
      }
    }

    return {
      access,
      publicUrl,
      signedUrl
    };
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

  async resolveAccessLevel(key, providedAccess) {
    if (providedAccess) {
      return providedAccess;
    }

    try {
      const metadata = await this.getFileMetadata(key);
      if (metadata?.access) {
        return metadata.access;
      }
    } catch (error) {
      logError(error, { context: 'StorageService.resolveAccessLevel', key });
    }

    return 'private';
  }

  buildLocalServeUrl(key) {
    if (!key.startsWith('files/')) {
      return `/storage/${key}`;
    }

    const segments = key.split('/');
    if (segments.length < 4) {
      return `/storage/${key}`;
    }

    const userId = encodeURIComponent(segments[1]);
    const bucketId = encodeURIComponent(segments[2]);
    const filePath = segments.slice(3).map(part => encodeURIComponent(part)).join('/');

    return `/api/serve/files/${userId}/${bucketId}/${filePath}`;
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

  buildMetadataPayload(contentType, size, metadata = {}) {
    const payload = {
      contentType,
      size,
      uploadedAt: new Date().toISOString(),
      service: 'dailey-media-api'
    };

    for (const [key, value] of Object.entries(metadata || {})) {
      if (value !== undefined && value !== null) {
        payload[key] = value;
      }
    }

    return payload;
  }

  convertToS3Metadata(metadataPayload) {
    if (!metadataPayload) {
      return { service: 'dailey-media-api' };
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(metadataPayload)) {
      if (value === undefined || value === null) continue;
      const normalizedKey = key.toLowerCase();
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

      // S3 metadata values cannot exceed 2KB; truncate if necessary
      sanitized[normalizedKey] = stringValue.length > 2000
        ? stringValue.slice(0, 2000)
        : stringValue;
    }

    if (!sanitized.service) {
      sanitized.service = 'dailey-media-api';
    }

    return sanitized;
  }

  async uploadMetadataSidecarS3(key, metadataPayload) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: `${key}.meta.json`,
        Body: JSON.stringify(metadataPayload, null, 2),
        ContentType: 'application/json',
        CacheControl: 'no-store'
      });

      await this.s3Client.send(command);
    } catch (error) {
      logError(error, { context: 'StorageService.uploadMetadataSidecarS3', key });
      // Metadata is helpful but non-critical; proceed without throwing
    }
  }

  async getFileMetadata(key) {
    try {
      if (this.storageType === 'local') {
        const metadataPath = path.join(process.cwd(), 'storage', `${key}.meta.json`);
        if (!fs.existsSync(metadataPath)) {
          return null;
        }

        const metadataContent = fs.readFileSync(metadataPath, 'utf8');
        return JSON.parse(metadataContent);
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: `${key}.meta.json`
      });

      const response = await this.s3Client.send(command);
      const buffer = await this.streamToBuffer(response.Body);
      return JSON.parse(buffer.toString('utf8'));
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }

      logError(error, { context: 'StorageService.getFileMetadata', key });
      return null;
    }
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

  async listBucketFolder(userId, bucketId, folderPath = '') {
    if (this.storageType === 's3') {
      return this.listBucketFolderS3(userId, bucketId, folderPath);
    }
    return this.listBucketFolderLocal(userId, bucketId, folderPath);
  }

  async listBucketFolderLocal(userId, bucketId, folderPath = '') {
    const basePath = path.join(process.cwd(), 'storage', 'files', userId, bucketId);
    const targetPath = folderPath
      ? path.join(basePath, folderPath)
      : basePath;

    await fs.promises.access(targetPath);

    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const entryPath = path.join(targetPath, entry.name);
      const stats = await fs.promises.stat(entryPath);

      if (entry.isDirectory()) {
        let folderMeta = {};
        try {
          const metaContent = await fs.promises.readFile(path.join(entryPath, '.folder.meta.json'), 'utf8');
          folderMeta = JSON.parse(metaContent);
        } catch {
          folderMeta = {
            name: entry.name,
            created_at: stats.birthtime,
            is_folder: true
          };
        }

        const folderContents = await fs.promises.readdir(entryPath);
        const fileCount = folderContents.filter(f => !f.startsWith('.')).length;

        items.push({
          ...folderMeta,
          name: entry.name,
          is_folder: true,
          file_count: fileCount,
          created_at: stats.birthtime
        });

        continue;
      }

      if (entry.name.endsWith('.meta.json')) continue;

      const relativePath = folderPath
        ? `${folderPath}/${entry.name}`
        : entry.name;

      const storageKey = `files/${userId}/${bucketId}/${relativePath}`;
      const metadata = await this.getFileMetadata(storageKey) || {};
      const accessDetails = await this.getAccessDetails(storageKey, { access: metadata.access });

      const encodedPath = encodeURIComponent(relativePath);
      const publicUrl = accessDetails.publicUrl || `/api/serve/files/${userId}/${bucketId}/${encodedPath}`;
      const displayName = metadata.originalFilename || entry.name;

      items.push({
        id: entry.name,
        name: displayName,
        original_filename: displayName,
        file_size: stats.size,
        mime_type: metadata.mimeType || metadata.contentType || 'application/octet-stream',
        uploaded_at: stats.mtime,
        storage_key: storageKey,
        public_url: publicUrl,
        signed_url: accessDetails.signedUrl,
        access: accessDetails.access,
        bucket_id: bucketId,
        folder_path: folderPath,
        is_folder: false,
        metadata
      });
    }

    items.sort((a, b) => {
      if (a.is_folder && !b.is_folder) return -1;
      if (!a.is_folder && b.is_folder) return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  }

  async listBucketFolderS3(userId, bucketId, folderPath = '') {
    const normalizedPath = folderPath
      ? folderPath.replace(/^\//, '').replace(/\/$/, '')
      : '';

    const prefix = normalizedPath
      ? `files/${userId}/${bucketId}/${normalizedPath}/`
      : `files/${userId}/${bucketId}/`;

    const items = [];
    const seenFolders = new Set();
    let foundResults = false;
    let continuationToken;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        Delimiter: '/',
        ContinuationToken: continuationToken
      });

      const response = await this.s3Client.send(command);

      for (const prefixEntry of response.CommonPrefixes || []) {
        const fullPrefix = prefixEntry.Prefix;
        const folderName = fullPrefix.slice(prefix.length, -1);

        if (!folderName || seenFolders.has(folderName)) {
          continue;
        }

        seenFolders.add(folderName);
        foundResults = true;

        items.push({
          name: folderName,
          is_folder: true,
          file_count: null,
          created_at: null
        });
      }

      for (const object of response.Contents || []) {
        if (object.Key === prefix) {
          continue;
        }

        foundResults = true;

        const relativeKey = object.Key.slice(prefix.length);
        if (!relativeKey || relativeKey.includes('/')) {
          continue;
        }

        if (relativeKey.startsWith('.') || relativeKey.endsWith('.meta.json')) {
          continue;
        }

        const storageKey = object.Key;
        const metadata = await this.getFileMetadata(storageKey) || {};
        const filename = path.basename(relativeKey);
        const displayName = metadata.originalFilename || filename;

        const accessDetails = await this.getAccessDetails(storageKey, { access: metadata.access });

        items.push({
          id: filename,
          name: displayName,
          original_filename: displayName,
          file_size: object.Size,
          mime_type: metadata.mimeType || metadata.contentType || 'application/octet-stream',
          uploaded_at: metadata.uploadedAt || object.LastModified,
          storage_key: storageKey,
          public_url: accessDetails.publicUrl,
          signed_url: accessDetails.signedUrl,
          access: accessDetails.access,
          bucket_id: bucketId,
          folder_path: normalizedPath,
          is_folder: false,
          metadata
        });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    if (normalizedPath && !foundResults) {
      const error = new Error('Folder not found');
      error.code = 'ENOENT';
      throw error;
    }

    items.sort((a, b) => {
      if (a.is_folder && !b.is_folder) return -1;
      if (!a.is_folder && b.is_folder) return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
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

  /**
   * Delete a file from a specific bucket
   */
  async deleteFileFromBucket(userId, bucketId, fileId) {
    try {
      // Construct the storage key from the file ID (which should be the filename)
      const storageKey = `files/${userId}/${bucketId}/${fileId}`;
      
      logInfo('Deleting file from bucket', { 
        userId, 
        bucketId, 
        fileId, 
        storageKey 
      });

      // Use the existing deleteFile method
      return await this.deleteFile(storageKey);
    } catch (error) {
      logError(error, { 
        context: 'StorageService.deleteFileFromBucket',
        userId,
        bucketId,
        fileId
      });
      throw error;
    }
  }
}

export default new StorageService();
