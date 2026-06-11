"use client";

import { useState } from "react";
import Link from "next/link";
import type { DocumentHeader, UnmappedDetail } from "@/lib/db";
import { fmtNum } from "@/lib/format";
import { resolveUnmapped } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface Item extends UnmappedDetail {
  resolved: boolean;
}

export function UnmappedResolver({
  doc,
  items: initial,
}: {
  doc: DocumentHeader;
  items: UnmappedDetail[];
}) {
  const [items, setItems] = useState<Item[]>(initial.map((i) => ({ ...i, resolved: false })));
  const [currentId, setCurrentId] = useState<string | null>(initial[0]?.id ?? null);
  const [selectedCoa, setSelectedCoa] = useState<string | null>(
    initial[0]?.suggestions[0]?.coaId ?? null
  );
  const [rationale, setRationale] = useState<string>(initial[0]?.suggestions[0]?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const show = useToast((s) => s.show);

  const cur = items.find((i) => i.id === currentId) ?? null;
  const resolvedCount = items.filter((i) => i.resolved).length;
  const pct = items.length ? (resolvedCount / items.length) * 100 : 0;

  function selectItem(id: string) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    setCurrentId(id);
    setSelectedCoa(it.suggestions[0]?.coaId ?? null);
    setRationale(it.suggestions[0]?.reason ?? "");
  }

  function advance(afterId: string) {
    const idx = items.findIndex((i) => i.id === afterId);
    const next =
      items.slice(idx + 1).find((i) => !i.resolved) ?? items.find((i) => !i.resolved);
    if (next && next.id !== afterId) selectItem(next.id);
  }

  async function confirm() {
    if (!cur || !selectedCoa) return;
    const itemId = cur.id;
    const coaId = selectedCoa;
    const note = rationale;
    // optimistic: mark resolved + advance (snappy — doesn't wait on the write)
    setItems((p) => p.map((i) => (i.id === itemId ? { ...i, resolved: true } : i)));
    setTimeout(() => advance(itemId), 300);
    setBusy(true);
    try {
      await resolveUnmapped(doc.id, itemId, coaId, note);
      show("✓ Mapping confirmed + stored in learning store");
    } catch (e) {
      // rollback
      setItems((p) => p.map((i) => (i.id === itemId ? { ...i, resolved: false } : i)));
      show(e instanceof Error ? e.message : "Failed to resolve", "err");
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="screen">
        <div className="tb">
          <span className="pg-t">{doc.company}</span>
          <span className="pg-s">· Unmapped Resolver</span>
          <div className="tb-r">
            <Link href={`/spread/${doc.id}`} className="btn bg btn-sm">← Spread</Link>
          </div>
        </div>
        <div className="screen-body">
          <div className="placeholder-note" style={{ padding: 14 }}>
            🎉 No pending unmapped items for this document.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="tb">
        <span className="pg-t">{doc.company}</span>
        <span className="pg-s">· Unmapped Resolver</span>
        <div className="tb-r">
          <span className="pg-s">
            {resolvedCount} / {items.length} resolved
          </span>
          <div className="ur-progress">
            <div className="ur-prog-fill" style={{ width: `${pct}%` }} />
          </div>
          <Link href={`/spread/${doc.id}`} className="btn bg btn-sm">← Spread</Link>
        </div>
      </div>

      <div className="screen-body resolver-body">
        <div className="ur-layout">
          {/* list */}
          <div className="ur-list">
            {items.map((it) => (
              <div
                key={it.id}
                className={`ur-item${it.id === currentId ? " cur" : ""}${it.resolved ? " resolved" : ""}`}
                onClick={() => selectItem(it.id)}
              >
                <div className="ur-label">{it.rawLabel}</div>
                <div className="ur-sub">
                  {it.statementType} · {fmtNum(it.fy1)}
                  {it.resolved && " · ✓"}
                </div>
              </div>
            ))}
          </div>

          {/* detail */}
          <div className="ur-detail">
            {cur ? (
              <>
                <div className="card-t">{cur.rawLabel}</div>
                <div>
                  <div className="dkv"><span className="dkv-k">Statement</span><span className="dkv-v">{cur.statementType}</span></div>
                  <div className="dkv"><span className="dkv-k">Document</span><span className="dkv-v">{doc.company}</span></div>
                  <div className="dkv"><span className="dkv-k">FY1 · FY2</span><span className="dkv-v">{fmtNum(cur.fy1)} · {fmtNum(cur.fy2)}</span></div>
                  <div className="dkv"><span className="dkv-k">Extraction ID(s)</span><span className="dkv-v mono">{cur.sourceExtractionIds.join(", ") || "—"}</span></div>
                </div>
                {cur.reason && <div className="reason-box"><strong>Why unmapped:</strong> {cur.reason}</div>}
                <div>
                  <div className="sl" style={{ marginBottom: 4 }}>Analyst rationale</div>
                  <textarea
                    className="rationale-area"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    placeholder="Why does this map to the selected CoA?"
                  />
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <button className="btn bp" onClick={confirm} disabled={busy || cur.resolved || !selectedCoa}>
                    ✓ Confirm{selectedCoa ? ` → ${selectedCoa}` : ""}
                  </button>
                  <button className="btn bg" onClick={() => advance(cur.id)}>Skip</button>
                </div>
              </>
            ) : (
              <div className="placeholder-note">Select an item.</div>
            )}
          </div>

          {/* suggestions */}
          <div className="ur-suggs">
            <div className="sl">AI Suggestions</div>
            {cur?.suggestions.length ? (
              cur.suggestions.map((s) => (
                <div
                  key={s.coaId}
                  className={`sugg-c${selectedCoa === s.coaId ? " sel" : ""}`}
                  onClick={() => setSelectedCoa(s.coaId)}
                >
                  <div className="sugg-id">{s.coaId} · {s.score.toFixed(2)}</div>
                  <div className="sugg-nm">{s.coaName}</div>
                  <div className="sugg-def">{s.definition}</div>
                </div>
              ))
            ) : (
              <div className="placeholder-note">No AI suggestions for this item.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
