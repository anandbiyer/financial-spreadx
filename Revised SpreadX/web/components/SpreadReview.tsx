"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  ConfidenceRow,
  DocumentHeader,
  LearnedAppliedRow,
  SpreadTreeResponse,
  UnmappedItemRow,
} from "@/lib/db";
import { confBand, BAND_COLOR, fmtNum } from "@/lib/format";
import { CoaTree } from "@/components/CoaTree";
import { ConfidenceBar, SourceChip } from "@/components/ui";

type Tab = "bs" | "pl" | "unmapped" | "confidence" | "learned";

export function SpreadReview({
  doc,
  tree,
  unmapped,
  confidence,
  learned,
}: {
  doc: DocumentHeader;
  tree: SpreadTreeResponse;
  unmapped: UnmappedItemRow[];
  confidence: ConfidenceRow[];
  learned: LearnedAppliedRow[];
}) {
  const [tab, setTab] = useState<Tab>("bs");

  const bs = tree.sections.filter((s) => s.statement === "balance_sheet");
  const pl = tree.sections.filter((s) => s.statement === "income_statement");
  const r = tree.reconciliation ?? {};

  const TABS: { key: Tab; label: string }[] = [
    { key: "bs", label: "Balance Sheet" },
    { key: "pl", label: "P&L Statement" },
    { key: "unmapped", label: `Unmapped Items (${unmapped.length})` },
    { key: "confidence", label: "Confidence & Source" },
    { key: "learned", label: `Learned Mappings (${learned.length})` },
  ];

  return (
    <div className="screen">
      <div className="tb">
        <span className="pg-t">{doc.company || doc.filename}</span>
        <span className="pg-s">
          · {doc.fiscalYear ?? "—"} · Spread Review
        </span>
        <div className="tb-r">
          <Link href={`/review/${doc.id}`} className="btn bg btn-sm">Workbench</Link>
          <Link href={`/tree/${doc.id}`} className="btn bg btn-sm">Tree</Link>
          <Link href={`/validation/${doc.id}`} className="btn bg btn-sm">Validation</Link>
          <Link href={`/resolver/${doc.id}`} className="btn bg btn-sm">Resolve</Link>
          <Link href={`/compare/${doc.id}`} className="btn bp btn-sm">Compare ↔</Link>
          <Link href={`/export/${doc.id}`} className="btn bg btn-sm">Export</Link>
          <Link href="/" className="btn bg btn-sm">← Docs</Link>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`tab${tab === t.key ? " on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      <div className="screen-body">
        {/* Balance + reconciliation banner (always visible on tree tabs) */}
        {(tab === "bs" || tab === "pl") && (
          <div className={`balance-banner ${doc.balance.isBalanced ? "bb-ok" : "bb-fail"}`}>
            <strong>{doc.balance.isBalanced ? "✓ A = L + E balances" : "⚠ A = L + E imbalance"}</strong>
            <span>
              Assets {fmtNum(doc.balance.totalAssets)} · L+E{" "}
              {fmtNum((doc.balance.totalLiabilities ?? 0) + (doc.balance.totalEquity ?? 0))} · diff{" "}
              {fmtNum(doc.balance.difference)}
            </span>
            <span className="recon-summary" style={{ marginLeft: "auto" }}>
              Reconciliation:{" "}
              <span className="recon-chip rc-pass">{r.passed ?? 0} foot</span>
              <span className="recon-chip rc-fail">{r.failed ?? 0} fail</span>
              {!!r.incomplete && <span className="badge b-gray">{r.incomplete} incomplete</span>}
            </span>
          </div>
        )}

        {tab === "bs" && <CoaTree sections={bs} />}
        {tab === "pl" && <CoaTree sections={pl} />}

        {tab === "unmapped" && <UnmappedTab rows={unmapped} />}
        {tab === "confidence" && <ConfidenceTab rows={confidence} />}
        {tab === "learned" && <LearnedTab rows={learned} />}
      </div>
    </div>
  );
}

function UnmappedTab({ rows }: { rows: UnmappedItemRow[] }) {
  if (!rows.length)
    return <div className="placeholder-note" style={{ padding: 14 }}>No unmapped items.</div>;
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Unmapped Items</div>
        <span className="pg-s">pending + not-spread (equity)</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Raw Label</th>
            <th>Statement</th>
            <th className="num">FY1</th>
            <th>Status</th>
            <th>Top Suggestion</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{u.rawLabel}</td>
              <td>{u.statementType}</td>
              <td className="num">{fmtNum(u.fy1)}</td>
              <td>
                <span className={`badge ${u.status === "pending" ? "b-amber" : "b-gray"}`}>
                  {u.status}
                </span>
              </td>
              <td className="mono">
                {u.topSuggestion
                  ? `${u.topSuggestion.coaId} (${u.topSuggestion.score.toFixed(2)})`
                  : "—"}
              </td>
              <td style={{ color: "var(--text-muted)", fontSize: 10.5, maxWidth: 280 }}>
                {u.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfidenceTab({ rows }: { rows: ConfidenceRow[] }) {
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Confidence & Source</div>
        <span className="pg-s">{rows.length} mapped lines · sorted by confidence</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>CoA</th>
            <th>Raw Label</th>
            <th>Confidence</th>
            <th>Source</th>
            <th>Extraction ID(s)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={`${c.coaId}-${i}`} style={{ background: confBand(c.confidence) === "red" ? "#fffbeb" : undefined }}>
              <td>
                <span className="coa-id">{c.coaId}</span>{" "}
                <span style={{ color: "var(--text-secondary)" }}>{c.name}</span>
              </td>
              <td>{c.rawLabel}</td>
              <td>
                <ConfidenceBar value={c.confidence} />
              </td>
              <td>
                <SourceChip source={c.source} />
              </td>
              <td className="mono" style={{ fontSize: 10 }}>
                {c.extractionIds.join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearnedTab({ rows }: { rows: LearnedAppliedRow[] }) {
  if (!rows.length)
    return (
      <div className="placeholder-note" style={{ padding: 14 }}>
        No learned mappings were applied to this document (all mapped by Claude / manual).
      </div>
    );
  return (
    <div className="card">
      <div className="card-h">
        <div className="card-t">Learned Mappings Applied</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>CoA</th>
            <th>Raw Label</th>
            <th>Confidence</th>
            <th>Learned From</th>
            <th>Times Applied</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => (
            <tr key={`${l.coaId}-${i}`}>
              <td>
                <span className="coa-id">{l.coaId}</span>
              </td>
              <td>{l.rawLabel}</td>
              <td style={{ color: BAND_COLOR[confBand(l.confidence)] }}>{l.confidence.toFixed(2)}</td>
              <td>{l.sourceDocument}</td>
              <td>{l.timesApplied}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
