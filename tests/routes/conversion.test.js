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
let documentConversionServiceMock;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/conversion', router);
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
    listConversionJobs: jest.fn(),
    getConversionJob: jest.fn()
  };

  documentConversionServiceMock = {
    getSupportedConversions: jest.fn(),
    convertMediaFile: jest.fn(),
    convertBatch: jest.fn(),
    listConversions: jest.fn(),
    getConversionJob: jest.fn()
  };

  jest.unstable_mockModule('../../src/services/databaseService.js', () => ({
    default: databaseServiceMock
  }));

  jest.unstable_mockModule('../../src/services/documentConversionService.js', () => ({
    default: documentConversionServiceMock
  }));

  ({ default: router } = await import('../../src/routes/conversion.js'));
});

beforeEach(() => {
  jest.resetAllMocks();
  databaseServiceMock.isAvailable.mockReturnValue(true);
  databaseServiceMock.getMediaFile.mockResolvedValue({
    id: 'media-1',
    user_id: TEST_USER,
    storage_key: 'docs/sample.md'
  });

  documentConversionServiceMock.getSupportedConversions.mockReturnValue({
    supported: { md: ['pdf', 'html'] },
    maxBatchSize: 5,
    features: {
      watermarking: true,
      compression: true,
      security: true
    }
  });
  documentConversionServiceMock.listConversions.mockResolvedValue([]);
});

describe('GET /api/conversion/supported', () => {
  it('returns supported conversions', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/conversion/supported')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.supported).toEqual({ md: ['pdf', 'html'] });
    expect(documentConversionServiceMock.getSupportedConversions).toHaveBeenCalled();
  });
});

describe('POST /api/conversion/:mediaFileId/convert', () => {
  it('invokes conversion service and returns result', async () => {
    documentConversionServiceMock.convertMediaFile.mockResolvedValue({
      jobId: 'job-123',
      mediaFileId: 'media-1',
      targetFormat: 'pdf',
      output: {
        storageKey: 'conversions/media-1/file.pdf',
        url: 'https://example.com/file.pdf'
      }
    });

    const app = createApp();
    const response = await request(app)
      .post('/api/conversion/media-1/convert')
      .set(...AUTH_HEADER)
      .send({ targetFormat: 'pdf', options: { watermark: 'CONFIDENTIAL' } })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.result.jobId).toBe('job-123');
    expect(documentConversionServiceMock.convertMediaFile).toHaveBeenCalledWith(
      'media-1',
      'pdf',
      expect.objectContaining({ watermark: 'CONFIDENTIAL' }),
      expect.objectContaining({ requestingUserId: TEST_USER })
    );
  });
});

describe('POST /api/conversion/batch', () => {
  it('handles batch conversions', async () => {
    documentConversionServiceMock.convertBatch.mockResolvedValue({
      batchId: 'batch-1',
      count: 1,
      results: [
        {
          jobId: 'job-123',
          mediaFileId: 'media-1',
          targetFormat: 'pdf'
        }
      ]
    });

    const app = createApp();
    const response = await request(app)
      .post('/api/conversion/batch')
      .set(...AUTH_HEADER)
      .send({
        conversions: [
          { mediaFileId: 'media-1', targetFormat: 'pdf' }
        ],
        options: { watermark: 'CONFIDENTIAL' }
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.batchId).toBe('batch-1');
    expect(documentConversionServiceMock.convertBatch).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ watermark: 'CONFIDENTIAL' }),
      TEST_USER
    );
  });
});

describe('GET /api/conversion/:mediaFileId/jobs', () => {
  it('lists conversion jobs', async () => {
    documentConversionServiceMock.listConversions.mockResolvedValue([
      { id: 'job-1', status: 'completed' }
    ]);

    const app = createApp();
    const response = await request(app)
      .get('/api/conversion/media-1/jobs')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.results).toEqual([{ id: 'job-1', status: 'completed' }]);
    expect(documentConversionServiceMock.listConversions).toHaveBeenCalledWith('media-1', {
      limit: 20,
      offset: 0,
      status: null
    });
  });
});

describe('GET /api/conversion/jobs/:jobId', () => {
  it('returns job details', async () => {
    documentConversionServiceMock.getConversionJob.mockResolvedValue({
      id: 'job-1',
      media_file_id: 'media-1',
      status: 'completed'
    });

    const app = createApp();
    const response = await request(app)
      .get('/api/conversion/jobs/job-1')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.job).toEqual({
      id: 'job-1',
      media_file_id: 'media-1',
      status: 'completed'
    });
    expect(documentConversionServiceMock.getConversionJob).toHaveBeenCalledWith('job-1');
  });
});
