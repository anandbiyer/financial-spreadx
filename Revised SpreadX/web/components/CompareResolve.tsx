"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type {
  BalanceCheck,
  CoaNode,
  DocumentHeader,
  SpreadSection,
  SpreadTreeResponse,
  UnmappedDetail,
} from "@/lib/db";
import { fmtNum } from "@/lib/format";
import { saveMappings } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { PdfPane } from "@/components/PdfPane";

interface Pending {
  unmappedItemId: string;
  coaId: string;
  rawLabel: string;
  fy1: number | null;
  saved: boolean;
}

export function CompareResolve({
  doc,
  tree,
  unmapped,
  hasPdf,
}: {
  doc: DocumentHeader;
  tree: SpreadTreeResponse;
  unmapped: UnmappedDetail[];
  hasPdf: boolean;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [balance, setBalance] = useState<BalanceCheck>(doc.balance);
  const [saving, setSaving] = useState(false);
  const [activePage, setActivePage] = useState<number>(
    unmapped.find((u) => u.page)?.page ?? 1
  );
  const show = useToast((s) => s.show);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const resolvedIds = new Set(pending.map((p) => p.unmappedItemId));
  const unsaved = pending.filter((p) => !p.saved);
  const pendingByCoa = new Map<string, Pending[]>();
  for (const p of pending) {
    const a = pendingByCoa.get(p.coaId) ?? [];
    a.push(p);
    pendingByCoa.set(p.coaId, a);
  }

  function toggle(coaId: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(coaId) ? next.delete(coaId) : next.add(coaId);
      return next;
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const item = active.data.current?.item as UnmappedDetail | undefined;
    const coaId = over.data.current?.coaId as string | undefined;
    if (!item || !coaId) return;
    setPending((p) => [
      ...p.filter((x) => x.unmappedItemId !== item.id),
      { unmappedItemId: item.id, coaId, rawLabel: item.rawLabel, fy1: item.fy1, saved: false },
    ]);
    setOpenIds((prev) => new Set(prev).add(coaId));
  }

  async function save() {
    if (!unsaved.length) return;
    const batch = unsaved.map((p) => ({ unmappedItemId: p.unmappedItemId, coaId: p.coaId }));
    setSaving(true);
    try {
      const res = await saveMappings(doc.id, batch);
      setBalance(res.balance);
      setPending((p) => p.map((x) => ({ ...x, saved: true })));
      show(`✓ ${res.saved} mapping(s) saved · Spread updated`);
    } catch (e) {
      // rollback: drop the unsaved optimistic mappings (keep already-saved)
      setPending((p) => p.filter((x) => x.saved));
      show(e instanceof Error ? e.message : "Save failed", "err");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setPending((p) => p.filter((x) => x.saved));
  }

  const lAndE = (balance.totalLiabilities ?? 0) + (balance.totalEquity ?? 0);

  return (
    <div className="screen">
      <div className="tb">
        <span className="pg-t">{doc.company}</span>
        <span className="pg-s">· Compare &amp; Resolve</span>
        <div className="tb-r">
          <Link href={`/spread/${doc.id}`} className="btn bg btn-sm">← Spread</Link>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="screen-body compare-body">
          <div className="compare-instruction">
            ↔ Drag an item from the <strong>Unmapped</strong> panel (right) onto a CoA line
            (centre) to resolve it, then <strong>Save &amp; Update Spread</strong>.
          </div>
          <div className="compare-3">
            {/* Pane 1 — PDF (page-jump on unmapped-item click) */}
            <div className="cpane cpane-pdf">
              <div className="cpane-hdr"><div className="cpane-hdr-t">Extracted Page</div></div>
              {hasPdf ? (
                <PdfPane docId={doc.id} page={activePage} />
              ) : (
                <div className="pdf-stub">No source PDF retained.</div>
              )}
            </div>

            {/* Pane 2 — CoA tree (drop targets) */}
            <div className="cpane cpane-coa">
              <div className="cpane-hdr">
                <div className="cpane-hdr-t">CoA Spread</div>
                <span className={`recon-chip ${balance.isBalanced ? "rc-pass" : "rc-fail"}`}>
                  {balance.isBalanced ? "A = L + E ✓" : `Assets ${fmtNum(balance.totalAssets)} · L+E ${fmtNum(lAndE)}`}
                </span>
              </div>
              <div className="cpane-body">
                <CompareTree
                  sections={tree.sections}
                  openIds={openIds}
                  onToggle={toggle}
                  pendingByCoa={pendingByCoa}
                />
              </div>
              {unsaved.length > 0 && (
                <div className="save-bar">
                  <span className="save-bar-txt">{unsaved.length} pending mapping(s)</span>
                  <div style={{ display: "flex", gap: 7 }}>
                    <button className="btn bg btn-sm" onClick={discard} disabled={saving}>Discard</button>
                    <button className="btn bp btn-sm" onClick={save} disabled={saving}>
                      {saving ? "Saving…" : "Save & Update Spread"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pane 3 — Unmapped (draggable) */}
            <div className="cpane cpane-unmapped">
              <div className="cpane-hdr">
                <div className="cpane-hdr-t">Unmapped</div>
                <span className="unmap-badge">
                  {unmapped.filter((u) => !resolvedIds.has(u.id)).length} pending
                </span>
              </div>
              <div className="cpane-body">
                {unmapped.map((u) => (
                  <UnmapDragItem
                    key={u.id}
                    item={u}
                    resolved={resolvedIds.has(u.id)}
                    onSelect={() => u.page && setActivePage(u.page)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function UnmapDragItem({
  item,
  resolved,
  onSelect,
}: {
  item: UnmappedDetail;
  resolved: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unmap-${item.id}`,
    data: { item },
    disabled: resolved,
  });
  const handlers = resolved ? {} : { ...attributes, ...listeners };
  return (
    <div
      ref={setNodeRef}
      {...handlers}
      onClick={onSelect}
      className={`unmap-drag-item${resolved ? " unmap-resolved" : ""}${isDragging ? " dragging" : ""}`}
    >
      <span className="drag-handle">⠿</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="unmap-label">{item.rawLabel}</div>
        <div className="unmap-sub">
          {item.statementType} · {fmtNum(item.fy1)}
          {item.suggestions[0] && ` · ${item.suggestions[0].coaId} ${item.suggestions[0].score.toFixed(2)}`}
        </div>
      </div>
      {resolved && <span style={{ color: "#15803d", fontWeight: 700 }}>✓</span>}
    </div>
  );
}

function CompareTree({
  sections,
  openIds,
  onToggle,
  pendingByCoa,
}: {
  sections: SpreadSection[];
  openIds: Set<string>;
  onToggle: (coaId: string) => void;
  pendingByCoa: Map<string, Pending[]>;
}) {
  return (
    <table className="coa-table">
      <thead>
        <tr>
          <th>CoA line</th>
          <th className="num">FY1</th>
          <th className="num">FY2</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((sec) => (
          <Fragment key={`${sec.statement}-${sec.category}`}>
            <tr className="coa-section-hdr">
              <td colSpan={3}>{sec.category}</td>
            </tr>
            {sec.nodes.map((n) => (
              <CoaDropRow
                key={n.mappingId}
                node={n}
                isOpen={openIds.has(n.coaId)}
                onToggle={onToggle}
                newLeaves={pendingByCoa.get(n.coaId) ?? []}
              />
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function CoaDropRow({
  node,
  isOpen,
  onToggle,
  newLeaves,
}: {
  node: CoaNode;
  isOpen: boolean;
  onToggle: (coaId: string) => void;
  newLeaves: Pending[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `coa-${node.coaId}`, data: { coaId: node.coaId } });
  const hasChildren = node.leaves.length > 0 || newLeaves.length > 0;
  return (
    <>
      <tr
        ref={setNodeRef}
        className={`tree-parent coa-drop-row${isOpen ? " open" : ""}${isOver ? " drag-over" : ""}`}
        onClick={() => hasChildren && onToggle(node.coaId)}
      >
        <td>
          <span className="tree-icon">{hasChildren ? "▶" : ""}</span>
          <span className="coa-id">{node.coaId}</span>{" "}
          <span style={{ color: "var(--text-primary)" }}>{node.name}</span>
        </td>
        <td className="num">{fmtNum(node.fy1)}</td>
        <td className="num">{fmtNum(node.fy2)}</td>
      </tr>
      {isOpen &&
        node.leaves.map((lf) => (
          <tr className="tree-leaf" key={lf.extractionId}>
            <td>
              <span className="tree-connector">└──</span> {lf.rawLabel}
            </td>
            <td className="num">{fmtNum(lf.fy1)}</td>
            <td className="num">{fmtNum(lf.fy2)}</td>
          </tr>
        ))}
      {isOpen &&
        newLeaves.map((nl) => (
          <tr className="tree-leaf coa-new-leaf" key={nl.unmappedItemId}>
            <td>
              <span className="tree-connector">└──</span> {nl.rawLabel}{" "}
              <span className="unmap-badge" style={{ background: "#dcfce7", color: "#166534" }}>
                {nl.saved ? "Mapped" : "Pending"} → {nl.coaId}
              </span>
            </td>
            <td className="num">{fmtNum(nl.fy1)}</td>
            <td className="num" />
          </tr>
        ))}
    </>
  );
}
