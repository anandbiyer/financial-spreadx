"""Unit tests for page filter.

Ported from: __tests__/unit/page-filter.test.ts (9 tests)
"""

from pdf.page_filter import expand_with_continuation_pages, filter_financial_pages
from pdf.statement_classifier import STATEMENT_SIGNALS
from models.page import ClassifiedPage


def _make_page(
    num: int,
    classification: str = "digital",
    section_type: str | None = None,
    text_content: str = "",
) -> ClassifiedPage:
    """Helper to create a mock ClassifiedPage."""
    return ClassifiedPage(
        page_number=num,
        classification=classification,
        word_count=100,
        ascii_ratio=0.95,
        text_content=text_content,
        section_type=section_type,
    )


def test_expand_8_page_window():
    """Start page 10, 20 total pages -> pages 10-18 included."""
    pages = [_make_page(i) for i in range(1, 21)]
    result = expand_with_continuation_pages([10], pages, max_window=8)
    for n in range(10, 19):
        assert n in result


def test_page_19_excluded():
    """Window of 8 from page 10 should not include page 19."""
    pages = [_make_page(i) for i in range(1, 21)]
    result = expand_with_continuation_pages([10], pages, max_window=8)
    assert 19 not in result


def test_multiple_starts_merge():
    """Multiple section starts [5, 15] merge both ranges."""
    pages = [_make_page(i) for i in range(1, 25)]
    result = expand_with_continuation_pages([5, 15], pages, max_window=8)
    assert 5 in result
    assert 13 in result  # 5 + 8
    assert 15 in result
    assert 20 in result  # 15 + 5 (within window from 15)


def test_near_end_of_pdf():
    """Start page 18, 20 total -> includes 18, 19, 20."""
    pages = [_make_page(i) for i in range(1, 21)]
    result = expand_with_continuation_pages([18], pages, max_window=8)
    assert 18 in result
    assert 19 in result
    assert 20 in result


def test_empty_starts():
    """Empty detected pages -> empty result."""
    pages = [_make_page(i) for i in range(1, 10)]
    assert expand_with_continuation_pages([], pages) == []


def test_boundary_stops_at_different_section():
    """Expansion from balance_sheet page stops at income_statement page."""
    pages = [
        _make_page(1, section_type="balance_sheet"),
        _make_page(2, section_type="income_statement"),
        _make_page(3),
    ]
    result = expand_with_continuation_pages([1], pages, max_window=8)
    assert 1 in result
    assert 2 not in result  # different section type = boundary


def test_filter_groups_by_type():
    """Filter groups 6 mock pages by pre-assigned section_type; scanned excluded."""
    pages = [
        _make_page(1, section_type="balance_sheet"),
        _make_page(2, section_type="income_statement"),
        _make_page(3, section_type="equity_statement"),
        _make_page(4, section_type="cash_flow"),
        _make_page(5, classification="scanned", section_type="balance_sheet"),
        _make_page(6, section_type="other"),
    ]
    result = filter_financial_pages(pages)

    assert "balance_sheet" in result.selected_pages
    assert "income_statement" in result.selected_pages
    assert "equity_statement" in result.selected_pages
    assert "cash_flow" in result.selected_pages
    # Scanned page 5 excluded; 'other' page 6 excluded
    assert result.filtered_page_count == 4
    assert 5 not in result.selected_pages.get("balance_sheet", [])


def test_note_page_map():
    """Pages with note headings populate note_page_map."""
    pages = [
        _make_page(10, section_type="notes", text_content="Note 12\nSome details..."),
    ]
    result = filter_financial_pages(pages)
    assert 12 in result.note_page_map
    assert 10 in result.note_page_map[12]


def test_reduction_ratio():
    """Reduction ratio is between 0 and 1."""
    pages = [
        _make_page(1, section_type="balance_sheet"),
        _make_page(2, section_type="other"),
        _make_page(3, section_type="other"),
    ]
    result = filter_financial_pages(pages)
    assert 0 < result.reduction_ratio <= 1.0
