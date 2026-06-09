"""Balance sheet identity + subtotal checks (Section 05, COA-006).

Values in `value_spread` already have sign conventions applied, so contra-assets
are negative and correctly reduce totals. Checks run per year; the most recent
year is reported as the headline result.
"""

from __future__ import annotations

from datetime import datetime, timezone

_ASSET_CATS = {"Current Assets", "Non-Current Assets"}
_LIAB_CATS = {"Current Liabilities", "Non-Current Liabilities"}
_EQUITY_CATS = {"Equity"}
_TOLERANCE = 0.001  # 0.1%


def _years(mappings: list[dict]) -> list[str]:
    years: set[str] = set()
    for m in mappings:
        years.update((m.get("value_spread") or {}).keys())
    return sorted(years)


def _sum(mappings: list[dict], categories: set[str], year: str,
         coa_by_id: dict[str, dict]) -> float:
    total = 0.0
    for m in mappings:
        coa = coa_by_id.get(m["coa_id"])
        if not coa or coa["broad_category"] not in categories:
            continue
        # Sum LEAF line items only. Subtotal CoA rows (e.g. "Net Block",
        # "Total Current Assets") restate their own components, so counting
        # them here double-counts and breaks the A = L + E identity.
        if coa.get("is_subtotal"):
            continue
        val = (m.get("value_spread") or {}).get(year)
        if isinstance(val, (int, float)):
            total += val
    return total


def check_balance_sheet_identity(
    mappings: list[dict],
    coa_by_id: dict[str, dict],
) -> dict:
    """Verify Total Assets = Total Liabilities + Total Equity per year."""
    bs_mappings = [
        m for m in mappings
        if (coa_by_id.get(m["coa_id"]) or {}).get("statement") == "Balance Sheet"
    ]
    checked_at = datetime.now(timezone.utc).isoformat()

    if not bs_mappings:
        return {"applicable": False, "isBalanced": None,
                "note": "No balance sheet rows mapped.", "checkedAt": checked_at}

    years = _years(bs_mappings)
    per_year: dict[str, dict] = {}
    for y in years:
        assets = _sum(bs_mappings, _ASSET_CATS, y, coa_by_id)
        liabs = _sum(bs_mappings, _LIAB_CATS, y, coa_by_id)
        equity = _sum(bs_mappings, _EQUITY_CATS, y, coa_by_id)
        diff = assets - (liabs + equity)
        balanced = abs(diff) / abs(assets) < _TOLERANCE if assets else (abs(diff) < 1e-9)
        per_year[y] = {
            "totalAssets": assets,
            "totalLiabilities": liabs,
            "totalEquity": equity,
            "totalLiabilitiesAndEquity": liabs + equity,
            "difference": diff,
            "isBalanced": balanced,
        }

    primary = years[-1] if years else None
    head = per_year.get(primary, {})
    contributors: list[dict] = []
    if primary and not head.get("isBalanced", True):
        contributors = _imbalance_contributors(bs_mappings, primary, coa_by_id)

    return {
        "applicable": True,
        "primary_year": primary,
        "per_year": per_year,
        "imbalanceContributors": contributors,
        "checkedAt": checked_at,
        **head,  # headline figures for the primary year
    }


def _imbalance_contributors(mappings: list[dict], year: str,
                            coa_by_id: dict[str, dict], top: int = 5) -> list[dict]:
    """Largest-magnitude BS lines for the year — likely imbalance contributors."""
    scored = []
    for m in mappings:
        coa = coa_by_id.get(m["coa_id"], {})
        if coa.get("is_subtotal"):
            continue  # leaf items only — consistent with _sum
        val = (m.get("value_spread") or {}).get(year)
        if isinstance(val, (int, float)):
            scored.append({
                "coa_id": m["coa_id"],
                "line_item_name": coa.get("line_item_name", ""),
                "raw_label": m.get("raw_label", ""),
                "value": val,
            })
    scored.sort(key=lambda x: abs(x["value"]), reverse=True)
    return scored[:top]


def verify_subtotals(
    mappings: list[dict],
    coa_by_id: dict[str, dict],
) -> list[dict]:
    """Per-statement, per-category subtotals for the primary year (informational)."""
    years = _years(mappings)
    if not years:
        return []
    primary = years[-1]
    cats: dict[tuple[str, str], float] = {}
    for m in mappings:
        coa = coa_by_id.get(m["coa_id"])
        if not coa or coa.get("is_subtotal"):
            continue  # recompute category subtotals from leaf items only
        val = (m.get("value_spread") or {}).get(primary)
        if not isinstance(val, (int, float)):
            continue
        key = (coa["statement"], coa["broad_category"])
        cats[key] = cats.get(key, 0.0) + val
    return [
        {"statement": stmt, "category": cat, "year": primary, "total": total}
        for (stmt, cat), total in sorted(cats.items())
    ]
