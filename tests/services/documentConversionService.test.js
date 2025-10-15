import {
  jest,
  describe,
  beforeEach,
  it,
  expect
} from '@jest/globals';

let documentConversionService;
let databaseServiceMock;
let storageServiceMock;
let fileServiceMock;
let uploadedBufferRef;

const SAMPLE_MARKDOWN = `# Receipt

Total: $12.34
Thank you!`;

beforeEach(async () => {
  jest.resetModules();

  process.env.CONVERSION_ENABLE_WATERMARKING = 'true';
  process.env.CONVERSION_ENABLE_SECURITY = 'true';
  process.env.CONVERSION_ENABLE_COMPRESSION = 'true';
  process.env.CONVERSION_DEFAULT_WATERMARK = '';

  databaseServiceMock = {
    isAvailable: jest.fn().mockReturnValue(true),
    getMediaFile: jest.fn().mockResolvedValue({
      id: 'media-1',
      original_filename: 'sample.md',
      storage_key: 'docs/sample.md',
      user_id: 'user-123'
    }),
    createConversionJob: jest.fn().mockResolvedValue('job-1'),
    updateConversionJob: jest.fn().mockResolvedValue(true),
    listConversionJobs: jest.fn().mockResolvedValue([]),
    getConversionJob: jest.fn().mockResolvedValue(null)
  };

  uploadedBufferRef = null;

  storageServiceMock = {
    getFileBuffer: jest.fn().mockResolvedValue(Buffer.from(SAMPLE_MARKDOWN, 'utf8')),
    uploadFile: jest.fn(async (buffer, key, mimeType) => {
      uploadedBufferRef = buffer;
      return {
        url: `https://example.com/${key}`,
        signedUrl: null,
        access: 'private'
      };
    }),
    getAccessDetails: jest.fn()
  };

  fileServiceMock = {
    getFileTypeInfo: jest.fn().mockReturnValue({
      extension: 'md',
      category: 'document'
    })
  };

  jest.unstable_mockModule('../../src/services/databaseService.js', () => ({
    default: databaseServiceMock
  }));

  jest.unstable_mockModule('../../src/services/storageService.js', () => ({
    default: storageServiceMock
  }));

  jest.unstable_mockModule('../../src/services/fileService.js', () => ({
    default: fileServiceMock
  }));

  ({ default: documentConversionService } = await import('../../src/services/documentConversionService.js'));
});

describe('documentConversionService.convertMediaFile', () => {
  it('converts markdown to PDF and applies watermark', async () => {
    const result = await documentConversionService.convertMediaFile(
      'media-1',
      'pdf',
      { watermark: 'CONFIDENTIAL' },
      { requestingUserId: 'user-123' }
    );

    expect(result.status).toBe('completed');
    expect(result.metadata.watermarkApplied).toBe(true);
    expect(storageServiceMock.uploadFile).toHaveBeenCalled();

    const uploaded = uploadedBufferRef;
    expect(uploaded).toBeInstanceOf(Buffer);
    expect(uploaded.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('throws an error when conversion is not supported', async () => {
    fileServiceMock.getFileTypeInfo.mockReturnValueOnce({
      extension: 'txt',
      category: 'document'
    });

    await expect(
      documentConversionService.convertMediaFile(
        'media-1',
        'pdf',
        {},
        { requestingUserId: 'user-123' }
      )
    ).rejects.toThrow('Conversion from txt to pdf is not supported');
  });
});
