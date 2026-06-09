"""Stage 11 orchestrator — runs COA mapping over a document's rows (Section 04).

Per row: learning store first (no LLM call) → else LLM mapping → route by
confidence threshold. Sign conventions are applied, duplicate CoA targets are
aggregated (SPR-004), and balance/subtotal checks run over the final set.

Stack-agnostic: returns a plain summary dict. Persistence is on by default but
can be disabled for tests.
"""

from __future__ import annotations

from typing import Callable

from config import logger, SPREAD_CONFIDENCE_THRESHOLD
from db.queries import (
    create_document,
    insert_coa_mappings,
    insert_unmapped_items,
    mark_learned_applied,
    update_document,
)
from spreading.balance_checks import check_balance_sheet_identity, verify_subtotals
from spreading.learning_store import (
    build_attribution_message,
    find_learned_mapping,
    normalise_label,
)
from spreading.map_row_to_coa import map_rows_batch, statement_to_coa_statement
from spreading.sign_conventions import apply_sign_to_spread
from spreading.subtotal_reconciliation import reconcile_subtotals

ProgressCallback = Callable[[str, str, float], None]

CONFIDENCE_THRESHOLD = SPREAD_CONFIDENCE_THRESHOLD  # COA-007: below this -> unmapped (config/env)
MAP_BATCH_SIZE = 8  # rows mapped per LLM call (amortises the candidate block)

# equity_statement rows are not spread (no CoA home for SOCE/movement lines) but
# are still recorded as terminal "not_spread" unmapped items for visibility.
_EQUITY_NOTE = ("Statement of Changes in Equity — not spread "
                "(no CoA target for equity/SOCE rows).")


def _load_coa_reference() -> tuple[dict[str, dict], dict[str, list[dict]]]:
    from db.queries import get_all_coa_reference  # local import keeps module load light

    all_coa = get_all_coa_reference()
    coa_by_id = {c["coa_id"]: c for c in all_coa}
    by_statement: dict[str, list[dict]] = {}
    for c in all_coa:
        by_statement.setdefault(c["statement"], []).append(c)
    return coa_by_id, by_statement


def _merge_spreads(a: dict, b: dict) -> dict:
    """Sum two value_spreads year-by-year (None + x = x; None + None = None)."""
    out: dict[str, float | None] = dict(a)
    for year, val in b.items():
        if val is None:
            out.setdefault(year, None)
            continue
        cur = out.get(year)
        out[year] = val if not isinstance(cur, (int, float)) else cur + val
    return out


def _aggregate(mapped: list[dict]) -> list[dict]:
    """Combine mappings sharing a coa_id into one row (SPR-004)."""
    by_coa: dict[str, dict] = {}
    order: list[str] = []
    for m in mapped:
        coa_id = m["coa_id"]
        if coa_id not in by_coa:
            by_coa[coa_id] = {**m, "aggregated_from": 1,
                              "source_extraction_ids": list(m.get("source_extraction_ids") or [])}
            order.append(coa_id)
        else:
            agg = by_coa[coa_id]
            agg["value_spread"] = _merge_spreads(agg["value_spread"], m["value_spread"])
            agg["aggregated_from"] += 1
            agg["raw_label"] = f"{agg['raw_label']} + {m['raw_label']}"
            agg["source_extraction_ids"] = (agg.get("source_extraction_ids") or []) \
                + list(m.get("source_extraction_ids") or [])
    for coa_id in order:
        if by_coa[coa_id]["aggregated_from"] > 1:
            n = by_coa[coa_id]["aggregated_from"]
            by_coa[coa_id]["rationale"] += f" [Aggregated from {n} source rows.]"
    return [by_coa[c] for c in order]


