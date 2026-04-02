import { eq, and } from 'drizzle-orm';
import { db } from '../index';
import { noteEntries } from '../schema';

export async function insertNoteEntries(
  entries: (typeof noteEntries.$inferInsert)[],
) {
  if (entries.length === 0) return [];
  return db.insert(noteEntries).values(entries).returning();
}

export async function getNotesByDocument(documentId: string) {
  return db
    .select()
    .from(noteEntries)
    .where(eq(noteEntries.documentId, documentId))
    .orderBy(noteEntries.noteNumber);
}

export async function getNoteByNumber(
  documentId: string,
  noteNumber: number,
) {
  const [note] = await db
    .select()
    .from(noteEntries)
    .where(
      and(
        eq(noteEntries.documentId, documentId),
        eq(noteEntries.noteNumber, noteNumber),
      ),
    );
  return note ?? null;
}

export async function updateNoteLinkedRows(
  id: string,
  linkedRowIds: string[],
) {
  const [note] = await db
    .update(noteEntries)
    .set({ linkedRowIds })
    .where(eq(noteEntries.id, id))
    .returning();
  return note;
}
