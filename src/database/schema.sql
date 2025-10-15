-- Dailey Media API Database Schema
-- MySQL/MariaDB Compatible

-- Users table (for future multi-tenancy)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    external_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSON,
    
    INDEX idx_users_external_id (external_id),
    INDEX idx_users_email (email),
    INDEX idx_users_created_at (created_at)
);

-- Applications table (for multi-app support)
CREATE TABLE IF NOT EXISTS applications (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    owner_user_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    settings JSON,
    
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_applications_slug (slug),
    INDEX idx_applications_owner (owner_user_id)
);

-- API Keys table (persistent storage for API keys)
CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    key_hash VARCHAR(255) UNIQUE NOT NULL, -- SHA-256 hash of the actual key
    key_prefix VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    application_id VARCHAR(36),
    permissions JSON NOT NULL, -- ['read', 'write', 'admin']
    scopes JSON NOT NULL, -- ['upload', 'media', 'transform']
    rate_limit_max_requests INT DEFAULT 100,
    rate_limit_window_ms INT DEFAULT 900000, -- 15 minutes
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    usage_count BIGINT DEFAULT 0,
    metadata JSON,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    INDEX idx_api_keys_hash (key_hash),
    INDEX idx_api_keys_user (user_id),
    INDEX idx_api_keys_app (application_id),
    INDEX idx_api_keys_active (is_active),
    INDEX idx_api_keys_expires (expires_at)
);

-- Media Collections (albums, folders, etc.)
CREATE TABLE IF NOT EXISTS media_collections (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    description TEXT,
    user_id VARCHAR(36) NOT NULL,
    application_id VARCHAR(36),
    parent_collection_id VARCHAR(36) NULL,
    visibility ENUM('public', 'private', 'shared') DEFAULT 'private',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    metadata JSON,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_collection_id) REFERENCES media_collections(id) ON DELETE CASCADE,
    INDEX idx_collections_user (user_id),
    INDEX idx_collections_app (application_id),
    INDEX idx_collections_parent (parent_collection_id),
    INDEX idx_collections_slug (slug),
    INDEX idx_collections_visibility (visibility)
);

-- Main media files table
CREATE TABLE IF NOT EXISTS media_files (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    storage_key VARCHAR(500) UNIQUE NOT NULL, -- Path/key in storage system
    original_filename VARCHAR(500) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    user_id VARCHAR(36) NOT NULL,
    application_id VARCHAR(36),
    collection_id VARCHAR(36) NULL,
    
    -- File information
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_extension VARCHAR(20) NOT NULL,
    content_hash VARCHAR(64) UNIQUE, -- SHA-256 hash for deduplication
    
    -- Image/video specific metadata
    width INT,
    height INT,
    duration_seconds DECIMAL(10,3), -- For videos
    frame_rate DECIMAL(8,3), -- For videos
    bit_rate INT, -- For videos
    color_space VARCHAR(50),
    has_transparency BOOLEAN DEFAULT FALSE,
    
    -- EXIF and technical metadata
    camera_make VARCHAR(100),
    camera_model VARCHAR(100),
    lens_model VARCHAR(100),
    focal_length DECIMAL(8,2),
    aperture DECIMAL(4,2),
    shutter_speed VARCHAR(20),
    iso_speed INT,
    flash_used BOOLEAN,
    white_balance VARCHAR(50),
    exposure_compensation DECIMAL(4,2),
    metering_mode VARCHAR(50),
    
    -- Geographic data
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    altitude DECIMAL(10, 2),
    location_name VARCHAR(255),
    
    -- Timestamps
    taken_at TIMESTAMP NULL, -- When photo/video was taken
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Status and processing
    processing_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    processing_error TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    
    -- Search and organization
    keywords TEXT, -- Comma-separated tags
    categories JSON, -- Array of category strings
    
    -- Additional metadata as JSON
    metadata JSON,
    exif_data JSON,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    FOREIGN KEY (collection_id) REFERENCES media_collections(id) ON DELETE SET NULL,
    
    -- Indexes for common queries
    INDEX idx_media_user (user_id),
    INDEX idx_media_app (application_id),
    INDEX idx_media_collection (collection_id),
    INDEX idx_media_hash (content_hash),
    INDEX idx_media_mime (mime_type),
    INDEX idx_media_size (file_size),
    INDEX idx_media_dimensions (width, height),
    INDEX idx_media_taken (taken_at),
    INDEX idx_media_uploaded (uploaded_at),
    INDEX idx_media_status (processing_status),
    INDEX idx_media_public (is_public),
    INDEX idx_media_deleted (is_deleted, deleted_at),
    INDEX idx_media_location (latitude, longitude),
    INDEX idx_media_camera (camera_make, camera_model),
    
    -- Full-text search indexes
    FULLTEXT idx_media_search (original_filename, title, description, keywords),
    FULLTEXT idx_media_keywords (keywords)
);

