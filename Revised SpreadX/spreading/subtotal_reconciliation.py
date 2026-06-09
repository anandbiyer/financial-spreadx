"""Subtotal reconciliation — cross-foot each extracted subtotal/total against the
sum of the leaf rows the statement nests under it, to validate the component
mappings (POC).

Why document-structure (not CoA category): many real subtotals — e.g. the UK
"Total assets less current liabilities" — have NO CoA entry, so a CoA-category
check cannot validate them. We therefore use the EXTRACTED hierarchy
(`is_subtotal` + `indentation_level` + `section_path` + document order) to group
each subtotal's contributing rows.

Footing uses RAW extracted values (`raw_values`) — the printed signs the document
itself foots on (e.g. UK creditors shown negative) — NOT the CoA-sign-applied
`value_spread`. A separate per-component `sign_flipped` flag compares the raw sign
to the mapped sign for diagnostics.

A failed foot is three-way ambiguous (mapping vs extraction/OCR vs sign error);
the report carries signals (unmapped component, sign flip) but does not assert a
single cause.

Pure module: no DB or LLM imports. An optional `llm_grouper(srows) -> {subtotal_idx:
[component_idx, ...]}` callable can be injected to resolve groups on flat/low-signal
layouts; when omitted, the heuristic runs alone and flags low-confidence groupings.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from spreading.balance_checks import _TOLERANCE  # reuse the 0.1% relative tolerance

_ABS_FLOOR = 1.0  # currency units: subtotals at/under this don't relative-fail


def _key(label, statement_type) -> tuple[str, str]:
    return (str(label or "").strip().lower(), statement_type)


def _years(value_spread: dict | None) -> list[str]:
    return sorted((value_spread or {}).keys())


def _num(v):
    return v if isinstance(v, (int, float)) else None


def _sign_flip(raw_values: dict | None, value_spread: dict | None) -> bool:
    """True if the mapped (sign-applied) value flips sign vs the raw extracted
    value for any shared year — a contra/negative convention was applied."""
    if not value_spread:
        return False
    for y, rv in (raw_values or {}).items():
        rv, sv = _num(rv), _num(value_spread.get(y))
        if rv is None or sv is None or rv == 0:
            continue
        if (rv < 0) != (sv < 0):
            return True
    return False


def _foot_diff(srows, i, comp_idx, year):
    """computed_sum(components) - extracted(subtotal) for `year`, or None if any
    value is missing."""
    ev = _num((srows[i].get("raw_values") or {}).get(year))
    if ev is None or not comp_idx:
        return None
    total = 0.0
    for j in comp_idx:
        v = _num((srows[j].get("raw_values") or {}).get(year))
        if v is None:
            return None
        total += v
    return total - ev


def _foots(srows, i, comp_idx, year) -> bool:
    d = _foot_diff(srows, i, comp_idx, year)
    if d is None:
        return False
    ev = abs(_num((srows[i].get("raw_values") or {}).get(year)) or 0.0)
    return abs(d) <= _ABS_FLOOR or (bool(ev) and abs(d) / ev < _TOLERANCE)


def _grouped_components(srows, i, level, consumed, year):
    """Foot-driven grouping for the subtotal at index `i`.

    Step 1 — collect the contiguous preceding LEAVES (and deeper nested subtotals)
    back to the nearest same-or-shallower subtotal boundary. If those foot the
    subtotal (or there's no preceding sibling / no year to check), use them.

    Step 2 — if the leaves alone don't foot AND a preceding same-level sibling
    subtotal exists, greedily absorb preceding rows (including that sibling's
    rolled-up value) until the checksum closes. This rolls Current assets into
    "Net current assets" without making Current assets absorb Non-current assets
    (whose leaves already foot in step 1).

    Returns (component_indices, method) where method ∈ {"leaves","absorbed",
    "unresolved"}.
    """
    base: list[int] = []
    j, sibling = i - 1, None
    while j >= 0:
        rj = srows[j]
        lvl = int(rj.get("indentation_level", 0) or 0)
        if rj.get("is_subtotal") and lvl <= level:
            sibling = j if lvl == level else None  # same-level sibling vs hard boundary
            break
        if j not in consumed:
            base.append(j)
        j -= 1
    base.reverse()

    if year is None or sibling is None or _foots(srows, i, base, year):
        method = "leaves" if (year is None or _foots(srows, i, base, year)) else "unresolved"
        return base, method

    # Leaves don't foot — absorb the preceding sibling(s) until it does.
    extended = list(base)
    j = sibling
    while j >= 0:
        rj = srows[j]
        lvl = int(rj.get("indentation_level", 0) or 0)
        if rj.get("is_subtotal") and lvl < level:
            break  # hard boundary: a shallower subtotal
        if j not in consumed:
            extended.append(j)
            if _foots(srows, i, sorted(extended), year):
                return sorted(extended), "absorbed"
        j -= 1
    return base, "unresolved"


def _build_report(statement_type, subtotal_row, comp_idx, srows, outcomes,
                  coa_by_id, grouping_conf, grouping_method="leaves") -> dict:
    extracted = subtotal_row.get("raw_values", {}) or {}
    years = _years(extracted)

    components = []
    has_unmapped = False
    for j in comp_idx:
        cr = srows[j]
        craw = cr.get("raw_values", {}) or {}
        oc = outcomes.get(_key(cr.get("raw_label", ""), statement_type), {})
        status = oc.get("status", "absent")  # mapped | unmapped | absent
        if status != "mapped":
            has_unmapped = True
        coa_id = oc.get("coa_id", "") or ""
        components.append({
            "raw_label": cr.get("raw_label", ""),
            "is_subtotal": bool(cr.get("is_subtotal")),
            "indentation_level": int(cr.get("indentation_level", 0) or 0),
            "raw_values": craw,
            "status": status,
            "coa_id": coa_id,
            "coa_name": (coa_by_id.get(coa_id) or {}).get("line_item_name", "") if coa_id else "",
            "confidence": oc.get("confidence"),
            "source": oc.get("source", ""),
            "sign_flipped": _sign_flip(craw, oc.get("value_spread")),
        })

    computed, difference, per_year_pass = {}, {}, {}
    for y in years:
        total, complete = 0.0, True
        for j in comp_idx:
            v = _num((srows[j].get("raw_values", {}) or {}).get(y))
            if v is None:
                complete = False
            else:
                total += v
        computed[y] = total
        ev = _num(extracted.get(y))
        if ev is None or not complete or not comp_idx:
            difference[y] = None
            per_year_pass[y] = None
            continue
        d = total - ev
        difference[y] = d
        per_year_pass[y] = abs(d) <= _ABS_FLOOR or (abs(d) / abs(ev) < _TOLERANCE if ev else False)

    headline = years[-1] if years else None
    return {
        "statement_type": statement_type,
        "raw_label": subtotal_row.get("raw_label", ""),
        "indentation_level": int(subtotal_row.get("indentation_level", 0) or 0),
        "years": years,
        "headline_year": headline,
        "extracted": extracted,
        "computed": computed,
        "difference": difference,
        "per_year_pass": per_year_pass,
        "pass": per_year_pass.get(headline) if headline else None,
        "has_unmapped_component": has_unmapped,
        "grouping_confidence": grouping_conf,
        "grouping_method": grouping_method,  # leaves | absorbed | unresolved | llm
        "n_components": len(comp_idx),
        "components": components,
    }


def _reconcile_statement(statement_type, srows, outcomes, coa_by_id, llm_grouper):
    levels = {int(r.get("indentation_level", 0) or 0) for r in srows}
    flat = len(levels) <= 1
    grouping_conf = "low" if flat else "high"

    groups = None
    if flat and llm_grouper is not None:
        groups = llm_grouper(srows) or {}
        grouping_conf = "llm"

    consumed: set[int] = set()
    reports = []
    for i, row in enumerate(srows):
        if not row.get("is_subtotal"):
            continue
        level = int(row.get("indentation_level", 0) or 0)
        year = (_years(row.get("raw_values")) or [None])[-1]
        if groups is not None and i in groups:
            comp_idx, method = [j for j in groups[i] if 0 <= j < i], "llm"
        else:
            comp_idx, method = _grouped_components(srows, i, level, consumed, year)
        consumed.update(comp_idx)
        reports.append(_build_report(statement_type, row, comp_idx, srows,
                                     outcomes, coa_by_id, grouping_conf, method))
    return reports


def reconcile_subtotals(
    rows: list[dict],
    outcomes: dict[tuple, dict],
    coa_by_id: dict[str, dict],
    *,
    llm_grouper: Callable[[list[dict]], dict] | None = None,
) -> dict:
    """Cross-foot every extracted subtotal against its component leaves.

    Args:
        rows: extracted rows in document order (raw_label, raw_values,
              statement_type, section_path, indentation_level, is_subtotal).
        outcomes: {(norm_label, statement_type): {status, coa_id, confidence,
                  source, value_spread, sign_applied}} per mapped/unmapped row.
        coa_by_id: CoA reference by id (for component CoA names).
        llm_grouper: optional fallback to resolve component groups on flat layouts.

    Returns a report dict: {subtotals: [...], summary: {...}, checkedAt}.
    Cash-flow, equity-statement, and unknown statements are excluded.
    """
    by_stmt: dict[str, list[dict]] = {}
    for r in rows:
        st = r.get("statement_type", "")
        if st in ("", "cash_flow", "equity_statement"):
            continue
        by_stmt.setdefault(st, []).append(r)

    reports = []
    for st, srows in by_stmt.items():
        reports.extend(_reconcile_statement(st, srows, outcomes, coa_by_id, llm_grouper))

    return {
        "subtotals": reports,
        "summary": {
            "total": len(reports),
            "passed": sum(1 for r in reports if r["pass"] is True),
            "failed": sum(1 for r in reports if r["pass"] is False),
            "incomplete": sum(1 for r in reports if r["pass"] is None),
            "with_unmapped_component": sum(1 for r in reports if r["has_unmapped_component"]),
            "low_confidence_grouping": sum(1 for r in reports if r["grouping_confidence"] == "low"),
        },
        "checkedAt": datetime.now(timezone.utc).isoformat(),
    }
