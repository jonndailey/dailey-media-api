# Video Processing Pipeline

DMAPI now ships with an FFmpeg-backed transcoding engine powered by Redis + BullMQ. Use it to generate streaming-ready derivatives, audio-extracted variants, and format conversions without leaving the platform.

## Capabilities

- MP4 (H.264/AAC) and WebM (VP9/Opus) presets out of the box
- Queue-based job orchestration using Redis/BullMQ with configurable concurrency
- Progress tracking persisted in MySQL and surfaced through the API
- Optional webhook callbacks on success/failure with retry backoff
- Automatic metadata capture via `ffprobe` (duration, resolution, bitrates)
- Storage integration that places new outputs under `video/{mediaId}/{jobId}/` with private ACLs by default

## API Surface

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/video/presets` | Enumerate the default output presets and codecs |
| `POST` | `/api/video/{mediaFileId}/process` | Queue a video for transcoding with custom outputs and webhook |
| `GET` | `/api/video/{mediaFileId}/jobs` | List processing history for a media asset |
| `GET` | `/api/video/jobs/{jobId}` | Retrieve the latest job status, outputs, and metadata |

### Example Request

```http
POST /api/video/a1b2c3d4/process
Authorization: Bearer <token>
Content-Type: application/json

{
  "outputs": [
    { "preset": "1080p_h264" },
    { "format": "webm", "videoCodec": "libvpx-vp9", "resolution": "1280x720", "bitrate": "1800k" }
  ],
  "webhookUrl": "https://app.example.com/hooks/video-finished"
}
```

Success response:

```json
{
  "success": true,
  "job": {
    "id": "job_01JBFC2345",
    "mediaFileId": "a1b2c3d4",
    "status": "queued",
    "progress": 0,
    "outputs": [
      { "preset": "1080p_h264", "format": "mp4", "videoCodec": "libx264", "audioCodec": "aac" },
      { "format": "webm", "videoCodec": "libvpx-vp9", "audioCodec": "libopus", "resolution": "1280x720", "bitrate": "1800k" }
    ]
  }
}
```

### Job Status Response

```json
{
  "success": true,
  "job": {
    "id": "job_01JBFC2345",
    "media_file_id": "a1b2c3d4",
    "status": "completed",
    "progress": 100,
    "generated_outputs": [
      {
        "id": "1080p_h264",
        "format": "mp4",
        "videoCodec": "libx264",
        "audioCodec": "aac",
        "storageKey": "video/a1b2c3d4/job_01JBFC2345/a1b2c3d4-0-1080p_h264.mp4",
        "duration": 182.6,
        "width": 1920,
        "height": 1080,
        "size": 85432123
      }
    ],
    "metadata": {
      "source": {
        "duration": 182.6,
        "video": { "codec": "h264", "width": 3840, "height": 2160 }
      }
    }
  }
}
```

## Configuration

Set the following environment variables (see `.env.example` for defaults):

| Variable | Purpose |
| -------- | ------- |
| `VIDEO_PROCESSING_ENABLED` | Toggle worker/queue startup (default `true`) |
| `VIDEO_PROCESSING_CONCURRENCY` | Number of simultaneous FFmpeg jobs per worker |
| `VIDEO_PROCESSING_QUEUE` | BullMQ queue name (default `video-processing`) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | Override binary locations if not on `$PATH` |
| `VIDEO_DEFAULT_OUTPUTS` | JSON array describing default presets used when request omits outputs |
| `VIDEO_WEBHOOK_MAX_RETRIES` | Number of webhook retry attempts (default `3`) |
| `VIDEO_WEBHOOK_TIMEOUT` | Timeout in ms for webhook delivery (default `5000`) |

> **Redis is required.** The queue uses BullMQ + Redis, so ensure `REDIS_URL` is configured and reachable from both the API and worker processes.

## Operational Notes

- Ensure FFmpeg/ffprobe are installed on the host or baked into the container image. The production Dockerfile bundles Alpine's `ffmpeg` package.
- Jobs run asynchronously; the API responds immediately with `202 Accepted`. Poll `/api/video/jobs/{jobId}` or rely on webhooks for completion.
- Outputs are private by default—use the file serving endpoints to generate signed URLs if you need to expose them externally.
- Large source files are streamed to a temporary directory before transcoding. Monitor `/tmp` usage on constrained environments.
- Extend or replace presets by supplying `VIDEO_DEFAULT_OUTPUTS` with a JSON array or by specifying custom `outputs` payloads per job.
