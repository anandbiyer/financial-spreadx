import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mappedRows, extractedRows, documents } from '@/lib/db/schema';
import { streamMappingExplanation } from '@/lib/claude/explain';

export const dynamic = 'force-dynamic';

// ── GET /api/review/[mappedRowId]/explain — SSE stream ──────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mappedRowId: string }> },
) {
  const { mappedRowId } = await params;

  // Fetch mapped row with its source extracted row and document
  const [row] = await db
    .select()
    .from(mappedRows)
    .where(eq(mappedRows.id, mappedRowId));

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [srcRow] = await db
    .select()
    .from(extractedRows)
    .where(eq(extractedRows.id, row.rowId));

  const [doc] = await db
    .select({ templateType: documents.templateType })
    .from(documents)
    .where(eq(documents.id, row.documentId));

  const stream = await streamMappingExplanation({
    rawLabel: row.canonicalField ? srcRow?.rawLabel ?? row.canonicalField : row.canonicalField ?? '(unknown)',
    canonicalField: row.canonicalField ?? '(unmapped)',
    mappingMethod: row.mappingMethod ?? 'dictionary',
    mappingConfidence: row.mappingConfidence ?? 0,
    templateType: doc?.templateType ?? 'unknown',
    statementType: srcRow?.statementType ?? 'income_statement',
    validationResults: (row.validationResults as Record<string, string>) ?? undefined,
  });

  // Return as SSE text/event-stream
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = (stream as any).getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = typeof value === 'string' ? value : new TextDecoder().decode(value);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
