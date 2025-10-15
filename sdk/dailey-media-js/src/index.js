import { HttpClient, HttpError } from './httpClient.js'

const DEFAULT_BASE_URL = 'http://localhost:5173'

export class DaileyMediaClient {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    apiKey,
    getAccessToken,
    fetchImpl,
    defaultBucket
  } = {}) {
    this.http = new HttpClient({ baseUrl, apiKey, getAccessToken, fetchImpl })
    this.defaultBucket = defaultBucket || 'default'
  }

  /**
   * Upload a file (Browser File, Blob, or Node Buffer)
   */
  async uploadFile(file, { bucketId, folderPath, metadata } = {}) {
    if (!file) {
      throw new Error('uploadFile requires a file or Buffer')
    }

    const form = createFormData()
    const fileName = inferFileName(file)

    if (isBrowserFile(file)) {
      form.append('file', file, fileName)
    } else {
      form.append('file', file, fileName)
    }

    form.append('bucket_id', bucketId || this.defaultBucket)
    if (folderPath) {
      form.append('folder_path', folderPath)
    }
    if (metadata && typeof metadata === 'object') {
      form.append('metadata', JSON.stringify(metadata))
    }

    return this.http.request('/api/upload', {
      method: 'POST',
      formData: form
    })
  }

  /**
   * List files with optional filters
   */
  async listFiles(query = {}) {
    return this.http.request('/api/files', { query })
  }

  /**
   * Retrieve file metadata by ID
   */
  async getFileMetadata(id) {
    if (!id) throw new Error('getFileMetadata requires an id')
    return this.http.request(`/api/files/${id}`)
  }

  /**
   * Delete a file
   */
  async deleteFile(id) {
    if (!id) throw new Error('deleteFile requires an id')
    return this.http.request(`/api/files/${id}`, { method: 'DELETE' })
  }

  /**
   * List media entries (legacy endpoint)
   */
  async listMedia(query = {}) {
    return this.http.request('/api/media', { query })
  }

  /**
   * API Key helpers (requires appropriate permissions)
   */
  async listApiKeys(params = {}) {
    return this.http.request('/api/keys', { query: params })
  }

  async createApiKey(payload) {
    if (!payload?.name) {
      throw new Error('createApiKey requires a name field')
    }

    return this.http.request('/api/keys', {
      method: 'POST',
      body: payload
    })
  }

  async deleteApiKey(id) {
    if (!id) throw new Error('deleteApiKey requires an id')
    return this.http.request(`/api/keys/${id}`, {
      method: 'DELETE'
    })
  }

  /**
   * Generate a signed URL using the serve route (local-only helper)
   */
  getLocalFileUrl({ userId, bucketId, path }) {
    if (!userId || !bucketId || !path) {
      throw new Error('getLocalFileUrl requires userId, bucketId, and path')
    }
    return `${this.http.baseUrl}/api/serve/files/${encodeURIComponent(userId)}/${encodeURIComponent(bucketId)}/${encodeURIComponent(path)}`
  }

  setDefaultBucket(bucketId) {
    this.defaultBucket = bucketId
  }

  /**
   * Video processing helpers
   */
  async listVideoPresets() {
    return this.http.request('/api/video/presets')
  }

  async processVideo(mediaFileId, options = {}) {
    if (!mediaFileId) {
      throw new Error('processVideo requires a mediaFileId')
    }

    return this.http.request(`/api/video/${mediaFileId}/process`, {
      method: 'POST',
      body: options
    })
  }

  async listVideoJobs(mediaFileId, query = {}) {
    if (!mediaFileId) {
      throw new Error('listVideoJobs requires a mediaFileId')
    }

    return this.http.request(`/api/video/${mediaFileId}/jobs`, {
      query
    })
  }

  async getVideoJob(jobId) {
    if (!jobId) {
      throw new Error('getVideoJob requires a jobId')
    }

    return this.http.request(`/api/video/jobs/${jobId}`)
  }
}

export { HttpError }

export function createClient(options) {
  return new DaileyMediaClient(options)
}

function createFormData() {
  if (typeof FormData !== 'undefined') {
    return new FormData()
  }

  throw new Error('FormData is not available in this environment. Install the `form-data` package and pass an instance explicitly when using Node.js.')
}

function isBrowserFile(file) {
  return typeof File !== 'undefined' && file instanceof File
}

function inferFileName(file) {
  if (isBrowserFile(file)) {
    return file.name
  }
  if (typeof file?.name === 'string') {
    return file.name
  }
  return `upload-${Date.now()}`
}
