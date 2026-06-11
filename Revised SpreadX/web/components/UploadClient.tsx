"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { uploadPdf } from "@/lib/api";
import type { PipelineStatus } from "@/lib/db";
import { fmtMoney } from "@/lib/format";

const STEPS = [
  { label: "Page Classification", match: ["S2", "S2b", "S2c"] },
  { label: "Financial Page Filtering", match: ["S3"] },
  { label: "Scanned / Template Classification", match: ["S4b"] },
  { label: "Row Extraction", match: ["S5"] },
  { label: "Notes Extraction", match: ["S6"] },
  { label: "COA Mapping & Spread", match: ["S11"] },
];

export function UploadClient() {
  const [docId, setDocId] = useState<string | null>(null);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Poll pipeline status while processing.
  useEffect(() => {
    if (!docId) return;
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/pipeline/${docId}/status`);
        const s = (await res.json()) as PipelineStatus;
        if (!active) return;
        setStatus(s);
        if (s.status === "done" || s.status === "error") return; // stop polling
      } catch {
        /* keep polling */
      }
      if (active) timer = setTimeout(tick, 1500);
    };
    let timer = setTimeout(tick, 800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [docId]);

  async function handleFile(file: File) {
    setError(null);
    setStatus(null);
    setDocId(null);
    try {
      const { documentId } = await uploadPdf(file);
      setDocId(documentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    }
  }

  const curIdx = STEPS.findIndex((s) => s.match.includes(status?.stage ?? ""));
  const done = status?.status === "done";
  const errored = status?.status === "error";

  function stepState(i: number): "done" | "running" | "pending" {
    if (done) return "done";
    if (curIdx < 0) return i === 0 && status?.status === "processing" ? "running" : "pending";
    if (i < curIdx) return "done";
    if (i === curIdx) return "running";
    return "pending";
  }

  return (
    <div className="screen">
      <Topbar title="Upload & Classify" subtitle="· single file · classify → extract → COA spread" />
      <div className="screen-body">
        <div className="s11-banner" style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, marginBottom: 10, fontSize: 11, color: "#1e40af" }}>
          ✦ <strong>Stage 11 — COA Mapping &amp; Spreading</strong> runs automatically after extraction.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div
            className={`upload-zone${dragOver ? " drag" : ""}${docId ? " active" : ""}`}
            onClick={() => !docId && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              {docId ? "Processing…" : "Drop PDF or click to browse"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Single PDF · any template · runs the full pipeline
            </div>
            {error && <div style={{ marginTop: 8, color: "var(--conf-red)", fontSize: 11 }}>{error}</div>}
          </div>

          <div>
            <div className="card">
              <div className="card-h">
                <div className="card-t">Pipeline Progress</div>
                <span className={`badge ${done ? "b-green" : errored ? "b-red" : docId ? "b-blue" : "b-gray"}`}>
                  {done ? "Complete" : errored ? "Error" : docId ? `Running · ${status?.stage ?? "queued"}` : "Waiting"}
                </span>
              </div>
              <div>
                {STEPS.map((step, i) => {
                  const st = stepState(i);
                  return (
                    <div key={i} style={{ display: "flex", gap: 9, padding: "7px 13px", borderBottom: "1px solid #f4f3f0", alignItems: "center" }}>
                      <div
                        style={{
                          width: 20, height: 20, borderRadius: "50%", display: "flex",
                          alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700,
                          flexShrink: 0,
                          background: st === "done" ? "#dcfce7" : st === "running" ? "#dbeafe" : "#f1f0eb",
                          color: st === "done" ? "#166534" : st === "running" ? "#1e40af" : "#8a8880",
                          animation: st === "running" ? "pulse 1.2s ease-in-out infinite" : undefined,
                        }}
                      >
                        {st === "done" ? "✓" : i + 1}
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: st === "pending" ? "var(--text-muted)" : "var(--text-primary)" }}>
                        {step.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {errored && (
              <div className="card">
                <div className="card-body" style={{ color: "var(--conf-red)", fontSize: 11.5 }}>
                  <strong>Pipeline error:</strong> {status?.error}
                </div>
              </div>
            )}

            {done && status?.summary && (
              <div className="card">
                <div className="card-h">
                  <div className="card-t">Run Summary · {status.summary.company}</div>
                  <span className="badge b-green">Complete</span>
                </div>
                <div className="card-body" style={{ fontSize: 11.5, display: "flex", flexDirection: "column", gap: 5 }}>
                  <Row k="Rows extracted" v={String(status.summary.totalRows)} />
                  <Row k="Mapped rows" v={String(status.summary.mappedRows)} />
                  <Row k="Unmapped pending" v={String(status.summary.unmappedCount)} />
                  <Row k="A = L + E" v={status.summary.balanced ? "Balanced" : "Imbalanced"} />
                  <Row k="Estimated cost" v={fmtMoney(status.summary.costUsd)} />
                  <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                    <Link href={`/spread/${docId}`} className="btn bp btn-sm">Open Spread →</Link>
                    <Link href={`/resolver/${docId}`} className="btn bg btn-sm">Resolve Unmapped</Link>
                    <Link href="/" className="btn bg btn-sm">Library</Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #f4f3f0" }}>
      <span style={{ color: "var(--text-muted)" }}>{k}</span>
      <span style={{ fontWeight: 500 }}>{v}</span>
    </div>
  );
}
