import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById } from '@/lib/db/queries/documents';
import { buildJsonExport, buildRawJsonExport, type ExportTier } from '@/lib/export/json-export';
import { buildXlsxExport } from '@/lib/export/xlsx-export';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── GET /api/export/[id]/[format] ───────────────────────────────────────────
// Supported formats: xlsx | json | raw-json
// Optional query param: ?tier=raw|canonical|reviewed (default: reviewed)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await params;
  const { searchParams } = new URL(request.url);
  const tier = (searchParams.get('tier') ?? 'reviewed') as ExportTier;

  const validTiers: ExportTier[] = ['raw', 'canonical', 'reviewed'];
  if (!validTiers.includes(tier)) {
    return NextResponse.json(
      { error: `Invalid tier "${tier}". Use: ${validTiers.join(', ')}` },
      { status: 400 },
    );
  }

  let doc;
  try {
    doc = await getDocumentById(id);
  } catch {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const supported = ['xlsx', 'json', 'raw-json'];
  if (!supported.includes(format)) {
    return NextResponse.json(
      { error: `Unsupported format "${format}". Use: ${supported.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const slug = doc.fileName.replace(/\.pdf$/i, '').replace(/[^a-z0-9_-]/gi, '_');

    if (format === 'xlsx') {
      const buffer = await buildXlsxExport(id, tier);
      const body = new Uint8Array(buffer);
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${slug}_${tier}.xlsx"`,
          'Content-Length': String(body.byteLength),
        },
      });
    }

    if (format === 'json') {
      const buffer = await buildJsonExport(id, tier);
      const body = new Uint8Array(buffer);
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${slug}_${tier}.json"`,
          'Content-Length': String(body.byteLength),
        },
      });
    }

    // raw-json
    const buffer = await buildRawJsonExport(id);
    const body = new Uint8Array(buffer);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${slug}_raw.json"`,
        'Content-Length': String(body.byteLength),
      },
    });

  } catch (error) {
    console.error(`[GET /api/export/${id}/${format}] Error:`, error);
    return NextResponse.json(
      { error: 'Export failed', details: String(error) },
      { status: 500 },
    );
  }
}
