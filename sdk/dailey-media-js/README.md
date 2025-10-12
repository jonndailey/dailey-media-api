# @dailey/media-api-sdk

TypeScript/JavaScript SDK for the Dailey Media API. Provides type-safe, feature-complete access to file upload, bucket management, and analytics functionality.

## Installation

Install directly from the repository:

```bash
npm install git+https://github.com/jonndailey/dailey-media-api.git#sdk/javascript
```

## Quick Start

```typescript
import { DaileyMediaApi } from '@dailey/media-api-sdk'

const api = new DaileyMediaApi({
  baseURL: 'https://api.dailey.dev',
  apiKey: 'your-api-key',
  timeout: 30000
})

// Upload a file
const result = await api.uploadFile({
  file: fileBuffer, // File | Buffer
  filename: 'photo.jpg',
  bucket: 'photos',
  folder: 'vacation/2024',
  tags: ['vacation', 'family']
})

// List files
const files = await api.listFiles('photos', 'vacation/2024')

// Get file details
const fileData = await api.getFile(result.id)

// Delete file
await api.deleteFile(result.id)
```

## Authentication

### API Keys
```typescript
const api = new DaileyMediaApi({
  baseURL: 'https://api.dailey.dev',
  apiKey: 'dmapi_prod_...'
})
```

### JWT Tokens (from Dailey Core)
```typescript
const api = new DaileyMediaApi({
  baseURL: 'https://api.dailey.dev'
})

// Set token after authentication
api.setAuthToken(jwtToken)
```

## API Reference

### File Operations

#### `uploadFile(options: FileUploadOptions): Promise<FileResponse>`
Upload a file to the API.

```typescript
interface FileUploadOptions {
  file: File | Buffer
  filename?: string
  bucket?: string
  folder?: string
  tags?: string[]
  metadata?: Record<string, any>
}
```

#### `getFile(fileId: string): Promise<FileResponse>`
Get file metadata and access URLs.

#### `deleteFile(fileId: string): Promise<ApiResponse<null>>`
Permanently delete a file.

#### `listFiles(bucketId?: string, folder?: string): Promise<FileResponse[]>`
List files with optional bucket and folder filtering.

#### `generatePublicLink(fileId: string, expiresIn?: string): Promise<{publicUrl: string}>`
Generate a time-limited public access URL.

### Bucket Management

#### `createBucket(name: string, description?: string, isPublic?: boolean): Promise<BucketResponse>`
Create a new storage bucket.

#### `getBucket(bucketId: string): Promise<BucketResponse>`
Get bucket information and metadata.

#### `listBuckets(): Promise<BucketResponse[]>`
List all accessible buckets.

#### `deleteBucket(bucketId: string): Promise<ApiResponse<null>>`
Delete a bucket and all its contents.

#### `createFolder(bucketId: string, folderPath: string): Promise<ApiResponse<null>>`
Create a folder within a bucket.

### Analytics

#### `getAnalytics(period?: string): Promise<any>`
Get usage analytics and statistics.

```typescript
const analytics = await api.getAnalytics('7d') // 1d, 7d, 30d, 90d
```

### Health & Status

#### `health(): Promise<any>`
Check API health and connectivity.

## TypeScript Support

The SDK is written in TypeScript and includes comprehensive type definitions:

```typescript
import { 
  DaileyMediaApi,
  FileResponse,
  BucketResponse,
  ApiResponse,
  FileUploadOptions
} from '@dailey/media-api-sdk'
```

## Error Handling

All methods throw structured errors that can be caught and handled:

```typescript
try {
  const result = await api.uploadFile(options)
} catch (error) {
  console.error('Upload failed:', error.response?.data || error.message)
}
```

## Browser Usage

The SDK works in both Node.js and browser environments:

```typescript
// Browser file upload
const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
const file = fileInput.files?.[0]

if (file) {
  const result = await api.uploadFile({
    file,
    filename: file.name,
    bucket: 'uploads'
  })
}
```

## Node.js Usage

```typescript
import fs from 'fs'
import { DaileyMediaApi } from '@dailey/media-api-sdk'

const api = new DaileyMediaApi({
  baseURL: process.env.MEDIA_API_URL!,
  apiKey: process.env.MEDIA_API_KEY!
})

// Upload from file system
const buffer = fs.readFileSync('./image.jpg')
const result = await api.uploadFile({
  file: buffer,
  filename: 'image.jpg',
  bucket: 'assets'
})
```

## Configuration Options

```typescript
interface DaileyMediaApiConfig {
  baseURL?: string          // API base URL
  apiKey?: string           // API key for authentication
  timeout?: number          // Request timeout (default: 30000ms)
  maxRetries?: number       // Max retry attempts (default: 3)
}
```

## Development

The SDK uses axios for HTTP requests and includes automatic retry logic with exponential backoff for server errors (5xx responses).
