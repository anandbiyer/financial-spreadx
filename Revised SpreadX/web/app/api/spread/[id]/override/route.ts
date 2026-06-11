import { NextResponse } from "next/server";
import { runOp } from "@/lib/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/spread/[id]/override — re-point an existing CoA mapping (Workbench). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  try {
    const result = await runOp("override_mapping", {
      documentId: id,
      mappingId: body.mappingId,
      newCoaId: body.newCoaId,
      rationale: body.rationale ?? "",
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
