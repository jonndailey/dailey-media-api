import {
  jest,
  describe,
  beforeEach,
  it,
  expect
} from '@jest/globals';

let videoProcessingService;
let databaseServiceMock;
let fileServiceMock;
let queueMock;

describe('videoProcessingService.createJob', () => {
  beforeEach(async () => {
    jest.resetModules();

    process.env.VIDEO_PROCESSING_ENABLED = 'true';
    process.env.VIDEO_PROCESSING_CONCURRENCY = '1';

    databaseServiceMock = {
      isAvailable: jest.fn().mockReturnValue(true),
      getMediaFile: jest.fn().mockResolvedValue({
        id: 'media-1',
        user_id: 'user-1',
        storage_key: 'videos/source.mp4',
        original_filename: 'source.mp4'
      }),
      createProcessingJob: jest.fn().mockResolvedValue('job-1'),
      updateProcessingJob: jest.fn(),
      listProcessingJobs: jest.fn(),
      getProcessingJob: jest.fn()
    };

    fileServiceMock = {
      getFileTypeInfo: jest.fn().mockReturnValue({
        category: 'video',
        extension: 'mp4'
      })
    };

    jest.unstable_mockModule('../../src/services/databaseService.js', () => ({
      default: databaseServiceMock
    }));

    jest.unstable_mockModule('../../src/services/storageService.js', () => ({
      default: {
        downloadToTempFile: jest.fn(),
        uploadFileFromPath: jest.fn(),
        getFileBuffer: jest.fn()
      }
    }));

    jest.unstable_mockModule('../../src/services/fileService.js', () => ({
      default: fileServiceMock
    }));

    ({ default: videoProcessingService } = await import('../../src/services/videoProcessingService.js'));

    queueMock = {
      add: jest.fn().mockResolvedValue({})
    };

    videoProcessingService.initialized = true;
    videoProcessingService.operational = true;
    videoProcessingService.queue = queueMock;
  });

  it('creates a job when video processing is available', async () => {
    const result = await videoProcessingService.createJob(
      'media-1',
      { outputs: [{ preset: '1080p_h264' }] },
      { requestingUserId: 'user-1' }
    );

    expect(result).toEqual(expect.objectContaining({
      id: 'job-1',
      mediaFileId: 'media-1',
      status: 'queued'
    }));

    expect(databaseServiceMock.createProcessingJob).toHaveBeenCalledWith(expect.objectContaining({
      media_file_id: 'media-1'
    }));

    expect(queueMock.add).toHaveBeenCalledWith(
      expect.stringContaining('transcode-'),
      expect.objectContaining({ jobId: 'job-1', mediaFileId: 'media-1' }),
      expect.any(Object)
    );
  });

  it('throws when media file is not a video', async () => {
    fileServiceMock.getFileTypeInfo.mockReturnValueOnce({
      category: 'image',
      extension: 'jpg'
    });

    await expect(
      videoProcessingService.createJob('media-1', {}, { requestingUserId: 'user-1' })
    ).rejects.toThrow('Media file is not a supported video type');
  });
});
