"""Regression tests for all 5 diagnosed PDF extraction failures.

Each test runs the FULL pipeline on a real PDF and asserts minimum
extraction counts. Requires ANTHROPIC_API_KEY.

Markers: @integration (requires API key), @slow (>60s per test)
"""

from __future__ import annotations

import pytest

from pipeline.orchestrator import run_pipeline


def _rows_by_type(result, stmt_type: str) -> list[dict]:
    """Helper: filter extracted rows by statement type."""
    return [r for r in result.extracted_rows if r.get("statement_type") == stmt_type]


# ═══════════════════════════════════════════════════════════════════════
# Case 1: freddie2023
# Diagnosed: balance_sheet 0 rows (multi-statement page),
#            cash_flow 0 rows (split across pages)
# Phase 1 impact: DPI fix helps if pages go through vision path;
#                 text-path fixes are Phase 2
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.integration
@pytest.mark.slow
def test_freddie2023_income_statement_preserved(pdf_freddie2023):
    """Income statement worked before — must not regress."""
    result = run_pipeline(pdf_freddie2023)
    rows = _rows_by_type(result, "income_statement")
    assert len(rows) >= 5, f"Expected >=5 income_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_freddie2023_equity_statement_preserved(pdf_freddie2023):
    """Equity statement worked before — must not regress."""
    result = run_pipeline(pdf_freddie2023)
    rows = _rows_by_type(result, "equity_statement")
    assert len(rows) >= 1, f"Expected >=1 equity_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_freddie2023_balance_sheet_extracted(pdf_freddie2023):
    """Balance sheet was 0 rows (multi-statement page). Should now extract."""
    result = run_pipeline(pdf_freddie2023)
    rows = _rows_by_type(result, "balance_sheet")
    assert len(rows) >= 5, f"Expected >=5 balance_sheet rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_freddie2023_cash_flow_extracted(pdf_freddie2023):
    """Cash flow was 0 rows. Should now extract."""
    result = run_pipeline(pdf_freddie2023)
    rows = _rows_by_type(result, "cash_flow")
    assert len(rows) >= 5, f"Expected >=5 cash_flow rows, got {len(rows)}"


# ═══════════════════════════════════════════════════════════════════════
# Case 2: Fubon Securities Co Ltd 2017
# Diagnosed: balance_sheet 0 rows (landscape vector, rotated),
#            income_statement 0 rows (unusual formatting)
# Phase 1 impact: DPI fix + enhanced prompt help vision path;
#                 rotation fix is Phase 3
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.integration
@pytest.mark.slow
def test_fubon_cash_flow_preserved(pdf_fubon):
    """Cash flow worked before (23 rows) — must not regress."""
    result = run_pipeline(pdf_fubon)
    rows = _rows_by_type(result, "cash_flow")
    assert len(rows) >= 10, f"Expected >=10 cash_flow rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_fubon_equity_preserved(pdf_fubon):
    """Equity worked before (19 rows) — must not regress."""
    result = run_pipeline(pdf_fubon)
    rows = _rows_by_type(result, "equity_statement")
    assert len(rows) >= 5, f"Expected >=5 equity_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_fubon_balance_sheet_extracted(pdf_fubon):
    """Balance sheet was 0 rows (landscape vector). Should now extract."""
    result = run_pipeline(pdf_fubon)
    rows = _rows_by_type(result, "balance_sheet")
    assert len(rows) >= 3, f"Expected >=3 balance_sheet rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_fubon_income_statement_extracted(pdf_fubon):
    """Income statement was 0 rows (unusual formatting). Should now extract."""
    result = run_pipeline(pdf_fubon)
    rows = _rows_by_type(result, "income_statement")
    assert len(rows) >= 3, f"Expected >=3 income_statement rows, got {len(rows)}"


