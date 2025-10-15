import fs from 'fs';
import path from 'path';
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import ffmpeg from 'fluent-ffmpeg';
import mime from 'mime-types';
import { nanoid } from 'nanoid';
import config from '../config/index.js';
import databaseService from './databaseService.js';
import storageService from './storageService.js';
import fileService from './fileService.js';
import { logInfo, logError, logWarning } from '../middleware/logger.js';

const videoConfig = config.videoProcessing;
const DEFAULT_PROGRESS_INTERVAL = videoConfig.progressUpdateIntervalMs || 2000;
const SUPPORTED_FORMATS = new Set(['mp4', 'webm']);
const DEFAULT_AUDIO_CODEC = {
  mp4: 'aac',
  webm: 'libopus'
};

if (videoConfig.ffmpegPath) {
  ffmpeg.setFfmpegPath(videoConfig.ffmpegPath);
}

if (videoConfig.ffprobePath) {
  ffmpeg.setFfprobePath(videoConfig.ffprobePath);
}

const defaultOutputs = (videoConfig.defaultOutputs || []).map(output => ({
  ...output,
  videoCodec: output.videoCodec || output.codec || (output.format === 'webm' ? 'libvpx-vp9' : 'libx264'),
  audioCodec: output.audioCodec || DEFAULT_AUDIO_CODEC[output.format] || 'aac'
}));

const presetIndex = new Map(
  defaultOutputs
    .filter(output => output.id)
    .map(output => [output.id, output])
);

function createRedisConnection() {
  const redisUrl = config.redisUrl;
  if (!redisUrl) {
    throw new Error('Redis URL not configured');
  }

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
}

function parseOutputRequest(request = {}) {
  const baseFormat = (request.format || request.container || '').toLowerCase();
  const format = baseFormat || null;
  const preset = request.preset || request.id || null;

  const presetMatch = preset ? presetIndex.get(preset) : null;

  if (presetMatch) {
    return {
      ...presetMatch,
      id: presetMatch.id || preset || `${presetMatch.format}_${presetMatch.videoCodec}`,
      format: presetMatch.format,
      videoCodec: request.videoCodec || request.codec || presetMatch.videoCodec,
      audioCodec: request.audioCodec || presetMatch.audioCodec || DEFAULT_AUDIO_CODEC[presetMatch.format] || 'aac',
      resolution: request.resolution || presetMatch.resolution || null,
      bitrate: request.bitrate || presetMatch.bitrate || null,
      audioBitrate: request.audioBitrate || presetMatch.audioBitrate || null,
      crf: typeof request.crf === 'number' ? request.crf : presetMatch.crf || null,
      fps: request.fps || presetMatch.fps || null,
      profile: request.profile || presetMatch.profile || null
    };
  }

  return {
    id: request.id || preset || `${format || 'mp4'}_${request.videoCodec || request.codec || ''}`,
    format,
    videoCodec: request.videoCodec || request.codec || (format === 'webm' ? 'libvpx-vp9' : 'libx264'),
    audioCodec: request.audioCodec || DEFAULT_AUDIO_CODEC[format] || 'aac',
    resolution: request.resolution || null,
    bitrate: request.bitrate || null,
    audioBitrate: request.audioBitrate || null,
    crf: typeof request.crf === 'number' ? request.crf : null,
    fps: request.fps || null,
    profile: request.profile || null
  };
}

function resolveOutputs(requestOutputs = []) {
  if (!Array.isArray(requestOutputs) || !requestOutputs.length) {
    return defaultOutputs.length ? [...defaultOutputs] : [];
  }

  return requestOutputs
    .map(output => parseOutputRequest(output))
    .filter(output => output.format && SUPPORTED_FORMATS.has(output.format));
}

function ensureDirectory(dir) {
  return fs.promises.mkdir(dir, { recursive: true });
}

