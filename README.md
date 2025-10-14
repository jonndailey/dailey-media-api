# Dailey Media API (DMAPI)

🚀 **Universal Media Processing Platform** - Transforming DMAPI from secure storage into the single source of truth for all media operations across the DAILEY ecosystem.

**Core Vision**: Any file, any format, any transformation – automatically processed, intelligently analyzed, and delivered optimally.

## ✨ Features

### 🔒 **Enterprise Security**
- **Multi-Factor Authentication**: TOTP-based MFA with QR code setup
- **JWT Security**: Secure token-based authentication with refresh capabilities
- **Rate Limiting**: Comprehensive per-user and per-endpoint protection
- **Input Validation**: XSS protection, SQL injection prevention, and sanitization
- **Security Headers**: HSTS, CSP, X-Frame-Options, and more

### 📁 **Advanced File Management**
- **Universal File Support**: Images, videos, audio, documents, archives, and any file type
- **Bucket Organization**: Public/private buckets with nested folder support
- **Smart Processing**: Automatic thumbnails, metadata extraction, and categorization
- **Content Serving**: Streaming, caching, and CDN-ready file delivery
- **Public Links**: Time-limited access URLs for secure sharing

### 🛠 **Developer Experience**
- **Interactive API Docs**: Swagger/OpenAPI documentation at `/docs`
- **JavaScript SDK**: `@dailey/media-api-sdk` with TypeScript support
- **CLI Tool**: `@dailey/media-cli` for command-line operations
- **Code Examples**: Comprehensive integration guides and samples

### 🚀 **Production Infrastructure**
- **CI/CD Pipeline**: Automated testing, security scanning, and deployment
- **Docker Support**: Multi-stage builds with security best practices
- **SSL Automation**: Let's Encrypt integration with auto-renewal
- **Monitoring**: Prometheus metrics, Grafana dashboards, health checks
- **Load Balancing**: Nginx reverse proxy with rate limiting

## 🏗️ Architecture

This API is designed as a standalone microservice that can be consumed by:
- **Dailey Photos** - Photo management and galleries
- **Dailey Forms** - Document storage and snapshots  
- **Castingly** - Actor headshots and reels
- **Dailey HR** - Profile images and ID scans

## 📡 API Endpoints

### Health & Status
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health with dependencies
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

### Media Operations
- `POST /api/upload` - Upload single or multiple files
- `GET /api/media/:id` - Retrieve media metadata and URLs
- `GET /api/media` - List media with filtering
- `DELETE /api/media/:id` - Delete media files
- `GET /api/media/:id/transform` - Dynamic image transformation

### File Serving
- `GET /api/serve/files/:userId/:bucketId/*` - Serve files with nested path support
- `GET /api/serve/files/:id/content` - Serve file by ID (authenticated)
- `POST /api/serve/files/:id/public-link` - Generate public access URL
- `GET /api/serve/public/:token` - Access files via public link

## 🛠️ Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/jonndailey/dailey-media-api.git
   cd dailey-media-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**
   
   **Option A: Standard Development (using nodemon)**
   ```bash
   npm run dev
   ```
   
   **Option B: PM2 Process Manager (recommended for development)**
   ```bash
   npm run pm2:start    # Start all services
   npm run pm2:status   # Check status
   npm run pm2:logs     # View logs
   npm run pm2:stop     # Stop all services
   ```

The API will be available at `http://localhost:4100` (Backend) and `http://localhost:5174` (Frontend)

**For Tailscale/Network Access**: Use `http://100.105.97.19:4100` (Backend)

## 🏃‍♂️ Quick Start

Test the API endpoints:

```bash
# Health check
curl http://localhost:4100/health

# API information  
curl http://localhost:4100/api

# Upload a file
ACCESS_TOKEN="paste-token-here"
curl -X POST http://localhost:4100/api/upload \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@image.jpg"
```

## 🌐 Cross-Origin & Integration

### CORS Configuration
The API is configured for cross-origin access to support frontend integration:
- `Access-Control-Allow-Origin: *` - Allows requests from any origin
- `Cross-Origin-Resource-Policy: cross-origin` - Enables cross-origin image loading
- CORS origins configurable via `CORS_ORIGINS` environment variable

### Frontend Integration
For browser-based applications, uploaded files can be directly referenced:

```javascript
// Upload file and get URL
const result = await mediaService.uploadFile(file, {
  bucketId: 'tenant-logos',
  folderPath: 'logos'
});

// Use the returned URL (either result.file.original.url or signedUrl)
const imageUrl = result.file.original.url || result.file.original.signedUrl;

// Display in React/HTML
<img src={`${MEDIA_API_URL}${imageUrl}`} alt="Uploaded file" />
```

### File URL Structure
Uploaded files return URLs in the format:
- **Public files**: `/storage/{key}`
- **Private files**: `/api/serve/files/{userId}/{bucketId}/{filePath}`

The frontend integration automatically converts relative URLs to absolute URLs using the configured `REACT_APP_MEDIA_API_URL`.

## 🔐 Authentication

The API trusts JWT access tokens issued by Dailey Core. Authenticate with Core, then include the token in requests:

```bash
# Obtain an access token
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@dailey.cloud", "password": "demo123"}'

# Use the token with the Media API
ACCESS_TOKEN="paste-token-here"
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:4100/api/media
```

## 🔑 API Keys

You can create and manage Dailey Media API keys from the **Buckets & Files → API Keys** tab in the web console. Generating keys requires either an existing admin key or signing in with a user that has `api.write` or higher permissions in Dailey Core.

