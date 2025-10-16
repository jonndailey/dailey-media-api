import { Buffer } from 'node:buffer';
import Module from 'module';
import { createCanvas, Path2D, DOMMatrix } from '@napi-rs/canvas';

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
  if (request === 'canvas') {
    request = '@napi-rs/canvas';
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { default: pdfjsLib } = await import('pdfjs-dist/legacy/build/pdf.js');

if (typeof global.Path2D === 'undefined') {
  global.Path2D = Path2D;
}

if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = DOMMatrix;
}

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';

const canvasFactory = {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  },
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  },
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
};

export async function renderPdfFirstPage(buffer, scale = 2) {
  const loadingTask = pdfjsLib.getDocument({
    data: Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer,
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: false
  });

  const pdfDocument = await loadingTask.promise;

  try {
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale });

    const canvasWidth = Math.ceil(viewport.width);
    const canvasHeight = Math.ceil(viewport.height);
    const { canvas, context } = canvasFactory.create(canvasWidth, canvasHeight);

    const renderContext = {
      canvasContext: context,
      viewport,
      canvasFactory
    };

    await page.render(renderContext).promise;
    const pngBuffer = await canvas.encode('png');

    canvasFactory.destroy({ canvas, context });

    return {
      buffer: pngBuffer,
      width: canvasWidth,
      height: canvasHeight
    };
  } finally {
    pdfDocument.cleanup();
    pdfDocument.destroy();
  }
}
