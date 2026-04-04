import { describe, it, expect } from 'vitest';
import {
  expandWithContinuationPages,
  filterFinancialPages,
} from '../../lib/pdf/page-filter';
import { STATEMENT_SIGNALS, classifyStatementType } from '../../lib/pdf/statement-classifier';
import type { ClassifiedPage } from '../../lib/pdf/page-classifier';

// ─── T2.6: Statement signal pattern matching (replaces SECTION_PATTERNS) ──

describe('T2.6 — Statement signal regex patterns', () => {
  const cases: [string, string][] = [
    ['Statement of Profit and Loss', 'income_statement'],
    ['Consolidated Statement of Income', 'income_statement'],
    ['Profit and Loss Account', 'income_statement'],
    ['Income Statement', 'income_statement'],
    ['CONSOLIDATED STATEMENTS OF INCOME', 'income_statement'],
    ['Consolidated Balance Sheet', 'balance_sheet'],
    ['CONSOLIDATED BALANCE SHEETS', 'balance_sheet'],
    ['Statement of Financial Position', 'balance_sheet'],
    ['Balance Sheet', 'balance_sheet'],
    ['Cash Flow Statement', 'cash_flow'],
    ['Statement of Cash Flows', 'cash_flow'],
    ['CONSOLIDATED STATEMENTS OF CASH FLOWS', 'cash_flow'],
    ['Statement of Changes in Equity', 'equity_statement'],
    ["Changes in Shareholders' Equity", 'equity_statement'],
    ['CONSOLIDATED STATEMENTS OF STOCKHOLDERS EQUITY', 'equity_statement'],
    ['Notes to the Financial Statements', 'notes'],
    ['Notes to the Consolidated Financial Statements', 'notes'],
    ['Note 12', 'notes'],
  ];

  for (const [heading, expectedType] of cases) {
    it(`"${heading}" → ${expectedType}`, () => {
      const matched = STATEMENT_SIGNALS.some(
        (s) => s.type === expectedType && s.pattern.test(heading),
      );
      expect(matched).toBe(true);
    });
  }

  it('non-financial heading does not match any statement signal', () => {
    const heading = 'Corporate Governance Report';
    const financialTypes = ['balance_sheet', 'income_statement', 'cash_flow', 'equity_statement', 'notes'];
    for (const signal of STATEMENT_SIGNALS) {
      if (!financialTypes.includes(signal.type)) continue;
      expect(signal.pattern.test(heading)).toBe(false);
    }
  });
});

// ─── T2.7: Continuation window ────────────────────────────

describe('T2.7 — Continuation window logic', () => {
  // Create 20 mock digital pages with no section_type (continuation candidates)
  const mockPages: ClassifiedPage[] = Array.from({ length: 20 }, (_, i) => ({
    pageNumber: i + 1,
    classification: 'digital' as const,
    wordCount: 100,
    asciiRatio: 0.95,
    textContent: `Page ${i + 1} content`,
    requiresOCR: false,
  }));

  it('expands page 10 with 8-page window → pages 10-18', () => {
    const expanded = expandWithContinuationPages([10], mockPages, 8);
    expect(expanded).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('page 19 is NOT included in window (max 8)', () => {
    const expanded = expandWithContinuationPages([10], mockPages, 8);
    expect(expanded).not.toContain(19);
  });

  it('multiple section starts merge correctly', () => {
    const expanded = expandWithContinuationPages([5, 15], mockPages, 8);
    expect(expanded).toContain(5);
    expect(expanded).toContain(13); // 5+8
    expect(expanded).toContain(15);
    expect(expanded).toContain(20); // 15+5 (page limit)
  });

  it('window does not exceed total page count', () => {
    const expanded = expandWithContinuationPages([18], mockPages, 8);
    expect(expanded).toContain(18);
    expect(expanded).toContain(19);
    expect(expanded).toContain(20);
    expect(expanded.length).toBeLessThanOrEqual(3);
  });

  it('empty section starts return empty', () => {
    const expanded = expandWithContinuationPages([], mockPages, 8);
    expect(expanded).toEqual([]);
  });

  it('T9.10 — boundary detection stops at next assigned section type', () => {
    const pagesWithTypes: ClassifiedPage[] = [
      { pageNumber: 1, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: '', requiresOCR: false, section_type: 'balance_sheet' },
      { pageNumber: 2, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: '', requiresOCR: false, section_type: 'income_statement' },
      { pageNumber: 3, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: '', requiresOCR: false },
      { pageNumber: 4, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: '', requiresOCR: false, section_type: 'cash_flow' },
    ];
    // Expanding page 1 (balance_sheet) should stop at page 2 (income_statement)
    const expanded = expandWithContinuationPages([1], pagesWithTypes, 8);
    expect(expanded).toEqual([1]);
    expect(expanded).not.toContain(2);
  });
});

// ─── filterFinancialPages with pre-assigned section_type ──

describe('filterFinancialPages — pre-assigned section_type', () => {
  it('T9.12 — groups pages by pre-assigned section_type (no regex)', () => {
    const mockPages: ClassifiedPage[] = [
      { pageNumber: 1, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'CONSOLIDATED BALANCE SHEETS ...', requiresOCR: false, section_type: 'balance_sheet' },
      { pageNumber: 2, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'CONSOLIDATED STATEMENTS OF INCOME ...', requiresOCR: false, section_type: 'income_statement' },
      { pageNumber: 3, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'CONSOLIDATED STATEMENTS OF STOCKHOLDERS EQUITY ...', requiresOCR: false, section_type: 'equity_statement' },
      { pageNumber: 4, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'CONSOLIDATED STATEMENTS OF CASH FLOWS ...', requiresOCR: false, section_type: 'cash_flow' },
      { pageNumber: 5, classification: 'digital', wordCount: 100, asciiRatio: 0.95, textContent: 'Directors Report ...', requiresOCR: false, section_type: 'other' },
      { pageNumber: 6, classification: 'scanned', wordCount: 3, asciiRatio: 0.1, textContent: '', requiresOCR: true },
    ];

    const result = filterFinancialPages(mockPages);

    expect(result.selectedPages.has('balance_sheet')).toBe(true);
    expect(result.selectedPages.has('income_statement')).toBe(true);
    expect(result.selectedPages.has('equity_statement')).toBe(true);
    expect(result.selectedPages.has('cash_flow')).toBe(true);
    expect(result.selectedPages.get('balance_sheet')).toContain(1);
    expect(result.selectedPages.get('income_statement')).toContain(2);
    expect(result.selectedPages.get('equity_statement')).toContain(3);
    expect(result.selectedPages.get('cash_flow')).toContain(4);
    // Scanned page 6 should NOT be included (handled by Stage 4b)
    expect([...result.selectedPages.values()].flat()).not.toContain(6);
    expect(result.totalPageCount).toBe(6);
  });
});
