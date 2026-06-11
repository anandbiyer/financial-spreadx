"use client";

import type { NoteItem } from "@/lib/db";

export function NoteDrawer({ note, onClose }: { note: NoteItem | null; onClose: () => void }) {
  return (
    <>
      <div className={`overlay${note ? " on" : ""}`} onClick={onClose} />
      <div className={`note-drawer${note ? " open" : ""}`}>
        {note && (
          <>
            <div className="nd-hd">
              <div>
                <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Note {note.noteNumber}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {note.noteTitle}
                </div>
              </div>
              <button className="btn bg btn-sm" onClick={onClose}>✕ Close</button>
            </div>
            <div className="nd-body">
              {note.summary && (
                <p style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {note.summary}
                </p>
              )}
              {note.subTables.map((t, i) => (
                <div key={i}>
                  {t.table_title && <div className="nd-sec">{t.table_title}</div>}
                  <table className="nd-tbl">
                    <tbody>
                      {t.rows.map((row, j) => (
                        <tr key={j}>
                          <td>{row.label}</td>
                          {Object.values(row.values || {}).map((v, k) => (
                            <td key={k} style={{ textAlign: "right" }}>
                              {v == null ? "—" : String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
