import { eq, and } from 'drizzle-orm';
import { db } from '../index';
import { extractedRows } from '../schema';

export async function insertExtractedRows(
  rows: (typeof extractedRows.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  return db.insert(extractedRows).values(rows).returning();
}

export async function getRowsByDocument(
  documentId: string,
  opts: { statementType?: string } = {},
) {
  const conditions = [eq(extractedRows.documentId, documentId)];
  if (opts.statementType) {
    conditions.push(eq(extractedRows.statementType, opts.statementType as any));
  }

  return db
    .select()
    .from(extractedRows)
    .where(and(...conditions))
    .orderBy(extractedRows.page, extractedRows.createdAt);
}
