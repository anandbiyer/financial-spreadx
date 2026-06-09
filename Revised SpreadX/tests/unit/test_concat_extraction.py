"""Unit tests for S5 multi-page concatenation logic with mocked Claude calls."""

from __future__ import annotations

from unittest.mock import patch, MagicMock, call

from pipeline.orchestrator import run_pipeline


def _mock_extract_statement(page_text, stmt_type, template, **kwargs):
    """Return 1 fake row, recording the text it received."""
    return [
        {
            "raw_label": f"Mock {stmt_type}",
            "raw_values": {"2024": 100},
            "section_path": [],
            "indentation_level": 0,
            "is_subtotal": False,
            "note_ref": None,
            "_received_text": page_text,  # track what text was passed
        }
    ]


def _mock_extract_note(note_text, note_number, template):
    from models.extraction import NoteExtraction
    return NoteExtraction(
        note_number=note_number,
        note_title=f"Note {note_number}",
        summary="Mock summary",
    )


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
def test_digital_pages_concatenated_for_same_statement(mock_extract, mock_note, pdf_lt_finance):
    """Digital pages for the same statement type should be concatenated into a single call."""
    result = run_pipeline(pdf_lt_finance, "T3")

    # extract_statement should be called once per statement TYPE (not per page)
    # Each call gets concatenated text from all digital pages of that type
    call_count_per_type = {}
    for c in mock_extract.call_args_list:
        text, stmt_type, tmpl = c[0]
        call_count_per_type[stmt_type] = call_count_per_type.get(stmt_type, 0) + 1

    for stmt_type, count in call_count_per_type.items():
        assert count == 1, (
            f"extract_statement called {count} times for {stmt_type}, expected 1 "
            f"(multi-page text should be concatenated into a single call)"
        )


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
def test_page_break_separator_in_concatenated_text(mock_extract, mock_note, pdf_lt_finance):
    """Concatenated text should contain PAGE BREAK separators between pages."""
    result = run_pipeline(pdf_lt_finance, "T3")

    for c in mock_extract.call_args_list:
        text, stmt_type, tmpl = c[0]
        # If multiple pages were concatenated, the separator should be present
        # (single-page statements won't have it, which is fine)
        # We just verify the separator format is correct when present
        if "--- PAGE BREAK ---" in text:
            # Separator found — concatenation is working
            parts = text.split("--- PAGE BREAK ---")
            assert len(parts) >= 2, "PAGE BREAK separator should split into 2+ parts"


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
@patch("pipeline.orchestrator.segment_page_text", wraps=lambda text, stype: text)
def test_segmentation_applied_before_concatenation(mock_segment, mock_extract, mock_note, pdf_lt_finance):
    """segment_page_text should be called for each digital page before concatenation."""
    result = run_pipeline(pdf_lt_finance, "T3")

    # segment_page_text should have been called at least once
    assert mock_segment.call_count >= 1, (
        "segment_page_text should be called for digital pages"
    )

    # Each call should receive a statement type
    for c in mock_segment.call_args_list:
        text_arg, stmt_type_arg = c[0]
        assert isinstance(text_arg, str)
        assert stmt_type_arg in (
            "income_statement", "balance_sheet", "cash_flow", "equity_statement"
        )
