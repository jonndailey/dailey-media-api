# Dailey Media API

Universal content platform API for the DAILEY ecosystem - handles all types of digital content including images, documents, videos, code, archives, and any file type across all Dailey applications.

## 🚀 Features

- **Universal File Support**: Handles ALL file types - images (JPEG, PNG, GIF, WebP, RAW, HEIC), documents (PDF, Office, text), code, archives (ZIP, TAR), videos, and any digital content
- **Smart Processing**: Automatic thumbnail generation for images, text preview extraction, metadata parsing, and file categorization
- **Secure Access**: JWT authentication with Dailey Core integration
- **Scalable Storage**: S3-compatible storage with CDN support
- **Audit Logging**: Comprehensive tracking of all media operations
- **Multi-tenant**: Supports multiple applications in the DAILEY ecosystem

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
curl -X POST -F "file=@image.jpg" http://localhost:5173/api/upload
```

## 🔐 Authentication

The API uses JWT tokens issued by Dailey Core. Include the token in requests:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:5173/api/media
```

## 📊 Database Schema

The API uses the following main tables:
- `media_files` - Primary media storage metadata
- `media_variants` - Generated thumbnails and resized versions
- `audit_logs` - Comprehensive operation tracking
- `api_keys` - System-to-system authentication

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