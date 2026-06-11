import { readFile } from "node:fs/promises";
import { getDocumentPdfPath } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/documents/[id]/pdf — stream the retained source PDF (Phase 4 viewer). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const path = getDocumentPdfPath(id);
  if (!path) return new Response("no pdf for this document", { status: 404 });
  try {
    const buf = await readFile(path);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("pdf file not found on disk", { status: 404 });
  }
}