function getMimeTypeForFormat(format) {
  if (format === 'webm') return 'video/webm';
  if (format === 'mp4') return 'video/mp4';
  return mime.getType(format) || 'application/octet-stream';
}

function createOutputFilename(base, index, output) {
  const ext = output.format || 'mp4';
  const label = output.id || `${output.format}-${output.videoCodec || 'codec'}`;
  return `${base}-${index}-${label}.${ext}`;
}

function probeVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, data) => {
      if (error) {
        return reject(error);
      }
      resolve(data);
    });
  });
}

function analyseStreams(probeData) {
  if (!probeData) {
    return {
      duration: null,
      size: null,
      video: null,
      audio: null
    };
  }

  const videoStream = probeData.streams?.find(stream => stream.codec_type === 'video') || null;
  const audioStream = probeData.streams?.find(stream => stream.codec_type === 'audio') || null;

  return {
    duration: probeData.format?.duration ? Number(probeData.format.duration) : null,
    size: probeData.format?.size ? Number(probeData.format.size) : null,
    video: videoStream
      ? {
          codec: videoStream.codec_name || null,
          width: videoStream.width || null,
          height: videoStream.height || null,
          fps: videoStream.avg_frame_rate || videoStream.r_frame_rate || null,
          bitrate: videoStream.bit_rate ? Number(videoStream.bit_rate) : null
        }
      : null,
    audio: audioStream
      ? {
          codec: audioStream.codec_name || null,
          channels: audioStream.channels || null,
          sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
          bitrate: audioStream.bit_rate ? Number(audioStream.bit_rate) : null
        }
      : null
  };
}

async function sendWebhook(webhookUrl, payload, attempt = 1) {
  if (!webhookUrl || videoConfig.webhook.enabled === false) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), videoConfig.webhook.timeoutMs || 5000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }
  } catch (error) {
    if (attempt <= (videoConfig.webhook.maxRetries || 0)) {
      const delay = Math.min(1000 * attempt, 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendWebhook(webhookUrl, payload, attempt + 1);
    }

    logWarning('Video processing webhook failed', {
      webhookUrl,
      error: error.message
    });
  }
}

async function transcodeVariant(inputPath, outputPath, outputConfig, onProgress) {
  await ensureDirectory(path.dirname(outputPath));

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .output(outputPath)
      .format(outputConfig.format)
      .videoCodec(outputConfig.videoCodec)
      .audioCodec(outputConfig.audioCodec)
      .on('progress', progress => {
        if (typeof onProgress === 'function') {
          onProgress(progress);
        }
      })
      .on('error', reject)
      .on('end', resolve);

    if (outputConfig.resolution) {
      command.size(outputConfig.resolution);
    }

    if (outputConfig.bitrate) {
      command.videoBitrate(outputConfig.bitrate);
    }

    if (outputConfig.audioBitrate) {
      command.audioBitrate(outputConfig.audioBitrate);
    }

    if (outputConfig.fps) {
      command.fps(outputConfig.fps);
    }

    if (outputConfig.profile) {
      command.outputOptions(['-profile:v', outputConfig.profile]);
    }

    if (typeof outputConfig.crf === 'number') {
      command.outputOptions(['-crf', String(outputConfig.crf)]);
    }

    if (outputConfig.format === 'mp4') {
      command.outputOptions(['-movflags', '+faststart']);
    }

    command.run();
  });
}

class VideoProcessingService {
  constructor() {
    this.queue = null;
    this.worker = null;
    this.queueEvents = null;
    this.initialized = false;
    this.operational = false;
  }

  isEnabled() {
    return videoConfig.enabled !== false;
  }

