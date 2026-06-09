"""Format the spread output: all 184 CoA entries in CoA-ID order (SPR-001).

Joins the document's coa_mappings onto the full CoA reference so every CoA entry
appears (blank where nothing mapped to it), split into Balance Sheet and P&L
sections. Used by both the Streamlit UI and the XLSX export.
"""

from __future__ import annotations


def coa_sort_key(coa_id: str) -> tuple:
    """Sort 'BS-001' < 'BS-002' < ... numerically within each prefix."""
    prefix, _, num = coa_id.partition("-")
    try:
        return (prefix, int(num))
    except ValueError:
        return (prefix, 0)


def _mapping_index(coa_mappings: list[dict]) -> dict[str, dict]:
    """coa_id -> mapping. After aggregation there is one per coa_id; if not,
    the first wins (deterministic)."""
    idx: dict[str, dict] = {}
    for m in coa_mappings:
        idx.setdefault(m["coa_id"], m)
    return idx


def format_spread_output(
    coa_mappings: list[dict],
    coa_reference: list[dict],
) -> dict:
    """Return {balance_sheet:[...], pl:[...], years:[...]} in CoA-ID order."""
    idx = _mapping_index(coa_mappings)

    years: set[str] = set()
    for m in coa_mappings:
        years.update((m.get("value_spread") or {}).keys())
    years_sorted = sorted(years)

    bs_rows: list[dict] = []
    pl_rows: list[dict] = []

    for coa in sorted(coa_reference, key=lambda c: coa_sort_key(c["coa_id"])):
        m = idx.get(coa["coa_id"])
        row = {
            "coa_id": coa["coa_id"],
            "line_item_name": coa["line_item_name"],
            "broad_category": coa["broad_category"],
            "sub_category": coa.get("sub_category", ""),
            "statement": coa["statement"],
            "is_subtotal": coa.get("is_subtotal", False),
            "sign_convention": coa.get("sign_convention", "positive"),
            "mapped": m is not None,
            "raw_label": m.get("raw_label", "") if m else "",
            "value_spread": m.get("value_spread", {}) if m else {},
            "confidence": m.get("confidence") if m else None,
            "mapping_source": m.get("mapping_source", "") if m else "",
            "rationale": m.get("rationale", "") if m else "",
            "aggregated_from": m.get("aggregated_from", 1) if m else 0,
            "source_extraction_ids": m.get("source_extraction_ids", []) if m else [],
        }
        if coa["statement"] == "Balance Sheet":
            bs_rows.append(row)
        else:
            pl_rows.append(row)

    return {"balance_sheet": bs_rows, "pl": pl_rows, "years": years_sorted}
