"""Integration tests — digital PDF pipeline.

Uses LT_Finance_Limited_2019.pdf (T3, 8 pages, all digital).
Ported from: __tests__/integration/pdf-pipeline-digital.test.ts
"""

import pytest

from pdf.page_classifier import classify_pdf_pages, summarize_classifications
from pdf.page_filter import filter_financial_pages
from pdf.page_rasterizer import rasterize_page
from pdf.statement_classifier import classify_statement_type


@pytest.mark.integration
def test_classify_lt_finance(pdf_lt_finance: bytes):
    """Page classifier returns 8 pages, majority digital."""
    pages = classify_pdf_pages(pdf_lt_finance)
    summary = summarize_classifications(pages)

    assert len(pages) == 8
    assert summary["total"] == 8

    # Majority should be digital
    assert summary["digital"] > summary["scanned"] + summary["hybrid"]

    # Every page has valid fields
    for page in pages:
        assert page.page_number > 0
        assert page.classification in ("digital", "scanned", "hybrid")
        assert page.word_count >= 0
        assert 0.0 <= page.ascii_ratio <= 1.0


@pytest.mark.integration
def test_rasterize_lt_finance_page1(pdf_lt_finance: bytes):
    """Rasterize page 1 -> valid PNG buffer with magic bytes."""
    png = rasterize_page(pdf_lt_finance, page_number=1, scale=2.0)

    assert len(png) > 0
    # PNG magic bytes: 89 50 4E 47
    assert png[0] == 0x89
    assert png[1] == 0x50
    assert png[2] == 0x4E
    assert png[3] == 0x47


# ── Phase 2: Statement classification + filtering ──


def _classify_and_filter(pdf_bytes: bytes):
    """Helper: run S2 + S2b + S3 on a PDF."""
    pages = classify_pdf_pages(pdf_bytes)
    for page in pages:
        if page.classification != "scanned":
            hits = classify_statement_type(page.text_content)
            page.section_type = hits[0].statement_type
            page.secondary_section_type = (
                hits[1].statement_type if len(hits) > 1 else None
            )
    return filter_financial_pages(pages)


@pytest.mark.integration
def test_filter_lt_finance(pdf_lt_finance: bytes):
    """S2b+S3 on LT Finance: finds income_statement and balance_sheet."""
    result = _classify_and_filter(pdf_lt_finance)

    assert "income_statement" in result.selected_pages
    assert "balance_sheet" in result.selected_pages
    assert result.filtered_page_count > 0


@pytest.mark.integration
def test_filter_cash_america(pdf_cash_america: bytes):
    """S2b+S3 on Cash America: handles US GAAP plural headings, >=2 types."""
    result = _classify_and_filter(pdf_cash_america)

    assert len(result.selected_pages) >= 2
    assert result.filtered_page_count > 0
