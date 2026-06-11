import { NextResponse } from "next/server";
import { countCoaReference } from "@/lib/db";
import { runOp } from "@/lib/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — Phase 0 end-to-end smoke test: exercises BOTH bridges.
 * - DB read via lib/db (better-sqlite3)
 * - Python op round-trip via lib/python → webapi.ops echo
 */
export async function GET() {
  try {
    const python = await runOp<{ ok: boolean; echo: unknown }>("echo", {
      ping: true,
      phase: "0",
    });
    return NextResponse.json({
      ok: true,
      db: { coaReference: countCoaReference() },
      python,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
