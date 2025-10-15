import express from 'express';
import request from 'supertest';
import {
  jest,
  describe,
  beforeAll,
  beforeEach,
  it,
  expect
} from '@jest/globals';

const AUTH_HEADER = ['Authorization', 'Bearer test-token'];
const TEST_USER = 'user-123';

let router;
let databaseServiceMock;
let ocrServiceMock;
let storageServiceMock;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ocr', router);
  return app;
};

beforeAll(async () => {
  jest.unstable_mockModule('../../src/middleware/dailey-auth.js', () => {
    const authenticateToken = (req, res, next) => {
      if (req.headers.authorization === AUTH_HEADER[1]) {
        req.userId = TEST_USER;
        req.userRoles = ['user', 'api.read', 'api.write'];
        return next();
      }
      return res.status(401).json({ success: false, error: 'Authentication required' });
    };

    return {
      authenticateToken,
      requireScope: () => (req, res, next) => {
        if (!req.userRoles?.length) {
          return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }
        return next();
      },
      requireRole: () => (req, res, next) => next(),
      requireAnyRole: () => (req, res, next) => next(),
      optionalAuth: (req, res, next) => next()
    };
  });

  databaseServiceMock = {
    isAvailable: jest.fn().mockReturnValue(true),
    getMediaFile: jest.fn(),
    getLatestOcrResult: jest.fn(),
    listOcrResults: jest.fn(),
    getOcrResult: jest.fn()
  };

  ocrServiceMock = {
    performOcr: jest.fn(),
    getSupportedLanguages: jest.fn(),
    getCapabilities: jest.fn()
  };

  storageServiceMock = {
    getAccessDetails: jest.fn().mockResolvedValue({
      access: 'private',
      publicUrl: null,
      signedUrl: 'signed-url'
    })
  };

  jest.unstable_mockModule('../../src/services/databaseService.js', () => ({
    default: databaseServiceMock
  }));

  jest.unstable_mockModule('../../src/services/ocrService.js', () => ({
    default: ocrServiceMock
  }));

  jest.unstable_mockModule('../../src/services/storageService.js', () => ({
    default: storageServiceMock
  }));

  ({ default: router } = await import('../../src/routes/ocr.js'));
});

beforeEach(() => {
  jest.resetAllMocks();

  databaseServiceMock.isAvailable.mockReturnValue(true);
  databaseServiceMock.getMediaFile.mockResolvedValue({
    id: 'media-1',
    user_id: TEST_USER,
    is_public: false
  });
  databaseServiceMock.getLatestOcrResult.mockResolvedValue(null);
  databaseServiceMock.listOcrResults.mockResolvedValue([]);
  databaseServiceMock.getOcrResult.mockResolvedValue(null);

  ocrServiceMock.getSupportedLanguages.mockReturnValue([
    { code: 'eng', name: 'English', nativeName: 'English', default: true },
    { code: 'spa', name: 'Spanish', nativeName: 'Espanol', default: false }
  ]);
  ocrServiceMock.getCapabilities.mockReturnValue({
    maxLanguagesPerRequest: 3,
    searchablePdf: true,
    structuredData: true
  });
  storageServiceMock.getAccessDetails.mockResolvedValue({
    access: 'private',
    publicUrl: null,
    signedUrl: 'signed-url'
  });
});

describe('GET /api/ocr/languages', () => {
  it('returns supported languages and capabilities', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/ocr/languages')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.languages).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'eng', default: true }),
      expect.objectContaining({ code: 'spa', default: false })
    ]));
    expect(response.body.capabilities).toEqual(expect.objectContaining({
      maxLanguagesPerRequest: 3,
      searchablePdf: true,
      structuredData: true
    }));
  });
});

