import { eq, and } from 'drizzle-orm';
import { db } from '../index';
import { documentPages } from '../schema';

export async function insertPageClassifications(
  pages: (typeof documentPages.$inferInsert)[],
) {
  if (pages.length === 0) return [];
  return db.insert(documentPages).values(pages).returning();
}

export async function getPagesByDocument(documentId: string) {
  return db
    .select()
    .from(documentPages)
    .where(eq(documentPages.documentId, documentId))
    .orderBy(documentPages.pageNumber);
}

export async function getSelectedPageText(
  documentId: string,
  sectionType: string,
) {
  const pages = await db
    .select()
    .from(documentPages)
    .where(
      and(
        eq(documentPages.documentId, documentId),
        eq(documentPages.isSelected, true),
        eq(documentPages.sectionType, sectionType),
      ),
    )
    .orderBy(documentPages.pageNumber);

  return pages.map((p) => p.textContent ?? '').join('\n\n');
}

export async function updatePageSection(
  id: string,
  sectionType: string,
  isSelected: boolean,
) {
  const [page] = await db
    .update(documentPages)
    .set({ sectionType, isSelected })
    .where(eq(documentPages.id, id))
    .returning();
  return page;
}
