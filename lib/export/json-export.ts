/**
 * JSON Export Service
 *
 * Produces a structured canonical JSON export for a document.
 * Supports three tiers:
 *   raw       — all mapped rows regardless of review status
 *   canonical — rows that have a canonicalField assigned
 *   reviewed  — only auto_approved or reviewed rows
 */

import { getDocumentById } from '@/lib/db/queries/documents';
import { getMappedRowsByDocument } from '@/lib/db/queries/mapped-rows';
import { getRowsByDocument } from '@/lib/db/queries/extracted-rows';
import { getFxRate, convertToUsd } from './fx-rates';

export type ExportTier = 'raw' | 'canonical' | 'reviewed';

export interface JsonExportMeta {
  documentId: string;
  fileName: string;
  templateType: string | null;
  currency: string;
  fxRateToUsd: number;
  unitScale: string | null;
  statementScopes: string[];
  exportedAt: string;
  tier: ExportTier;
}

export interface JsonExportRow {
  canonicalField: string | null;
  rawLabel: string;
  statementType: string;
  values: Record<string, { original: number | null; usd: number | null }>;
  mappingMethod: string;
  mappingConfidence: number;
  reviewStatus: string;
  statementScope: string;
}

export interface JsonExportOutput {
  meta: JsonExportMeta;
  validation: Record<string, unknown>;
  statements: {
    income_statement: JsonExportRow[];
    balance_sheet: JsonExportRow[];
    cash_flow: JsonExportRow[];
    equity_statement: JsonExportRow[];
    other: JsonExportRow[];
  };
}

export async function buildJsonExport(
  documentId: string,
  tier: ExportTier = 'reviewed',
): Promise<Buffer> {
  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const currency = doc.currencyCode ?? 'USD';
  const fxRate = getFxRate(currency);

  // Fetch mapped rows with raw label join
  const reviewStatusFilter =
    tier === 'reviewed' ? 'auto_approved' : undefined;
  const allMapped = await getMappedRowsByDocument(documentId, {
    reviewStatus: reviewStatusFilter,
  });

  // For 'canonical' tier also include 'reviewed' status rows
  const rows =
    tier === 'canonical'
      ? allMapped.filter((r) => r.canonicalField !== null)
      : allMapped;

  const statements: JsonExportOutput['statements'] = {
    income_statement: [],
    balance_sheet: [],
    cash_flow: [],
    equity_statement: [],
    other: [],
  };

  for (const row of rows) {
    const rawValues = (row.normalizedValues as Record<string, number | null>) ?? {};
    const values: JsonExportRow['values'] = {};
    for (const [year, val] of Object.entries(rawValues)) {
      values[year] = {
        original: val,
        usd: convertToUsd(val, currency),
      };
    }

    const exportRow: JsonExportRow = {
      canonicalField: row.canonicalField,
      rawLabel: row.rawLabel ?? '',
      statementType: row.statementType ?? 'other',
      values,
      mappingMethod: row.mappingMethod ?? 'dictionary',
      mappingConfidence: row.mappingConfidence ?? 0,
      reviewStatus: row.reviewStatus ?? 'needs_review',
      statementScope: row.statementScope ?? 'unknown',
    };

    const bucket =
      (row.statementType as keyof typeof statements) ?? 'other';
    if (bucket in statements) {
      statements[bucket].push(exportRow);
    } else {
      statements.other.push(exportRow);
    }
  }

  const output: JsonExportOutput = {
    meta: {
      documentId,
      fileName: doc.fileName,
      templateType: doc.templateType,
      currency,
      fxRateToUsd: fxRate,
      unitScale: doc.unitScale,
      statementScopes: doc.statementScopes ?? [],
      exportedAt: new Date().toISOString(),
      tier,
    },
    validation: (doc.validationResults as Record<string, unknown>) ?? {},
    statements,
  };

  return Buffer.from(JSON.stringify(output, null, 2), 'utf-8');
}

/**
 * Raw JSON export — returns raw extracted rows without canonical mapping.
 */
export async function buildRawJsonExport(documentId: string): Promise<Buffer> {
  const doc = await getDocumentById(documentId);
  if (!doc) throw new Error(`Document ${documentId} not found`);

  const rows = await getRowsByDocument(documentId);

  const output = {
    meta: {
      documentId,
      fileName: doc.fileName,
      templateType: doc.templateType,
      currency: doc.currencyCode,
      exportedAt: new Date().toISOString(),
      tier: 'raw-json',
    },
    rows: rows.map((r) => ({
      id: r.id,
      statementType: r.statementType,
      rawLabel: r.rawLabel,
      rawValues: r.rawValues,
      page: r.page,
      sectionPath: r.sectionPath,
      indentationLevel: r.indentationLevel,
      noteRef: r.noteRef,
      isSubtotal: r.isSubtotal,
      statementScope: r.statementScope,
    })),
  };

  return Buffer.from(JSON.stringify(output, null, 2), 'utf-8');
}