-- Media variants (thumbnails, resized versions, different formats)
CREATE TABLE IF NOT EXISTS media_variants (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    media_file_id VARCHAR(36) NOT NULL,
    storage_key VARCHAR(500) UNIQUE NOT NULL,
    variant_type ENUM('thumbnail', 'small', 'medium', 'large', 'xlarge', 'original', 'custom') NOT NULL,
    format VARCHAR(20) NOT NULL, -- 'jpeg', 'png', 'webp', etc.
    
    -- Variant specifications
    width INT NOT NULL,
    height INT NOT NULL,
    file_size BIGINT NOT NULL,
    quality INT, -- JPEG quality, WebP quality, etc.
    
    -- Processing information
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_settings JSON, -- Settings used to create this variant
    
    -- Status
    is_available BOOLEAN DEFAULT TRUE,
    
    FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE,
    
    INDEX idx_variants_media (media_file_id),
    INDEX idx_variants_type (variant_type),
    INDEX idx_variants_format (format),
    INDEX idx_variants_dimensions (width, height),
    INDEX idx_variants_available (is_available),
    
    -- Unique constraint to prevent duplicate variants
    UNIQUE KEY unique_variant (media_file_id, variant_type, width, height, format)
);

-- OCR results table
CREATE TABLE IF NOT EXISTS media_ocr_results (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    media_file_id VARCHAR(36) NOT NULL,
    languages JSON NOT NULL,
    text LONGTEXT,
    average_confidence DECIMAL(5,2),
    confidence_summary JSON,
    word_count INT DEFAULT 0,
    line_count INT DEFAULT 0,
    pdf_storage_key VARCHAR(500),
    request_options JSON,
    metadata JSON,
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE,
    
    INDEX idx_media_ocr_media (media_file_id),
    FULLTEXT idx_media_ocr_text (text)
);

-- Document conversion jobs
CREATE TABLE IF NOT EXISTS media_conversion_jobs (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    media_file_id VARCHAR(36) NOT NULL,
    source_format VARCHAR(20) NOT NULL,
    target_format VARCHAR(20) NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    options JSON,
    metadata JSON,
    output_storage_key VARCHAR(500),
    output_file_size BIGINT,
    output_mime_type VARCHAR(100),
    duration_ms INT,
    error_message TEXT,
    batch_id VARCHAR(36),
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    
    FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE,
    
    INDEX idx_conversion_media (media_file_id),
    INDEX idx_conversion_status (status),
    INDEX idx_conversion_batch (batch_id),
    INDEX idx_conversion_created (created_at)
);

-- Media tags (many-to-many relationship)
CREATE TABLE IF NOT EXISTS media_tags (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(7), -- Hex color code
    user_id VARCHAR(36), -- NULL for system tags
    application_id VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usage_count INT DEFAULT 0,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    
    INDEX idx_tags_slug (slug),
    INDEX idx_tags_user (user_id),
    INDEX idx_tags_app (application_id),
    INDEX idx_tags_usage (usage_count)
);