After the first login:

1. Open the **API Keys** tab and click **Create API Key**.
2. Choose a name, permissions, scopes, and optional expiry.
3. Copy the generated key immediately – it will not be shown again.

API keys can also be created programmatically via `POST /api/keys`. Use the same auth requirements (JWT with `api.write`/`core.admin`, or an API key that already has `write` permission).

## 📦 Internal JavaScript SDK

A private SDK is included for internal projects under `sdk/dailey-media-js`:

```bash
npm install git+https://github.com/jonndailey/dailey-media-api.git#sdk/dailey-media-js
```

```javascript
import { DaileyMediaClient } from '@dailey-media/js-sdk'

const client = new DaileyMediaClient({
  baseUrl: process.env.MEDIA_API_URL,
  apiKey: process.env.MEDIA_API_KEY
})

await client.uploadFile(fileInput.files[0], {
  bucketId: 'marketing-assets',
  folderPath: '2025/spring'
})

const files = await client.listFiles({ limit: 20 })
```

The SDK supports uploads, file listing, metadata retrieval, deletions, and API key management. See `sdk/dailey-media-js/README.md` for details.

## 📊 Database Schema

The API uses the following main tables:
- `media_files` - Primary media storage metadata
- `media_variants` - Generated thumbnails and resized versions
- `audit_logs` - Comprehensive operation tracking
- `api_keys` - Legacy system-to-system authentication (maintained for backwards compatibility)

## 🔧 Troubleshooting

### Common Issues

#### CORS Errors in Browser
If you see `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` errors:
1. Ensure `CORS_ORIGINS` environment variable includes your frontend URL
2. Check that `Cross-Origin-Resource-Policy: cross-origin` is set in responses
3. Verify the Media API is accessible from your frontend domain

#### File Upload Success but Images Don't Display
1. **Check URL Format**: Uploaded files return URLs like `/api/serve/files/{userId}/{bucketId}/{filePath}`
2. **Database Integration**: Ensure the frontend properly saves the returned URL to the database
3. **URL Resolution**: Frontend should convert relative URLs to absolute URLs using the Media API base URL

#### File Serving 404 Errors
1. **Nested Paths**: The serve route supports nested paths with `/*` wildcard
2. **File Permissions**: Check that files are accessible in the storage directory
3. **URL Encoding**: Ensure special characters in file paths are properly encoded

### Environment Variables
Key environment variables for proper operation:
```env
NODE_ENV=development
PORT=4100
HOST=0.0.0.0

# Storage Configuration
STORAGE_TYPE=local

# CORS Configuration (critical for browser integration)
CORS_ORIGINS=http://localhost:3005,http://100.105.97.19:3005,http://localhost:3000,http://100.105.97.19:3000

# Development flags
DISABLE_AUTH=true
LOG_LEVEL=debug
```

## 🚀 Deployment

The API is designed to deploy on Dailey Cloud with:
- Docker containerization
- Kubernetes orchestration
- Horizontal auto-scaling
- Health monitoring

## 📝 Development Status

### ✅ Current Capabilities (v1.0)
- ✅ **Secure File Storage**: Enterprise-grade storage with bucket organization
- ✅ **Universal File Support**: Images, videos, audio, documents, archives, and any file type
- ✅ **Image Processing**: Automatic thumbnails, metadata extraction, and basic transformations
- ✅ **Authentication & Security**: DAILEY CORE integration, MFA, rate limiting
- ✅ **Web Management Console**: Drag & drop uploads, file browser, analytics dashboard
- ✅ **File Deletion**: Individual file deletion with confirmation modal
- ✅ **Analytics & Monitoring**: Usage tracking, file type analysis, performance metrics
- ✅ **Developer Tools**: REST API, JavaScript SDK, comprehensive documentation
- ✅ **Production Infrastructure**: PM2 process management, Docker support, health checks

### 🚧 Next Phase (v2.0) - In Planning
- 🔄 **Video & Audio Processing**: FFmpeg integration for transcoding, compression, streaming
- 🔄 **Document Processing**: Universal conversion (PDF, Office, HTML, Markdown)
- 🔄 **OCR & Text Extraction**: Multi-language OCR with intelligent document understanding
- 🔄 **AI-Powered Intelligence**: Content analysis, auto-tagging, smart search
- 🔄 **Advanced Image Processing**: Background removal, enhancement, effects
- 🔄 **Workflow Automation**: Event-driven processing pipelines
- 🔄 **Content Delivery**: CDN integration, adaptive streaming, format optimization
- 🔄 **Collaboration Tools**: Real-time annotation, version control, approval workflows

### 🎯 Future Vision (v3.0+)
- 🔮 **Archive Management**: Smart compression, selective extraction, malware scanning
- 🔮 **Accessibility Features**: Auto-generated alt text, captions, WCAG compliance
- 🔮 **Machine Learning**: Custom models, content moderation, quality assessment
- 🔮 **Live Streaming**: RTMP ingest, adaptive bitrate, DVR functionality
- 🔮 **3D & VR Content**: 360° video processing, 3D model support
- 🔮 **Blockchain Integration**: Content verification, digital signatures, provenance tracking

### Recent Integration Success
Successfully deployed and integrated with Dailey Core for tenant logo management:
- File uploads working via drag & drop interface
- Cross-origin image serving resolved
- Database integration for metadata storage
- Real-time file serving with proper caching headers

## 🤝 Contributing

This is part of the DAILEY ecosystem separation project. See the main tracking issue for coordination.

## 📄 License

UNLICENSED - Internal DAILEY Software project
