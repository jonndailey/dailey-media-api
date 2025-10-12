import express from 'express';
import request from 'supertest';
import path from 'path';
import { promises as fs } from 'fs';
import {
  jest,
  describe,
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect
} from '@jest/globals';

const TEST_USER = 'jest-user';
const TEST_BUCKET = 'jest-bucket';
const STORAGE_USER_ROOT = path.join(process.cwd(), 'storage', 'files', TEST_USER);
const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
const AUTH_HEADER = ['Authorization', 'Bearer test-token'];

let bucketsRouter;
let uploadRouter;
let serveRouter;

const createBucketsApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/buckets', bucketsRouter);
  return app;
};

const createUploadApp = () => {
  const app = express();
  app.use('/api/upload', uploadRouter);
  return app;
};

const getServeContentHandlers = () => {
  const layer = serveRouter.stack.find(
    (routeLayer) => routeLayer.route?.path === '/files/:id/content'
  );
  if (!layer) {
    throw new Error('Content route not registered');
  }
  return layer.route.stack.map((stackLayer) => stackLayer.handle);
};

const createServeContentApp = () => {
  const app = express();
  const handlers = getServeContentHandlers();
  handlers.forEach((handler) => {
    app.get('/api/serve/files/:id/content', handler);
  });
  return app;
};

beforeAll(async () => {
  process.env.STORAGE_TYPE = 'local';
  process.env.NODE_ENV = 'test';

  jest.unstable_mockModule('../src/middleware/logger.js', () => ({
    logInfo: jest.fn(),
    logError: jest.fn()
  }));

  jest.unstable_mockModule('../src/middleware/dailey-auth.js', () => {
    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader === AUTH_HEADER[1]) {
        req.user = { id: TEST_USER, email: 'jest@example.com' };
        req.userId = TEST_USER;
        req.userRoles = ['user', 'api.read', 'api.write'];
        req.appId = 'jest-app';
        return next();
      }
      return res.status(401).json({ success: false, error: 'Authentication required' });
    };

    const requireScope = () => (req, res, next) => {
      if (!req.userRoles?.length) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }
      return next();
    };

    return {
      authenticateToken,
      requireScope,
      requireRole: () => (req, res, next) => next(),
      requireAnyRole: () => (req, res, next) => next(),
      optionalAuth: (req, res, next) => next()
    };
  });

  jest.unstable_mockModule('../src/services/analyticsService.js', () => ({
    default: {
      trackFileUpload: jest.fn().mockResolvedValue(undefined),
      trackFileAccess: jest.fn().mockResolvedValue(undefined)
    }
  }));

  jest.unstable_mockModule('../src/services/thumbnailService.js', () => ({
    default: {
      generateThumbnails: jest.fn().mockResolvedValue(undefined)
    }
  }));

  ({ default: bucketsRouter } = await import('../src/routes/buckets.js'));
  ({ default: uploadRouter } = await import('../src/routes/upload.js'));
  ({ default: serveRouter } = await import('../src/routes/serve.js'));
});

beforeEach(async () => {
  await fs.rm(STORAGE_USER_ROOT, { recursive: true, force: true });
  await fs.rm(path.join(UPLOADS_ROOT, 'file123_test-artifact.txt'), { force: true });
});

afterAll(async () => {
  await fs.rm(STORAGE_USER_ROOT, { recursive: true, force: true });
  await fs.rm(path.join(UPLOADS_ROOT, 'file123_test-artifact.txt'), { force: true });
});

describe('Bucket file browsing', () => {
  it('lists files at the bucket root', async () => {
    const bucketPath = path.join(STORAGE_USER_ROOT, TEST_BUCKET);
    await fs.mkdir(bucketPath, { recursive: true });
    await fs.writeFile(path.join(bucketPath, 'example.txt'), 'root-data');

    const app = createBucketsApp();
    const response = await request(app)
      .get(`/api/buckets/${TEST_BUCKET}/files`)
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.current_path).toBe('');
    const fileEntry = response.body.files.find(
      (item) => item.original_filename === 'example.txt'
    );
    expect(fileEntry).toBeDefined();
    expect(fileEntry.folder_path).toBe('');
    expect(fileEntry.storage_key.startsWith(`files/${TEST_USER}/${TEST_BUCKET}/example.txt`)).toBe(true);
  });

  it('normalizes query paths when inspecting nested folders', async () => {
    const nestedPath = path.join(STORAGE_USER_ROOT, TEST_BUCKET, 'nested');
    await fs.mkdir(nestedPath, { recursive: true });
    await fs.writeFile(path.join(nestedPath, 'photo.jpg'), 'nested');

    const app = createBucketsApp();
    const response = await request(app)
      .get(`/api/buckets/${TEST_BUCKET}/files`)
      .query({ path: '/nested/' })
      .set(...AUTH_HEADER)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.current_path).toBe('nested');
    const nestedFile = response.body.files.find(
      (item) => item.original_filename === 'photo.jpg'
    );
    expect(nestedFile).toBeDefined();
    expect(nestedFile.folder_path).toBe('nested');
    expect(nestedFile.storage_key.startsWith(`files/${TEST_USER}/${TEST_BUCKET}/nested/photo.jpg`)).toBe(true);
  });
});

describe('Upload handling', () => {
  it('stores files using normalized bucket paths', async () => {
    const app = createUploadApp();

    const response = await request(app)
      .post('/api/upload')
      .set(...AUTH_HEADER)
      .field('bucket_id', 'assets')
      .field('folder_path', '/photos/events/')
      .attach('file', Buffer.from('upload-body'), 'sample.txt')
      .expect(200);

    expect(response.body.success).toBe(true);
    const { file } = response.body;
    expect(file.original.key.startsWith(`files/${TEST_USER}/assets/photos/events/`)).toBe(true);
    expect(file.metadata.folderPath).toBe('photos/events');

    const storedPath = path.join(process.cwd(), 'storage', file.original.key);
    const stats = await fs.stat(storedPath);
    expect(stats.isFile()).toBe(true);
  });
});

describe('Serve endpoint authorization', () => {
  it('denies access without authentication', async () => {
    const app = createServeContentApp();
    await request(app)
      .get('/api/serve/files/file123/content')
      .expect(401);
  });

  it('streams file content when authorized', async () => {
    await fs.mkdir(UPLOADS_ROOT, { recursive: true });
    const testFilePath = path.join(UPLOADS_ROOT, 'file123_test-artifact.txt');
    await fs.writeFile(testFilePath, 'served-content');

    const app = createServeContentApp();
    const response = await request(app)
      .get('/api/serve/files/file123/content')
      .set(...AUTH_HEADER)
      .expect(200)
      .expect('Content-Type', /text\/plain/);

    expect(response.text).toBe('served-content');
  });
});
