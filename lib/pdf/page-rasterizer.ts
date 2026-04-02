import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

/**
 * Rasterize a single PDF page to a PNG buffer.
 *
 * @param pdfBuffer  - The full PDF file as a Buffer
 * @param pageNumber - 1-based page number
 * @param scale      - Render scale (2.0 = 2× default resolution)
 * @returns PNG image buffer (~150-300 KB per page at 2× scale)
 */
export async function rasterizePage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale = 2.0,
): Promise<Buffer> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) })
    .promise;

  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height),
    );
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx as any,
      canvas: canvas as any,
      viewport,
    }).promise;

    return canvas.toBuffer('image/png');
  } finally {
    await pdf.destroy();
  }
}

/**
 * Rasterize multiple PDF pages to PNG buffers.
 *
 * @param pdfBuffer   - The full PDF file as a Buffer
 * @param pageNumbers - Array of 1-based page numbers
 * @param scale       - Render scale
 * @returns Map of page number → PNG buffer
 */
export async function rasterizePages(
  pdfBuffer: Buffer,
  pageNumbers: number[],
  scale = 2.0,
): Promise<Map<number, Buffer>> {
  const result = new Map<number, Buffer>();
  for (const pageNum of pageNumbers) {
    result.set(pageNum, await rasterizePage(pdfBuffer, pageNum, scale));
  }
  return result;
}
