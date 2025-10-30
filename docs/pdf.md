# PDF Operations

DMAPI provides a growing set of PDF operations suitable for Dailey Forms and enterprise workflows. Operations respect per-file access (public/private) and write results as media variants tied to the source item.

## Authentication and Access

All endpoints require JWT auth and owner/admin access to the source media file. Results inherit the access policy of the source (public ➜ public, private ➜ private).

## Capabilities

`GET /api/pdf/capabilities`

Returns supported operations and key parameters.

## Merge

`POST /api/pdf/merge`

Body:
```
{ "files": ["id1","id2",...], "options": { } }
```

Combines PDFs in listed order. Returns a single PDF variant tied to the first item.

## Split

`POST /api/pdf/split/{mediaFileId}`

Body:
```
{ "parts": [{"range":"1-5"},{"range":"6-"}] }
```

Generates one output per range; ranges support `start-end`, open-ended (`4-`), single pages (`7`), and comma lists.

## Rotate

`POST /api/pdf/rotate/{mediaFileId}`

Body:
```
{ "pages": "all" | "1,3-5", "angle": 90 }
```

Applies rotation to selected pages.

## Compress / Optimize (Ghostscript)

`POST /api/pdf/compress/{mediaFileId}`

Body:
```
{ "profile": "screen"|"ebook"|"prepress", "imageDownsample": 144 }
```

Runs Ghostscript pdfwrite optimizations; falls back safely if Ghostscript is missing.

## Watermark (Text)

`POST /api/pdf/watermark/{mediaFileId}`

Body:
```
{ "text": "CONFIDENTIAL", "pages": "all", "opacity": 0.2,
  "size": 48, "position": "center", "angle": -35 }
```

Adds a diagonal text overlay per page.

## Stamp (Header/Footer/Text/Image/Page Numbers)

`POST /api/pdf/stamp/{mediaFileId}`

Body:
```
{
  "text": "Dailey Forms",
  "imageMediaFileId": null,
  "pages": "all",
  "position": "header",  // header | footer | center
  "margin": 36,
  "opacity": 1,
  "fontSize": 12,
  "pageNumbers": { "enabled": true, "format": "{page}/{total}", "position": "footer-right", "fontSize": 10, "margin": 24 }
}
```

Draws text and/or an image at header/footer; supports page numbers.

## Flatten

`POST /api/pdf/flatten/{mediaFileId}`

Body:
```
{ "what": "forms" | "annotations" | "all" }
```

Flattens form fields via pdf-lib; uses Ghostscript to bake annotations where possible.

## Forms

List fields:

`GET /api/pdf/forms/{mediaFileId}/fields`

Fill fields:

`POST /api/pdf/forms/{mediaFileId}/fill`

Body:
```
{ "fields": { "FullName": "Jane Doe", "Accept": true }, "flatten": true }
```

## Export Pages to Images

`POST /api/pdf/images/{mediaFileId}`

Body:
```
{ "format": "png" | "jpg", "dpi": 200, "pages": "1-3,5", "quality": 85 }
```

Uses ImageMagick/convert to rasterize selected pages with the requested DPI.

## Security (Ghostscript)

`POST /api/pdf/security/{mediaFileId}`

Body:
```
{
  "action": "set" | "remove",
  "userPassword": "",
  "ownerPassword": "",
  "currentPassword": "",
  "permissions": { "print": true, "modify": false, "copy": false, "annotate": true, "fillForms": true, "extract": false, "assemble": false, "highResPrint": false }
}
```

Applies 128-bit encryption and permission mask when Ghostscript is installed.

## Notes

- All outputs are stored as media variants with `operation` metadata and access preserved.
- If Ghostscript/ImageMagick are not installed, endpoints gracefully error or pass through when possible.
- For heavy operations and long files, consider enabling async job orchestration (see roadmap).

