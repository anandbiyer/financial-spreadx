import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB queries before importing the module under test
vi.mock('@/lib/db/queries/documents', () => ({
  getDocumentById: vi.fn(),
}));
vi.mock('@/lib/db/queries/mapped-rows', () => ({
  getMappedRowsByDocument: vi.fn(),
}));
vi.mock('@/lib/db/queries/extracted-rows', () => ({
  getRowsByDocument: vi.fn(),
}));

import { buildJsonExport, buildRawJsonExport } from '@/lib/export/json-export';
import { getDocumentById } from '@/lib/db/queries/documents';
import { getMappedRowsByDocument } from '@/lib/db/queries/mapped-rows';
import { getRowsByDocument } from '@/lib/db/queries/extracted-rows';
import { FX_RATES } from '@/lib/export/fx-rates';

const mockDoc = {
  id: 'doc-1',
  fileName: 'test.pdf',
  templateType: 'T3',
  currencyCode: 'INR',
  unitScale: 'crore',
  statementScopes: ['standalone'],
  validationResults: {
    V01: { name: 'Balance Sheet Identity', status: 'passed', lhs: 1000, rhs: 1000, diffPct: 0 },
  },
  ocrRequired: false,
  pageCount: 8,
  createdAt: new Date('2026-01-01'),
};

const mockMappedRows = [
  {
    id: 'mr-1',
    rowId: 'er-1',
    documentId: 'doc-1',
    canonicalField: 'total_revenue',
    rawLabel: 'Revenue from operations',
    statementType: 'income_statement',
    normalizedValues: { '2024': 7000, '2023': 6500 },
    mappingMethod: 'dictionary',
    mappingConfidence: 0.98,
    reviewStatus: 'auto_approved',
    statementScope: 'standalone',
    noteRef: null,
  },
  {
    id: 'mr-2',
    rowId: 'er-2',
    documentId: 'doc-1',
    canonicalField: 'total_assets',
    rawLabel: 'Total assets',
    statementType: 'balance_sheet',
    normalizedValues: { '2024': 50000, '2023': 45000 },
    mappingMethod: 'dictionary',
    mappingConfidence: 0.99,
    reviewStatus: 'auto_approved',
    statementScope: 'standalone',
    noteRef: null,
  },
];

beforeEach(() => {
  vi.mocked(getDocumentById).mockResolvedValue(mockDoc as any);
  vi.mocked(getMappedRowsByDocument).mockResolvedValue(mockMappedRows as any);
  vi.mocked(getRowsByDocument).mockResolvedValue([]);
});

describe('buildJsonExport', () => {
  it('returns a Buffer', async () => {
    const buf = await buildJsonExport('doc-1', 'reviewed');
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('produces valid JSON', async () => {
    const buf = await buildJsonExport('doc-1', 'reviewed');
    expect(() => JSON.parse(buf.toString('utf-8'))).not.toThrow();
  });

  it('output has correct top-level structure', async () => {
    const buf = await buildJsonExport('doc-1', 'reviewed');
    const out = JSON.parse(buf.toString('utf-8'));
    expect(out).toHaveProperty('meta');
    expect(out).toHaveProperty('validation');
    expect(out).toHaveProperty('statements');
    expect(out.statements).toHaveProperty('income_statement');
    expect(out.statements).toHaveProperty('balance_sheet');
    expect(out.statements).toHaveProperty('cash_flow');
    expect(out.statements).toHaveProperty('equity_statement');
  });

  it('meta contains correct document fields', async () => {
    const buf = await buildJsonExport('doc-1', 'reviewed');
    const { meta } = JSON.parse(buf.toString('utf-8'));
    expect(meta.documentId).toBe('doc-1');
    expect(meta.currency).toBe('INR');
    expect(meta.fxRateToUsd).toBe(FX_RATES.INR);
    expect(meta.tier).toBe('reviewed');
    expect(meta.templateType).toBe('T3');
  });

  it('rows are bucketed into correct statement types', async () => {
    const buf = await buildJsonExport('doc-1', 'reviewed');
    const { statements } = JSON.parse(buf.toString('utf-8'));
    expect(statements.income_statement).toHaveLength(1);
    expect(statements.balance_sheet).toHaveLength(1);
    expect(statements.income_statement[0].canonicalField).toBe('total_revenue');
  });

  it('applies USD conversion to values', async () => {
    const buf = await buildJsonExport('doc-1', 'reviewed');
    const { statements } = JSON.parse(buf.toString('utf-8'));
    const row = statements.income_statement[0];
    const original = row.values['2024'].original;
    const usd = row.values['2024'].usd;
    expect(original).toBe(7000);
    expect(usd).toBeCloseTo(7000 * FX_RATES.INR, 4);
  });

  it('includes validation results in output', async () => {
    const buf = await buildJsonExport('doc-1', 'reviewed');
    const { validation } = JSON.parse(buf.toString('utf-8'));
    expect(validation).toHaveProperty('V01');
    expect(validation.V01.status).toBe('passed');
  });

  it('throws if document not found', async () => {
    vi.mocked(getDocumentById).mockResolvedValueOnce(null as any);
    await expect(buildJsonExport('bad-id', 'reviewed')).rejects.toThrow('not found');
  });
});

describe('buildRawJsonExport', () => {
  beforeEach(() => {
    vi.mocked(getRowsByDocument).mockResolvedValue([
      {
        id: 'er-1',
        documentId: 'doc-1',
        statementType: 'income_statement' as any,
        rawLabel: 'Revenue from operations',
        rawValues: { '2024': 7000, '2023': 6500 },
        page: 3,
        sectionPath: ['Revenue'],
        indentationLevel: 0,
        noteRef: null,
        noteEntryId: null,
        isSubtotal: false,
        statementScope: 'standalone',
        columnMetadata: {},
        createdAt: new Date(),
      },
    ]);
  });

  it('returns a Buffer with raw rows', async () => {
    const buf = await buildRawJsonExport('doc-1');
    const out = JSON.parse(buf.toString('utf-8'));
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].rawLabel).toBe('Revenue from operations');
    expect(out.meta.tier).toBe('raw-json');
  });
});
