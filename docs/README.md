# Dailey Media API Documentation

## Overview

The Dailey Media API is a secure, scalable media storage and processing service designed for the DAILEY ecosystem. It provides comprehensive file management, bucket organization, and advanced security features.

## Features

- 🚀 **High Performance**: Optimized for speed and scalability
- 🔐 **Enterprise Security**: JWT authentication, MFA, rate limiting
- 📁 **Flexible Storage**: Bucket and folder organization with nested support
- 🌐 **Multi-Format Support**: Images, videos, audio, documents, and more
- 📊 **Analytics**: Comprehensive usage statistics and monitoring
- 🔧 **Developer Friendly**: SDKs, CLI tools, and interactive documentation

## Quick Start

### 1. Installation

```bash
# Install the JavaScript SDK
npm install @dailey/media-api-sdk

# Install the CLI tool
npm install -g @dailey/media-cli
```

### 2. Authentication

```javascript
import { DaileyMediaApi } from '@dailey/media-api-sdk';

const api = new DaileyMediaApi({
  baseURL: 'https://api.dailey.dev',
  apiKey: 'your-api-key'
});
```

### 3. Upload a File

```javascript
const file = await api.uploadFile({
  file: fileData,
  bucket: 'my-photos',
  folder: 'vacation-2024',
  tags: ['vacation', 'family']
});

console.log('File uploaded:', file.id);
```

## API Reference

### Base URL
```
Production: https://api.dailey.dev
Staging: https://staging-api.dailey.dev
```

### Authentication

The API uses Bearer token authentication:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.dailey.dev/api/files
```

### Core Endpoints

#### Files
- `POST /api/upload` - Upload files
- `GET /api/files` - List files
- `GET /api/files/:id` - Get file details
- `DELETE /api/files/:id` - Delete file

#### Buckets
- `GET /api/buckets` - List buckets
- `POST /api/buckets` - Create bucket
- `GET /api/buckets/:id` - Get bucket details
- `DELETE /api/buckets/:id` - Delete bucket

#### Authentication
- `POST /api/auth/mfa/setup` - Setup MFA
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout

## SDKs

### JavaScript/TypeScript

```bash
npm install @dailey/media-api-sdk
```

```javascript
import { DaileyMediaApi } from '@dailey/media-api-sdk';

const api = new DaileyMediaApi({
  baseURL: 'https://api.dailey.dev',
  apiKey: 'your-api-key'
});

// Upload a file
const result = await api.uploadFile({
  file: fileBuffer,
  filename: 'photo.jpg',
  bucket: 'photos'
});

// List files
const files = await api.listFiles('photos');

// Create bucket
const bucket = await api.createBucket('new-bucket', 'My new bucket');
```

### CLI Tool

```bash
# Install globally
npm install -g @dailey/media-cli

# Configure
dmedia config

# Upload files
dmedia upload *.jpg --bucket photos --folder vacation

# List files
dmedia ls --bucket photos

# Download file
dmedia download file-id-123

# Show analytics
dmedia analytics
```

## Security

### Authentication Methods

1. **Bearer Tokens**: JWT tokens from DAILEY CORE
2. **API Keys**: For programmatic access
3. **Multi-Factor Authentication**: TOTP-based MFA

### Rate Limiting

- General API: 1000 requests per hour
- Authentication: 5 attempts per 15 minutes
- File uploads: 10 per minute

### Security Headers

All responses include comprehensive security headers:
- Strict-Transport-Security
- X-Content-Type-Options
- X-Frame-Options
- Content-Security-Policy

## File Organization

### Buckets

Buckets are top-level containers for organizing files:

```javascript
await api.createBucket('photos', 'Photo storage', false); // private
await api.createBucket('public-assets', 'Public files', true); // public
```

### Folders

Organize files within buckets using folders:

```javascript
await api.uploadFile({
  file: photoFile,
  bucket: 'photos',
  folder: 'vacation/2024/hawaii'
});
```

### Nested Structure

```
my-app-bucket/
├── images/
│   ├── thumbnails/
│   │   ├── sm/
│   │   ├── md/
│   │   └── lg/
│   └── originals/
├── videos/
└── documents/
```

## File Processing

### Supported Formats

- **Images**: JPG, PNG, GIF, WebP, HEIC, TIFF, RAW formats
- **Videos**: MP4, MOV, AVI, MKV, WebM
- **Audio**: MP3, WAV, AAC, FLAC, OGG
- **Documents**: PDF, DOC, DOCX, TXT, MD
- **Archives**: ZIP, RAR, TAR, 7Z

### Automatic Processing

- Image thumbnail generation
- Metadata extraction
- File type validation
- Virus scanning (planned)

## Error Handling

### Standard Error Format

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "Invalid file type",
  "details": [
    {
      "field": "file",
      "message": "File type not allowed"
    }
  ]
}
```

### Common Error Codes

- `400` - Validation Error
- `401` - Authentication Required
- `403` - Insufficient Permissions
- `404` - Not Found
- `413` - File Too Large
- `429` - Rate Limited
- `500` - Server Error

## Analytics

### Usage Metrics

```javascript
const analytics = await api.getAnalytics('30d');

console.log({
  totalFiles: analytics.fileCount,
  storageUsed: analytics.storageSize,
  bandwidth: analytics.bandwidth,
  topBuckets: analytics.buckets
});
```

### Available Periods

- `1d` - Last 24 hours
- `7d` - Last 7 days
- `30d` - Last 30 days
- `90d` - Last 90 days

## Deployment

### Environment Variables

```bash
# Required
NODE_ENV=production
JWT_SECRET=your-super-secure-secret
DATABASE_URL=mysql://user:pass@host:3306/db
S3_ACCESS_KEY_ID=your-s3-key
S3_SECRET_ACCESS_KEY=your-s3-secret

# Optional
REDIS_URL=redis://localhost:6379
CORS_ORIGINS=https://yourdomain.com
RATE_LIMIT_REQUESTS=1000
```

### Docker Deployment

```bash
# Build image
docker build -t dailey-media-api .

# Run container
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret \
  dailey-media-api
```

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://user:pass@db:3306/dailey
    depends_on:
      - db
      - redis
```

## Contributing

### Development Setup

```bash
# Clone repository
git clone https://github.com/jonndailey/dailey-media-api.git
cd dailey-media-api

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test
```

### Code Standards

- TypeScript for type safety
- ESLint for code quality
- Jest for testing
- Conventional commits

## Support

- 📧 Email: support@dailey.dev
- 💬 Discord: [Dailey Community](https://discord.gg/dailey)
- 📖 Documentation: https://docs.dailey.dev
- 🐛 Issues: https://github.com/jonndailey/dailey-media-api/issues

## License

UNLICENSED - Contact Dailey Software for licensing information.