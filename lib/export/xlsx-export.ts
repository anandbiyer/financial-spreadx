/**
 * XLSX Export Service
 *
 * Produces an 8-tab Excel workbook using ExcelJS.
 * Tabs: Summary | Income Statement | Balance Sheet | Cash Flow |
 *       Equity Statement | Validation | Raw Extraction | Metadata
 */

import ExcelJS from 'exceljs';
import { getDocumentById } from '@/lib/db/queries/documents';
import { getMappedRowsByDocument } from '@/lib/db/queries/mapped-rows';
import { getRowsByDocument } from '@/lib/db/queries/extracted-rows';
import { getFxRate, convertToUsd } from './fx-rates';
import type { ExportTier } from './json-export';

// ── Styling helpers ──────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1A1917' },
};

const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF0EEE9' },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' },
  bold: true,
  size: 9,
  name: 'Calibri',
};

const BODY_FONT: Partial<ExcelJS.Font> = {
  size: 9,
  name: 'Calibri',
};

function applyHeaderRow(row: ExcelJS.Row) {
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.height = 18;
  row.alignment = { vertical: 'middle' };
}

function applySubHeaderRow(row: ExcelJS.Row) {
  row.font = { ...BODY_FONT, bold: true };
  row.fill = SUBHEADER_FILL;
}

// ── Column year extraction ───────────────────────────────────────────────────

function extractYears(rows: { normalizedValues: unknown }[]): string[] {
  const years = new Set<string>();
  for (const r of rows) {
    const vals = r.normalizedValues as Record<string, number | null> | null;
    if (vals) Object.keys(vals).forEach((k) => years.add(k));
  }
  return [...years].sort().reverse(); // most recent first
}

// ── Statement sheet builder ──────────────────────────────────────────────────

function buildStatementSheet(
  ws: ExcelJS.Worksheet,
  rows: {
    canonicalField: string | null;
    rawLabel: string | null;
    normalizedValues: unknown;
    mappingMethod: string | null;
    mappingConfidence: number | null;
    reviewStatus: string | null;
    statementScope: string | null;
  }[],
  years: string[],
  currency: string,
) {
  const usdCols = currency !== 'USD' ? years.map((y) => `${y}_USD`) : [];
  const allCols = ['Canonical Field', 'Raw Label', ...years, ...usdCols, 'Confidence', 'Method', 'Status', 'Scope'];

  ws.columns = allCols.map((h) => ({
    header: h,
    width: h === 'Raw Label' || h === 'Canonical Field' ? 32 : 14,
  }));

  applyHeaderRow(ws.getRow(1));

  for (const row of rows) {
    const vals = (row.normalizedValues as Record<string, number | null>) ?? {};
    const yearVals = years.map((y) => vals[y] ?? null);
    const usdVals = usdCols.map((_, i) => convertToUsd(vals[years[i]] ?? null, currency));
    ws.addRow([
      row.canonicalField ?? '',
      row.rawLabel ?? '',
      ...yearVals,
      ...usdVals,
      row.mappingConfidence != null ? Math.round(row.mappingConfidence * 100) / 100 : '',
      row.mappingMethod ?? '',
      row.reviewStatus ?? '',
      row.statementScope ?? '',
    ]).font = BODY_FONT;
  }

  // Format number columns
  const startCol = 3;
  const numColCount = years.length + usdCols.length;
  for (let c = startCol; c < startCol + numColCount; c++) {
    ws.getColumn(c).numFmt = '#,##0.00';
  }
}

// ── Main export function ─────────────────────────────────────────────────────

