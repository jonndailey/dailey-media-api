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
let videoProcessingServiceMock;

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/video', router);
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
    listProcessingJobs: jest.fn(),
    getProcessingJob: jest.fn()
  };

  videoProcessingServiceMock = {
    getSupportedOutputs: jest.fn(),
    listJobs: jest.fn(),
    getJob: jest.fn(),
    createJob: jest.fn()
  };

  jest.unstable_mockModule('../../src/services/databaseService.js', () => ({
    default: databaseServiceMock
  }));

  jest.unstable_mockModule('../../src/services/videoProcessingService.js', () => ({
    default: videoProcessingServiceMock
  }));

  ({ default: router } = await import('../../src/routes/video.js'));
});

beforeEach(() => {
  jest.resetAllMocks();
  databaseServiceMock.isAvailable.mockReturnValue(true);
  databaseServiceMock.getMediaFile.mockResolvedValue({
    id: 'media-1',
    user_id: TEST_USER,
    storage_key: 'videos/demo.mp4'
  });

  videoProcessingServiceMock.getSupportedOutputs.mockReturnValue([
    { id: '1080p_h264', format: 'mp4', videoCodec: 'libx264' }
  ]);
  videoProcessingServiceMock.listJobs.mockResolvedValue([]);
  videoProcessingServiceMock.getJob.mockResolvedValue({
    id: 'job-1',
    media_file_id: 'media-1',
    status: 'queued'
  });
});

describe('GET /api/video/presets', () => {
  it('returns available presets', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/api/video/presets')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.presets).toEqual([
      expect.objectContaining({ id: '1080p_h264', format: 'mp4' })
    ]);
  });
});

describe('POST /api/video/:mediaFileId/process', () => {
  it('queues a video job', async () => {
    videoProcessingServiceMock.createJob.mockResolvedValue({
      id: 'job-1',
      mediaFileId: 'media-1',
      status: 'queued',
      progress: 0
    });

    const app = createApp();
    const response = await request(app)
      .post('/api/video/media-1/process')
      .set(...AUTH_HEADER)
      .send({ outputs: [{ preset: '1080p_h264' }] })
      .expect(202);

    expect(response.body.success).toBe(true);
    expect(response.body.job.id).toBe('job-1');
    expect(videoProcessingServiceMock.createJob).toHaveBeenCalledWith(
      'media-1',
      expect.objectContaining({ outputs: [{ preset: '1080p_h264' }] }),
      expect.objectContaining({ requestingUserId: TEST_USER })
    );
  });
});

describe('GET /api/video/:mediaFileId/jobs', () => {
  it('lists processing jobs', async () => {
    videoProcessingServiceMock.listJobs.mockResolvedValue([
      { id: 'job-1', status: 'processing' }
    ]);

    const app = createApp();
    const response = await request(app)
      .get('/api/video/media-1/jobs')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.results).toEqual([
      expect.objectContaining({ id: 'job-1', status: 'processing' })
    ]);
  });
});

describe('GET /api/video/jobs/:jobId', () => {
  it('returns job details', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/api/video/jobs/job-1')
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.job).toEqual(expect.objectContaining({ id: 'job-1' }));
    expect(videoProcessingServiceMock.getJob).toHaveBeenCalledWith('job-1');
  });
});
