import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById } from '@/lib/db/queries/documents';
import { getMappedRowsByDocument } from '@/lib/db/queries/mapped-rows';
import { runAllValidations, type CanonicalMap } from '@/lib/mapping/formula-validator';

export const dynamic = 'force-dynamic';

// ── GET /api/documents/[id]/validation ─────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const mappedRows = await getMappedRowsByDocument(id);

  // Build canonical map from primary year values
  const yearCounts: Record<string, number> = {};
  for (const row of mappedRows) {
    const vals = (row.normalizedValues as Record<string, number | null>) ?? {};
    for (const k of Object.keys(vals)) {
      if (/^\d{4}$/.test(k)) yearCounts[k] = (yearCounts[k] ?? 0) + 1;
    }
  }
  const primaryYear = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const canonicalMap: CanonicalMap = {};
  for (const row of mappedRows) {
    if (!row.canonicalField) continue;
    const vals = (row.normalizedValues as Record<string, number | null>) ?? {};
    const val = primaryYear ? (vals[primaryYear] ?? null) : null;
    canonicalMap[row.canonicalField] = val;
  }

  const checks = runAllValidations(canonicalMap, doc.templateType ?? '');

  const passed = checks.filter((c) => c.status === 'passed').length;
  const failed = checks.filter((c) => c.status === 'failed').length;
  const skipped = checks.filter((c) => c.status === 'skipped').length;
  const healthScore = checks.length > 0
    ? Math.round((passed / (checks.length - skipped || 1)) * 100)
    : 100;

  return NextResponse.json({
    documentId: id,
    templateType: doc.templateType,
    primaryYear,
    healthScore,
    summary: { passed, failed, skipped, total: checks.length },
    checks,
  });
}
