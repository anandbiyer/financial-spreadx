"""Integration tests — Claude extraction (requires ANTHROPIC_API_KEY).

Tests real Claude API calls for digital text and vision extraction.
"""

from __future__ import annotations

import os
import re

import pytest

from claude.extract import extract_statement
from claude.extract_vision import extract_statement_from_image
from pdf.page_classifier import classify_pdf_pages
from pdf.page_rasterizer import rasterize_page
from pdf.statement_classifier import classify_statement_type

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not os.environ.get("ANTHROPIC_API_KEY"),
        reason="ANTHROPIC_API_KEY not set",
    ),
]


def _find_page_by_type(pdf_bytes: bytes, target_type: str) -> str | None:
    """Classify pages and return text of first page matching target_type."""
    pages = classify_pdf_pages(pdf_bytes)
    for page in pages:
        if page.classification == "scanned":
            continue
        hits = classify_statement_type(page.text_content)
        if hits[0].statement_type == target_type:
            return page.text_content
    return None


@pytest.mark.timeout(60)
def test_extract_digital_pl_lt_finance(pdf_lt_finance: bytes):
    """Extract P&L from LT Finance (T3) -> >=5 rows with valid structure."""
    text = _find_page_by_type(pdf_lt_finance, "income_statement")
    assert text is not None, "No income_statement page found"

    rows = extract_statement(text, "income_statement", "T3")

    assert len(rows) >= 5
    for row in rows:
        assert row["raw_label"]
        assert isinstance(row["raw_values"], dict)
        assert isinstance(row["section_path"], list)
        assert isinstance(row["is_subtotal"], bool)

    # At least one row should have a 4-digit year key
    all_keys = set()
    for row in rows:
        all_keys.update(row["raw_values"].keys())
    assert any(re.match(r"^\d{4}$", k) for k in all_keys), (
        f"No 4-digit year key found in {all_keys}"
    )


@pytest.mark.timeout(60)
def test_extract_digital_bs_lt_finance(pdf_lt_finance: bytes):
    """Extract balance sheet from LT Finance -> >=3 rows."""
    text = _find_page_by_type(pdf_lt_finance, "balance_sheet")
    assert text is not None, "No balance_sheet page found"

    rows = extract_statement(text, "balance_sheet", "T3")
    assert len(rows) >= 3


@pytest.mark.timeout(90)
def test_extract_vision_sun_hung_kai(pdf_sun_hung_kai: bytes):
    """Extract from scanned Sun Hung Kai page 1 via vision -> returns list."""
    png = rasterize_page(pdf_sun_hung_kai, page_number=1, scale=2.0)
    rows = extract_statement_from_image(png, "balance_sheet", "T8", 1)

    assert isinstance(rows, list)
    # May be empty if page 1 is not a financial statement
    for row in rows:
        assert "raw_label" in row
        assert "raw_values" in row


@pytest.mark.timeout(90)
def test_extract_digital_cash_america(pdf_cash_america: bytes):
    """Extract from Cash America income statement -> returns rows."""
    text = _find_page_by_type(pdf_cash_america, "income_statement")
    assert text is not None, "No income_statement page found"

    # Try up to 2 attempts — older PDFs with dotted formatting can be flaky
    rows = extract_statement(text, "income_statement", "T1")
    if len(rows) == 0:
        rows = extract_statement(text, "income_statement", "T1")
    assert len(rows) >= 1, "Expected at least 1 extracted row from Cash America"
