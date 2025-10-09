import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5173'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Storage
  storage: {
    type: process.env.STORAGE_TYPE || 's3',
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || 'dailey-media',
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
    }
  },

  // Authentication
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER || 'https://core.dailey.dev',
    audience: process.env.JWT_AUDIENCE || 'dailey-media-api',
    jwksUrl: process.env.CORE_JWKS_URL || 'https://core.dailey.dev/.well-known/jwks.json'
  },

  // File Processing
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
    allowedFormats: (process.env.ALLOWED_FORMATS || 'jpg,jpeg,png,gif,webp,heic,heif,avif,tiff,cr2,cr3,nef,arw,dng').split(','),
    variantSizes: parseVariantSizes(process.env.VARIANT_SIZES || 'sm:640,md:1280,lg:1920')
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000')
  },

  // Monitoring
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  
  // CDN
  cdnUrl: process.env.CDN_URL,

  // Development flags
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};

function parseVariantSizes(sizesString) {
  const sizes = {};
  sizesString.split(',').forEach(sizeStr => {
    const [name, width] = sizeStr.split(':');
    if (name && width) {
      sizes[name.trim()] = parseInt(width.trim());
    }
  });
  return sizes;
}

export default config;