import { NextResponse } from "next/server";
import { getCoaReference } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/coa-reference — full Chart of Accounts (read via lib/db). */
export async function GET() {
  const rows = getCoaReference();
  return NextResponse.json({ count: rows.length, rows });
}
