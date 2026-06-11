import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { runDetached, runOp } from "@/lib/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/upload — accept a PDF, register the Document (processing), and fire the
 * pipeline detached. Returns the documentId immediately; the client polls status.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file provided" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "PDF files only" }, { status: 400 });
  }

  const docId = randomUUID().replace(/-/g, "");
  const uploadsDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const pdfPath = path.join(uploadsDir, `${docId}.pdf`);
  await writeFile(pdfPath, Buffer.from(await file.arrayBuffer()));

  try {
    await runOp("register_upload", { documentId: docId, filename: file.name, pdfPath });
    runDetached("run_pipeline", { documentId: docId, pdfPath, filename: file.name });
    return NextResponse.json({ documentId: docId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
