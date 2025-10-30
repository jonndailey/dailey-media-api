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
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || 'dailey-media',
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: (() => {
        const rawValue = process.env.S3_FORCE_PATH_STYLE;
        if (typeof rawValue === 'string' && rawValue.length) {
          return rawValue.toLowerCase() === 'true';
        }
        return Boolean(process.env.S3_ENDPOINT);
      })()
    }
  },

  // Authentication
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER || 'https://core.dailey.cloud',
    audience: process.env.JWT_AUDIENCE || 'dailey-media-api',
    jwksUrl: process.env.CORE_JWKS_URL || 'https://core.dailey.cloud/.well-known/jwks.json'
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

  // Video processing
  videoProcessing: createVideoProcessingConfig(),

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

function parseVideoOutputs(value, fallback = []) {
  if (!value) {
    return [...fallback];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [...fallback];
    }

    return parsed
      .map(output => ({
        id: output.id || null,
        format: (output.format || '').toLowerCase(),
        videoCodec: output.videoCodec || output.codec || '',
        audioCodec: output.audioCodec || 'aac',
        resolution: output.resolution || null,
        bitrate: output.bitrate || null,
        audioBitrate: output.audioBitrate || null,
        preset: output.preset || null,
        crf: typeof output.crf === 'number' ? output.crf : null,
        fps: output.fps || null,
        profile: output.profile || null
      }))
      .filter(output => output.format && output.videoCodec);
  } catch (error) {
    return [...fallback];
  }
}

function createVideoProcessingConfig() {
  const defaultOutputs = [
    {
      id: '1080p_h264',
      format: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      resolution: '1920x1080',
      bitrate: '4500k',
      audioBitrate: '192k',
      profile: 'high'
    },
    {
      id: '720p_h264',
      format: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      resolution: '1280x720',
      bitrate: '2500k',
      audioBitrate: '160k',
      profile: 'main'
    },
    {
      id: '480p_vp9',
      format: 'webm',
      videoCodec: 'libvpx-vp9',
      audioCodec: 'libopus',
      resolution: '854x480',
      bitrate: '1200k',
      audioBitrate: '128k'
    }
  ];

  return {
    enabled: process.env.VIDEO_PROCESSING_ENABLED !== 'false',
    queueName: process.env.VIDEO_PROCESSING_QUEUE || 'video-processing',
    concurrency: Math.max(1, parseInt(process.env.VIDEO_PROCESSING_CONCURRENCY || '1', 10)),
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
    progressUpdateIntervalMs: Math.max(500, parseInt(process.env.VIDEO_PROGRESS_UPDATE_INTERVAL || '2000', 10)),
    allowOriginalCopy: process.env.VIDEO_ALLOW_ORIGINAL === 'true',
    defaultOutputs: parseVideoOutputs(process.env.VIDEO_DEFAULT_OUTPUTS, defaultOutputs),
    webhook: {
      enabled: process.env.VIDEO_WEBHOOKS_ENABLED !== 'false',
      timeoutMs: Math.max(1000, parseInt(process.env.VIDEO_WEBHOOK_TIMEOUT || '5000', 10)),
      maxRetries: Math.max(0, parseInt(process.env.VIDEO_WEBHOOK_MAX_RETRIES || '3', 10))
    }
  };
}

export default config;
