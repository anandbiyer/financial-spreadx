"""Unit tests for CoA seed derivations (sign convention / subtotal / memo)."""

from __future__ import annotations

from db.seed_coa import (
    DEFAULT_XLSX,
    derive_is_memo,
    derive_is_subtotal,
    derive_sign_convention,
    load_coa_entries,
)


def test_contra_assets_are_contra():
    assert derive_sign_convention("Bad Debt Reserve (-)", "Balance Sheet") == "contra"
    assert derive_sign_convention("Accum Deprec & Impairment(-)", "Balance Sheet") == "contra"


def test_pl_reductions_are_negative_but_revenue_is_positive():
    assert derive_sign_convention("Current Income Tax", "P&L") == "negative"
    assert derive_sign_convention("Sales/Revenues", "P&L") == "positive"
    assert derive_sign_convention("Gross Profit", "P&L") == "positive"
    # interest income must not be flipped negative
    assert derive_sign_convention("Interest Income", "P&L") == "positive"


def test_balance_sheet_default_positive():
    assert derive_sign_convention("Cash", "Balance Sheet") == "positive"


def test_subtotal_detection():
    assert derive_is_subtotal("Profit Before Taxes") is True
    assert derive_is_subtotal("Total Current Assets") is True
    assert derive_is_subtotal("Cash") is False


def test_memo_detection():
    assert derive_is_memo("Memo - 0 Decimals") is True
    assert derive_is_memo("Cash") is False


def test_workbook_parses_to_184_entries():
    if not DEFAULT_XLSX.exists():
        import pytest
        pytest.skip("CoA reference workbook not present")
    entries = load_coa_entries()
    assert len(entries) == 184
    bs = [e for e in entries if e["statement"] == "Balance Sheet"]
    pl = [e for e in entries if e["statement"] == "P&L"]
    assert len(bs) == 116
    assert len(pl) == 68
