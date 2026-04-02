import { eq } from 'drizzle-orm';
import { db } from '../index';
import { reviewOverrides } from '../schema';

export async function insertReviewOverride(
  data: typeof reviewOverrides.$inferInsert,
) {
  const [override] = await db
    .insert(reviewOverrides)
    .values(data)
    .returning();
  return override;
}

export async function getOverridesByDocument(mappedRowIds: string[]) {
  if (mappedRowIds.length === 0) return [];
  // Use inArray once we have mapped row IDs
  const results = [];
  for (const id of mappedRowIds) {
    const overrides = await db
      .select()
      .from(reviewOverrides)
      .where(eq(reviewOverrides.mappedRowId, id));
    results.push(...overrides);
  }
  return results;
}
