"use client";

import { useState } from "react";
import Link from "next/link";
import type { DocumentHeader } from "@/lib/db";

type Tier = "reviewed" | "raw";

export function ExportCentre({ doc }: { doc: DocumentHeader }) {
  const [tier, setTier] = useState<Tier>("reviewed");

  const download = (format: "xlsx" | "json") => {
    window.open(`/api/documents/${doc.id}/export?format=${format}&tier=${tier}`, "_blank");
  };

  return (
    <div className="screen">
      <div className="tb">
        <span className="pg-t">{doc.company}</span>
        <span className="pg-s">· Export Centre</span>
        <div className="tb-r">
          <Link href={`/spread/${doc.id}`} className="btn bg btn-sm">← Spread</Link>
        </div>
      </div>

      <div className="screen-body">
        <div className="sl" style={{ marginBottom: 6 }}>Tier</div>
        <div className="tier-sel">
          <button className={`tier-btn${tier === "raw" ? " on" : ""}`} onClick={() => setTier("raw")}>
            Raw extraction
          </button>
          <button className={`tier-btn${tier === "reviewed" ? " on" : ""}`} onClick={() => setTier("reviewed")}>
            Reviewed final
          </button>
        </div>
        <div className="placeholder-note" style={{ marginBottom: 12 }}>
          {tier === "raw"
            ? "Raw extracted rows (Extraction ID, page, label, values) rebuilt from the database."
            : "The 7-sheet spread workbook generated live from the database — reflects analyst resolves/overrides, recomputed balance + reconciliation."}
        </div>

        <div className="ex-grid">
          <div className="ex-card rec">
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <span className="ex-ico" style={{ background: "#15803d" }}>X</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>XLSX</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Excel workbook</div>
              </div>
            </div>
            <button className="btn bp btn-sm" onClick={() => download("xlsx")}>↓ Download XLSX</button>
          </div>

          <div className="ex-card">
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <span className="ex-ico" style={{ background: "#b45309" }}>{`{}`}</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>JSON</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Structured data</div>
              </div>
            </div>
            <button className="btn bg btn-sm" onClick={() => download("json")}>↓ Download JSON</button>
          </div>

          <div className="ex-card def">
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <span className="ex-ico" style={{ background: "#8a8880" }}>C</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>CSV</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Deferred</div>
              </div>
            </div>
            <button className="btn bg btn-sm" disabled>Not in v1</button>
          </div>

          <div className="ex-card def">
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <span className="ex-ico" style={{ background: "#8a8880" }}>P</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>PDF</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Deferred</div>
              </div>
            </div>
            <button className="btn bg btn-sm" disabled>Not in v1</button>
          </div>
        </div>
      </div>
    </div>
  );
}
