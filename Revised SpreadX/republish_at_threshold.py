"""Republish the per-document spread workbooks at the current confidence threshold
(config.SPREAD_CONFIDENCE_THRESHOLD, now 0.55) WITHOUT re-running the LLM.

The threshold is a post-hoc gate: lowering 0.60 -> 0.55 only accepts mapping picks
the model already produced (persisted as the top suggestion on each unmapped item).
So this script reconciles the latest-per-filename document in spreadx.db to what a
fresh 0.55 run would yield, then rewrites <stem>_spread.xlsx:

  1. Promote each pending BS/P&L unmapped item whose top REAL-CoA suggestion score
     >= threshold into a coa_mapping (sign applied, merged into the existing
     aggregated row for that coa_id so there stays exactly one row per coa_id).
     Promoted unmapped_items are marked status="auto_mapped" (terminal, hidden from
     the Unmapped sheet).
  2. Reconcile pre-equity-skip data: any pending equity_statement item becomes
     status="not_spread" (matching the current "equity is not spread" behaviour), so
     it shows as terminal on the Unmapped sheet rather than as analyst work.
  3. Recompute the document's balance_check_result and the unmapped-component flags
     in reconciliation_result, and refresh unmapped_count / spread_status.
  4. Re-export <stem>_spread.xlsx via the normal service path.

Idempotent: re-running maps nothing new once the DB already reflects the threshold.
Run:  .venv\\Scripts\\python.exe republish_at_threshold.py
"""

from __future__ import annotations

import copy
import os
import uuid

from sqlalchemy import func, select

from config import SPREAD_CONFIDENCE_THRESHOLD
from db.models import CoaMapping, UnmappedItem
from db.queries import get_all_coa_reference
from db.session import session_scope
from spreading.coa_mapper import _EQUITY_NOTE, _merge_spreads
from spreading.balance_checks import check_balance_sheet_identity
from spreading.service import export_spread_xlsx
from spreading.sign_conventions import apply_sign_to_spread
from build_threshold_sensitivity import _best_suggestion, _load_docs, _norm

THRESHOLD = SPREAD_CONFIDENCE_THRESHOLD
_ROOT = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(_ROOT, "Financials_Provided")


