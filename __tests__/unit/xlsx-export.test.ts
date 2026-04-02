import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

vi.mock('@/lib/db/queries/documents', () => ({
  getDocumentById: vi.fn(),
}));
vi.mock('@/lib/db/queries/mapped-rows', () => ({
  getMappedRowsByDocument: vi.fn(),
}));
vi.mock('@/lib/db/queries/extracted-rows', () => ({
  getRowsByDocument: vi.fn(),
}));

import { buildXlsxExport } from '@/lib/export/xlsx-export';
import { getDocumentById } from '@/lib/db/queries/documents';
import { getMappedRowsByDocument } from '@/lib/db/queries/mapped-rows';
import { getRowsByDocument } from '@/lib/db/queries/extracted-rows';

const mockDoc = {
  id: 'doc-1',
  fileName: 'LT_Finance_Limited_2019.pdf',
  templateType: 'T3',
  currencyCode: 'INR',
  unitScale: 'crore',
  statementScopes: ['standalone'],
  validationResults: {
    V01: { name: 'Balance Sheet Identity', status: 'passed', lhs: 1000, rhs: 1000, diffPct: 0 },
    V02: { name: 'PBT Check', status: 'failed', lhs: 500, rhs: 520, diffPct: 0.04 },
  },
  ocrRequired: false,
  pageCount: 8,
  createdAt: new Date('2026-01-01'),
};

const mockMappedRows = [
  {
    id: 'mr-1', rowId: 'er-1', documentId: 'doc-1',
    canonicalField: 'total_revenue', rawLabel: 'Revenue from operations',
    statementType: 'income_statement',
    normalizedValues: { '2024': 7000, '2023': 6500 },
    mappingMethod: 'dictionary', mappingConfidence: 0.98,
    reviewStatus: 'auto_approved', statementScope: 'standalone', noteRef: null,
  },
  {
    id: 'mr-2', rowId: 'er-2', documentId: 'doc-1',
    canonicalField: 'total_assets', rawLabel: 'Total assets',
    statementType: 'balance_sheet',
    normalizedValues: { '2024': 50000, '2023': 45000 },
    mappingMethod: 'dictionary', mappingConfidence: 0.99,
    reviewStatus: 'auto_approved', statementScope: 'standalone', noteRef: null,
  },
  {
    id: 'mr-3', rowId: 'er-3', documentId: 'doc-1',
    canonicalField: 'net_cash_operating', rawLabel: 'Net cash from operating activities',
    statementType: 'cash_flow',
    normalizedValues: { '2024': 1200, '2023': 1100 },
    mappingMethod: 'dictionary', mappingConfidence: 0.98,
    reviewStatus: 'auto_approved', statementScope: 'standalone', noteRef: null,
  },
];

const mockRawRows = [
  {
    id: 'er-1', documentId: 'doc-1',
    statementType: 'income_statement' as any,
    rawLabel: 'Revenue from operations',
    rawValues: { '2024': 7000, '2023': 6500 },
    page: 3, sectionPath: ['Revenue'], indentationLevel: 0,
    noteRef: null, noteEntryId: null, isSubtotal: false, statementScope: 'standalone',
    columnMetadata: {}, createdAt: new Date(),
  },
];

beforeEach(() => {
  vi.mocked(getDocumentById).mockResolvedValue(mockDoc as any);
  vi.mocked(getMappedRowsByDocument).mockResolvedValue(mockMappedRows as any);
  vi.mocked(getRowsByDocument).mockResolvedValue(mockRawRows as any);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseWorkbook(buf: any): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

describe('buildXlsxExport', () => {
  it('returns a non-empty Buffer', async () => {
    const buf = await buildXlsxExport('doc-1', 'reviewed');
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('produces a valid xlsx workbook', async () => {
    const buf = await buildXlsxExport('doc-1', 'reviewed');
    await expect(parseWorkbook(buf)).resolves.toBeDefined();
  });

  it('workbook has exactly 8 worksheets', async () => {
    const buf = await buildXlsxExport('doc-1', 'reviewed');
    const wb = await parseWorkbook(buf);
    expect(wb.worksheets).toHaveLength(8);
  });

  it('worksheet names match spec', async () => {
    const buf = await buildXlsxExport('doc-1', 'reviewed');
    const wb = await parseWorkbook(buf);
    const names = wb.worksheets.map((ws) => ws.name);
    expect(names).toContain('Summary');
    expect(names).toContain('Income Statement');
    expect(names).toContain('Balance Sheet');
    expect(names).toContain('Cash Flow');
    expect(names).toContain('Equity Statement');
    expect(names).toContain('Validation');
    expect(names).toContain('Raw Extraction');
    expect(names).toContain('Metadata');
  });

  it('Income Statement sheet has data rows', async () => {
    const buf = await buildXlsxExport('doc-1', 'reviewed');
    const wb = await parseWorkbook(buf);
    const ws = wb.getWorksheet('Income Statement')!;
    // Row 1 is header, row 2+ are data
    expect(ws.rowCount).toBeGreaterThan(1);
  });

  it('Validation sheet lists all validation checks', async () => {
    const buf = await buildXlsxExport('doc-1', 'reviewed');
    const wb = await parseWorkbook(buf);
    const ws = wb.getWorksheet('Validation')!;
    // 1 header + 2 validation rows
    expect(ws.rowCount).toBe(3);
  });

  it('Raw Extraction sheet has raw rows', async () => {
    const buf = await buildXlsxExport('doc-1', 'reviewed');
    const wb = await parseWorkbook(buf);
    const ws = wb.getWorksheet('Raw Extraction')!;
    expect(ws.rowCount).toBeGreaterThan(1);
  });

  it('Summary sheet contains document metadata', async () => {
    const buf = await buildXlsxExport('doc-1', 'reviewed');
    const wb = await parseWorkbook(buf);
    const ws = wb.getWorksheet('Summary')!;
    const values = ws.getColumn(1).values as (string | undefined)[];
    expect(values.some((v) => v?.toString().includes('Template Type'))).toBe(true);
    expect(values.some((v) => v?.toString().includes('Currency'))).toBe(true);
  });

  it('throws if document not found', async () => {
    vi.mocked(getDocumentById).mockResolvedValueOnce(null as any);
    await expect(buildXlsxExport('bad-id', 'reviewed')).rejects.toThrow('not found');
  });
});
