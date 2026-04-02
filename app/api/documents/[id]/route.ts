import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents, extractedRows, mappedRows } from '@/lib/db/schema';
import { getDocumentById } from '@/lib/db/queries/documents';
import { count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// ── GET /api/documents/[id] ─────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await getDocumentById(id);

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Include row counts
  const [{ extractedCount }] = await db
    .select({ extractedCount: count() })
    .from(extractedRows)
    .where(eq(extractedRows.documentId, id));

  const [{ mappedCount }] = await db
    .select({ mappedCount: count() })
    .from(mappedRows)
    .where(eq(mappedRows.documentId, id));

  const [{ reviewCount }] = await db
    .select({ reviewCount: count() })
    .from(mappedRows)
    .where(and(eq(mappedRows.documentId, id), eq(mappedRows.reviewStatus, 'needs_review')));

  return NextResponse.json({
    ...doc,
    _counts: {
      extractedRows: Number(extractedCount),
      mappedRows: Number(mappedCount),
      needsReview: Number(reviewCount),
    },
  });
}

// ── DELETE /api/documents/[id] ──────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await getDocumentById(id);

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(documents).where(eq(documents.id, id));

  return NextResponse.json({ deleted: true, id });
}
