"use client";

import { Fragment, useState } from "react";
import type { SpreadSection } from "@/lib/db";
import { fmtNum } from "@/lib/format";
import { ConfidenceBar, ReconChip, SourceChip } from "@/components/ui";

/**
 * CoA tree — expandable parent CoA lines with extraction-id source-line leaves
 * (FrontendDesign §1, the reference component). Reused by Compare View in Phase 3.
 */
export function CoaTree({ sections }: { sections: SpreadSection[] }) {
  const allIds = sections.flatMap((s) => s.nodes.map((n) => n.mappingId));
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (!sections.length) {
    return (
      <div className="placeholder-note" style={{ padding: 14 }}>
        No mapped CoA lines for this statement.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">CoA lines</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn bg btn-sm" onClick={() => setOpen(new Set(allIds))}>
            Expand all
          </button>
          <button className="btn bg btn-sm" onClick={() => setOpen(new Set())}>
            Collapse all
          </button>
        </div>
      </div>
      <table className="coa-table">
        <thead>
          <tr>
            <th>CoA line</th>
            <th className="num">FY1</th>
            <th className="num">FY2</th>
            <th>Confidence</th>
            <th>Source</th>
            <th>Recon</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => (
            <Fragment key={sec.category}>
              <tr className="coa-section-hdr">
                <td colSpan={6}>{sec.category}</td>
              </tr>
              {sec.nodes.map((n) => {
                const isOpen = open.has(n.mappingId);
                const hasLeaves = n.leaves.length > 0;
                return (
                  <Fragment key={n.mappingId}>
                    <tr
                      className={`tree-parent${isOpen ? " open" : ""}${n.isSubtotal ? " subtotal" : ""}`}
                      onClick={() => hasLeaves && toggle(n.mappingId)}
                    >
                      <td>
                        <span className="tree-icon">{hasLeaves ? "▶" : ""}</span>
                        <span className="coa-id">{n.coaId}</span>{" "}
                        <span style={{ color: "var(--text-primary)" }}>{n.name}</span>
                        {n.aggregatedFrom > 1 && (
                          <span className="pg-s"> · {n.aggregatedFrom} rows</span>
                        )}
                      </td>
                      <td className="num">{fmtNum(n.fy1)}</td>
                      <td className="num">{fmtNum(n.fy2)}</td>
                      <td>
                        <ConfidenceBar value={n.confidence} />
                      </td>
                      <td>
                        <SourceChip source={n.source} />
                      </td>
                      <td>
                        {n.reconcile && (
                          <ReconChip
                            pass={n.reconcile.pass}
                            missingLeaf={n.reconcile.missingLeaf}
                          />
                        )}
                      </td>
                    </tr>
                    {isOpen &&
                      n.leaves.map((lf) => (
                        <tr className="tree-leaf" key={lf.extractionId}>
                          <td>
                            <span className="tree-connector">└──</span>{" "}
                            <span className="mono" style={{ fontSize: 9, color: "#8a8880" }}>
                              #{lf.extractionId}
                            </span>{" "}
                            {lf.rawLabel}
                            {lf.noteRef && <span className="note-pill"> · {lf.noteRef}</span>}{" "}
                            <span className="pg-s">p{lf.page}</span>
                          </td>
                          <td className="num">{fmtNum(lf.fy1)}</td>
                          <td className="num">{fmtNum(lf.fy2)}</td>
                          <td colSpan={3} />
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
