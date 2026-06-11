"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CoaOption, DocumentHeader, NoteItem, WorkbenchRow } from "@/lib/db";
import { fmtNum, fy12Of } from "@/lib/format";
import { overrideMapping } from "@/lib/api";
import { ConfidenceBar } from "@/components/ui";
import { PdfPane } from "@/components/PdfPane";
import { NoteDrawer } from "@/components/NoteDrawer";

const STMT_LABEL: Record<string, string> = {
  balance_sheet: "Balance Sheet",
  income_statement: "P&L",
  cash_flow: "Cash Flow",
  equity_statement: "Equity",
};
const COA_STMT: Record<string, string> = {
  balance_sheet: "Balance Sheet",
  income_statement: "P&L",
};
const FILTERS = ["all", "balance_sheet", "income_statement", "cash_flow"] as const;

export function ReviewWorkbench({
  doc,
  rows: initial,
  notes,
  coaOptions,
  hasPdf,
}: {
  doc: DocumentHeader;
  rows: WorkbenchRow[];
  notes: NoteItem[];
  coaOptions: CoaOption[];
  hasPdf: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [activePage, setActivePage] = useState<number>(
    initial.find((r) => r.page)?.page ?? 1
  );
  const [openNote, setOpenNote] = useState<NoteItem | null>(null);
  const coaName = useMemo(
    () => new Map(coaOptions.map((c) => [c.coaId, c.name])),
    [coaOptions]
  );
  const noteNums = useMemo(() => new Set(notes.map((n) => n.noteNumber)), [notes]);
  const refNum = (ref: string) => parseInt((ref.match(/\d+/) || [""])[0], 10);

  const visible = rows.filter((r) => filter === "all" || r.statementType === filter);

  function openNoteRef(ref: string | null) {
    if (!ref) return;
    const n = parseInt((ref.match(/\d+/) || [""])[0], 10);
    const note = notes.find((x) => x.noteNumber === n);
    if (note) setOpenNote(note);
  }

  async function doOverride(row: WorkbenchRow, newCoaId: string) {
    if (!row.mappingId || newCoaId === row.coaId) return;
    const prev = { coaId: row.coaId, coaName: row.coaName };
    setRows((rs) =>
      rs.map((r) =>
        r.extractionId === row.extractionId
          ? { ...r, coaId: newCoaId, coaName: coaName.get(newCoaId) ?? newCoaId }
          : r
      )
    );
    try {
      await overrideMapping(doc.id, row.mappingId, newCoaId, "Workbench override");
    } catch {
      setRows((rs) =>
        rs.map((r) => (r.extractionId === row.extractionId ? { ...r, ...prev } : r))
      );
    }
  }

  return (
    <div className="screen">
      <div className="tb">
        <span className="pg-t">{doc.company}</span>
        <span className="pg-s">· Review Workbench · {rows.length} rows</span>
        <div className="tb-r">
          <div className="fpills">
            {FILTERS.map((f) => (
              <div key={f} className={`fp${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : STMT_LABEL[f]}
              </div>
            ))}
          </div>
          <Link href={`/spread/${doc.id}`} className="btn bg btn-sm">← Spread</Link>
        </div>
      </div>

      <div className="screen-body rev-body">
        <div className="rev-layout">
          <div className="rev-pdf">
            <div className="cpane-hdr"><div className="cpane-hdr-t">Extracted Page</div></div>
            {hasPdf ? (
              <PdfPane docId={doc.id} page={activePage} />
            ) : (
              <div className="pdf-stub">No source PDF retained for this document.</div>
            )}
          </div>

          <div className="rev-table">
            <table>
              <thead>
                <tr>
                  <th>Raw Label</th>
                  <th className="num">FY1</th>
                  <th className="num">FY2</th>
                  <th>Mapped CoA line item</th>
                  <th>Confidence</th>
                  <th>Page</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const flagged =
                    r.mappingStatus === "mapped" && r.confidence != null && r.confidence < 0.75;
                  const v = fy12Of(r.rawValues);
                  return (
                    <tr
                      key={r.extractionId}
                      className={`rev-row${flagged ? " flagged" : ""}${activePage === r.page ? " active" : ""}`}
                      onClick={() => r.page && setActivePage(r.page)}
                    >
                      <td>
                        <span className="mono" style={{ fontSize: 9, color: "#8a8880" }}>
                          #{r.extractionId}
                        </span>{" "}
                        {r.rawLabel}
                        {r.noteRef &&
                          (noteNums.has(refNum(r.noteRef)) ? (
                            <span
                              className="note-pill"
                              style={{ marginLeft: 6, cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openNoteRef(r.noteRef);
                              }}
                            >
                              Note {r.noteRef} →
                            </span>
                          ) : (
                            <span
                              style={{ marginLeft: 6, fontSize: 9, color: "var(--text-muted)" }}
                            >
                              note {r.noteRef}
                            </span>
                          ))}
                      </td>
                      <td className="num">{fmtNum(v.fy1)}</td>
                      <td className="num">{fmtNum(v.fy2)}</td>
                      <td>
                        {r.mappingStatus === "mapped" ? (
                          flagged && r.mappingId ? (
                            <select
                              className="coa-select"
                              value={r.coaId ?? ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => doOverride(r, e.target.value)}
                            >
                              {coaOptions
                                .filter((c) => c.statement === COA_STMT[r.statementType])
                                .map((c) => (
                                  <option key={c.coaId} value={c.coaId}>
                                    {c.coaId} · {c.name}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <span>
                              <span className="coa-id">{r.coaId}</span> {r.coaName}
                            </span>
                          )
                        ) : r.mappingStatus === "unmapped" ? (
                          <Link href={`/resolver/${doc.id}`} className="al" onClick={(e) => e.stopPropagation()}>
                            ⚠ Unmapped — resolve →
                          </Link>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>not spread</span>
                        )}
                      </td>
                      <td>{r.confidence != null ? <ConfidenceBar value={r.confidence} /> : "—"}</td>
                      <td style={{ color: "var(--text-muted)" }}>{r.page || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <NoteDrawer note={openNote} onClose={() => setOpenNote(null)} />
    </div>
  );
}
