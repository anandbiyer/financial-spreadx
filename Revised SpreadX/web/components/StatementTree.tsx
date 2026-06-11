"use client";

import { useState } from "react";
import Link from "next/link";
import type { DocumentHeader, ExtractedRowItem, NoteItem } from "@/lib/db";
import { fmtNum, fy12Of } from "@/lib/format";
import { NoteDrawer } from "@/components/NoteDrawer";

const SECTIONS: { key: string; label: string }[] = [
  { key: "income_statement", label: "Income Statement" },
  { key: "balance_sheet", label: "Balance Sheet" },
  { key: "cash_flow", label: "Cash Flow" },
  { key: "equity_statement", label: "Equity" },
];
type Scope = "both" | "consolidated" | "standalone";
const SCOPE_MATCH: Record<Scope, (s: string) => boolean> = {
  both: () => true,
  consolidated: (s) => s === "consolidated" || s === "group",
  standalone: (s) => s === "standalone" || s === "company",
};

export function StatementTree({
  doc,
  rows,
  notes,
}: {
  doc: DocumentHeader;
  rows: ExtractedRowItem[];
  notes: NoteItem[];
}) {
  const [scope, setScope] = useState<Scope>("both");
  const [open, setOpen] = useState<Set<string>>(new Set(["balance_sheet"]));
  const [openNote, setOpenNote] = useState<NoteItem | null>(null);

  const scoped = rows.filter((r) => SCOPE_MATCH[scope](r.statementScope));
  const noteNums = new Set(notes.map((n) => n.noteNumber));
  const toggle = (k: string) =>
    setOpen((p) => {
      const n = new Set(p);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  return (
    <div className="screen">
      <div className="tb">
        <span className="pg-t">{doc.company}</span>
        <span className="pg-s">· Statement Tree</span>
        <div className="tb-r">
          <div className="scope-pills">
            {(["both", "consolidated", "standalone"] as Scope[]).map((s) => (
              <button key={s} className={`scope-btn${scope === s ? " on" : ""}`} onClick={() => setScope(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <Link href={`/spread/${doc.id}`} className="btn bg btn-sm">← Spread</Link>
        </div>
      </div>

      <div className="screen-body">
        {SECTIONS.map((sec) => {
          const secRows = scoped.filter((r) => r.statementType === sec.key);
          if (!secRows.length) return null;
          const isOpen = open.has(sec.key);
          return (
            <div key={sec.key} className={`ts${isOpen ? " open" : ""}`}>
              <div className="thd" onClick={() => toggle(sec.key)}>
                <div className="thd-t">
                  <span className="acc-icon">▶</span>
                  {sec.label}
                  <span className="badge b-gray">{secRows.length}</span>
                </div>
              </div>
              {isOpen && (
                <div className="tbdy">
                  {secRows.map((r) => (
                    <div
                      key={r.extractionId}
                      className={`trow${r.isSubtotal ? " sub" : ""}`}
                      style={{ paddingLeft: 10 + r.indentationLevel * 14 }}
                    >
                      <span>
                        {r.rawLabel}
                        {r.noteRef &&
                          (noteNums.has(parseInt((r.noteRef.match(/\d+/) || [""])[0], 10)) ? (
                            <span
                              className="note-pill"
                              style={{ marginLeft: 6, cursor: "pointer" }}
                              onClick={() => {
                                const n = parseInt((r.noteRef!.match(/\d+/) || [""])[0], 10);
                                const note = notes.find((x) => x.noteNumber === n);
                                if (note) setOpenNote(note);
                              }}
                            >
                              Note {r.noteRef} →
                            </span>
                          ) : (
                            <span style={{ marginLeft: 6, fontSize: 9, color: "var(--text-muted)" }}>
                              note {r.noteRef}
                            </span>
                          ))}
                      </span>
                      <span className="trow-val">{fmtNum(fy12Of(r.rawValues).fy1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Notes Index */}
        {notes.length > 0 && (
          <div className={`ts${open.has("notes") ? " open" : ""}`}>
            <div className="thd" onClick={() => toggle("notes")}>
              <div className="thd-t">
                <span className="acc-icon">▶</span>
                Notes Index
                <span className="badge b-gray">{notes.length}</span>
              </div>
            </div>
            {open.has("notes") && (
              <div className="tbdy">
                {notes.map((n) => (
                  <div key={n.noteNumber} className="trow">
                    <span>
                      <span className="mono" style={{ color: "var(--text-muted)", fontSize: 9 }}>
                        Note {n.noteNumber}
                      </span>{" "}
                      {n.noteTitle}
                    </span>
                    <span className="al" style={{ marginLeft: "auto" }} onClick={() => setOpenNote(n)}>
                      View note →
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <NoteDrawer note={openNote} onClose={() => setOpenNote(null)} />
    </div>
  );
}
