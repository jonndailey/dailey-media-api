# Document Conversion Service

The Dailey Media API bundles a lightweight document conversion engine that turns existing media assets into new derivatives (PDF, HTML, etc.) without leaving the platform. Conversions respect access controls, persist job metadata, and optionally add compliance watermarks.

## Capabilities

- Word, Excel, PowerPoint, and OpenDocument formats → PDF via LibreOffice (headless)
- Markdown → HTML or PDF using the same layout-aware renderer used in the web console
- HTML → PDF with support for headings, lists, tables, and code blocks
- Batch conversion orchestration with per-request overrides
- Optional watermarking, metadata stripping, and storage access policies

## API Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/conversion/supported` | Discover supported source/target formats and feature flags |
| `POST` | `/api/conversion/{mediaFileId}/convert` | Convert a single media file to a new format |
| `POST` | `/api/conversion/batch` | Run a batch of conversions (max size configurable) |
| `GET` | `/api/conversion/{mediaFileId}/jobs` | Paginated history of conversion jobs per media item |
| `GET` | `/api/conversion/jobs/{jobId}` | Retrieve a specific conversion job record |

All endpoints require the `read` scope except `POST` operations, which require `write`.

## Example – Convert DOCX to PDF

```http
POST /api/conversion/7c9c8d4a/convert
Authorization: Bearer <token>
Content-Type: application/json

{
  "targetFormat": "pdf",
  "options": {
    "watermark": "CONFIDENTIAL",
    "security": {
      "stripMetadata": true,
      "access": "private"
    }
  }
}
```

Success response:

```json
{
  "success": true,
  "result": {
    "jobId": "job_01JBDR3ZKX",
    "mediaFileId": "7c9c8d4a",
    "sourceFormat": "docx",
    "targetFormat": "pdf",
    "status": "completed",
    "durationMs": 1832,
    "output": {
      "storageKey": "conversions/7c9c8d4a/1729004000-f3a1b2.pdf",
      "size": 231042,
      "mimeType": "application/pdf",
      "url": null,
      "signedUrl": "https://signed.example.com/...",
      "access": "private"
    },
    "metadata": {
      "engine": "libreoffice",
      "watermarkApplied": true,
      "securityApplied": true,
      "batchId": null
    }
  }
}
```

## Batch Conversion

```http
POST /api/conversion/batch
Authorization: Bearer <token>

{
  "options": { "watermark": "DAILEY MEDIA" },
  "conversions": [
    { "mediaFileId": "doc-1", "targetFormat": "pdf" },
    { "mediaFileId": "doc-2", "targetFormat": "html", "options": { "watermark": null } }
  ]
}
```

When the database is reachable the API creates a `batchId` that links individual job records. Each job persists source format, target format, status, duration, output storage key, and any errors.

## Configuration

Tune conversion behaviour via environment variables (see `.env.example`):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `LIBREOFFICE_BINARY` | auto-detect | Explicit path to the LibreOffice `soffice` binary |
| `CONVERSION_SUPPORTED_MAP` | built-in matrix | Override supported source→target mappings (e.g. `docx:pdf,md:html;pdf`) |
| `CONVERSION_MAX_BATCH` | `10` | Maximum conversions accepted per batch request |
| `CONVERSION_ENABLE_WATERMARKING` | `true` | Toggle watermark support |
| `CONVERSION_DEFAULT_WATERMARK` | unset | Text applied when request omits `options.watermark` |
| `CONVERSION_ENABLE_COMPRESSION` | `true` | Compress generated PDF output |
| `CONVERSION_ENABLE_SECURITY` | `true` | Enable metadata stripping and access overrides |

> 🛠 **LibreOffice** must be installed on the host for Office ➜ PDF conversions. The service attempts to auto-discover `soffice`; set `LIBREOFFICE_BINARY` if running in a custom container.

## Operational Notes

- Conversions reuse the media file’s access policy (private by default). Override with `options.security.access`.
- Job history is only persisted when the database connection is available; the API still streams back conversion results inline.
- Watermark text applies diagonally across each PDF page using `Helvetica Bold`. Provide short strings (15–30 chars) for best results.
- HTML/Markdown renderers prioritise semantic structure. Complex CSS is not rendered—use LibreOffice for fidelity-critical conversions.