export async function buildXlsxExport(
  documentId: string,
  tier: ExportTier = 'reviewed',
): Promise<Buffer> {
  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const currency = doc.currencyCode ?? 'USD';
  const fxRate = getFxRate(currency);

  const reviewStatusFilter = tier === 'reviewed' ? 'auto_approved' : undefined;
  const allMapped = await getMappedRowsByDocument(documentId, {
    reviewStatus: reviewStatusFilter,
  });

  const mapped =
    tier === 'canonical'
      ? allMapped.filter((r) => r.canonicalField !== null)
      : allMapped;

  const rawRows = await getRowsByDocument(documentId);
  const validationResults = (doc.validationResults as Record<string, {
    name: string; status: string; lhs?: number; rhs?: number; diffPct?: number;
  }>) ?? {};

  const years = extractYears(mapped);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Financial SpreadX';
  wb.created = new Date();

  // ── Tab 1: Summary ──────────────────────────────────────
  const wsSummary = wb.addWorksheet('Summary');
  wsSummary.columns = [
    { header: 'Field', width: 28 },
    { header: 'Value', width: 42 },
  ];
  applyHeaderRow(wsSummary.getRow(1));

  const totalRows = mapped.length;
  const autoApproved = mapped.filter((r) => r.reviewStatus === 'auto_approved').length;
  const needsReview = mapped.filter((r) => r.reviewStatus === 'needs_review').length;
  const highConf = mapped.filter((r) => (r.mappingConfidence ?? 0) >= 0.80).length;
  const validPassed = Object.values(validationResults).filter((v) => v.status === 'passed').length;
  const validFailed = Object.values(validationResults).filter((v) => v.status === 'failed').length;

  const summaryData = [
    ['Document ID', documentId],
    ['File Name', doc.fileName],
    ['Template Type', doc.templateType ?? '—'],
    ['Currency', currency],
    [`FX Rate (1 ${currency} → USD)`, fxRate],
    ['Unit Scale', doc.unitScale ?? '—'],
    ['Statement Scopes', (doc.statementScopes ?? []).join(', ') || '—'],
    ['Export Tier', tier],
    ['Exported At', new Date().toISOString()],
    ['', ''],
    ['Total Mapped Rows', totalRows],
    ['Auto Approved', autoApproved],
    ['Needs Review', needsReview],
    ['High Confidence (≥80%)', highConf],
    ['', ''],
    ['Validation Checks Passed', validPassed],
    ['Validation Checks Failed', validFailed],
    ['Total Validation Checks', Object.keys(validationResults).length],
  ];

  for (const [field, value] of summaryData) {
    const row = wsSummary.addRow([field, value]);
    row.font = BODY_FONT;
    if (!field) row.height = 8;
  }

  // ── Tabs 2-5: Statement sheets ──────────────────────────
  const STATEMENT_TABS: Array<{ name: string; type: string }> = [
    { name: 'Income Statement', type: 'income_statement' },
    { name: 'Balance Sheet', type: 'balance_sheet' },
    { name: 'Cash Flow', type: 'cash_flow' },
    { name: 'Equity Statement', type: 'equity_statement' },
  ];

  for (const { name, type } of STATEMENT_TABS) {
    const ws = wb.addWorksheet(name);
    const stRows = mapped.filter((r) => r.statementType === type);
    buildStatementSheet(ws, stRows, years, currency);
  }

  // ── Tab 6: Validation ───────────────────────────────────
  const wsVal = wb.addWorksheet('Validation');
  wsVal.columns = [
    { header: 'Check ID', width: 10 },
    { header: 'Name', width: 36 },
    { header: 'Status', width: 12 },
    { header: 'LHS', width: 16 },
    { header: 'RHS', width: 16 },
    { header: 'Diff %', width: 10 },
  ];
  applyHeaderRow(wsVal.getRow(1));

  for (const [checkId, check] of Object.entries(validationResults)) {
    const row = wsVal.addRow([
      checkId,
      check.name,
      check.status,
      check.lhs ?? '',
      check.rhs ?? '',
      check.diffPct != null ? Math.round(check.diffPct * 10000) / 100 : '',
    ]);
    row.font = BODY_FONT;
    if (check.status === 'failed') {
      row.getCell(3).font = { ...BODY_FONT, color: { argb: 'FFB91C1C' }, bold: true };
    } else if (check.status === 'passed') {
      row.getCell(3).font = { ...BODY_FONT, color: { argb: 'FF15803D' }, bold: true };
    }
  }
  wsVal.getColumn(4).numFmt = '#,##0.00';
  wsVal.getColumn(5).numFmt = '#,##0.00';
  wsVal.getColumn(6).numFmt = '0.00"%"';

  // ── Tab 7: Raw Extraction ───────────────────────────────
  const wsRaw = wb.addWorksheet('Raw Extraction');
  wsRaw.columns = [
    { header: 'Page', width: 8 },
    { header: 'Statement Type', width: 18 },
    { header: 'Raw Label', width: 44 },
    { header: 'Indentation', width: 11 },
    { header: 'Is Subtotal', width: 11 },
    { header: 'Note Ref', width: 12 },
    { header: 'Scope', width: 14 },
    { header: 'Values (JSON)', width: 40 },
  ];
  applyHeaderRow(wsRaw.getRow(1));

  for (const r of rawRows) {
    wsRaw.addRow([
      r.page ?? '',
      r.statementType,
      r.rawLabel,
      r.indentationLevel ?? 0,
      r.isSubtotal ? 'Yes' : 'No',
      r.noteRef ?? '',
      r.statementScope ?? '',
      JSON.stringify(r.rawValues),
    ]).font = BODY_FONT;
  }

  // ── Tab 8: Metadata ─────────────────────────────────────
  const wsMeta = wb.addWorksheet('Metadata');
  wsMeta.columns = [
    { header: 'Metric', width: 32 },
    { header: 'Value', width: 24 },
  ];
  applyHeaderRow(wsMeta.getRow(1));

  const dictCount = mapped.filter((r) => r.mappingMethod === 'dictionary').length;
  const claudeCount = mapped.filter((r) => r.mappingMethod === 'claude').length;
  const overrideCount = mapped.filter((r) => r.mappingMethod === 'override').length;

  const confBrackets = {
    '< 0.50': mapped.filter((r) => (r.mappingConfidence ?? 0) < 0.50).length,
    '0.50 – 0.69': mapped.filter((r) => { const c = r.mappingConfidence ?? 0; return c >= 0.50 && c < 0.70; }).length,
    '0.70 – 0.79': mapped.filter((r) => { const c = r.mappingConfidence ?? 0; return c >= 0.70 && c < 0.80; }).length,
    '0.80 – 0.91': mapped.filter((r) => { const c = r.mappingConfidence ?? 0; return c >= 0.80 && c < 0.92; }).length,
    '≥ 0.92': mapped.filter((r) => (r.mappingConfidence ?? 0) >= 0.92).length,
  };

  const metaData: [string, string | number][] = [
    ['Template Type', doc.templateType ?? '—'],
    ['Page Count', doc.pageCount ?? '—'],
    ['OCR Required', doc.ocrRequired ? 'Yes' : 'No'],
    ['', ''],
    ['Mapping Method: Dictionary', dictCount],
    ['Mapping Method: Claude', claudeCount],
    ['Mapping Method: Override', overrideCount],
    ['', ''],
    ...Object.entries(confBrackets).map(([k, v]) => [`Confidence ${k}`, v] as [string, number]),
    ['', ''],
    ['Created At', doc.createdAt?.toISOString() ?? '—'],
    ['Exported At', new Date().toISOString()],
    ['Export Tier', tier],
    ['FX Rate Source', 'Hardcoded demo rates'],
  ];

  for (const [metric, value] of metaData) {
    const row = wsMeta.addRow([metric, value]);
    row.font = BODY_FONT;
    if (!metric) row.height = 8;
  }

  // Serialize workbook to buffer
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