describe('POST /api/ocr/:mediaFileId/extract', () => {
  it('returns cached result when available without reprocessing', async () => {
    databaseServiceMock.getLatestOcrResult.mockResolvedValue({
      id: 'ocr-1',
      text: 'cached',
      metadata: {
        receiptSuggestions: {
          total: '45.67',
          date: '2025-10-15',
          merchant: 'Coffee Spot'
        }
      }
    });

    const app = createApp();
    const response = await request(app)
      .post('/api/ocr/media-1/extract')
      .set(...AUTH_HEADER)
      .send({})
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.cached).toBe(true);
    expect(response.body.result.id).toBe('ocr-1');
    expect(response.body.result.suggestions).toEqual({
      total: '45.67',
      date: '2025-10-15',
      merchant: 'Coffee Spot'
    });
    expect(ocrServiceMock.performOcr).not.toHaveBeenCalled();
  });

  it('invokes OCR service when force flag is set', async () => {
    databaseServiceMock.getLatestOcrResult.mockResolvedValueOnce({
      id: 'ocr-1',
      text: 'stale'
    });
    ocrServiceMock.performOcr.mockResolvedValue({
      mediaFileId: 'media-1',
      text: 'fresh result',
      structured: {
        keyValuePairs: [{ key: 'Total', value: '$12.34' }],
        tables: [],
        formFields: [],
        stats: { linesAnalyzed: 4, wordsAnalyzed: 12, textLength: 42 }
      },
      suggestions: {
        total: '12.34',
        date: null,
        merchant: 'Coffee World'
      }
    });

    const app = createApp();
    const response = await request(app)
      .post('/api/ocr/media-1/extract')
      .set(...AUTH_HEADER)
      .send({ force: true, languages: ['eng', 'spa'] })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.cached).toBe(false);
    expect(response.body.result.text).toBe('fresh result');
    expect(response.body.result.suggestions).toEqual({
      total: '12.34',
      date: null,
      merchant: 'Coffee World'
    });
    expect(response.body.result.structured).toEqual(expect.objectContaining({
      keyValuePairs: expect.any(Array),
      tables: expect.any(Array)
    }));
    expect(ocrServiceMock.performOcr).toHaveBeenCalledWith('media-1', expect.objectContaining({
      languages: ['eng', 'spa'],
      persist: true,
      requestingUserId: TEST_USER
    }));
  });
});

describe('GET /api/ocr/:mediaFileId/results', () => {
  it('returns paginated OCR results', async () => {
    databaseServiceMock.listOcrResults.mockResolvedValue([
      { id: 'ocr-1', text: 'result-1', metadata: { receiptSuggestions: { total: '10.00', date: null, merchant: null } } },
      { id: 'ocr-2', text: 'result-2', metadata: { receiptSuggestions: null } }
    ]);

    const app = createApp();
    const response = await request(app)
      .get('/api/ocr/media-1/results')
      .set(...AUTH_HEADER)
      .query({ limit: 2, offset: 0 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0].suggestions).toEqual({ total: '10.00', date: null, merchant: null });
    expect(databaseServiceMock.listOcrResults).toHaveBeenCalledWith('media-1', {
      limit: 2,
      offset: 0
    });
  });
});

describe('GET /api/ocr/:mediaFileId/results/latest', () => {
  it('returns 404 when no OCR results exist', async () => {
    databaseServiceMock.getLatestOcrResult.mockResolvedValue(null);

    const app = createApp();
    const response = await request(app)
      .get('/api/ocr/media-1/results/latest')
      .set(...AUTH_HEADER)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('No OCR results found');
  });

  it('returns latest OCR payload when available', async () => {
    databaseServiceMock.getLatestOcrResult.mockResolvedValue({
      id: 'ocr-latest',
      text: 'latest',
      metadata: {
        receiptSuggestions: { total: null, date: '2025-10-15', merchant: 'Cafe' }
      }
    });

    const app = createApp();
    const response = await request(app)
      .get('/api/ocr/media-1/results/latest')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.result.id).toBe('ocr-latest');
    expect(response.body.result.suggestions).toEqual({ total: null, date: '2025-10-15', merchant: 'Cafe' });
  });
});

describe('GET /api/ocr/results/:resultId/pdf', () => {
  it('returns signed URL for stored searchable PDF', async () => {
    databaseServiceMock.getOcrResult.mockResolvedValue({
      id: 'ocr-1',
      media_file_id: 'media-1',
      pdf_storage_key: 'ocr/media-1/result.pdf'
    });

    const app = createApp();
    const response = await request(app)
      .get('/api/ocr/results/ocr-1/pdf')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.pdf.storageKey).toBe('ocr/media-1/result.pdf');
    expect(storageServiceMock.getAccessDetails).toHaveBeenCalledWith('ocr/media-1/result.pdf', {
      access: 'private'
    });
  });
});
