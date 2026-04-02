import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mappedRows } from '@/lib/db/schema';
import { insertReviewOverride } from '@/lib/db/queries/review-overrides';
import { updateMappedRowReviewStatus } from '@/lib/db/queries/mapped-rows';

export const dynamic = 'force-dynamic';

// ── POST /api/review/[mappedRowId] ──────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mappedRowId: string }> },
) {
  const { mappedRowId } = await params;

  const [existingRow] = await db
    .select()
    .from(mappedRows)
    .where(eq(mappedRows.id, mappedRowId));

  if (!existingRow) {
    return NextResponse.json({ error: 'Mapped row not found' }, { status: 404 });
  }

  const body = await request.json() as {
    new_canonical_field?: string;
    new_value?: number;
    reason?: string;
    reviewer?: string;
  };

  if (!body.new_canonical_field && body.new_value === undefined) {
    return NextResponse.json(
      { error: 'Provide new_canonical_field or new_value' },
      { status: 400 },
    );
  }

  // Write override record
  const override = await insertReviewOverride({
    mappedRowId,
    oldCanonicalField: existingRow.canonicalField,
    newCanonicalField: body.new_canonical_field ?? existingRow.canonicalField,
    reviewer: body.reviewer ?? 'analyst',
    reason: body.reason,
  });

  // Update the mapped row
  const updates: Partial<typeof mappedRows.$inferInsert> = {
    reviewStatus: 'reviewed',
    mappingMethod: 'override',
  };
  if (body.new_canonical_field) {
    updates.canonicalField = body.new_canonical_field;
  }

  const updated = await updateMappedRowReviewStatus(mappedRowId, 'reviewed', updates);

  return NextResponse.json({ override, mappedRow: updated });
}
