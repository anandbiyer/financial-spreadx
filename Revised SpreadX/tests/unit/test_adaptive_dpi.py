"""Unit tests for adaptive DPI and 0-row vision retry with rotation."""

from __future__ import annotations

from unittest.mock import patch, call

from pipeline.orchestrator import run_pipeline


def _mock_extract_statement(page_text, stmt_type, template, **kwargs):
    return []


def _mock_extract_note(note_text, note_number, template):
    from models.extraction import NoteExtraction
    return NoteExtraction(
        note_number=note_number,
        note_title=f"Note {note_number}",
        summary="Mock summary",
    )


def _mock_classify_scanned(image_buffers):
    from models.page import ScannedPageClassification
    return {
        pn: ScannedPageClassification(
            statement_types=["income_statement"],
            confidence=0.95,
            visible_years=[2024],
            heading_verbatim="Mock",
            scope="consolidated",
            is_continuation=False,
        )
        for pn in image_buffers
    }


def _vision_rows(image_buffer, stmt_type, template, page_num):
    return [
        {
            "raw_label": f"Vision {stmt_type}",
            "raw_values": {"2024": 100},
            "section_path": [],
            "indentation_level": 0,
            "is_subtotal": False,
            "note_ref": None,
        }
    ]


def _vision_empty_then_rows(image_buffer, stmt_type, template, page_num):
    """First call returns empty, second call returns rows (simulates retry success)."""
    _vision_empty_then_rows.call_count = getattr(_vision_empty_then_rows, "call_count", 0) + 1
    if _vision_empty_then_rows.call_count % 2 == 1:
        return []  # First attempt fails
    return _vision_rows(image_buffer, stmt_type, template, page_num)  # Retry succeeds


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
@patch("pipeline.orchestrator.extract_statement_from_image", side_effect=_vision_rows)
@patch("pipeline.orchestrator.classify_scanned_pages", side_effect=_mock_classify_scanned)
@patch("pipeline.orchestrator.rasterize_page", return_value=b"\x89PNG fake")
@patch("pipeline.orchestrator.rasterize_pages")
@patch("pipeline.orchestrator.detect_and_correct_rotation", side_effect=lambda png, w, h: png)
@patch("pipeline.orchestrator.rotate_image_90", side_effect=lambda png: png)
def test_high_drawing_page_uses_higher_dpi(
    mock_rotate90, mock_rotation, mock_rast_pages, mock_rast_page,
    mock_classify, mock_vision, mock_extract, mock_note,
    pdf_labranche,
):
    """Pages with drawing_count > 2000 should use dpi_scale >= 3.0.
    Uses LaBranche which has page 4 with 2555 drawings."""
    mock_rast_pages.return_value = {1: b"s4b", 2: b"s4b", 3: b"s4b", 4: b"s4b"}

    result = run_pipeline(pdf_labranche, dpi_scale=2.0)

    # Check that rasterize_page was called with scale=3.0 for dense pages
    scales_used = [c[0][2] for c in mock_rast_page.call_args_list]
    assert 3.0 in scales_used, (
        f"Expected 3.0 DPI for dense pages, scales used: {scales_used}"
    )


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
@patch("pipeline.orchestrator.extract_statement_from_image")
@patch("pipeline.orchestrator.classify_scanned_pages", side_effect=_mock_classify_scanned)
@patch("pipeline.orchestrator.rasterize_page", return_value=b"\x89PNG fake")
@patch("pipeline.orchestrator.rasterize_pages")
@patch("pipeline.orchestrator.detect_and_correct_rotation", side_effect=lambda png, w, h: png)
@patch("pipeline.orchestrator.rotate_image_90", return_value=b"\x89PNG rotated")
def test_retry_with_rotation_on_zero_rows(
    mock_rotate90, mock_rotation, mock_rast_pages, mock_rast_page,
    mock_classify, mock_vision, mock_extract, mock_note,
    pdf_sun_hung_kai,
):
    """When vision returns 0 rows, retry with rotated image."""
    _vision_empty_then_rows.call_count = 0
    mock_vision.side_effect = _vision_empty_then_rows
    mock_rast_pages.return_value = {1: b"s4b", 2: b"s4b", 3: b"s4b", 4: b"s4b"}

    result = run_pipeline(pdf_sun_hung_kai, dpi_scale=2.0)

    # rotate_image_90 should have been called at least once (retry path)
    assert mock_rotate90.call_count >= 1, (
        "rotate_image_90 should be called as retry strategy on 0-row pages"
    )


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
@patch("pipeline.orchestrator.extract_statement_from_image", side_effect=_vision_rows)
@patch("pipeline.orchestrator.classify_scanned_pages", side_effect=_mock_classify_scanned)
@patch("pipeline.orchestrator.rasterize_page", return_value=b"\x89PNG fake")
@patch("pipeline.orchestrator.rasterize_pages")
@patch("pipeline.orchestrator.detect_and_correct_rotation", side_effect=lambda png, w, h: png)
@patch("pipeline.orchestrator.rotate_image_90", return_value=b"\x89PNG rotated")
def test_no_retry_when_rows_exist(
    mock_rotate90, mock_rotation, mock_rast_pages, mock_rast_page,
    mock_classify, mock_vision, mock_extract, mock_note,
    pdf_sun_hung_kai,
):
    """When vision returns rows on first attempt, no retry/rotation needed."""
    mock_rast_pages.return_value = {1: b"s4b", 2: b"s4b", 3: b"s4b", 4: b"s4b"}

    result = run_pipeline(pdf_sun_hung_kai, dpi_scale=2.0)

    # rotate_image_90 should NOT be called when extraction succeeds
    assert mock_rotate90.call_count == 0, (
        f"rotate_image_90 called {mock_rotate90.call_count} times but shouldn't when rows exist"
    )
