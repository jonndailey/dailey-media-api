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
- **Document Intelligence**: Tesseract-powered OCR with PDF rasterization, 10+ language models, structured data extraction, and confidence scoring
- **Document Conversion**: LibreOffice-backed Office → PDF conversion plus Markdown/HTML rendering with watermarking options
- **Video Processing**: FFmpeg-powered transcoding with multi-output presets, progress tracking, and webhooks
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

## 🔧 Configuration

### Port Configuration
**IMPORTANT**: The application uses the following ports:
- **Backend API**: Port `4100` (not 4000, which may conflict with other services)
- **Frontend Dev Server**: Port `5174` (Vite development server)
- **Backend Health**: Accessible at `http://localhost:4100/health`
- **Frontend**: Accessible at `http://localhost:5174` or `http://YOUR_TAILSCALE_IP:5174`

### Environment Variables
Create a `.env` file in the root directory:
```bash
# Backend Configuration
PORT=4100  # MUST be 4100 to avoid conflicts
HOST=0.0.0.0
NODE_ENV=development

# Storage
STORAGE_TYPE=s3
# Replace 127.0.0.1 with your Tailscale IP if other devices need access (e.g. http://100.105.97.19:9000)
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=dailey-media
S3_ACCESS_KEY_ID=dailey
S3_SECRET_ACCESS_KEY=dailey-secret
# Leave blank to let the app choose a sensible default (true when endpoint is present)
S3_FORCE_PATH_STYLE=

# Development
DISABLE_AUTH=true
LOG_LEVEL=debug
VIDEO_PROCESSING_ENABLED=false  # Enable only when Redis + FFmpeg are configured

# CORS (update with your IPs)
CORS_ORIGINS=http://localhost:3005,http://localhost:3000,http://localhost:5174,http://YOUR_TAILSCALE_IP:5174
```

> OCR tuning: adjust `OCR_SUPPORTED_LANGUAGES`, `OCR_DEFAULT_LANGUAGES`, `OCR_MAX_LANGUAGES`, `OCR_ENABLE_SEARCHABLE_PDF`, and `OCR_ENABLE_STRUCTURED_DATA` in `.env` to customise language availability and response payloads.
> Conversion tuning: set `LIBREOFFICE_BINARY`, `CONVERSION_SUPPORTED_MAP`, `CONVERSION_MAX_BATCH`, `CONVERSION_ENABLE_WATERMARKING`, `CONVERSION_DEFAULT_WATERMARK`, and `CONVERSION_ENABLE_SECURITY` to control document conversion behaviour.
> Video processing tuning: configure `VIDEO_PROCESSING_ENABLED`, `VIDEO_PROCESSING_CONCURRENCY`, `FFMPEG_PATH`, `FFPROBE_PATH`, `VIDEO_DEFAULT_OUTPUTS`, and `VIDEO_WEBHOOK_MAX_RETRIES` to shape the transcoding pipeline. Redis is required for queue processing; leave `VIDEO_PROCESSING_ENABLED=false` locally if Redis isn’t running.

### PM2 Configuration
The `ecosystem.config.cjs` file manages the PM2 processes:
- Backend runs on port `4100` (defined in ecosystem config)
- Frontend proxies API calls to backend
- Use `pm2 start ecosystem.config.cjs` to start both services

## 🚀 Quick Start

### Installation
```bash
# Install dependencies
npm install
cd web && npm install

# Copy environment template
cp .env.example .env

# Start with PM2
pm2 start ecosystem.config.cjs

# Or start individually
pm2 start ecosystem.config.cjs --only dmapi-backend
pm2 start ecosystem.config.cjs --only dmapi-frontend
```

### Local MinIO (Development)

Install the MinIO server binary and run it alongside the API:

```bash
npm run minio:install
npm run minio
```

The MinIO server listens on `http://127.0.0.1:9000` (S3 API) and `http://127.0.0.1:9001` (web console). Default credentials are `dailey` / `dailey-secret`; override them with `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` in your `.env`.

### Migrate Existing Local Media

After MinIO is running and `STORAGE_TYPE` is set to `s3`, copy the legacy filesystem storage into the MinIO bucket:

