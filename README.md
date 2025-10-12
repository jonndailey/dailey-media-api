# Dailey Media API

🚀 **Production-Ready** secure, scalable media storage and processing API for the DAILEY ecosystem. Handles all types of digital content with enterprise-grade security, comprehensive documentation, and developer tools.

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

The API will be available at `http://localhost:5173` (Backend) and `http://localhost:5174` (Frontend)

## 🏃‍♂️ Quick Start

Test the API endpoints:

```bash
# Health check
curl http://localhost:5173/health

# API information
curl http://localhost:5173/api

# Upload a file
ACCESS_TOKEN="paste-token-here"
curl -X POST http://localhost:5173/api/upload \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@image.jpg"
```

## 🔐 Authentication

The API trusts JWT access tokens issued by Dailey Core. Authenticate with Core, then include the token in requests:

```bash
# Obtain an access token
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@dailey.cloud", "password": "demo123"}'

# Use the token with the Media API
ACCESS_TOKEN="paste-token-here"
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:5173/api/media
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

## 🚀 Deployment

The API is designed to deploy on Dailey Cloud with:
- Docker containerization
- Kubernetes orchestration
- Horizontal auto-scaling
- Health monitoring

## 📝 Development Status

- ✅ Basic project structure and Express server
- ✅ Health endpoints and middleware
- ✅ File upload endpoints (all file types)
- ✅ DAILEY CORE authentication integration
- ✅ Image processing pipeline with Sharp
- ✅ Web interface for file management
- ✅ Analytics and monitoring
- ✅ PM2 process management
- ✅ Database schema implementation
- ⏳ Deployment configuration

## 🤝 Contributing

This is part of the DAILEY ecosystem separation project. See the main tracking issue for coordination.

## 📄 License

UNLICENSED - Internal DAILEY Software project
