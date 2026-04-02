import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById } from '@/lib/db/queries/documents';
import { getNoteByNumber } from '@/lib/db/queries/note-entries';

export const dynamic = 'force-dynamic';

// ── GET /api/notes/[documentId]/[noteNumber] ────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string; noteNumber: string }> },
) {
  const { documentId, noteNumber: noteNumberStr } = await params;

  const noteNumber = parseInt(noteNumberStr, 10);
  if (isNaN(noteNumber)) {
    return NextResponse.json({ error: 'Invalid note number' }, { status: 400 });
  }

  const doc = await getDocumentById(documentId);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const note = await getNoteByNumber(documentId, noteNumber);
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  return NextResponse.json(note);
}