```bash
npm run migrate:local-s3
# Optional flags:
#   --dry-run        Preview actions without uploading
#   --skip-existing  Keep existing objects untouched
```

By default the script walks `./storage`, recreates keys like `files/{userId}/{bucketId}/...`, and preserves metadata sidecars. Replace `127.0.0.1` with your Tailscale IP in `.env` so remote devices resolve signed URLs.

### Verify Services
```bash
# Check backend health
curl http://localhost:4100/health

# Check frontend
curl http://localhost:5174/

# Test API proxy
curl http://localhost:5174/api/upload/formats
```

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

### Text Extraction (OCR)
- `GET /api/ocr/languages` - Inspect supported languages and OCR capabilities
- `POST /api/ocr/:mediaFileId/extract` - Run OCR on a media file with optional language/output overrides
- `GET /api/ocr/:mediaFileId/results` - List stored OCR runs for a media file
- `GET /api/ocr/:mediaFileId/results/latest` - Retrieve the most recent OCR payload
- `GET /api/ocr/results/:resultId/pdf` - Fetch signed access details for the generated searchable PDF

> PDFs are rasterized server-side (first page only) before OCR. If rendering fails because of a malformed/encrypted document, the API responds with `422` so clients can retry or alert the user. Structured payloads (key/value pairs, tabular data, and checkboxes) are returned by default and can be disabled per request.

### Document Conversion
- `GET /api/conversion/supported` - Discover supported source/target format combinations
- `POST /api/conversion/:mediaFileId/convert` - Convert a single media file to another format
- `POST /api/conversion/batch` - Run a batch of conversions with shared defaults
- `POST /api/conversion/from-url` - Import a document from a URL and convert in one step
- `GET /api/conversion/:mediaFileId/jobs` - List conversion history for a media item
- `GET /api/conversion/jobs/:jobId` - Inspect a specific conversion job record

> Office → PDF conversions rely on LibreOffice (headless). Install `soffice` on the host or set `LIBREOFFICE_BINARY` so the service can locate it. Watermarking and metadata stripping are available when enabled in configuration.

### PDF Operations
- `GET /api/pdf/capabilities` - List supported PDF operations and parameters
- `POST /api/pdf/merge` - Merge multiple PDFs into a single document
- `POST /api/pdf/split/:mediaFileId` - Split a PDF into parts by page ranges
- `POST /api/pdf/rotate/:mediaFileId` - Rotate selected pages by angle (e.g. 90/180/270)
- `POST /api/pdf/compress/:mediaFileId` - Compress/optimize PDF (profiles: screen, ebook, prepress)
- `POST /api/pdf/stamp/:mediaFileId` - Stamp header/footer text, page numbers, and/or an image
- `POST /api/pdf/watermark/:mediaFileId` - Apply text watermark to selected pages
- `POST /api/pdf/flatten/:mediaFileId` - Flatten forms (and annotations where possible)
- `POST /api/pdf/images/:mediaFileId` - Export PDF pages to images (png/jpg, dpi)
- `POST /api/pdf/security/:mediaFileId` - Set/remove passwords and permissions (Ghostscript)
- `GET /api/pdf/forms/:mediaFileId/fields` - List PDF form fields (name/type/value)
- `POST /api/pdf/forms/:mediaFileId/fill` - Fill form fields and optionally flatten

### Image Transform
- `GET /api/files/:id/transform` - On-demand image resize/format with `width`, `height`, `format`, `quality`, and `fit`

### Video Processing
- `GET /api/video/presets` - Inspect available transcoding presets and defaults
- `POST /api/video/:mediaFileId/process` - Queue a media file for transcoding/transmuxing
- `GET /api/video/:mediaFileId/jobs` - List processing history for a source asset
- `GET /api/video/jobs/:jobId` - Retrieve detailed status for a specific processing job

> FFmpeg must be installed on the host (or provided via `FFMPEG_PATH`/`FFPROBE_PATH`). Jobs run asynchronously via Redis + BullMQ with webhook callbacks on completion or failure.

### File Serving
- `GET /api/serve/files/:userId/:bucketId/*` - Serve files with nested path support
- `GET /api/serve/files/:id/content` - Serve file by ID (authenticated)
- `POST /api/serve/files/:id/public-link` - Generate public access URL
- `GET /api/serve/public/:token` - Access files via public link

