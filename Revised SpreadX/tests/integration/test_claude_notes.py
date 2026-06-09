"""Integration tests — Claude note extraction (requires ANTHROPIC_API_KEY).

Tests real Claude API calls for financial note extraction.
"""

from __future__ import annotations

import os

import pytest

from claude.extract_notes import extract_note
from pdf.page_classifier import classify_pdf_pages
from pdf.statement_classifier import classify_statement_type

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not os.environ.get("ANTHROPIC_API_KEY"),
        reason="ANTHROPIC_API_KEY not set",
    ),
]


@pytest.mark.timeout(60)
def test_extract_note_synthetic():
    """Extract from synthetic note text about loans (INR crore)."""
    note_text = """Note 5: Loans and Advances
As at March 31, 2019, the company's loan portfolio comprised:
- Term loans: 15,234 crore (2018: 12,456 crore)
- Working capital loans: 3,456 crore (2018: 2,890 crore)
- Infrastructure loans: 8,123 crore (2018: 7,654 crore)
Total loans and advances: 26,813 crore (2018: 23,000 crore)
Impairment allowance: 1,234 crore (2018: 987 crore)"""

    result = extract_note(note_text, 5, "T3")

    assert result.note_number == 5
    assert result.note_title  # non-empty
    assert 0 < len(result.summary) <= 500
    assert isinstance(result.sub_tables, list)


@pytest.mark.timeout(60)
def test_extract_note_from_real_pdf(pdf_aspect_capital: bytes):
    """Find a notes page in Aspect Capital and extract it."""
    pages = classify_pdf_pages(pdf_aspect_capital)

    # Find a notes page
    note_text = None
    for page in pages:
        if page.classification == "scanned":
            continue
        hits = classify_statement_type(page.text_content)
        if hits[0].statement_type == "notes":
            note_text = page.text_content
            break

    if note_text is None:
        pytest.skip("No notes page found in Aspect Capital PDF")

    result = extract_note(note_text, 1, "T5")

    assert result.note_number == 1
    assert result.note_title  # non-empty
    assert len(result.summary) > 0
