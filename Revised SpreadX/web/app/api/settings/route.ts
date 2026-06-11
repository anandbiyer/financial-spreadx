import { NextResponse } from "next/server";
import { runOp } from "@/lib/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await runOp("get_settings", {}));
}

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const r = await runOp("save_settings", {
      llm_provider: body.llmProvider,
      llm_model: body.llmModel,
      confidence_threshold: body.confidenceThreshold,
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
