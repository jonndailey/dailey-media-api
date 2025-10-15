import axios, { AxiosInstance, AxiosResponse } from 'axios';

export interface DaileyMediaApiConfig {
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface FileUploadOptions {
  file: File | Buffer;
  filename?: string;
  bucket?: string;
  folder?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface FileResponse {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_key: string;
  bucket_id: string;
  folder_path?: string;
  uploaded_at: string;
  metadata?: Record<string, any>;
  access: 'public' | 'private';
  accessUrl?: string;
}

export interface BucketResponse {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface VideoPreset {
  id?: string;
  format: string;
  videoCodec: string;
  audioCodec: string;
  resolution?: string | null;
  bitrate?: string | null;
  audioBitrate?: string | null;
  profile?: string | null;
  crf?: number | null;
}

export interface VideoOutputRequest {
  preset?: string;
  format?: string;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  bitrate?: string;
  audioBitrate?: string;
  crf?: number;
  fps?: number | string;
  profile?: string;
}

export interface VideoOutputResult {
  id: string;
  format: string;
  videoCodec: string;
  audioCodec: string;
  storageKey: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  bitrate?: number;
  url?: string | null;
  signedUrl?: string | null;
  access?: 'public' | 'private';
}

export interface VideoJobRecord {
  id: string;
  media_file_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  requested_outputs?: VideoOutputRequest[];
  generated_outputs?: VideoOutputResult[];
  metadata?: Record<string, any>;
  error_message?: string | null;
  webhook_url?: string | null;
  retry_count?: number;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface VideoJobSummary {
  id: string;
  mediaFileId: string;
  status: string;
  progress: number;
  outputs: VideoOutputRequest[];
  webhookUrl?: string | null;
}

export interface VideoJobRequest {
  outputs?: VideoOutputRequest[];
  webhookUrl?: string;
}

export interface VideoJobQueueResponse {
  success: boolean;
  job: VideoJobSummary;
}

export interface VideoPresetResponse {
  success: boolean;
  presets: VideoPreset[];
}

export interface VideoJobListResponse {
  success: boolean;
  results: VideoJobRecord[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface VideoJobDetailResponse {
  success: boolean;
  job: VideoJobRecord;
}

export class DaileyMediaApi {
  private client: AxiosInstance;
  private maxRetries: number;

  constructor(config: DaileyMediaApiConfig) {
    this.maxRetries = config.maxRetries || 3;
    
    this.client = axios.create({
      baseURL: config.baseURL || 'https://api.dailey.dev',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'X-API-Key': config.apiKey })
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove authentication token
   */
  clearAuth(): void {
    delete this.client.defaults.headers.common['Authorization'];
  }

  /**
   * Upload a file
   */
  async uploadFile(options: FileUploadOptions): Promise<FileResponse> {
    const formData = new FormData();
    
    formData.append('file', options.file, options.filename);
    
    if (options.bucket) {
      formData.append('bucket_id', options.bucket);
    }
    
    if (options.folder) {
      formData.append('folder_path', options.folder);
    }
    
    if (options.tags) {
      formData.append('tags', JSON.stringify(options.tags));
    }
    
    if (options.metadata) {
      formData.append('metadata', JSON.stringify(options.metadata));
    }

    const response = await this.client.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  }

  /**
   * Get file information
   */
  async getFile(fileId: string): Promise<FileResponse> {
    const response = await this.client.get(`/api/files/${fileId}`);
    return response.data;
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string): Promise<ApiResponse<null>> {
    const response = await this.client.delete(`/api/files/${fileId}`);
    return response.data;
  }

  /**
   * List files in a bucket
   */
  async listFiles(bucketId?: string, folder?: string): Promise<FileResponse[]> {
    const params: any = {};
    if (bucketId) params.bucket_id = bucketId;
    if (folder) params.folder_path = folder;

    const response = await this.client.get('/api/files', { params });
    return response.data.files || [];
  }

  /**
   * Create a bucket
   */
  async createBucket(name: string, description?: string, isPublic = false): Promise<BucketResponse> {
    const response = await this.client.post('/api/buckets', {
      name,
      description,
      is_public: isPublic
    });
    return response.data;
  }

  /**
   * Get bucket information
   */
  async getBucket(bucketId: string): Promise<BucketResponse> {
    const response = await this.client.get(`/api/buckets/${bucketId}`);
    return response.data;
  }

  /**
   * List all buckets
   */
  async listBuckets(): Promise<BucketResponse[]> {
    const response = await this.client.get('/api/buckets');
    return response.data.buckets || [];
  }

  /**
   * Delete a bucket
   */
  async deleteBucket(bucketId: string): Promise<ApiResponse<null>> {
    const response = await this.client.delete(`/api/buckets/${bucketId}`);
    return response.data;
  }

  /**
   * Create a folder in a bucket
   */
  async createFolder(bucketId: string, folderPath: string): Promise<ApiResponse<null>> {
    const response = await this.client.post(`/api/buckets/${bucketId}/folders`, {
      path: folderPath
    });
    return response.data;
  }

  /**
   * Generate a public link for a file
   */
  async generatePublicLink(fileId: string, expiresIn = '24h'): Promise<{ publicUrl: string }> {
    const response = await this.client.post(`/api/serve/files/${fileId}/public-link`, {
      expiresIn
    });
    return response.data;
  }

  /**
   * Get analytics data
   */
  async getAnalytics(period = '7d'): Promise<any> {
    const response = await this.client.get('/api/analytics', {
      params: { period }
    });
    return response.data;
  }

  /**
   * Check API health
   */
  async health(): Promise<any> {
    const response = await this.client.get('/health');
    return response.data;
  }

  /**
   * Video processing helpers
   */
  async listVideoPresets(): Promise<VideoPresetResponse> {
    const response = await this.client.get('/api/video/presets');
    return response.data;
  }

  async processVideo(mediaFileId: string, payload: VideoJobRequest = {}): Promise<VideoJobQueueResponse> {
    if (!mediaFileId) {
      throw new Error('mediaFileId is required');
    }

    const response = await this.client.post(`/api/video/${mediaFileId}/process`, payload);
    return response.data;
  }

  async listVideoJobs(
    mediaFileId: string,
    params: { status?: string; limit?: number; offset?: number } = {}
  ): Promise<VideoJobListResponse> {
    if (!mediaFileId) {
      throw new Error('mediaFileId is required');
    }

    const response = await this.client.get(`/api/video/${mediaFileId}/jobs`, { params });
    return response.data;
  }

  async getVideoJob(jobId: string): Promise<VideoJobDetailResponse> {
    if (!jobId) {
      throw new Error('jobId is required');
    }

    const response = await this.client.get(`/api/video/jobs/${jobId}`);
    return response.data;
  }

  /**
   * Retry a request with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    retries = this.maxRetries
  ): Promise<AxiosResponse<T>> {
    try {
      return await requestFn();
    } catch (error: any) {
      if (retries > 0 && error.response?.status >= 500) {
        const delay = Math.pow(2, this.maxRetries - retries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryRequest(requestFn, retries - 1);
      }
      throw error;
    }
  }
}

// Export a factory function for easier usage
export function createDaileyMediaApi(config: DaileyMediaApiConfig): DaileyMediaApi {
  return new DaileyMediaApi(config);
}

// Default export
export default DaileyMediaApi;
