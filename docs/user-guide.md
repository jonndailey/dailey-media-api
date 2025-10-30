# Dailey Media API – User Guide

Complete guide for integrating with the production-ready Dailey Media API. This secure, scalable service handles all your media storage needs with enterprise-grade features.

## 1. Prerequisites

- Access to the Dailey Media Console with `api.write` or admin permissions
- Node.js ≥ 18 for TypeScript SDK usage
- Valid authentication credentials (API key or JWT from Dailey Core)
- HTTPS-enabled environment for production use

## 2. Generate an API Key

1. Sign in to the DMAPI console.
2. Navigate to **API Keys** (new tab in the Buckets & Files interface).
3. Click **Create API Key**.
4. Choose permissions (e.g., `read`, `write`) and scopes (`media`, `upload`, etc.).
5. Copy the key immediately—this is the only time it is displayed.

> **Tip:** Keys can also be created via `POST /api/keys` using a signed-in session or another key with `write` permission.

## 3. Install the TypeScript SDK

Install the production-ready TypeScript SDK:

```bash
npm install git+https://github.com/jonndailey/dailey-media-api.git#sdk/javascript
```

Or via the CLI tool:

```bash
npm install -g @dailey/media-cli
dmedia config  # Configure API credentials
```

## 4. Configure Environment Variables

```bash
MEDIA_API_URL=https://media.dailey.internal
MEDIA_API_KEY=dmapi_dev_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## 5. TypeScript/JavaScript Example

```typescript
import { DaileyMediaApi } from '@dailey/media-api-sdk'
import fs from 'fs'

const api = new DaileyMediaApi({
  baseURL: process.env.MEDIA_API_URL!,
  apiKey: process.env.MEDIA_API_KEY!,
  timeout: 30000
})

async function main() {
  // Upload with nested folder support
  const buffer = fs.readFileSync('./sample.png')
  const upload = await api.uploadFile({
    file: buffer,
    filename: 'sample.png',
    bucket: 'marketing-assets',
    folder: '2025/spring/campaign-photos',
    tags: ['marketing', 'spring', '2025']
  })

  console.log('Upload result:', upload)

  // List files with folder filtering
  const files = await api.listFiles('marketing-assets', '2025/spring')
  console.log('Files in folder:', files)

  // Generate public link with expiration
  const publicLink = await api.generatePublicLink(upload.id, '24h')
  console.log('Public URL:', publicLink.publicUrl)
}

main().catch(console.error)
```

## 6. React Upload Component

```typescript
import { DaileyMediaApi } from '@dailey/media-api-sdk'
import { useState } from 'react'

export function SecureUploader() {
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  
  const api = new DaileyMediaApi({
    baseURL: import.meta.env.VITE_MEDIA_API_URL,
    apiKey: import.meta.env.VITE_MEDIA_API_KEY
  })

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setStatus('Uploading...')
    setProgress(0)

    try {
      const result = await api.uploadFile({
        file,
        filename: file.name,
        bucket: 'user-uploads',
        folder: `${new Date().getFullYear()}/${new Date().getMonth() + 1}`,
        tags: [file.type.split('/')[0]] // 'image', 'video', etc.
      })
      
      setStatus(`Upload complete: ${result.id}`)
      setProgress(100)
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    }
  }

  return (
    <div className="upload-component">
      <input 
        type="file" 
        onChange={handleUpload}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
      />
      {status && <p>{status}</p>}
      {progress > 0 && <progress value={progress} max={100} />}
    </div>
  )
}
```

## 7. CLI Tool Usage

The production CLI tool provides powerful command-line access:

```bash
# Install and configure
npm install -g @dailey/media-cli
dmedia config

# Upload files with patterns
dmedia upload *.jpg --bucket photos --folder vacation/2024 --tags vacation,family

# List files and buckets
dmedia ls --bucket photos --folder vacation
dmedia buckets

# Download and manage files
dmedia download file-id-123 --output ./downloaded-file.jpg
dmedia delete file-id-123