  isOperational() {
    return this.operational;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (!this.isEnabled()) {
      logInfo('Video processing disabled via configuration');
      return;
    }

    if (process.env.NODE_ENV === 'test') {
      logInfo('Video processing worker not started in test environment');
      this.operational = false;
      return;
    }

    try {
      this.queue = new Queue(videoConfig.queueName, {
        connection: createRedisConnection()
      });

      this.queueEvents = new QueueEvents(videoConfig.queueName, {
        connection: createRedisConnection()
      });

      this.worker = new Worker(
        videoConfig.queueName,
        job => this.handleJob(job),
        {
          concurrency: Math.max(1, videoConfig.concurrency || 1),
          connection: createRedisConnection()
        }
      );

      this.queueEvents.on('failed', event => {
        logError(new Error(event.failedReason || 'Video job failed'), {
          context: 'videoProcessing.queueFailed',
          jobId: event.jobId
        });
      });

      this.worker.on('error', error => {
        logError(error, { context: 'videoProcessing.workerError' });
      });

      this.operational = true;
      logInfo('Video processing service initialized', {
        queue: videoConfig.queueName,
        concurrency: videoConfig.concurrency
      });
    } catch (error) {
      logError(error, { context: 'videoProcessing.initialize' });
      this.operational = false;
    }
  }

