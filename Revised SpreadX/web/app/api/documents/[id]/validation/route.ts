import { NextResponse } from "next/server";
import { getValidation } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const v = getValidation(id);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(v);
}
