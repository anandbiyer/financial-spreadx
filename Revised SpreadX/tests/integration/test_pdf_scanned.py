"""Integration tests — scanned/hybrid PDF pipeline.

Uses Sun_Hung_Kai___Co__Limited_AR_2024.pdf (T8, scanned/hybrid, 3.2 MB).
Ported from: __tests__/integration/pdf-pipeline-scanned.test.ts
"""

import pytest

from pdf.page_classifier import classify_pdf_pages, summarize_classifications
from pdf.page_filter import filter_financial_pages
from pdf.page_rasterizer import rasterize_page
from pdf.statement_classifier import classify_statement_type


@pytest.mark.integration
def test_classify_sun_hung_kai(pdf_sun_hung_kai: bytes):
    """Page classifier returns pages with majority scanned/hybrid."""
    pages = classify_pdf_pages(pdf_sun_hung_kai)
    summary = summarize_classifications(pages)

    assert len(pages) >= 1
    assert summary["total"] == len(pages)

    # Most pages should be scanned or hybrid (image-heavy PDF)
    non_digital = summary["scanned"] + summary["hybrid"]
    assert non_digital > summary["digital"]

    # Every page has valid classification
    for page in pages:
        assert page.classification in ("digital", "scanned", "hybrid")


@pytest.mark.integration
def test_rasterize_sun_hung_kai_page1(pdf_sun_hung_kai: bytes):
    """Rasterize page 1 -> valid PNG buffer with magic bytes."""
    png = rasterize_page(pdf_sun_hung_kai, page_number=1, scale=2.0)

    assert len(png) > 0
    # PNG magic bytes
    assert png[0] == 0x89
    assert png[1] == 0x50
    assert png[2] == 0x4E
    assert png[3] == 0x47


# ── Phase 2: Filter on scanned PDF ──


@pytest.mark.integration
def test_filter_sun_hung_kai(pdf_sun_hung_kai: bytes):
    """Filter on scanned PDF completes gracefully; scanned pages have no text."""
    pages = classify_pdf_pages(pdf_sun_hung_kai)

    # S2b: classify digital/hybrid pages only (skip scanned)
    for page in pages:
        if page.classification != "scanned":
            hits = classify_statement_type(page.text_content)
            page.section_type = hits[0].statement_type

    result = filter_financial_pages(pages)

    # Should complete without error
    assert result.total_page_count > 0
    assert 0.0 <= result.reduction_ratio <= 1.0