  async handleJob(job) {
    const { jobId, mediaFileId, storageKey, outputs, webhookUrl } = job.data;
    const progressState = {
      totalOutputs: outputs.length,
      currentIndex: 0,
      lastUpdate: 0,
      overall: 0
    };

    let download = null;

    try {
      await databaseService.updateProcessingJob(jobId, {
        status: 'processing',
        progress: 0
      });

      download = await storageService.downloadToTempFile(storageKey, { prefix: mediaFileId });
      const tempDir = download.tempDir;
      const inputPath = download.filePath;
      const generatedOutputs = [];

      const sourceProbe = await probeVideoMetadata(inputPath).catch(() => null);
      const sourceMetadata = analyseStreams(sourceProbe);

      for (let index = 0; index < outputs.length; index += 1) {
        progressState.currentIndex = index;
        const output = outputs[index];
        const outputFilename = createOutputFilename(mediaFileId, index, output);
        const outputPath = path.join(tempDir, outputFilename);

        const onProgress = progress => {
          const now = Date.now();
          if (!progress || typeof progress.percent !== 'number') {
            return;
          }
          const localPercent = Math.min(Math.max(progress.percent, 0), 100);
          const overallPercent = ((index + (localPercent / 100)) / outputs.length) * 100;

          if (overallPercent - progressState.overall >= 1 || (now - progressState.lastUpdate) >= DEFAULT_PROGRESS_INTERVAL) {
            progressState.overall = overallPercent;
            progressState.lastUpdate = now;
            job.updateProgress(overallPercent);
            databaseService.updateProcessingJob(jobId, {
              progress: overallPercent
            }).catch(error => {
              logError(error, { context: 'videoProcessing.updateProgress', jobId });
            });
          }
        };

        await transcodeVariant(inputPath, outputPath, output, onProgress);

        const probe = await probeVideoMetadata(outputPath).catch(() => null);
        const analysis = analyseStreams(probe);

        const storageKeyOutput = `video/${mediaFileId}/${jobId}/${outputFilename}`;
        const mimeType = getMimeTypeForFormat(output.format);

        const uploadResult = await storageService.uploadFileFromPath(
          outputPath,
          storageKeyOutput,
          mimeType,
          {
            source_media_id: mediaFileId,
            type: 'video.transcode',
            job_id: jobId,
            preset: output.id || null,
            video_codec: output.videoCodec,
            audio_codec: output.audioCodec,
            resolution: output.resolution || analysis.video?.width ? `${analysis.video.width}x${analysis.video.height}` : null
          },
          { access: 'private' }
        );

        const fileStats = await fs.promises.stat(outputPath);

        generatedOutputs.push({
          id: output.id || `${output.format}_${index}`,
          format: output.format,
          videoCodec: output.videoCodec,
          audioCodec: output.audioCodec,
          storageKey: storageKeyOutput,
          size: fileStats.size,
          duration: analysis.duration,
          width: analysis.video?.width || null,
          height: analysis.video?.height || null,
          bitrate: analysis.video?.bitrate || null,
          url: uploadResult.url || null,
          signedUrl: uploadResult.signedUrl || null,
          access: uploadResult.access || 'private'
        });

        await databaseService.updateProcessingJob(jobId, {
          generated_outputs: generatedOutputs
        });
      }

      await databaseService.updateProcessingJob(jobId, {
        status: 'completed',
        progress: 100,
        metadata: {
          source: sourceMetadata
        },
        generated_outputs: generatedOutputs,
        completed_at: new Date().toISOString()
      });

      if (job?.updateProgress) {
        job.updateProgress(100).catch(() => {});
      }

      await sendWebhook(webhookUrl, {
        jobId,
        mediaFileId,
        status: 'completed',
        outputs: generatedOutputs,
        metadata: {
          source: sourceMetadata
        }
      });

      logInfo('Video processing job completed', {
        jobId,
        mediaFileId
      });
    } catch (error) {
      logError(error, {
        context: 'videoProcessing.handleJob',
        jobId,
        mediaFileId
      });

      await databaseService.updateProcessingJob(jobId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      });

      await sendWebhook(job.data.webhookUrl, {
        jobId,
        mediaFileId,
        status: 'failed',
        error: error.message
      });

      throw error;
    } finally {
      if (download?.cleanup) {
        await download.cleanup();
      }
    }
  }

  async createJob(mediaFileId, request, context = {}) {
    if (!this.isEnabled()) {
      const error = new Error('Video processing is disabled');
      error.statusCode = 503;
      throw error;
    }

    if (!this.isOperational()) {
      const error = new Error('Video processing queue is unavailable');
      error.statusCode = 503;
      throw error;
    }

    if (!databaseService.isAvailable()) {
      const error = new Error('Database unavailable for video processing');
      error.statusCode = 503;
      throw error;
    }

    const mediaFile = await databaseService.getMediaFile(mediaFileId);
    if (!mediaFile) {
      const error = new Error('Media file not found');
      error.statusCode = 404;
      throw error;
    }

    const typeInfo = fileService.getFileTypeInfo(mediaFile.original_filename || mediaFile.storage_key);
    if (typeInfo.category !== 'video') {
      const error = new Error('Media file is not a supported video type');
      error.statusCode = 400;
      throw error;
    }

    const outputs = resolveOutputs(request?.outputs);
    if (!outputs.length) {
      const error = new Error('No valid output formats specified for processing');
      error.statusCode = 400;
      throw error;
    }

    const jobId = await databaseService.createProcessingJob({
      media_file_id: mediaFileId,
      type: 'video.transcode',
      status: 'queued',
      progress: 0,
      input_storage_key: mediaFile.storage_key,
      requested_outputs: outputs,
      metadata: {
        requestedBy: context.requestingUserId || null,
        webhookUrl: request?.webhookUrl || null
      },
      webhook_url: request?.webhookUrl || null,
      created_by: context.requestingUserId || mediaFile.user_id
    });

    await this.queue.add(
      `transcode-${jobId}`,
      {
        jobId,
        mediaFileId,
        storageKey: mediaFile.storage_key,
        outputs,
        webhookUrl: request?.webhookUrl || null
      },
      {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    logInfo('Video processing job enqueued', {
      jobId,
      mediaFileId,
      outputs: outputs.length
    });

    return {
      id: jobId,
      mediaFileId,
      status: 'queued',
      progress: 0,
      outputs,
      webhookUrl: request?.webhookUrl || null
    };
  }

  async getJob(jobId) {
    return databaseService.getProcessingJob(jobId);
  }

  async listJobs(mediaFileId, options = {}) {
    return databaseService.listProcessingJobs(mediaFileId, options);
  }

  getSupportedOutputs() {
    return defaultOutputs;
  }
}

export default new VideoProcessingService();
