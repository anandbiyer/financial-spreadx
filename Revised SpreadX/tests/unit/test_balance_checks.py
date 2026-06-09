"""Unit tests for the balance sheet identity check (COA-006)."""

from __future__ import annotations

from spreading.balance_checks import check_balance_sheet_identity, verify_subtotals

# Minimal synthetic CoA reference: one asset, one liability, one equity entry.
_COA = {
    "BS-A": {"coa_id": "BS-A", "statement": "Balance Sheet",
             "broad_category": "Current Assets", "line_item_name": "Cash"},
    "BS-L": {"coa_id": "BS-L", "statement": "Balance Sheet",
             "broad_category": "Current Liabilities", "line_item_name": "Payables"},
    "BS-E": {"coa_id": "BS-E", "statement": "Balance Sheet",
             "broad_category": "Equity", "line_item_name": "Retained Earnings"},
}


def _mapped(assets, liabs, equity, year="2024"):
    return [
        {"coa_id": "BS-A", "value_spread": {year: assets}, "raw_label": "a"},
        {"coa_id": "BS-L", "value_spread": {year: liabs}, "raw_label": "l"},
        {"coa_id": "BS-E", "value_spread": {year: equity}, "raw_label": "e"},
    ]


def test_balanced_within_tolerance():
    res = check_balance_sheet_identity(_mapped(100.0, 40.0, 60.0), _COA)
    assert res["applicable"] is True
    assert res["isBalanced"] is True
    assert res["totalAssets"] == 100.0
    assert res["totalLiabilitiesAndEquity"] == 100.0


def test_small_diff_inside_point_one_percent():
    # 100 vs 99.95 => 0.05% < 0.1% tolerance => balanced
    res = check_balance_sheet_identity(_mapped(100.0, 40.0, 59.95), _COA)
    assert res["isBalanced"] is True


def test_imbalanced_beyond_tolerance():
    res = check_balance_sheet_identity(_mapped(100.0, 40.0, 50.0), _COA)
    assert res["isBalanced"] is False
    assert res["difference"] == 10.0
    assert len(res["imbalanceContributors"]) >= 1


def test_not_applicable_without_bs_rows():
    res = check_balance_sheet_identity([], _COA)
    assert res["applicable"] is False
    assert res["isBalanced"] is None


def test_verify_subtotals_returns_category_totals():
    subs = verify_subtotals(_mapped(100.0, 40.0, 60.0), _COA)
    cats = {s["category"]: s["total"] for s in subs}
    assert cats["Current Assets"] == 100.0
    assert cats["Equity"] == 60.0


# Regression (T11): subtotal CoA rows restate their components and must NOT be
# summed into the identity, or assets double-count and the sheet won't balance.
_COA_WITH_SUBTOTAL = {
    **_COA,
    "BS-A2": {"coa_id": "BS-A2", "statement": "Balance Sheet",
              "broad_category": "Current Assets", "line_item_name": "Receivables"},
    "BS-ATOT": {"coa_id": "BS-ATOT", "statement": "Balance Sheet",
                "broad_category": "Current Assets",
                "line_item_name": "Total Current Assets", "is_subtotal": True},
}


def test_subtotal_rows_excluded_from_identity():
    # Two asset leaves (60 + 40 = 100) plus a subtotal row restating 100.
    mapped = [
        {"coa_id": "BS-A", "value_spread": {"2024": 60.0}, "raw_label": "cash"},
        {"coa_id": "BS-A2", "value_spread": {"2024": 40.0}, "raw_label": "recv"},
        {"coa_id": "BS-ATOT", "value_spread": {"2024": 100.0}, "raw_label": "total ca"},
        {"coa_id": "BS-L", "value_spread": {"2024": 40.0}, "raw_label": "l"},
        {"coa_id": "BS-E", "value_spread": {"2024": 60.0}, "raw_label": "e"},
    ]
    res = check_balance_sheet_identity(mapped, _COA_WITH_SUBTOTAL)
    # Without the fix, assets would be 200 (100 leaves + 100 subtotal) and unbalanced.
    assert res["totalAssets"] == 100.0
    assert res["isBalanced"] is True
    # The subtotal row must not appear among imbalance contributors either.
    assert all(c["coa_id"] != "BS-ATOT" for c in res.get("imbalanceContributors", []))


def test_verify_subtotals_excludes_subtotal_rows():
    mapped = [
        {"coa_id": "BS-A", "value_spread": {"2024": 60.0}, "raw_label": "cash"},
        {"coa_id": "BS-A2", "value_spread": {"2024": 40.0}, "raw_label": "recv"},
        {"coa_id": "BS-ATOT", "value_spread": {"2024": 100.0}, "raw_label": "total ca"},
    ]
    subs = verify_subtotals(mapped, _COA_WITH_SUBTOTAL)
    cats = {s["category"]: s["total"] for s in subs}
    assert cats["Current Assets"] == 100.0  # leaves only, not 200
