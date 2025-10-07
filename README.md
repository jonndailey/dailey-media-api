# Dailey Media API

Standalone media API for the DAILEY ecosystem - handles file uploads, processing, and delivery across all Dailey applications.

## 🚀 Features

- **Multi-format Support**: Handles standard image formats (JPEG, PNG, GIF, WebP) and professional formats (RAW, HEIC, TIFF)
- **Image Processing**: Automatic thumbnail generation and on-demand transformations
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
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:4000`

## 🏃‍♂️ Quick Start

Test the API endpoints:

```bash
# Health check
curl http://localhost:4000/health

# API information
curl http://localhost:4000/api

# Upload a file (coming soon)
# curl -X POST -F "file=@image.jpg" http://localhost:4000/api/upload
```

## 🔐 Authentication

The API uses JWT tokens issued by Dailey Core. Include the token in requests:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:4000/api/media
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
- 🔄 Media utilities extraction (in progress)
- ⏳ File upload endpoints
- ⏳ JWT authentication
- ⏳ Database schema implementation
- ⏳ Image processing pipeline
- ⏳ Deployment configuration

## 🤝 Contributing

This is part of the DAILEY ecosystem separation project. See the main tracking issue for coordination.

## 📄 License

UNLICENSED - Internal DAILEY Software project