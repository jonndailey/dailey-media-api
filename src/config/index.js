import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4100'), // Default to 4100 to avoid conflicts
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

  // OCR
  ocr: createOcrConfig(),

  // Document conversion
  conversion: createConversionConfig(),

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

function parseLanguageList(value, fallback = []) {
  if (!value) {
    return [...fallback];
  }

  return value
    .split(/[\s,;+]+/)
    .map(code => code.trim().toLowerCase())
    .filter(Boolean);
}

function createOcrConfig() {
  const defaultSupportedLanguages = [
    'eng', // English
    'spa', // Spanish
    'fra', // French
    'deu', // German
    'ita', // Italian
    'por', // Portuguese
    'nld', // Dutch
    'pol', // Polish
    'swe', // Swedish
    'fin', // Finnish
    'tur', // Turkish
    'jpn', // Japanese
    'chi_sim' // Simplified Chinese
  ];

  const supportedLanguages = Array.from(
    new Set(parseLanguageList(process.env.OCR_SUPPORTED_LANGUAGES, defaultSupportedLanguages))
  );

  const defaultLanguages = parseLanguageList(
    process.env.OCR_DEFAULT_LANGUAGES,
    supportedLanguages.slice(0, 2)
  ).filter(code => supportedLanguages.includes(code));

  const maxLanguagesPerRequest = Math.max(
    1,
    parseInt(process.env.OCR_MAX_LANGUAGES || '3', 10)
  );

  return {
    supportedLanguages,
    defaultLanguages: defaultLanguages.length ? defaultLanguages : supportedLanguages.slice(0, 1),
    maxLanguagesPerRequest,
    enableSearchablePdf: process.env.OCR_ENABLE_SEARCHABLE_PDF !== 'false',
    enableStructuredData: process.env.OCR_ENABLE_STRUCTURED_DATA !== 'false'
  };
}

function parseKeyValuePairs(value, fallback = {}) {
  if (!value) {
    return { ...fallback };
  }

  const parsed = { ...fallback };
  value.split(',').forEach(pair => {
    const [key, rawValue] = pair.split(':');
    if (!key) return;
    parsed[key.trim()] = typeof rawValue === 'undefined'
      ? true
      : rawValue.trim().toLowerCase() === 'true'
        ? true
        : rawValue.trim().toLowerCase() === 'false'
          ? false
          : rawValue.trim();
  });

  return parsed;
}

function createConversionConfig() {
  const defaultSupportedTargets = {
    doc: ['pdf'],
    docx: ['pdf'],
    xls: ['pdf'],
    xlsx: ['pdf'],
    ppt: ['pdf'],
    pptx: ['pdf'],
    odt: ['pdf'],
    ods: ['pdf'],
    odp: ['pdf'],
    md: ['html', 'pdf'],
    markdown: ['html', 'pdf'],
    html: ['pdf'],
    htm: ['pdf']
  };

  const supportedMap = parseKeyValuePairs(
    process.env.CONVERSION_SUPPORTED_MAP,
    defaultSupportedTargets
  );

  const maxBatchSize = Math.max(
    1,
    parseInt(process.env.CONVERSION_MAX_BATCH || '10', 10)
  );

  return {
    libreOfficePath: process.env.LIBREOFFICE_BINARY || null,
    pandocPath: process.env.PANDOC_BINARY || null,
    supportedTargets: supportedMap,
    maxBatchSize,
    defaultWatermark: process.env.CONVERSION_DEFAULT_WATERMARK || null,
    enableWatermarking: process.env.CONVERSION_ENABLE_WATERMARKING !== 'false',
    enableCompression: process.env.CONVERSION_ENABLE_COMPRESSION !== 'false',
    enableSecurityOptions: process.env.CONVERSION_ENABLE_SECURITY !== 'false'
  };
}

export default config;