def run_coa_mapping_stage(
    rows: list[dict],
    template_type: str,
    scope: str = "unknown",
    filename: str = "document.pdf",
    analyst_id: str = "AS",
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
    progress_callback: ProgressCallback | None = None,
    persist: bool = True,
    batch_size: int = MAP_BATCH_SIZE,
) -> dict:
    """Map every row to the standardised CoA and persist the spread result.

    Args:
        rows: extracted rows (dicts with raw_label, raw_values, statement_type, ...).
        template_type, scope, filename: document context.
        confidence_threshold: rows below this go to the unmapped queue.
        persist: write to the DB (set False in unit tests that only inspect output).

    Returns a summary dict including document_id, source counts, balance check.
    """
    coa_by_id, by_statement = _load_coa_reference()
    doc_id = create_document(filename, template_type, scope) if persist else "ephemeral"

    mapped: list[dict] = []
    unmapped: list[dict] = []
    equity_unmapped: list[dict] = []  # terminal "not_spread" items — not analyst work
    counts = {"learned": 0, "claude": 0, "unmapped": 0,
              "skipped_no_coa": 0, "equity_unmapped": 0}
    total = len(rows)
    # Per-row mapping outcome keyed by (norm raw_label, statement_type) — fed to
    # subtotal reconciliation so each component can show its mapping status.
    # Captured pre-aggregation so the join survives `_aggregate`'s label merging.
    outcomes: dict[tuple, dict] = {}

    def _outcome_key(row, stmt_type):
        return (str(row.get("raw_label", "") or "").strip().lower(), stmt_type)

    def _ext_ids(row):
        eid = row.get("extraction_id")
        return [eid] if eid else []

    def _record_mapped(row, stmt_type, coa_id, confidence, rationale, source,
                       learned_id, raw_values):
        sign = coa_by_id.get(coa_id, {}).get("sign_convention", "positive")
        vs, applied = apply_sign_to_spread(raw_values, sign)
        mapped.append({
            "document_id": doc_id, "coa_id": coa_id,
            "raw_label": row.get("raw_label", ""), "statement_type": stmt_type,
            "confidence": confidence, "rationale": rationale,
            "mapping_source": source, "learned_mapping_id": learned_id,
            "value_spread": vs, "sign_applied": applied,
            "source_extraction_ids": _ext_ids(row),
        })
        outcomes[_outcome_key(row, stmt_type)] = {
            "status": "mapped", "coa_id": coa_id, "confidence": confidence,
            "source": source, "value_spread": vs, "sign_applied": applied,
        }

    def _record_unmapped(row, stmt_type, raw_values, candidates, note,
                         status="pending", bucket=None):
        (unmapped if bucket is None else bucket).append({
            "document_id": doc_id,
            "raw_label": row.get("raw_label", ""),
            "canonical_field": normalise_label(row.get("raw_label", "")),
            "statement_type": stmt_type,
            "value_spread": raw_values,
            "claude_suggestions": candidates,
            "ambiguity_note": note,
            "status": status,
            "source_extraction_ids": _ext_ids(row),
        })
        outcomes[_outcome_key(row, stmt_type)] = {
            "status": "unmapped", "coa_id": "", "confidence": None,
            "source": "", "value_spread": raw_values, "sign_applied": False,
        }

    # ── Pass 1: triage. Skip no-CoA rows; resolve learning-store hits (no LLM);
    #    collect the rest for batched LLM mapping, grouped by CoA statement.
    to_map: dict[str, list[dict]] = {}  # coa_statement -> [{row, stmt_type, raw_values}]
    for row in rows:
        stmt_type = row.get("statement_type", "")
        coa_statement = statement_to_coa_statement(stmt_type)
        if coa_statement is None:
            if stmt_type == "equity_statement":
                # Not spread, but recorded as a terminal unmapped item for visibility.
                _record_unmapped(row, stmt_type, row.get("raw_values", {}) or {},
                                 candidates=[], note=_EQUITY_NOTE,
                                 status="not_spread", bucket=equity_unmapped)
                counts["equity_unmapped"] += 1
            else:
                counts["skipped_no_coa"] += 1
            continue  # cash flow / unknown skipped; equity recorded as not_spread

        raw_values = row.get("raw_values", {}) or {}

        learned = find_learned_mapping(row.get("raw_label", ""), stmt_type, template_type)
        if learned:
            _record_mapped(row, stmt_type, learned["coa_id"],
                           learned["learned_confidence"], build_attribution_message(learned),
                           "learned", learned["id"], raw_values)
            if persist:
                mark_learned_applied(learned["id"])
            counts["learned"] += 1
            continue

        to_map.setdefault(coa_statement, []).append(
            {"row": row, "stmt_type": stmt_type, "raw_values": raw_values})

    # ── Pass 2: batched LLM mapping. One call per `batch_size` same-statement rows.
    pending_total = sum(len(v) for v in to_map.values())
    processed = 0
    for coa_statement, items in to_map.items():
        candidates = by_statement.get(coa_statement, [])
        for start in range(0, len(items), max(batch_size, 1)):
            chunk = items[start:start + max(batch_size, 1)]
            if progress_callback:
                progress_callback(
                    "S11",
                    f"Mapping rows {processed + 1}-{processed + len(chunk)}/{pending_total} "
                    f"({coa_statement})",
                    (processed + len(chunk)) / max(pending_total, 1),
                )
            results = map_rows_batch([c["row"] for c in chunk], candidates,
                                     template_type, coa_statement)
            for ctx, result in zip(chunk, results):
                if result.coa_id and result.confidence >= confidence_threshold:
                    _record_mapped(ctx["row"], ctx["stmt_type"], result.coa_id,
                                   result.confidence, result.rationale, "claude",
                                   None, ctx["raw_values"])
                    counts["claude"] += 1
                else:
                    _record_unmapped(ctx["row"], ctx["stmt_type"], ctx["raw_values"],
                                     [c.model_dump() for c in result.candidates],
                                     "; ".join(result.ambiguities))
                    counts["unmapped"] += 1
            processed += len(chunk)

    # Aggregate duplicate CoA targets (SPR-004).
    mapped = _aggregate(mapped)

    balance = check_balance_sheet_identity(mapped, coa_by_id)
    subtotals = verify_subtotals(mapped, coa_by_id)
    # Cross-foot each extracted subtotal against its component leaves (uses the
    # original rows, which still carry section_path/indentation/is_subtotal).
    reconciliation = reconcile_subtotals(rows, outcomes, coa_by_id)
    status = "has_unmapped" if unmapped else "spread_complete"

    if persist:
        if mapped:
            insert_coa_mappings(mapped)
        if unmapped or equity_unmapped:
            insert_unmapped_items(unmapped + equity_unmapped)
        update_document(doc_id, spread_status=status,
                        unmapped_count=len(unmapped), balance_check_result=balance,
                        reconciliation_result=reconciliation)

    logger.info(f"[S11] doc={doc_id} mapped={len(mapped)} "
                f"(learned={counts['learned']} claude={counts['claude']}) "
                f"unmapped={counts['unmapped']} equity_not_spread={counts['equity_unmapped']} "
                f"skipped={counts['skipped_no_coa']} "
                f"balanced={balance.get('isBalanced')}")

    return {
        "document_id": doc_id,
        "filename": filename,
        "template_type": template_type,
        "scope": scope,
        "status": status,
        "counts": {**counts, "mapped": len(mapped), "total_rows": total},
        "balance_check": balance,
        "subtotal_checks": subtotals,
        "reconciliation": reconciliation,
        "mapped": mapped,          # convenient for non-persist callers/tests
        "unmapped": unmapped,
        "equity_unmapped": equity_unmapped,  # terminal not_spread items
    }
