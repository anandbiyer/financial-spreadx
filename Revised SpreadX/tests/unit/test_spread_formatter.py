"""Unit tests for spread output formatting (SPR-001 ordering)."""

from __future__ import annotations

from spreading.spread_formatter import coa_sort_key, format_spread_output

_COA_REF = [
    {"coa_id": "BS-002", "line_item_name": "Time Deposits", "statement": "Balance Sheet",
     "broad_category": "Current Assets", "sub_category": "", "is_subtotal": False,
     "sign_convention": "positive"},
    {"coa_id": "BS-010", "line_item_name": "Inventory", "statement": "Balance Sheet",
     "broad_category": "Current Assets", "sub_category": "", "is_subtotal": False,
     "sign_convention": "positive"},
    {"coa_id": "BS-001", "line_item_name": "Cash", "statement": "Balance Sheet",
     "broad_category": "Current Assets", "sub_category": "", "is_subtotal": False,
     "sign_convention": "positive"},
    {"coa_id": "PL-001", "line_item_name": "Sales", "statement": "P&L",
     "broad_category": "Revenue", "sub_category": "", "is_subtotal": False,
     "sign_convention": "positive"},
]


def test_coa_sort_key_numeric():
    ids = ["BS-010", "BS-002", "BS-001"]
    assert sorted(ids, key=coa_sort_key) == ["BS-001", "BS-002", "BS-010"]


def test_format_orders_by_coa_id_and_splits_statements():
    mappings = [
        {"coa_id": "BS-001", "raw_label": "Cash at bank",
         "value_spread": {"2024": 50.0}, "confidence": 0.95,
         "mapping_source": "claude", "rationale": "r", "aggregated_from": 1},
    ]
    out = format_spread_output(mappings, _COA_REF)
    bs_ids = [r["coa_id"] for r in out["balance_sheet"]]
    assert bs_ids == ["BS-001", "BS-002", "BS-010"]  # numeric CoA order
    assert [r["coa_id"] for r in out["pl"]] == ["PL-001"]
    assert out["years"] == ["2024"]
    # mapped flag + blank rows
    cash = out["balance_sheet"][0]
    assert cash["mapped"] is True and cash["value_spread"] == {"2024": 50.0}
    assert out["balance_sheet"][1]["mapped"] is False
