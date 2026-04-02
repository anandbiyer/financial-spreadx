import { describe, it, expect } from 'vitest';
import {
  SECTION_PATTERNS,
  expandWithContinuationPages,
  filterFinancialPages,
  type PageSection,
} from '../../lib/pdf/page-filter';
import type { ClassifiedPage } from '../../lib/pdf/page-classifier';

// ─── T2.6: Regex pattern matching ─────────────────────────

describe('T2.6 — Section heading regex patterns', () => {
  const cases: [string, PageSection][] = [
    ['Statement of Profit and Loss', 'income_statement'],
    ['Consolidated Statement of Income', 'income_statement'],
    ['Profit and Loss Account', 'income_statement'],
    ['Income Statement', 'income_statement'],
    ['Consolidated Balance Sheet', 'balance_sheet'],
    ['Statement of Financial Position', 'balance_sheet'],
    ['Balance Sheet', 'balance_sheet'],
    ['Cash Flow Statement', 'cash_flow'],
    ['Statement of Cash Flows', 'cash_flow'],
    ['Consolidated Cash Flow', 'cash_flow'],
    ["Statement of Changes in Equity", 'equity_statement'],
    ["Changes in Shareholders' Equity", 'equity_statement'],
    ["Changes in Stockholders Equity", 'equity_statement'],
    ['Notes to the Financial Statements', 'notes'],
    ['Notes to the Consolidated Financial Statements', 'notes'],
    ['Note 12', 'notes'],
  ];

  for (const [heading, expectedSection] of cases) {
    it(`"${heading}" → ${expectedSection}`, () => {
      const patterns = SECTION_PATTERNS[expectedSection];
      const matched = patterns.some((p) => p.test(heading));
      expect(matched).toBe(true);
    });
  }

  it('non-financial heading does not match any section', () => {
    const heading = 'Corporate Governance Report';
    for (const [section, patterns] of Object.entries(SECTION_PATTERNS)) {
      if (section === 'other' || section === 'unclassified') continue;
      const matched = patterns.some((p: RegExp) => p.test(heading));
      expect(matched).toBe(false);
    }
  });
});

// ─── T2.7: Continuation window ────────────────────────────

describe('T2.7 — Continuation window logic', () => {
  // Create 20 mock digital pages
  const mockPages: ClassifiedPage[] = Array.from({ length: 20 }, (_, i) => ({
    pageNumber: i + 1,
    classification: 'digital' as const,
    wordCount: 100,
    asciiRatio: 0.95,
    textContent: `Page ${i + 1} content`,
    requiresOCR: false,
  }));

  it('expands page 10 with 5-page window → pages 10-15', () => {
    const expanded = expandWithContinuationPages([10], mockPages, 5);
    expect(expanded).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('page 16 is NOT included in window', () => {
    const expanded = expandWithContinuationPages([10], mockPages, 5);
    expect(expanded).not.toContain(16);
  });

  it('multiple section starts merge correctly', () => {
    const expanded = expandWithContinuationPages([5, 12], mockPages, 5);
    expect(expanded).toContain(5);
    expect(expanded).toContain(10); // 5+5
    expect(expanded).toContain(12);
    expect(expanded).toContain(17); // 12+5
    expect(expanded).not.toContain(18); // 12+6 = beyond window
  });

  it('window does not exceed total page count', () => {
    const expanded = expandWithContinuationPages([18], mockPages, 5);
    expect(expanded).toContain(18);
    expect(expanded).toContain(19);
    expect(expanded).toContain(20);
    // Pages beyond 20 don't exist
    expect(expanded.length).toBeLessThanOrEqual(3);
  });

  it('empty section starts return empty', () => {
    const expanded = expandWithContinuationPages([], mockPages, 5);
    expect(expanded).toEqual([]);
  });
});

// ─── filterFinancialPages with mock data ──────────────────

describe('filterFinancialPages — mock data', () => {
  it('detects income_statement and balance_sheet from headings', () => {
    const mockPages: ClassifiedPage[] = [
      { pageNumber: 1, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'Annual Report 2023 - Directors Report', requiresOCR: false },
      { pageNumber: 2, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'Statement of Profit and Loss for the year ended 31 March 2023', requiresOCR: false },
      { pageNumber: 3, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'Revenue from operations 5000 Expenses 3000', requiresOCR: false },
      { pageNumber: 4, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'Balance Sheet as at 31 March 2023', requiresOCR: false },
      { pageNumber: 5, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'Total Assets 50000 Total Liabilities 30000', requiresOCR: false },
      { pageNumber: 6, classification: 'scanned', wordCount: 3, asciiRatio: 0.1, textContent: '', requiresOCR: true },
    ];

    const result = filterFinancialPages(mockPages);

    expect(result.selectedPages.has('income_statement')).toBe(true);
    expect(result.selectedPages.has('balance_sheet')).toBe(true);
    expect(result.filteredPageCount).toBeLessThan(result.totalPageCount);
    expect(result.reductionRatio).toBeLessThan(1.0);
    expect(result.totalPageCount).toBe(6);
  });
});
