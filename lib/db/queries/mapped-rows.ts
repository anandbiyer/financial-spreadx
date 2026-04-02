import { eq, and, lt } from 'drizzle-orm';
import { db } from '../index';
import { mappedRows, extractedRows } from '../schema';

export async function insertMappedRows(
  rows: (typeof mappedRows.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  return db.insert(mappedRows).values(rows).returning();
}

export async function getMappedRowsByDocument(
  documentId: string,
  opts: {
    reviewStatus?: string;
    confidenceBelow?: number;
  } = {},
) {
  const conditions = [eq(mappedRows.documentId, documentId)];
  if (opts.reviewStatus) {
    conditions.push(eq(mappedRows.reviewStatus, opts.reviewStatus as any));
  }
  if (opts.confidenceBelow !== undefined) {
    conditions.push(lt(mappedRows.mappingConfidence, opts.confidenceBelow));
  }

  return db
    .select({
      id: mappedRows.id,
      rowId: mappedRows.rowId,
      documentId: mappedRows.documentId,
      canonicalField: mappedRows.canonicalField,
      canonicalGroup: mappedRows.canonicalGroup,
      parentCanonicalField: mappedRows.parentCanonicalField,
      normalizedValues: mappedRows.normalizedValues,
      mappingMethod: mappedRows.mappingMethod,
      mappingConfidence: mappedRows.mappingConfidence,
      validationResults: mappedRows.validationResults,
      reviewStatus: mappedRows.reviewStatus,
      statementScope: mappedRows.statementScope,
      createdAt: mappedRows.createdAt,
      // From extractedRows join
      rawLabel: extractedRows.rawLabel,
      statementType: extractedRows.statementType,
      noteRef: extractedRows.noteRef,
    })
    .from(mappedRows)
    .leftJoin(extractedRows, eq(mappedRows.rowId, extractedRows.id))
    .where(and(...conditions))
    .orderBy(mappedRows.createdAt);
}

export async function updateMappedRowReviewStatus(
  id: string,
  reviewStatus: typeof mappedRows.$inferInsert.reviewStatus,
  updates?: Partial<typeof mappedRows.$inferInsert>,
) {
  const [row] = await db
    .update(mappedRows)
    .set({ reviewStatus, ...updates })
    .where(eq(mappedRows.id, id))
    .returning();
  return row;
}

export async function bulkApproveAboveThreshold(
  documentId: string,
  threshold: number,
) {
  return db
    .update(mappedRows)
    .set({ reviewStatus: 'auto_approved' })
    .where(
      and(
        eq(mappedRows.documentId, documentId),
        eq(mappedRows.reviewStatus, 'needs_review'),
      ),
    )
    .returning();
}
