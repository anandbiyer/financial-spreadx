import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById } from '@/lib/db/queries/documents';
import { getMappedRowsByDocument } from '@/lib/db/queries/mapped-rows';

export const dynamic = 'force-dynamic';

// ── GET /api/documents/[id]/mapped ──────────────────────────────────────────
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
  const reviewStatus = searchParams.get('review_status') ?? undefined;
  const confidenceBelow = searchParams.get('confidence_below')
    ? parseFloat(searchParams.get('confidence_below')!)
    : undefined;

  const rows = await getMappedRowsByDocument(id, { reviewStatus, confidenceBelow });

  return NextResponse.json({ rows, total: rows.length });
}
