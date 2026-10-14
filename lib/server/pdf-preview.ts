import sharp from 'sharp';
import { definePDFJSModule, renderPageAsImage } from 'unpdf';

const PREVIEW_WIDTH = 1200;
const JPEG_QUALITY = 82;

let pdfjsReady: Promise<void> | null = null;

async function ensurePdfjs() {
  if (!pdfjsReady) {
    // Node needs the legacy PDF.js build (not the browser ESM entry).
    pdfjsReady = definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs')).then(() => undefined);
  }
  await pdfjsReady;
}

/**
 * Render page 1 of a PDF to an optimized JPEG buffer.
 * Returns null on failure so callers can fall back to PDF-placeholder UI.
 */
export async function renderPdfPagePreview(pdfBuffer: Buffer): Promise<Buffer | null> {
  if (!pdfBuffer?.length) {
    return null;
  }

  try {
    await ensurePdfjs();

    const pageImage = await renderPageAsImage(new Uint8Array(pdfBuffer), 1, {
      canvasImport: () => import('@napi-rs/canvas'),
      width: PREVIEW_WIDTH,
    });

    const raw = Buffer.from(pageImage);
    return sharp(raw).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  } catch (error) {
    console.warn('[pdf-preview] Failed to render PDF page preview:', error instanceof Error ? error.message : error);
    return null;
  }
}
