import { NextResponse } from "next/server";
import { getSpreadTree } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/spread/[id] — CoA tree with extraction-id leaves + reconciliation. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tree = getSpreadTree(id);
  if (!tree) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(tree);
}