-- Junction table for media-tag relationships
CREATE TABLE IF NOT EXISTS media_file_tags (
    media_file_id VARCHAR(36) NOT NULL,
    tag_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (media_file_id, tag_id),
    FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES media_tags(id) ON DELETE CASCADE,
    
    INDEX idx_media_tags_media (media_file_id),
    INDEX idx_media_tags_tag (tag_id)
);

-- Upload sessions (for tracking batch uploads)
CREATE TABLE IF NOT EXISTS upload_sessions (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    application_id VARCHAR(36),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    status ENUM('active', 'completed', 'failed', 'cancelled') DEFAULT 'active',
    total_files INT DEFAULT 0,
    processed_files INT DEFAULT 0,
    failed_files INT DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    processed_size BIGINT DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    metadata JSON,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    
    INDEX idx_upload_sessions_user (user_id),
    INDEX idx_upload_sessions_app (application_id),
    INDEX idx_upload_sessions_token (session_token),
    INDEX idx_upload_sessions_status (status),
    INDEX idx_upload_sessions_started (started_at)
);

-- Upload session files (individual files in a batch upload)
CREATE TABLE IF NOT EXISTS upload_session_files (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    upload_session_id VARCHAR(36) NOT NULL,
    media_file_id VARCHAR(36) NULL, -- NULL until processed
    original_filename VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    error_message TEXT,
    upload_order INT,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    FOREIGN KEY (upload_session_id) REFERENCES upload_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE SET NULL,
    
    INDEX idx_upload_files_session (upload_session_id),
    INDEX idx_upload_files_media (media_file_id),
    INDEX idx_upload_files_status (status),
    INDEX idx_upload_files_order (upload_order)
);

-- Analytics and usage tracking
CREATE TABLE IF NOT EXISTS media_analytics (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    media_file_id VARCHAR(36) NOT NULL,
    event_type ENUM('view', 'download', 'transform', 'share') NOT NULL,
    user_id VARCHAR(36),
    application_id VARCHAR(36),
    ip_address VARCHAR(45), -- IPv6 compatible
    user_agent TEXT,
    referer TEXT,
    variant_type VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    
    FOREIGN KEY (media_file_id) REFERENCES media_files(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    
    INDEX idx_analytics_media (media_file_id),
    INDEX idx_analytics_user (user_id),
    INDEX idx_analytics_app (application_id),
    INDEX idx_analytics_event (event_type),
    INDEX idx_analytics_timestamp (timestamp),
    INDEX idx_analytics_variant (variant_type)
);

-- Create default admin user for development
INSERT IGNORE INTO users (id, external_id, email, display_name, metadata) VALUES 
('system', 'system', 'admin@dailey.dev', 'System Administrator', JSON_OBJECT('role', 'admin', 'environment', 'development'));

-- Create default application
INSERT IGNORE INTO applications (id, name, slug, owner_user_id, description, settings) VALUES 
('dailey-media-api', 'Dailey Media API', 'dailey-media-api', 'system', 'Default application for the Dailey Media API', JSON_OBJECT('auto_generate_thumbnails', true, 'max_file_size', 104857600));

-- Create some default media tags
INSERT IGNORE INTO media_tags (name, slug, description, color, user_id, application_id) VALUES
('Photography', 'photography', 'General photography content', '#3B82F6', NULL, 'dailey-media-api'),
('Portrait', 'portrait', 'Portrait photography', '#EF4444', NULL, 'dailey-media-api'),
('Landscape', 'landscape', 'Landscape photography', '#10B981', NULL, 'dailey-media-api'),
('Urban', 'urban', 'Urban and street photography', '#6B7280', NULL, 'dailey-media-api'),
('Nature', 'nature', 'Nature and wildlife photography', '#059669', NULL, 'dailey-media-api'),
('Architecture', 'architecture', 'Architectural photography', '#7C3AED', NULL, 'dailey-media-api'),
('Event', 'event', 'Event photography', '#F59E0B', NULL, 'dailey-media-api'),
('Product', 'product', 'Product photography', '#EC4899', NULL, 'dailey-media-api');
