import { NextResponse } from "next/server";
import { getDocuments } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/documents — latest run per filename (Document Library). */
export async function GET() {
  return NextResponse.json({ documents: getDocuments() });
}
