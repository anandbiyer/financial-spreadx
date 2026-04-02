// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runMappingEngine, type ExtractedRowInput } from '../../lib/mapping/index';

describe('T3.37 — runMappingEngine with 10 mock T5 IS rows', () => {
  const rows: ExtractedRowInput[] = [
    { rawLabel: 'Turnover', rawValues: { '2023': 5000 }, statementType: 'income_statement', sectionPath: ['revenue'], indentationLevel: 0, isSubtotal: false },
    { rawLabel: 'Cost of sales', rawValues: { '2023': -3000 }, statementType: 'income_statement', sectionPath: ['expenses'], indentationLevel: 1, isSubtotal: false },
    { rawLabel: 'Gross profit', rawValues: { '2023': 2000 }, statementType: 'income_statement', sectionPath: [], indentationLevel: 0, isSubtotal: true },
    { rawLabel: 'Administrative expenses', rawValues: { '2023': -1800 }, statementType: 'income_statement', sectionPath: ['expenses'], indentationLevel: 1, isSubtotal: false },
    { rawLabel: 'Operating loss', rawValues: { '2023': -300 }, statementType: 'income_statement', sectionPath: [], indentationLevel: 0, isSubtotal: false },
    { rawLabel: 'Interest payable', rawValues: { '2023': -50 }, statementType: 'income_statement', sectionPath: ['expenses'], indentationLevel: 1, isSubtotal: false },
    { rawLabel: 'Loss before taxation', rawValues: { '2023': -350 }, statementType: 'income_statement', sectionPath: [], indentationLevel: 0, isSubtotal: false },
    { rawLabel: 'Taxation', rawValues: { '2023': 70 }, statementType: 'income_statement', sectionPath: [], indentationLevel: 0, isSubtotal: false },
    { rawLabel: 'Loss for the financial year', rawValues: { '2023': -280 }, statementType: 'income_statement', sectionPath: [], indentationLevel: 0, isSubtotal: false },
    { rawLabel: 'Loss per share', rawValues: { '2023': -0.14 }, statementType: 'income_statement', sectionPath: [], indentationLevel: 0, isSubtotal: false },
  ];

  it('returns 10 mapped rows', () => {
    const { mappedRows } = runMappingEngine(rows, 'T5', 'test-doc-1');
    expect(mappedRows.length).toBe(10);
  });

  it('at least 8/10 have confidence >= 0.80', () => {
    const { mappedRows } = runMappingEngine(rows, 'T5', 'test-doc-1');
    const highConf = mappedRows.filter(r => r.mappingConfidence >= 0.80);
    expect(highConf.length).toBeGreaterThanOrEqual(8);
  });

  it('includes key canonical fields', () => {
    const { mappedRows } = runMappingEngine(rows, 'T5', 'test-doc-1');
    const fields = mappedRows.map(r => r.canonicalField).filter(Boolean);
    expect(fields).toContain('total_revenue');
    expect(fields).toContain('net_income');
  });

  it('runs V01-V12 validations', () => {
    const { validationChecks } = runMappingEngine(rows, 'T5', 'test-doc-1');
    expect(validationChecks.length).toBe(12);
  });
});

describe('T3.38 — runMappingEngine with 5 mock T8 BS rows', () => {
  const rows: ExtractedRowInput[] = [
    { rawLabel: 'Cash and bank balances', rawValues: { '2024': 5000 }, statementType: 'balance_sheet', sectionPath: ['assets'], indentationLevel: 1, isSubtotal: false },
    { rawLabel: 'Clearing settlement funds', rawValues: { '2024': 12000 }, statementType: 'balance_sheet', sectionPath: ['assets'], indentationLevel: 1, isSubtotal: false },
    { rawLabel: 'Total assets', rawValues: { '2024': 50000 }, statementType: 'balance_sheet', sectionPath: [], indentationLevel: 0, isSubtotal: true },
    { rawLabel: 'Borrowings', rawValues: { '2024': 20000 }, statementType: 'balance_sheet', sectionPath: ['liabilities'], indentationLevel: 1, isSubtotal: false },
    { rawLabel: 'Total liabilities', rawValues: { '2024': 35000 }, statementType: 'balance_sheet', sectionPath: [], indentationLevel: 0, isSubtotal: true },
  ];

  it('returns 5 mapped rows', () => {
    const { mappedRows } = runMappingEngine(rows, 'T8', 'test-doc-2');
    expect(mappedRows.length).toBe(5);
  });

  it('V01 check runs (may skip if equity missing)', () => {
    const { validationChecks } = runMappingEngine(rows, 'T8', 'test-doc-2');
    const v01 = validationChecks.find(c => c.checkId === 'V01');
    expect(v01).toBeDefined();
    // V01 may be 'skipped' since we don't have total_equity, or 'failed' if it computed
    expect(['passed', 'failed', 'skipped']).toContain(v01!.status);
  });

  it('maps clearing_settlement_funds correctly', () => {
    const { mappedRows } = runMappingEngine(rows, 'T8', 'test-doc-2');
    const clearing = mappedRows.find(r => r.canonicalField === 'clearing_funds');
    expect(clearing).toBeDefined();
  });
});
