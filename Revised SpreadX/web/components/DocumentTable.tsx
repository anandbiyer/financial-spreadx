"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentListItem } from "@/lib/db";
import { templateLabel } from "@/lib/format";
import { HealthBar, StatusPill } from "@/components/ui";
import { useToast } from "@/components/Toast";

type Filter = "all" | "has_unmapped" | "complete";

const FILTERS: { key: Filter; label: (d: DocumentListItem[]) => string }[] = [
  { key: "all", label: (d) => `All (${d.length})` },
  { key: "has_unmapped", label: (d) => `Needs Review (${d.filter((x) => x.uiStatus === "has_unmapped").length})` },
  { key: "complete", label: (d) => `Spread Complete (${d.filter((x) => x.uiStatus === "complete").length})` },
];

export function DocumentTable({ documents }: { documents: DocumentListItem[] }) {
  const [list, setList] = useState(documents);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirm, setConfirm] = useState<DocumentListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const show = useToast((s) => s.show);

  const rows = list.filter((d) => filter === "all" || d.uiStatus === filter);

  async function doDelete(doc: DocumentListItem) {
    setBusy(true);
    const prev = list;
    setList((l) => l.filter((d) => d.id !== doc.id)); // optimistic
    setConfirm(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      show(`✓ Deleted ${doc.company || doc.filename} · learned mappings kept`);
      router.refresh();
    } catch (e) {
      setList(prev); // rollback
      show(e instanceof Error ? e.message : "delete failed", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fpills" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <div key={f.key} className={`fp${filter === f.key ? " on" : ""}`} onClick={() => setFilter(f.key)}>
            {f.label(list)}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-h">
          <div className="card-t">{rows.length} document{rows.length === 1 ? "" : "s"}</div>
          <span className="pg-s">latest run per filename</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Company</th><th>Year</th><th>Template</th><th>Status</th>
              <th>Health</th><th>Flagged</th><th>CoA Mapped</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="t-hover" onClick={() => router.push(`/spread/${d.id}`)}>
                <td>
                  <div className="co">{d.company || d.filename}</div>
                  <div className="co-s">{d.scope}</div>
                </td>
                <td>{d.fiscalYear ?? "—"}</td>
                <td><span className="badge b-gray">{templateLabel(d.templateType)}</span></td>
                <td><StatusPill status={d.uiStatus} /></td>
                <td><HealthBar score={d.healthScore} /></td>
                <td style={{ color: d.flaggedCount ? "#92400e" : "#8a8880", fontSize: 10.5 }}>
                  {d.flaggedCount || "—"}
                </td>
                <td className="mono" style={{ fontWeight: 500 }}>{d.mappedRows}/{d.mappableRows}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <span className="al" onClick={(e) => { e.stopPropagation(); router.push(`/spread/${d.id}`); }}>
                    Spread ↗
                  </span>
                  <span
                    className="al"
                    style={{ color: "var(--conf-red)", marginLeft: 10 }}
                    title="Delete document"
                    onClick={(e) => { e.stopPropagation(); setConfirm(d); }}
                  >
                    🗑
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <>
          <div className="overlay on" onClick={() => setConfirm(null)} />
          <div className="confirm-modal">
            <div className="card-t" style={{ marginBottom: 8 }}>Delete document?</div>
            <div className="placeholder-note" style={{ marginBottom: 12 }}>
              This removes <strong>{confirm.company || confirm.filename}</strong> — its PDF,
              extracted rows, mappings and unmapped items. <strong>Global learned mappings are
              kept.</strong> This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
              <button className="btn bg btn-sm" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
              <button
                className="btn btn-sm"
                style={{ background: "var(--conf-red)", color: "#fff" }}
                onClick={() => doDelete(confirm)}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
