import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById } from '@/lib/db/queries/documents';
import { getRowsByDocument } from '@/lib/db/queries/extracted-rows';

export const dynamic = 'force-dynamic';

// ── GET /api/documents/[id]/rows ────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const statementType = searchParams.get('statement_type') ?? undefined;

  const rows = await getRowsByDocument(id, { statementType });

  return NextResponse.json({ rows, total: rows.length });
}
