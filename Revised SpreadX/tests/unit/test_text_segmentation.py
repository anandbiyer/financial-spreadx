"""Unit tests for segment_page_text() — isolates target statement from multi-statement pages."""

from __future__ import annotations

from claude.extract import segment_page_text


# ── Sample page texts for testing ───────────────────────────────────────────

MIXED_PAGE = (
    "LABRANCHE & CO INC. AND SUBSIDIARIES\n"
    "CONSOLIDATED STATEMENTS OF INCOME\n"
    "(000's omitted)\n"
    "For the Years Ended December 31,  2008  2007  2006\n"
    "Revenue  100,000  90,000  80,000\n"
    "Cost of sales  (60,000)  (55,000)  (50,000)\n"
    "Gross profit  40,000  35,000  30,000\n"
    "Operating expenses  (20,000)  (18,000)  (16,000)\n"
    "Operating income  20,000  17,000  14,000\n"
    "Interest expense  (5,000)  (4,500)  (4,000)\n"
    "Net Income  15,000  12,500  10,000\n"
    "\n"
    "CONSOLIDATED BALANCE SHEETS\n"
    "(000's omitted)\n"
    "ASSETS\n"
    "Cash and cash equivalents  50,000  45,000\n"
    "Receivables  30,000  28,000\n"
    "Investments  80,000  75,000\n"
    "Property and equipment  25,000  22,000\n"
    "Intangible assets  15,000  10,000\n"
    "Total Assets  200,000  180,000\n"
)

THREE_STATEMENTS = (
    "CONSOLIDATED STATEMENTS OF INCOME\n"
    "For the Years Ended December 31,  2024  2023\n"
    "Revenue  100,000  90,000\n"
    "Cost of sales  (60,000)  (55,000)\n"
    "Gross profit  40,000  35,000\n"
    "Operating expenses  (20,000)  (18,000)\n"
    "Net Income  20,000  17,000\n"
    "\n"
    "CONSOLIDATED BALANCE SHEETS\n"
    "As at December 31,  2024  2023\n"
    "Cash and cash equivalents  50,000  45,000\n"
    "Trade receivables  30,000  28,000\n"
    "Total current assets  80,000  73,000\n"
    "Property and equipment  120,000  107,000\n"
    "Total Assets  200,000  180,000\n"
    "Accounts payable  40,000  35,000\n"
    "Total Liabilities  100,000  90,000\n"
    "Total Equity  100,000  90,000\n"
    "\n"
    "CONSOLIDATED STATEMENTS OF CASH FLOWS\n"
    "For the Years Ended December 31,  2024  2023\n"
    "Operating activities  30,000  25,000\n"
    "Investing activities  (10,000)  (8,000)\n"
    "Financing activities  (5,000)  (4,000)\n"
    "Net change in cash  15,000  13,000\n"
)

# Must exceed _MIN_SEGMENT_CHARS (200) so the matched segment is treated as a
# real statement, not a TOC/footer false match (which now yields "").
SINGLE_STATEMENT = (
    "CONSOLIDATED STATEMENTS OF CASH FLOWS\n"
    "Operating activities\n"
    "Net income before tax  45,000\n"
    "Adjustments for depreciation and amortization  12,500\n"
    "Changes in working capital  (3,200)\n"
    "Net cash from operating activities  30,000\n"
    "Investing activities\n"
    "Purchase of property, plant and equipment  (10,000)\n"
    "Net cash used in investing activities  (10,000)\n"
    "Financing activities\n"
    "Repayment of borrowings  (5,000)\n"
    "Net cash used in financing activities  (5,000)\n"
)

NO_HEADING = (
    "Some random text about the company\n"
    "Chairman's letter to shareholders\n"
    "We are pleased to report...\n"
)

CONTINUATION_PAGE = (
    "Liabilities continued\n"
    "Accounts payable  25,000\n"
    "Total Liabilities  100,000\n"
    "STOCKHOLDERS' EQUITY\n"
    "Common stock  50,000\n"
)


# ── Tests ───────────────────────────────────────────────────────────────────


def test_segment_income_statement_from_mixed_page():
    """Segmenting for income_statement returns only the income section."""
    result = segment_page_text(MIXED_PAGE, "income_statement")
    assert "STATEMENTS OF INCOME" in result
    assert "Revenue" in result
    assert "Net Income" in result
    # Should NOT contain balance sheet content
    assert "BALANCE SHEETS" not in result
    assert "Total Assets" not in result


def test_segment_balance_sheet_from_mixed_page():
    """Segmenting for balance_sheet returns only the balance sheet section."""
    result = segment_page_text(MIXED_PAGE, "balance_sheet")
    assert "BALANCE SHEETS" in result
    assert "ASSETS" in result
    assert "Total Assets" in result
    # Should NOT contain income statement content
    assert "STATEMENTS OF INCOME" not in result
    assert "Revenue" not in result


def test_segment_no_heading_returns_full_text():
    """Text with no recognizable statement headings returns full text."""
    result = segment_page_text(NO_HEADING, "balance_sheet")
    assert result == NO_HEADING


def test_segment_single_statement_returns_full_text():
    """Page with only one statement returns from heading to end."""
    result = segment_page_text(SINGLE_STATEMENT, "cash_flow")
    assert "STATEMENTS OF CASH FLOWS" in result
    assert "Operating activities" in result
    assert "Financing activities" in result


def test_segment_preserves_continuation_text():
    """Page with no target heading returns full text (continuation page)."""
    result = segment_page_text(CONTINUATION_PAGE, "balance_sheet")
    # No "balance sheet" heading exists, so full text returned
    assert "Liabilities continued" in result
    assert "Accounts payable" in result


def test_segment_handles_three_statements():
    """Three statements on one page — cash_flow is correctly isolated."""
    result = segment_page_text(THREE_STATEMENTS, "cash_flow")
    assert "CASH FLOWS" in result
    assert "Operating" in result
    # Should NOT contain balance sheet or income content
    assert "BALANCE SHEETS" not in result
    assert "Revenue" not in result


def test_segment_respects_statement_type_order():
    """Balance sheet segment ends where cash flow heading begins."""
    result = segment_page_text(THREE_STATEMENTS, "balance_sheet")
    assert "BALANCE SHEETS" in result
    assert "Assets" in result
    # Should NOT contain cash flow
    assert "CASH FLOWS" not in result
    assert "Operating" not in result