def _reconcile_doc(doc, coa_by_id, valid_ids, s) -> dict:
    """Mutate one document's mappings/unmapped/checks in place. Returns a recap."""
    existing = s.execute(
        select(CoaMapping).where(CoaMapping.document_id == doc.id)).scalars().all()
    by_coa = {m.coa_id: m for m in existing}  # one row per coa_id (already aggregated)

    pending = s.execute(
        select(UnmappedItem).where(
            UnmappedItem.document_id == doc.id,
            UnmappedItem.status == "pending",
        )).scalars().all()

    # Group promotions by target coa_id; flip equity to terminal not_spread.
    delta: dict[str, dict] = {}
    promoted_keys: dict[tuple, str] = {}   # (norm_label, stmt) -> coa_id (for recon)
    n_promoted = n_equity = 0
    for u in pending:
        if u.statement_type == "equity_statement":
            u.status = "not_spread"
            if not u.ambiguity_note:
                u.ambiguity_note = _EQUITY_NOTE
            n_equity += 1
            continue
        coa_id, score = _best_suggestion(u, valid_ids)
        if not coa_id or score is None or score < THRESHOLD:
            continue  # stays pending (below threshold or no real-CoA suggestion)
        sign = (coa_by_id.get(coa_id) or {}).get("sign_convention", "positive")
        vs, applied = apply_sign_to_spread(u.value_spread or {}, sign)
        d = delta.setdefault(coa_id, {"spread": {}, "count": 0, "labels": [],
                                      "stmt": u.statement_type, "conf": 0.0,
                                      "reason": "", "applied": False, "ext_ids": []})
        d["spread"] = _merge_spreads(d["spread"], vs)
        d["count"] += 1
        d["labels"].append(u.raw_label or "")
        d["ext_ids"] += list(u.source_extraction_ids or [])
        d["applied"] = d["applied"] or applied
        if score > d["conf"]:
            d["conf"] = score
            sg = u.claude_suggestions or []
            best = max(sg, key=lambda c: (c.get("score") or 0)) if sg else {}
            d["reason"] = best.get("reason", "")
        promoted_keys[(_norm(u.raw_label), u.statement_type)] = coa_id
        u.status = "auto_mapped"
        n_promoted += 1

    # Apply promotions: merge into the existing coa_id row, else insert a new one.
    new_objs = []
    for coa_id, d in delta.items():
        label = " + ".join(l for l in d["labels"] if l)
        if coa_id in by_coa:
            m = by_coa[coa_id]
            m.value_spread = _merge_spreads(m.value_spread or {}, d["spread"])
            m.aggregated_from = (m.aggregated_from or 1) + d["count"]
            m.raw_label = f"{m.raw_label} + {label}" if m.raw_label else label
            m.source_extraction_ids = (m.source_extraction_ids or []) + d["ext_ids"]
        else:
            obj = CoaMapping(
                id=uuid.uuid4().hex, document_id=doc.id, coa_id=coa_id,
                raw_label=label, statement_type=d["stmt"], confidence=d["conf"],
                rationale=(d["reason"] + " [Threshold-promoted at "
                           f"{THRESHOLD:.2f}.]").strip(),
                mapping_source="claude", learned_mapping_id=None,
                value_spread=d["spread"], sign_applied=d["applied"],
                aggregated_from=d["count"], source_extraction_ids=d["ext_ids"],
            )
            s.add(obj)
            new_objs.append(obj)

    # Recompute the balance identity over the full mapped set.
    final = [{"coa_id": m.coa_id, "value_spread": m.value_spread or {},
              "raw_label": m.raw_label} for m in list(existing) + new_objs]
    balance = check_balance_sheet_identity(final, coa_by_id)
    doc.balance_check_result = balance

    # Recompute reconciliation unmapped-component flags (foot pass/fail is unchanged).
    if isinstance(doc.reconciliation_result, dict) and doc.reconciliation_result.get("subtotals"):
        recon = copy.deepcopy(doc.reconciliation_result)
        for rep in recon["subtotals"]:
            stmt = rep.get("statement_type", "")
            for comp in rep.get("components", []):
                if comp.get("status") == "mapped":
                    continue
                cid = promoted_keys.get((_norm(comp.get("raw_label")), stmt))
                if cid:
                    comp["status"] = "mapped"
                    comp["coa_id"] = cid
                    comp["coa_name"] = (coa_by_id.get(cid) or {}).get("line_item_name", "")
            rep["has_unmapped_component"] = any(
                c.get("status") != "mapped" for c in rep.get("components", []))
        recon.setdefault("summary", {})["with_unmapped_component"] = sum(
            1 for r in recon["subtotals"] if r["has_unmapped_component"])
        doc.reconciliation_result = recon

    # Refresh document status from the remaining pending count.
    remaining = s.execute(
        select(func.count()).select_from(UnmappedItem).where(
            UnmappedItem.document_id == doc.id,
            UnmappedItem.status == "pending",
        )).scalar_one()
    doc.unmapped_count = remaining
    doc.spread_status = "spread_complete" if remaining == 0 else "has_unmapped"

    return {
        "filename": doc.filename,
        "doc_id": doc.id,
        "promoted": n_promoted,
        "equity_terminal": n_equity,
        "remaining_pending": remaining,
        "mapped_total": len(final),
        "balanced": balance.get("isBalanced"),
        "difference": balance.get("difference"),
    }


def main() -> None:
    recaps = []
    with session_scope() as s:
        coa_by_id = {c["coa_id"]: c for c in get_all_coa_reference()}
        valid_ids = set(coa_by_id)
        for doc in _load_docs(s):
            recaps.append(_reconcile_doc(doc, coa_by_id, valid_ids, s))

    # Re-export AFTER the mutation transaction has committed.
    print(f"Republishing spread workbooks at threshold {THRESHOLD:.2f}:\n")
    for rc in recaps:
        stem = os.path.splitext(rc["filename"])[0]
        out = os.path.join(OUTDIR, f"{stem}_spread.xlsx")
        with open(out, "wb") as f:
            f.write(export_spread_xlsx(rc["doc_id"]))
        bal = "—" if rc["balanced"] is None else ("balanced" if rc["balanced"] else "OFF")
        diff = (f"{rc['difference']:,.0f}"
                if isinstance(rc["difference"], (int, float)) else "—")
        print(f"  {stem}")
        print(f"     +{rc['promoted']} promoted (>= {THRESHOLD:.2f}), "
              f"{rc['equity_terminal']} equity->not_spread, "
              f"{rc['remaining_pending']} still pending; "
              f"{rc['mapped_total']} CoA rows; A=L+E {bal} (diff {diff})")
    print(f"\nDone. {len(recaps)} workbook(s) rewritten in {OUTDIR}")


if __name__ == "__main__":
    main()