# View analytics
dmedia analytics
```

## 8. REST API Reference

Complete endpoint documentation available at `/docs` (Swagger UI).

### Core Endpoints

| Method | Endpoint                    | Purpose                          |
|--------|----------------------------|----------------------------------|
| GET    | `/health`                  | Service health check             |
| GET    | `/health/detailed`         | Detailed health with dependencies |
| POST   | `/api/upload`              | Upload files with metadata       |
| GET    | `/api/files`               | List files with filtering        |
| GET    | `/api/files/:id`           | Get file details and URLs        |
| DELETE | `/api/files/:id`           | Delete file                      |
| POST   | `/api/files/:id/public-link` | Generate time-limited public URL |

### Bucket Management

| Method | Endpoint                    | Purpose                    |
|--------|----------------------------|----------------------------|
| GET    | `/api/buckets`             | List all buckets           |
| POST   | `/api/buckets`             | Create new bucket          |
| GET    | `/api/buckets/:id`         | Get bucket details         |
| DELETE | `/api/buckets/:id`         | Delete bucket              |
| POST   | `/api/buckets/:id/folders` | Create folder in bucket    |

### Authentication & Analytics

| Method | Endpoint              | Purpose                     |
|--------|-----------------------|-----------------------------|
| GET    | `/api/keys`           | List API keys               |
| POST   | `/api/keys`           | Create API key              |
| DELETE | `/api/keys/:id`       | Delete API key              |
| GET    | `/api/analytics`      | Usage statistics            |
| POST   | `/api/auth/mfa/setup` | Setup MFA (TOTP)           |

### Application scoping

- Every media row is tied to an `application_id`. Authenticated API clients inherit this automatically from the issued API key or JWT.
- When auth bypass is enabled for local development (`DISABLE_AUTH=true`), the server falls back to `application_id = 'dailey-media-api'`. If you migrated assets for another product (e.g. Castingly), include `app_id=castingly` in `/api/files` or `/api/media` requests so those records are returned.
- The DMAPI web UI follows the same rule: make sure tabs that should surface Castingly data append `?app_id=castingly` (or expose a selector for other app ids).
- Primary tenant admins can use the application selector in the DMAPI UI header to switch between `castingly`, `dailey-media-api`, and other registered apps. The buckets and files tabs automatically reload for the selected scope.

## 9. Security Features

### Multi-Factor Authentication
```typescript
// Setup MFA for enhanced security
const mfaSetup = await api.setupMFA()
console.log('Scan QR code:', mfaSetup.qrCode)
```

### Rate Limiting
- API: 1000 requests/hour per user
- Upload: 10 files/minute per user  
- Auth: 5 attempts/15 minutes per IP

### Security Headers
All responses include comprehensive security headers (HSTS, CSP, X-Frame-Options, etc.)

## 10. Error Handling & Monitoring

```typescript
try {
  const result = await api.uploadFile(options)
} catch (error) {
  if (error.response?.status === 413) {
    console.error('File too large')
  } else if (error.response?.status === 429) {
    console.error('Rate limited - retry after delay')
  } else {
    console.error('Upload failed:', error.message)
  }
}
```

Common status codes:
- `400` - Invalid request/validation error
- `401` - Authentication required  
- `403` - Insufficient permissions
- `413` - File too large
- `429` - Rate limited
- `500` - Server error

## 11. Production Deployment

### Environment Configuration
```bash
# Required
NODE_ENV=production
JWT_SECRET=your-secure-secret
DATABASE_URL=your-database-url

# Optional
CORS_ORIGINS=https://yourdomain.com
RATE_LIMIT_REQUESTS=1000
MAX_FILE_SIZE=10485760
```

### Docker Deployment
```bash
docker build -t dailey-media-api .
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=your-db-url \
  dailey-media-api
```

## 12. Monitoring & Analytics

Access comprehensive analytics via the web interface or API:
- File upload statistics
- Storage usage metrics  
- API key usage tracking
- Error rate monitoring
- Performance metrics

Live totals (dynamic) — avoid hard-coded numbers:
- DB-backed (if `DATABASE_URL` is set):
  - `SELECT COUNT(*) AS total_files, SUM(file_size) AS total_bytes FROM media_files WHERE application_id='castingly';`
- Storage fallback (no DB):
  - Iterate `/api/buckets/:bucketId/files?user_id=<userId>&path=actors/<userId>/<folder>` and sum `file_size` for folders (headshots, reels, resumes, documents). Include `app_id=castingly` where applicable.

## 13. Support & Resources

- 📖 **Interactive Docs**: `/docs` (Swagger UI)
- 🔧 **Web Console**: Bucket management and analytics
- 💻 **CLI Tool**: `@dailey/media-cli`
- 📦 **TypeScript SDK**: Full type safety and IntelliSense
- 🐛 **Issues**: [GitHub Issues](https://github.com/jonndailey/dailey-media-api/issues)

## Appendix: Quick Reference (PDF, Conversion, Image Transform)

- Image Transform: `GET /api/files/:id/transform?width=800&format=webp&quality=82&fit=inside`
- Conversion (from URL): `POST /api/conversion/from-url` → import + convert in one step
- PDF Capabilities: `GET /api/pdf/capabilities`
- PDF Merge/Split/Rotate/Compress: see [PDF Operations](./pdf.md)
- PDF Watermark/Stamp/Flatten/Images/Forms: see [PDF Operations](./pdf.md)
