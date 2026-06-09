"""Unit tests for the vision fallback when digital extraction returns 0 rows."""

from __future__ import annotations

from unittest.mock import patch, call

from pipeline.orchestrator import run_pipeline


def _mock_extract_empty(page_text, stmt_type, template, **kwargs):
    """Return 0 rows — simulates digital extraction failure."""
    return []


def _mock_extract_rows(page_text, stmt_type, template, **kwargs):
    """Return 2 rows — simulates successful digital extraction."""
    return [
        {
            "raw_label": f"Mock {stmt_type}",
            "raw_values": {"2024": 100},
            "section_path": [],
            "indentation_level": 0,
            "is_subtotal": False,
            "note_ref": None,
        },
        {
            "raw_label": f"Mock {stmt_type} total",
            "raw_values": {"2024": 200},
            "section_path": [],
            "indentation_level": 0,
            "is_subtotal": True,
            "note_ref": None,
        },
    ]


def _mock_vision_extract(image_buffer, stmt_type, template, page_num):
    return [
        {
            "raw_label": f"Vision {stmt_type}",
            "raw_values": {"2024": 300},
            "section_path": [],
            "indentation_level": 0,
            "is_subtotal": False,
            "note_ref": None,
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
@patch("pipeline.orchestrator.extract_statement_from_image", side_effect=_mock_vision_extract)
@patch("pipeline.orchestrator.rasterize_page", return_value=b"\x89PNG fake")
@patch("pipeline.orchestrator.detect_and_correct_rotation", side_effect=lambda png, w, h: png)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_empty)
def test_vision_fallback_triggers_on_zero_rows(
    mock_extract, mock_rotation, mock_rasterize, mock_vision, mock_note,
    pdf_lt_finance,
):
    """When digital extraction returns 0 rows, vision fallback should trigger."""
    result = run_pipeline(pdf_lt_finance, "T3")

    # Vision extraction should have been called as fallback
    assert mock_vision.call_count >= 1, (
        "extract_statement_from_image should be called as fallback"
    )
    # Should have some rows from the vision fallback
    assert len(result.extracted_rows) >= 1


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement_from_image", side_effect=_mock_vision_extract)
@patch("pipeline.orchestrator.rasterize_page", return_value=b"\x89PNG fake")
@patch("pipeline.orchestrator.detect_and_correct_rotation", side_effect=lambda png, w, h: png)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_rows)
def test_vision_fallback_not_triggered_when_rows_exist(
    mock_extract, mock_rotation, mock_rasterize, mock_vision, mock_note,
    pdf_lt_finance,
):
    """When digital extraction returns rows, vision fallback should NOT trigger."""
    result = run_pipeline(pdf_lt_finance, "T3")

    # Vision extraction should NOT be called (digital succeeded)
    # Note: vision may still be called for scanned pages if any exist,
    # but rasterize_page should not be called for digital pages
    # The key assertion is that we have rows from the digital path
    assert len(result.extracted_rows) >= 1
    # All rows should come from mock_extract_rows, not vision
    for r in result.extracted_rows:
        assert "Vision" not in r.get("raw_label", ""), (
            "Vision fallback should not have been used"
        )


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement_from_image", side_effect=Exception("API error"))
@patch("pipeline.orchestrator.rasterize_page", return_value=b"\x89PNG fake")
@patch("pipeline.orchestrator.detect_and_correct_rotation", side_effect=lambda png, w, h: png)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_empty)
def test_vision_fallback_exception_handled(
    mock_extract, mock_rotation, mock_rasterize, mock_vision, mock_note,
    pdf_lt_finance,
):
    """When vision fallback also raises an exception, pipeline doesn't crash."""
    result = run_pipeline(pdf_lt_finance, "T3")

    # Pipeline should complete without error
    assert result.extracted_rows == []
    assert "total_rows" in result.summary
