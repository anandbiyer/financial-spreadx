import { eq, sql, and, count } from 'drizzle-orm';
import { db } from '../index';
import { documents } from '../schema';

export async function getDocumentById(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  return doc ?? null;
}

export async function listDocuments(opts: {
  page?: number;
  limit?: number;
  status?: string;
  templateType?: string;
} = {}) {
  const { page = 1, limit = 20, status, templateType } = opts;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(documents.status, status as any));
  if (templateType) conditions.push(eq(documents.templateType, templateType));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(where)
      .orderBy(documents.createdAt)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(documents)
      .where(where),
  ]);

  return { rows, total, page, limit };
}

export async function createDocument(data: {
  fileName: string;
  companyName?: string;
  reportYear?: number[];
  blobUrl?: string;
  pageCount?: number;
  templateType?: string;
  currencyCode?: string;
  unitScale?: string;
}) {
  const [doc] = await db.insert(documents).values(data).returning();
  return doc;
}

export async function updateDocumentStatus(
  id: string,
  status: typeof documents.$inferInsert.status,
) {
  const [doc] = await db
    .update(documents)
    .set({ status })
    .where(eq(documents.id, id))
    .returning();
  return doc;
}

export async function updateDocumentTemplate(
  id: string,
  data: {
    templateType: string;
    classificationConfidence: number;
    currencyCode?: string;
    unitScale?: string;
    statementScopes?: string[];
    pageClassificationSummary?: Record<string, number>;
  },
) {
  const [doc] = await db
    .update(documents)
    .set(data)
    .where(eq(documents.id, id))
    .returning();
  return doc;
}

export async function updateDocumentValidation(
  id: string,
  validationResults: Record<string, unknown>,
  status?: typeof documents.$inferInsert.status,
) {
  const updates: Record<string, unknown> = { validationResults };
  if (status) updates.status = status;

  const [doc] = await db
    .update(documents)
    .set(updates)
    .where(eq(documents.id, id))
    .returning();
  return doc;
}
