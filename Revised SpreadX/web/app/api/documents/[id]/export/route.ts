import { runOp } from "@/lib/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportResult {
  format: string;
  tier: string;
  filename: string;
  base64?: string;
  json?: unknown;
}

/** GET /api/documents/[id]/export?format=xlsx|json&tier=raw|reviewed — DB-backed (B13). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "xlsx";
  const tier = url.searchParams.get("tier") || "reviewed";

  try {
    const r = await runOp<ExportResult>("export", { documentId: id, format, tier });
    if (format === "xlsx" && r.base64) {
      return new Response(new Uint8Array(Buffer.from(r.base64, "base64")), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${r.filename}"`,
        },
      });
    }
    return new Response(JSON.stringify(r.json ?? {}, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${r.filename}"`,
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
  }
}