# ═══════════════════════════════════════════════════════════════════════
# Case 3: HDFC Credila 2023
# Diagnosed: income_statement 0 rows (hybrid misclassified),
#            cash_flow 0 rows (hybrid misclassified),
#            balance_sheet 109 garbled rows
# Phase 1 impact: DPI fix + prompt help; hybrid detection is Phase 3
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.integration
@pytest.mark.slow
def test_hdfc_equity_preserved(pdf_hdfc_credila):
    """Equity worked before — must not regress."""
    result = run_pipeline(pdf_hdfc_credila)
    rows = _rows_by_type(result, "equity_statement")
    assert len(rows) >= 1, f"Expected >=1 equity_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_hdfc_income_statement_extracted(pdf_hdfc_credila):
    """Income statement was 0 rows (hybrid page misclassified). Should now extract."""
    result = run_pipeline(pdf_hdfc_credila)
    rows = _rows_by_type(result, "income_statement")
    assert len(rows) >= 3, f"Expected >=3 income_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_hdfc_cash_flow_extracted(pdf_hdfc_credila):
    """Cash flow was 0 rows (hybrid page misclassified). Should now extract."""
    result = run_pipeline(pdf_hdfc_credila)
    rows = _rows_by_type(result, "cash_flow")
    assert len(rows) >= 3, f"Expected >=3 cash_flow rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_hdfc_balance_sheet_quality(pdf_hdfc_credila):
    """Balance sheet had 109 garbled rows. Labels should not be mostly numeric."""
    result = run_pipeline(pdf_hdfc_credila)
    rows = _rows_by_type(result, "balance_sheet")
    if not rows:
        pytest.skip("No balance_sheet rows to check quality on")
    numeric_labels = sum(
        1
        for r in rows
        if r["raw_label"]
        .replace(",", "")
        .replace(".", "")
        .replace("-", "")
        .replace(" ", "")
        .isdigit()
    )
    ratio = numeric_labels / len(rows)
    assert ratio < 0.3, (
        f"Too many garbled labels: {numeric_labels}/{len(rows)} = {ratio:.0%}"
    )


# ═══════════════════════════════════════════════════════════════════════
# Case 4: LaBranche & Co Inc 2008
# Diagnosed: cash_flow 0 rows (dense page, DPI reuse bug + max_tokens)
# Phase 1 impact: DIRECT FIX — DPI reuse fix + max_tokens increase
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.integration
@pytest.mark.slow
def test_labranche_balance_sheet_preserved(pdf_labranche):
    """Balance sheet worked before (30 rows) — must not regress."""
    result = run_pipeline(pdf_labranche)
    rows = _rows_by_type(result, "balance_sheet")
    assert len(rows) >= 15, f"Expected >=15 balance_sheet rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_labranche_income_statement_preserved(pdf_labranche):
    """Income statement worked before (30 rows) — must not regress."""
    result = run_pipeline(pdf_labranche)
    rows = _rows_by_type(result, "income_statement")
    assert len(rows) >= 15, f"Expected >=15 income_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_labranche_equity_preserved(pdf_labranche):
    """Equity worked before (15 rows) — must not regress."""
    result = run_pipeline(pdf_labranche)
    rows = _rows_by_type(result, "equity_statement")
    assert len(rows) >= 5, f"Expected >=5 equity_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_labranche_cash_flow_extracted(pdf_labranche):
    """Cash flow was 0 rows (DPI reuse bug). Phase 1 directly fixes this."""
    result = run_pipeline(pdf_labranche)
    rows = _rows_by_type(result, "cash_flow")
    assert len(rows) >= 10, f"Expected >=10 cash_flow rows, got {len(rows)}"


# ═══════════════════════════════════════════════════════════════════════
# Case 5: Sun Hung Kai & Co. Limited 2024
# Diagnosed: balance_sheet 0 rows, equity_statement 0 rows,
#            cash_flow 0 rows (dual-column layouts + DPI reuse bug)
# Phase 1 impact: DIRECT FIX — DPI reuse fix + multi-column prompt
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.integration
@pytest.mark.slow
def test_sun_hung_kai_income_preserved(pdf_sun_hung_kai):
    """Income statement worked before (33 rows) — must not regress."""
    result = run_pipeline(pdf_sun_hung_kai)
    rows = _rows_by_type(result, "income_statement")
    assert len(rows) >= 20, f"Expected >=20 income_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_sun_hung_kai_balance_sheet_extracted(pdf_sun_hung_kai):
    """Balance sheet was 0 rows (dual-column, low DPI). Phase 1 fixes this."""
    result = run_pipeline(pdf_sun_hung_kai)
    rows = _rows_by_type(result, "balance_sheet")
    assert len(rows) >= 5, f"Expected >=5 balance_sheet rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_sun_hung_kai_equity_extracted(pdf_sun_hung_kai):
    """Equity was 0 rows (wide multi-column table). Phase 1 fixes this."""
    result = run_pipeline(pdf_sun_hung_kai)
    rows = _rows_by_type(result, "equity_statement")
    assert len(rows) >= 3, f"Expected >=3 equity_statement rows, got {len(rows)}"


@pytest.mark.integration
@pytest.mark.slow
def test_sun_hung_kai_cash_flow_extracted(pdf_sun_hung_kai):
    """Cash flow was 0 rows (dual-column layout). Phase 1 fixes this."""
    result = run_pipeline(pdf_sun_hung_kai)
    rows = _rows_by_type(result, "cash_flow")
    assert len(rows) >= 5, f"Expected >=5 cash_flow rows, got {len(rows)}"
