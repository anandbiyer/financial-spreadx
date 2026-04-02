// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractStatement } from '../../lib/claude/extract';
import { extractNote } from '../../lib/claude/extract-notes';
import { extractStatementFromImage } from '../../lib/claude/extract-vision';
import { classifyPdfPages } from '../../lib/pdf/page-classifier';
import { rasterizePage } from '../../lib/pdf/page-rasterizer';

const FIXTURES = path.resolve(__dirname, '../fixtures');

let digitalPages: { pageNumber: number; textContent: string; classification: string }[];
let scannedBuffer: Buffer;

beforeAll(async () => {
  // Load DIGITAL pages
  const digitalBuf = fs.readFileSync(path.join(FIXTURES, 'LT_Finance_Limited_2019.pdf'));
  digitalPages = (await classifyPdfPages(digitalBuf)).map((p) => ({
    pageNumber: p.pageNumber,
    textContent: p.textContent,
    classification: p.classification,
  }));

  // Load SCANNED buffer
  scannedBuffer = fs.readFileSync(path.join(FIXTURES, 'Sun_Hung_Kai_Co_Limited_AR_2024.pdf'));
}, 30000);

// ─── T4.4: Extract from DIGITAL P&L page ─────────────────

describe('T4.4 — Extract rows from DIGITAL (LT Finance P&L page)', () => {
  it('returns ExtractedRow[] with >= 5 rows from P&L page', async () => {
    // Page 3 is "Statement of Profit and Loss"
    const plPage = digitalPages.find((p) => p.pageNumber === 3);
    expect(plPage).toBeDefined();

    const rows = await extractStatement(plPage!.textContent, 'income_statement', 'T3');

    console.log('DIGITAL P&L extraction:', {
      rowCount: rows.length,
      labels: rows.slice(0, 5).map((r) => r.raw_label),
    });

    expect(rows.length).toBeGreaterThanOrEqual(5);

    // Check structure
    for (const row of rows) {
      expect(row.raw_label).toBeTruthy();
      expect(typeof row.raw_values).toBe('object');
      expect(Array.isArray(row.section_path)).toBe(true);
      expect(typeof row.indentation_level).toBe('number');
      expect(typeof row.is_subtotal).toBe('boolean');
    }

    // Should have at least one year column
    const allKeys = rows.flatMap((r) => Object.keys(r.raw_values));
    const yearKeys = allKeys.filter((k) => /^\d{4}$/.test(k));
    expect(yearKeys.length).toBeGreaterThan(0);
  }, 60000);
});

// ─── T4.5: Extract from DIGITAL BS page ──────────────────

describe('T4.5 — Extract rows from DIGITAL (LT Finance BS page)', () => {
  it('returns ExtractedRow[] with >= 3 rows from BS page', async () => {
    // Page 1 is "Balance Sheet"
    const bsPage = digitalPages.find((p) => p.pageNumber === 1);
    expect(bsPage).toBeDefined();

    const rows = await extractStatement(bsPage!.textContent, 'balance_sheet', 'T3');

    console.log('DIGITAL BS extraction:', {
      rowCount: rows.length,
      labels: rows.slice(0, 5).map((r) => r.raw_label),
    });

    expect(rows.length).toBeGreaterThanOrEqual(3);
  }, 60000);
});

// ─── T4.6: Extract Vision from SCANNED ───────────────────

describe('T4.6 — Extract Vision from SCANNED (Sun Hung Kai page 1)', () => {
  it('returns ExtractedRow[] without throwing', async () => {
    const pngBuffer = await rasterizePage(scannedBuffer, 1, 2.0);

    const rows = await extractStatementFromImage(
      pngBuffer, 'balance_sheet', 'T8', 1,
    );

    console.log('SCANNED Vision extraction:', {
      rowCount: rows.length,
      labels: rows.slice(0, 3).map((r) => r.raw_label),
    });

    // May be empty if page is not a financial statement
    expect(Array.isArray(rows)).toBe(true);

    // If rows returned, verify structure
    for (const row of rows) {
      expect(row.raw_label).toBeTruthy();
      expect(typeof row.raw_values).toBe('object');
    }
  }, 90000);
});

// ─── T4.7: Extract Notes ─────────────────────────────────

describe('T4.7 — Extract Note from synthetic text', () => {
  it('returns structured note with title and summary', async () => {
    const noteText = `Note 5: Loans and Advances
As at March 31, 2019, the company's loan portfolio comprised:
- Term loans: ₹15,234 crore (prior year: ₹12,890 crore)
- Working capital loans: ₹3,456 crore (prior year: ₹2,901 crore)
- Infrastructure loans: ₹8,123 crore (prior year: ₹7,654 crore)
Total loans and advances: ₹26,813 crore (prior year: ₹23,445 crore)
Impairment allowance: ₹1,234 crore`;

    const result = await extractNote(noteText, 5, 'T3');

    console.log('Note extraction:', {
      number: result.note_number,
      title: result.note_title,
      summaryLength: result.summary.length,
      subTableCount: result.sub_tables.length,
    });

    expect(result.note_number).toBe(5);
    expect(result.note_title).toBeTruthy();
    expect(result.summary.length).toBeLessThanOrEqual(500);
    expect(result.summary.length).toBeGreaterThan(0);
  }, 60000);
});
