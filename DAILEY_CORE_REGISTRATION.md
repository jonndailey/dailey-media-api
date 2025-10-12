# Dailey Media API - DAILEY CORE Registration

This document explains how to register the Dailey Media API with DAILEY CORE authentication service.

## Prerequisites

1. DAILEY CORE must be running on `http://localhost:3002`
2. Access to the DAILEY CORE database
3. Admin credentials for DAILEY CORE

## Registration Steps

### 1. Connect to DAILEY CORE Database

```bash
# Connect to MySQL database (adjust connection details as needed)
mysql -u root -p dailey_core_auth
```

### 2. Register Dailey Media API in Apps Table

Execute the following SQL command to register the Dailey Media API:

```sql
-- Generate a UUID for the Dailey Media API
SET @app_uuid = UUID();

-- Insert the Dailey Media API app registration
INSERT INTO apps (
    id, 
    tenant_id, 
    name, 
    slug, 
    client_id, 
    client_secret_hash, 
    redirect_uris, 
    status,
    description,
    homepage_url,
    created_at,
    updated_at
) VALUES (
    @app_uuid,
    '11111111-1111-1111-1111-111111111111',  -- Default Dailey tenant
    'Dailey Media API',
    'dailey-media-api',
    'dailey-media-api-client',
    '$2b$12$placeholder_hash',  -- Placeholder hash (not used for this integration)
    '["http://localhost:5174", "http://100.105.97.19:5174", "http://localhost:5173"]',  -- Frontend URLs
    'active',
    'Universal file storage API for the DAILEY ecosystem',
    'http://localhost:5174',
    NOW(),
    NOW()
) ON DUPLICATE KEY UPDATE 
    name = VALUES(name),
    description = VALUES(description),
    redirect_uris = VALUES(redirect_uris),
    updated_at = NOW();

-- Verify the app was created
SELECT id, name, slug, status, created_at FROM apps WHERE slug = 'dailey-media-api';
```

### 3. Update DAILEY CORE CORS Configuration

Add the Dailey Media API frontend URL to DAILEY CORE's CORS whitelist:

#### Option A: Environment Variable (Recommended)
Add to DAILEY CORE's `.env` file:
```bash
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:22001,http://localhost:5174,http://100.105.97.19:5174
```

#### Option B: Code Update
In DAILEY CORE's server configuration (`/backend/src/server.js`), update the CORS options:

```javascript
const corsOptions = {
  origin: [
    'http://localhost:3001',      // DAILEY CORE frontend
    'http://localhost:22001',     // DAILEY CLOUD frontend
    'http://localhost:5174',      // Dailey Media API frontend (dev)
    'http://100.105.97.19:5174',  // Dailey Media API frontend (Tailscale)
    'http://100.105.97.19:*'      // Tailscale access pattern
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization',
    'X-Application',    // Required for audit log context
    'X-App-Name',       // Required for audit log context  
    'X-Client-Id'       // Optional client identification
  ]
};
```

### 4. Test Authentication Integration

After registration, test the integration:

```bash
# 1. Start DAILEY CORE (port 3002)
cd /path/to/dailey-core && npm run dev

# 2. Start Dailey Media API backend (port 4000)
cd /path/to/dailey-media-api && npm run dev

# 3. Start Dailey Media API frontend (port 5174)
cd /path/to/dailey-media-api/web && npm run dev

# 4. Test login at http://localhost:5174
# Use admin credentials: admin@dailey.cloud / demo123
```

### 5. Verify Integration

1. **Frontend Login**: Navigate to `http://localhost:5174` and verify the login form appears
2. **Authentication**: Login with `admin@dailey.cloud` / `demo123`
3. **API Access**: Verify that authenticated API calls work (check browser network tab)
4. **Audit Logs**: Check DAILEY CORE audit logs for proper application context

## Configuration Details

### App Information
- **Name**: Dailey Media API
- **Slug**: dailey-media-api
- **Client ID**: dailey-media-api-client
- **Type**: Universal file storage API
- **Tenant**: Dailey LLC (default tenant)

### Authentication URLs
- **DAILEY CORE**: http://localhost:3002
- **Backend API**: http://localhost:5173
- **Frontend**: http://localhost:5174
- **Tailscale Frontend**: http://100.105.97.19:5174

### Required Scopes/Roles
- **Upload Files**: `user`, `api.write`, `core.admin`, `tenant.admin`
- **View Files**: `user`, `api.read`, `api.write`, `core.admin`, `tenant.admin`
- **View Analytics**: `core.admin`, `tenant.admin`, `analytics.viewer`

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure Dailey Media API frontend URL is in DAILEY CORE's CORS whitelist
2. **Login Fails**: Verify DAILEY CORE is running and accessible at http://localhost:3002
3. **API 401 Errors**: Check that the DAILEY CORE auth middleware is properly validating tokens
4. **Missing Audit Context**: Ensure requests include `X-Application: Dailey Media API` header

### Debug Commands

```bash
# Check DAILEY CORE health
curl http://localhost:3002/api/docs/health

# Test DAILEY CORE login
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@dailey.cloud", "password": "demo123"}'

# Test Dailey Media API with auth
TOKEN="your-token-here"
curl -X GET http://localhost:5173/api/files \
  -H "Authorization: Bearer $TOKEN"

# Check app registration in database
mysql -u root -p dailey_core_auth -e "SELECT * FROM apps WHERE slug = 'dailey-media-api';"
```

## Security Notes

- The `client_secret_hash` is not used in this JWT-based integration
- All authentication is handled through DAILEY CORE JWT tokens
- API key system has been completely replaced with DAILEY CORE authentication
- File access is controlled through user roles and permissions

## Integration Complete

Once these steps are complete, the Dailey Media API will be fully integrated with DAILEY CORE authentication, providing:

- ✅ Centralized user authentication
- ✅ Role-based access control (RBAC)
- ✅ Audit logging with proper application context
- ✅ Secure token-based API access
- ✅ User-specific analytics tracking