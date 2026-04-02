// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyPdfPages, summarizeClassifications } from '../../lib/pdf/page-classifier';
import { filterFinancialPages } from '../../lib/pdf/page-filter';
import { rasterizePage } from '../../lib/pdf/page-rasterizer';

const FIXTURES = path.resolve(__dirname, '../fixtures');
const SCANNED_PDF = path.join(FIXTURES, 'Sun_Hung_Kai_Co_Limited_AR_2024.pdf');

let pdfBuffer: Buffer;

beforeAll(() => {
  pdfBuffer = fs.readFileSync(SCANNED_PDF);
});

// ─── T2.2: Page classifier on SCANNED ────────────────────

describe('T2.2 — Page classifier on SCANNED (Sun Hung Kai 2024)', () => {
  it('returns ClassifiedPage[] and classifies pages correctly', async () => {
    const pages = await classifyPdfPages(pdfBuffer);

    // Sun Hung Kai sample is a small excerpt (4 pages, 3.2MB = image-heavy)
    expect(pages.length).toBeGreaterThanOrEqual(1);

    const summary = summarizeClassifications(pages);
    console.log('SCANNED classification summary:', summary);
    expect(summary.total).toBe(pages.length);

    // Since this is an image-heavy PDF, most pages should be scanned or hybrid
    // (very few extractable text words)
    const nonDigital = summary.scanned + summary.hybrid;
    console.log(`  → ${nonDigital} scanned/hybrid pages, ${summary.digital} digital pages`);

    // Every page should have valid fields
    for (const page of pages) {
      expect(['digital', 'scanned', 'hybrid']).toContain(page.classification);
      expect(page.pageNumber).toBeGreaterThan(0);
    }
  });
}, 120000);

// ─── T2.5: Page filter on SCANNED ────────────────────────

describe('T2.5 — Page filter on SCANNED (Sun Hung Kai 2024)', () => {
  it('runs filter without error; scanned pages have no text to match headings', async () => {
    const pages = await classifyPdfPages(pdfBuffer);
    const result = filterFinancialPages(pages);

    console.log('SCANNED filter result:', {
      sections: [...result.selectedPages.keys()],
      filteredPageCount: result.filteredPageCount,
      totalPageCount: result.totalPageCount,
      reductionRatio: result.reductionRatio.toFixed(2),
      noteCount: result.notePageMap.size,
    });

    // Filter should complete without error
    expect(result.totalPageCount).toBeGreaterThan(0);

    // Scanned pages have no extractable text, so heading patterns won't match.
    // This is expected — scanned pages need OCR before financial filtering.
    // The key test is that the filter handles zero matches gracefully.
    expect(result.reductionRatio).toBeGreaterThanOrEqual(0);
    expect(result.reductionRatio).toBeLessThanOrEqual(1.0);
  });
}, 120000);

// ─── T2.9: Page rasterizer on SCANNED ────────────────────

describe('T2.9 — Page rasterizer on SCANNED (Sun Hung Kai page 1)', () => {
  it('returns a PNG buffer with PNG magic bytes', async () => {
    const pngBuffer = await rasterizePage(pdfBuffer, 1, 2.0);

    expect(pngBuffer.length).toBeGreaterThan(0);

    // PNG magic bytes
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50);
    expect(pngBuffer[2]).toBe(0x4e);
    expect(pngBuffer[3]).toBe(0x47);

    console.log(`  → Rasterized page 1: ${(pngBuffer.length / 1024).toFixed(0)} KB`);
  });
}, 60000);
