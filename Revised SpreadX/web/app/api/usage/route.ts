import { NextResponse } from "next/server";
import { getUsageAll } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/usage — aggregate LLM usage/cost across documents. */
export async function GET() {
  return NextResponse.json(getUsageAll());
}
