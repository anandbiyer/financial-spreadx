"""Unit tests for statement type classifier.

Ported from: __tests__/unit/statement-classifier.test.ts (18 tests)
"""

from pdf.statement_classifier import (
    STATEMENT_SIGNALS,
    classify_statement_type,
    normalize_heading_text,
)


# ── T9.1-T9.4: US GAAP plural headings ──

def test_us_gaap_income():
    result = classify_statement_type("CONSOLIDATED STATEMENTS OF INCOME")
    assert result[0].statement_type == "income_statement"
    assert result[0].confidence == 1.0


def test_us_gaap_balance():
    result = classify_statement_type("CONSOLIDATED BALANCE SHEETS")
    assert result[0].statement_type == "balance_sheet"
    assert result[0].confidence == 1.0


def test_us_gaap_cash_flow():
    result = classify_statement_type("CONSOLIDATED STATEMENTS OF CASH FLOWS")
    assert result[0].statement_type == "cash_flow"
    assert result[0].confidence == 1.0


def test_us_gaap_equity():
    result = classify_statement_type("CONSOLIDATED STATEMENTS OF STOCKHOLDERS EQUITY")
    assert result[0].statement_type == "equity_statement"
    assert result[0].confidence == 1.0


# ── T9.5-T9.7: Template-specific variants ──

def test_ind_as_pl():
    result = classify_statement_type(
        "Statement of Profit and Loss for the year ended 31 March 2024"
    )
    assert result[0].statement_type == "income_statement"


def test_uk_pl_account():
    result = classify_statement_type(
        "Profit and Loss Account for the year ended 31 December 2023"
    )
    assert result[0].statement_type == "income_statement"


def test_ifrs_financial_position():
    result = classify_statement_type(
        "Statement of Financial Position as at 31 December 2023"
    )
    assert result[0].statement_type == "balance_sheet"


# ── T9.8: Non-financial headings ──

def test_non_financial_chairman():
    result = classify_statement_type("Chairman's Report")
    assert result[0].statement_type == "other"


def test_non_financial_directors():
    result = classify_statement_type("Annual Report 2023 - Directors Report")
    assert result[0].statement_type == "other"


# ── Additional coverage ──

def test_ifrs_comprehensive_income():
    result = classify_statement_type(
        "Statement of Profit or Loss and Other Comprehensive Income"
    )
    assert result[0].statement_type == "income_statement"


def test_partners_capital():
    result = classify_statement_type(
        "Consolidated Statement of Changes in Partners' Capital"
    )
    assert result[0].statement_type == "equity_statement"


def test_members_interests():
    result = classify_statement_type("Reconciliation of Members' Interests")
    assert result[0].statement_type == "equity_statement"


def test_cash_flows_continuation():
    result = classify_statement_type("Cash Flows From Operating Activities")
    assert result[0].statement_type == "cash_flow"
    assert result[0].confidence == 0.9


def test_notes_heading():
    result = classify_statement_type("Notes to the Financial Statements")
    assert result[0].statement_type == "notes"


def test_taiwan_comprehensive_income():
    result = classify_statement_type("Comprehensive Income Statement")
    assert result[0].statement_type == "income_statement"


def test_consolidated_equity():
    result = classify_statement_type("CONSOLIDATED STATEMENTS OF EQUITY")
    assert result[0].statement_type == "equity_statement"


def test_us_gaap_operations():
    result = classify_statement_type("CONSOLIDATED STATEMENTS OF OPERATIONS")
    assert result[0].statement_type == "income_statement"


def test_signal_count():
    assert len(STATEMENT_SIGNALS) >= 35


def test_normalize_heading_smart_quotes():
    """Smart quotes should be converted to ASCII for regex matching."""
    text = "Members\u2019 Interests"
    normalized = normalize_heading_text(text)
    assert "\u2019" not in normalized
    assert "'" in normalized
