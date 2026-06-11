"use client";

import { useState } from "react";
import Link from "next/link";
import type { DocumentHeader, ValidationResult } from "@/lib/db";
import { fmtNum } from "@/lib/format";

export function ValidationView({
  doc,
  initial,
}: {
  doc: DocumentHeader;
  initial: ValidationResult;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function revalidate() {
    setBusy(true);
    try {
      await fetch(`/api/spread/${doc.id}/recompute`, { method: "POST" });
      const res = await fetch(`/api/documents/${doc.id}/validation`);
      setV((await res.json()) as ValidationResult);
    } finally {
      setBusy(false);
    }
  }

  const b = v.balance;
  const r = v.reconciliation;
  const lAndE = (b.totalLiabilities ?? 0) + (b.totalEquity ?? 0);

  return (
    <div className="screen">
      <div className="tb">
        <span className="pg-t">{doc.company}</span>
        <span className="pg-s">· Validation · 2 checks</span>
        <div className="tb-r">
          <button className="btn bg btn-sm" onClick={revalidate} disabled={busy}>
            {busy ? "Re-validating…" : "↻ Re-validate"}
          </button>
          <Link href={`/spread/${doc.id}`} className="btn bg btn-sm">← Spread</Link>
        </div>
      </div>

      <div className="screen-body">
        {/* Card 1 — A = L + E */}
        <div className={`vcard ${b.isBalanced ? "pass" : "fail"}`}>
          <div className="vcard-t">
            {b.isBalanced ? "✓" : "⚠"} Balance Sheet Identity (A = L + E)
            <span className={`badge ${b.isBalanced ? "b-green" : "b-red"}`}>
              {b.isBalanced ? "PASS" : "FAIL"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            <Stat k="Total Assets" v={fmtNum(b.totalAssets)} />
            <Stat k="Liabilities + Equity" v={fmtNum(lAndE)} />
            <Stat k="Difference" v={fmtNum(b.difference)} />
            <Stat k="Primary Year" v={b.primary_year ?? "—"} />
          </div>
          {!b.isBalanced && (b.imbalanceContributors?.length ?? 0) > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="sl">Largest balance-sheet lines</div>
              <table>
                <tbody>
                  {b.imbalanceContributors!.slice(0, 5).map((c, i) => (
                    <tr key={i}>
                      <td><span className="coa-id">{c.coa_id}</span> {c.line_item_name}</td>
                      <td className="num">{fmtNum(c.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Card 2 — Subtotal Reconciliation */}
        <div className={`vcard ${r.failed === 0 ? "pass" : "fail"}`}>
          <div className="vcard-t">
            Subtotal Reconciliation
            <span className="badge b-green">{r.passed} foot</span>
            <span className="badge b-red">{r.failed} fail</span>
            <span className="badge b-gray">{r.incomplete} incomplete</span>
            {r.withUnmapped > 0 && <span className="badge b-amber">{r.withUnmapped} w/ unmapped leaf</span>}
          </div>
          <table>
            <thead>
              <tr><th>Subtotal</th><th>Foots</th><th>Missing leaf</th></tr>
            </thead>
            <tbody>
              {r.subtotals.map((st, i) => (
                <tr key={i}>
                  <td>{st.rawLabel}</td>
                  <td>
                    {st.pass === true ? (
                      <span className="recon-chip rc-pass">FOOTS</span>
                    ) : st.pass === false ? (
                      <span className="recon-chip rc-fail">FAIL</span>
                    ) : (
                      <span className="badge b-gray">incomplete</span>
                    )}
                  </td>
                  <td>{st.missingLeaf ? <span className="recon-chip rc-missing">yes</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="placeholder-note" style={{ padding: "0 2px" }}>
          v1 ships the two independent checks (A=L+E + subtotal reconciliation). The
          V01–V12 rule framework is out of scope (decision Q3).
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <div className="sl">{k}</div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{v}</div>
    </div>
  );
}
