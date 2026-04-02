// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyPdfPages, summarizeClassifications } from '../../lib/pdf/page-classifier';
import { filterFinancialPages } from '../../lib/pdf/page-filter';
import { rasterizePage } from '../../lib/pdf/page-rasterizer';

const FIXTURES = path.resolve(__dirname, '../fixtures');
// LT Finance (T3, 8 pages, all digital text, INR crore) is our DIGITAL test file
const DIGITAL_PDF = path.join(FIXTURES, 'LT_Finance_Limited_2019.pdf');

let pdfBuffer: Buffer;

beforeAll(() => {
  pdfBuffer = fs.readFileSync(DIGITAL_PDF);
});

// ─── T2.1: Page classifier on DIGITAL ────────────────────

describe('T2.1 — Page classifier on DIGITAL (LT Finance 2019)', () => {
  it('returns ClassifiedPage[] with correct page count', async () => {
    const pages = await classifyPdfPages(pdfBuffer);

    // LT Finance 2019 is 8 pages, all digital text
    expect(pages.length).toBe(8);

    // Every page has required fields
    for (const page of pages) {
      expect(page.pageNumber).toBeGreaterThan(0);
      expect(['digital', 'scanned', 'hybrid']).toContain(page.classification);
      expect(page.wordCount).toBeGreaterThanOrEqual(0);
      expect(page.asciiRatio).toBeGreaterThanOrEqual(0);
      expect(page.asciiRatio).toBeLessThanOrEqual(1);
    }

    // Majority should be digital (it's a text-based PDF)
    const summary = summarizeClassifications(pages);
    console.log('DIGITAL classification summary:', summary);
    expect(summary.digital).toBeGreaterThan(summary.scanned + summary.hybrid);
  });
}, 30000);

// ─── T2.4: Page filter on DIGITAL ────────────────────────

describe('T2.4 — Page filter on DIGITAL (LT Finance 2019)', () => {
  it('detects at least income_statement and balance_sheet', async () => {
    const pages = await classifyPdfPages(pdfBuffer);
    const result = filterFinancialPages(pages);

    console.log('DIGITAL filter result:', {
      sections: [...result.selectedPages.keys()],
      filteredPageCount: result.filteredPageCount,
      totalPageCount: result.totalPageCount,
      reductionRatio: result.reductionRatio.toFixed(2),
      noteCount: result.notePageMap.size,
    });

    // Should find at least income_statement and balance_sheet
    expect(result.selectedPages.has('income_statement')).toBe(true);
    expect(result.selectedPages.has('balance_sheet')).toBe(true);

    // LT Finance is 8 pages of pure financial content — all pages may be selected
    // The key check is that sections were identified correctly, not that pages were filtered out
    expect(result.filteredPageCount).toBeGreaterThan(0);
    expect(result.reductionRatio).toBeLessThanOrEqual(1.0);
    expect(result.reductionRatio).toBeGreaterThan(0);
  });
}, 30000);

// ─── T2.10: Page rasterizer on DIGITAL ───────────────────

describe('T2.10 — Page rasterizer on DIGITAL (LT Finance page 1)', () => {
  it('returns a valid PNG buffer', async () => {
    const pngBuffer = await rasterizePage(pdfBuffer, 1, 2.0);

    expect(pngBuffer.length).toBeGreaterThan(0);

    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50);
    expect(pngBuffer[2]).toBe(0x4e);
    expect(pngBuffer[3]).toBe(0x47);
  });
}, 30000);
