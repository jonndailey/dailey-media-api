# DMAPI Backlog (Nitro-class Parity)

This backlog lists remaining items to reach “Nitro-class” document versatility and Dailey Forms UX polish. Each item includes a suggested GitHub issue title and acceptance criteria.

## PDF

1) feat(pdf): page reorder and page extraction
- API: `POST /api/pdf/reorder/:mediaFileId` with `{ order: [3,1,2,...] }`
- API: `POST /api/pdf/extract/:mediaFileId` with `{ pages: "1,4-6" }`
- DoD: outputs saved as variants; preserves access; errors on invalid page indexes.

2) feat(pdf): crop and resize pages
- API: `POST /api/pdf/crop/:mediaFileId` body `{ pages: "all", box: { x, y, w, h }, units: 'pt'|'mm' }`
- API: `POST /api/pdf/resize/:mediaFileId` body `{ width, height, fit: 'fit'|'fill' }`
- DoD: geometry validated; preserves vector content; variants created.

3) feat(pdf): redaction (terms and zones)
- API: `POST /api/pdf/redact/:mediaFileId` body `{ terms: ["SSN"], boxes: [{ page, x, y, w, h }], previewOnly }`
- DoD: redactions are irreversible in output; preview mode supported; tests for searchable text removal.

4) feat(pdf): digital signatures (deferred)
- API: `POST /api/pdf/sign/:mediaFileId` with signature appearance, location, reason, and P12
- DoD: validates cert; embeds visual stamp; variant saved.

5) feat(pdf): watermark image support
- Extend `/api/pdf/watermark/:id` to accept image media id and size/tiling options
- DoD: image watermark scales proportionally; opacity supported; pages selection.

## Conversion

6) feat(conversion): PDF ➜ DOCX high-fidelity provider
- Pluggable provider (commercial/OSS) for layout-preserving PDF→DOCX
- Expose caps in `/api/conversion/supported` and a provider selector
- DoD: sample corpus accuracy targets; fallback to baseline pipeline.

7) feat(conversion): PDF ➜ images multi-page streaming
- Add streaming zip/tar of per-page images
- DoD: archive streaming with Content-Disposition; pagination range.

## OCR

8) feat(ocr): pre-processing toggles
- Add `preProcess: { deskew, denoise, binarize }` and `pageRange`
- DoD: options documented; unit tests validate improved confidence

9) feat(ocr): re-OCR scanned pages only
- Detect scanned pages and re-run OCR selectively
- DoD: metadata includes scanned page indices; time savings measured.

## Async & Webhooks

10) feat(jobs): async PDF ops queue
- Switch heavy PDF ops to async jobs with progress + ETA
- Webhook callbacks; SDK helpers for Dailey Forms
- DoD: job endpoints mirror video pipeline; retry/backoff.

## SDK & UX

11) feat(sdk): client helpers for forms
- List/fill/flatten orchestrations; robust field naming resolution
- DoD: TS definitions; examples for Dailey Forms UI.

12) docs: formal OpenAPI for all new endpoints
- Update swagger config and examples for pdf + conversion from-url
- DoD: accurate request/response schemas + authorization notes.

