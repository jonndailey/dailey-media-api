# OCR and Text Extraction

The Dailey Media API now includes native optical character recognition (OCR) powered by the open-source [Tesseract](https://github.com/tesseract-ocr/tesseract) engine. Run text extraction on any uploaded image to generate searchable PDFs, confidence-scored transcripts, and structured metadata.

## Capabilities

- Multi-language recognition (`eng` default, override per request)
- Confidence scoring with per-word bounding boxes
- Optional HOCR/TSV payloads for advanced parsing
- Searchable PDF generation stored alongside the source asset
- Persistent history for auditing and re-processing

## API Overview

### Kick Off OCR

```http
POST /api/ocr/{mediaFileId}/extract
Authorization: Bearer <token>
Content-Type: application/json

{
  "languages": ["eng", "spa"],
  "output": {
    "searchablePDF": true,
    "plainText": true,
    "confidence": true,
    "hocr": false,
    "tsv": false
  },
  "force": false
}
```

- `languages` maps to Tesseract language codes and defaults to `["eng"]`.
- When `force` is omitted or `false`, the latest cached OCR result is returned.
- Set `output.searchablePDF` to `true` to persist a searchable PDF variant.

### Inspect Results

- `GET /api/ocr/{mediaFileId}/results` – paginated history
- `GET /api/ocr/{mediaFileId}/results/latest` – most recent run (404 when none)
- `GET /api/ocr/results/{resultId}/pdf` – signed access details for the stored PDF

## Response Snapshot

```json
{
  "success": true,
  "cached": false,
  "result": {
    "mediaFileId": "media-123",
    "languages": ["eng", "spa"],
    "text": "Recognised text …",
    "durationMs": 4120,
    "confidence": {
      "average": 92.31,
      "min": 56.12,
      "max": 99.85
    },
    "metadata": {
      "script": "Latin",
      "blocks": 4,
      "lines": 21,
      "words": 186
    },
    "words": [
      {
        "text": "Media",
        "confidence": 95.67,
        "boundingBox": { "x0": 123, "y0": 45, "x1": 180, "y1": 68 }
      }
    ],
    "searchablePdf": {
      "storageKey": "ocr/media-123/searchable-1728938241-cec3a5.pdf",
      "signedUrl": "https://…",
      "access": "private"
    }
  }
}
```

## Deployment Notes

- The first request for a new language triggers a language data download from Tesseract’s CDN; cache these files for production environments if outbound traffic is restricted.
- PDF generation stores derivatives under `ocr/{mediaId}` using the same access policy (public/private) as the parent media item.
- Results persist in the `media_ocr_results` table—run `npm run migrate` after pulling the update so the schema changes are applied.

## Troubleshooting

- **`Unsupported file type for OCR processing`** – Only raster images (JPG, PNG, TIFF, etc.) are supported today. PDF and document conversion is on the roadmap.
- **`Database not available`** – OCR requires the relational database for asset metadata and history tracking. Confirm credentials in `.env`.
- **Slow first run** – Language model downloads happen lazily. Warm up the worker by triggering OCR during deployment or bake language data into your container image.
