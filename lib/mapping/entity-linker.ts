/**
 * M9 — Entity Linker
 *
 * Parses note references from extracted rows and builds bidirectional links
 * between rows and note_entries.
 */

import { db } from '../db/index';
import { noteEntries } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Parse an integer note number from a note reference string.
 *
 * Examples:
 *   "Note 12"       → 12
 *   "(Note 3.1)"    → 3
 *   "See Note 5"    → 5
 *   null             → null
 *   "See accompanying notes" → null (no number)
 */
export function parseNoteNumber(noteRef: string | null): number | null {
  if (!noteRef) return null;
  const match = noteRef.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Link extracted rows to their corresponding note_entries via note_ref.
 * Writes bidirectional relationship: appends row UUIDs to note_entries.linked_row_ids.
 */
export async function linkNotesToRows(
  documentId: string,
  extractedRows: { id: string; noteRef: string | null }[],
  noteRecords: { id: string; noteNumber: number }[],
): Promise<void> {
  const noteMap = new Map(noteRecords.map((n) => [n.noteNumber, n.id]));

  // Group row IDs by note number
  const noteToRows = new Map<string, string[]>();

  for (const row of extractedRows) {
    const noteNum = parseNoteNumber(row.noteRef);
    if (noteNum === null) continue;

    const noteId = noteMap.get(noteNum);
    if (!noteId) continue;

    const existing = noteToRows.get(noteId) ?? [];
    existing.push(row.id);
    noteToRows.set(noteId, existing);
  }

  // Batch update note_entries with linked row IDs
  for (const [noteId, rowIds] of noteToRows) {
    await db
      .update(noteEntries)
      .set({ linkedRowIds: rowIds })
      .where(eq(noteEntries.id, noteId));
  }
}