## Production Auth/CORS and Cloudflare

- Frontend → Core (direct): In production the web UI calls DAILEY CORE directly over HTTPS.
  - Set `web/.env.production`:
    - `VITE_CORE_AUTH_URL=https://core.dailey.cloud`
    - `VITE_MEDIA_API_URL=https://media.dailey.cloud`
  - Ensure CORS on CORE allows `https://media.dailey.cloud` with `credentials: true`.
  - Handle `OPTIONS` preflight on `/auth/*` and set `Access-Control-Allow-Headers` to include
    `Content-Type, Authorization, X-Application, X-App-Name, X-Client-Id`.

- Cloudflare SSL/TLS mode: Use “Full (strict)” for both Core and Media domains to prevent redirect loops.
  - Do not proxy Core via `/core` on the media origin unless you have a specific reason; direct CORS is simpler and safer.

- Nginx (origin) proxy headers for DMAPI:
  - Always forward `Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Host, X-Forwarded-Proto` to the backend.
  - Use `try_files $uri $uri/ /index.html;` for the UI.

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

4. **Initialize the MySQL database**
   ```bash
   # Add your DATABASE_URL credentials in .env first
   npm run migrate
   ```
   The migration script will create all tables and seed default records (system app, dev users). If you rely on the built-in `DISABLE_AUTH=true` fallback, ensure the `users` table contains the `test-user-id` row:
   ```sql
   INSERT INTO users (id, external_id, email, display_name)
   VALUES ('test-user-id', 'test-user-id', 'test@example.com', 'Test User')
   ON DUPLICATE KEY UPDATE email = VALUES(email);
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

#### PM2 Startup on Boot

To make sure the API and companion services restart automatically after a reboot, run the helper script and follow the printed instructions:

```bash
./scripts/pm2-ensure-startup.sh
```

The script starts the processes defined in `ecosystem.config.cjs`, saves the PM2 process list, and outputs the `sudo pm2 startup` command you need to execute once. After running that command, PM2 will resurrect the saved processes on every server restart. Check the status with `npx pm2 status` whenever you need to confirm the processes are registered.

> Note: The `dmapi-frontend` PM2 app proxies `/api` to the URL defined in `VITE_MEDIA_API_URL` (defaults to `http://localhost:4000`). The API runs under the `dmapi-backend` PM2 process, so both process names start with `dmapi`. If you change the backend port, update that environment variable so the proxy keeps working.

The API will be available at `http://localhost:4000` (Backend) and `http://localhost:5174` (Frontend)

**For Tailscale/Network Access**: Use `http://100.105.97.19:4000` (Backend)

## 🏃‍♂️ Quick Start

Test the API endpoints:

```bash
# Health check
curl http://localhost:4000/health

# API information  
curl http://localhost:4000/api

# Upload a file
ACCESS_TOKEN="paste-token-here"
curl -X POST http://localhost:4000/api/upload \
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
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:4000/api/media
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

#### Frontend Proxy ECONNREFUSED
1. **Confirm Backend Port**: The API listens on `PORT` (default `4000`). Make sure the PM2 `dmapi-backend` process is running and not reporting `EADDRINUSE` in `logs/dmapi-backend-error.log`.
2. **Update Proxy Target**: Set `VITE_MEDIA_API_URL` to match the API URL (for local dev: `http://localhost:4000`) so the Vite dev server proxies correctly.
3. **Avoid Duplicate Servers**: Stop any `npm run dev` instances before starting PM2 to prevent port conflicts on the API port.

### Environment Variables
Key environment variables for proper operation:
```env
NODE_ENV=development
PORT=4100
HOST=0.0.0.0
VITE_MEDIA_API_URL=http://localhost:4100

# Storage Configuration
STORAGE_TYPE=s3
# Replace 127.0.0.1 with your Tailscale IP if other devices need access (e.g. http://100.105.97.19:9000)
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=dailey-media
S3_ACCESS_KEY_ID=dailey
S3_SECRET_ACCESS_KEY=dailey-secret
S3_FORCE_PATH_STYLE=

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
