"""Unit tests for the S4b → S5 DPI reuse fix.

Verifies that S4b classification buffers are cleared before S5 extraction
so that scanned pages are re-rasterized at the full extraction DPI.
"""

from __future__ import annotations

from unittest.mock import patch, MagicMock, call

from pipeline.orchestrator import run_pipeline


def _mock_extract_statement(page_text, stmt_type, template, **kwargs):
    return [
        {
            "raw_label": f"Mock {stmt_type}",
            "raw_values": {"2024": 100},
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


def _mock_vision_extract(image_buffer, stmt_type, template, page_num):
    return [
        {
            "raw_label": f"Vision {stmt_type}",
            "raw_values": {"2024": 200},
            "section_path": [],
            "indentation_level": 0,
            "is_subtotal": False,
            "note_ref": None,
        }
    ]


def _mock_classify_scanned(image_buffers):
    """Classify every scanned page as income_statement for testing."""
    from models.page import ScannedPageClassification

    return {
        pn: ScannedPageClassification(
            statement_types=["income_statement"],
            confidence=0.95,
            visible_years=[2024],
            heading_verbatim="Mock heading",
            scope="consolidated",
            is_continuation=False,
        )
        for pn in image_buffers
    }


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
@patch("pipeline.orchestrator.extract_statement_from_image", side_effect=_mock_vision_extract)
@patch("pipeline.orchestrator.classify_scanned_pages", side_effect=_mock_classify_scanned)
@patch("pipeline.orchestrator.rasterize_page")
@patch("pipeline.orchestrator.rasterize_pages")
def test_s4b_buffer_cleared_after_classification(
    mock_rast_pages,
    mock_rast_page,
    mock_classify,
    mock_vision_extract,
    mock_extract,
    mock_note,
    pdf_sun_hung_kai,
):
    """After S4b, image_buffer should be None so S5 calls rasterize_page."""
    # S4b rasterize_pages returns fake buffers
    mock_rast_pages.return_value = {1: b"fake_png_1", 2: b"fake_png_2",
                                     3: b"fake_png_3", 4: b"fake_png_4"}
    # S5 rasterize_page returns a fresh buffer
    mock_rast_page.return_value = b"fresh_png"

    result = run_pipeline(pdf_sun_hung_kai)

    # S5 should call rasterize_page for each scanned page (buffer was cleared)
    assert mock_rast_page.call_count >= 1, (
        "rasterize_page should be called in S5 after S4b buffers are cleared"
    )


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
@patch("pipeline.orchestrator.extract_statement_from_image", side_effect=_mock_vision_extract)
@patch("pipeline.orchestrator.classify_scanned_pages", side_effect=_mock_classify_scanned)
@patch("pipeline.orchestrator.rasterize_page")
@patch("pipeline.orchestrator.rasterize_pages")
def test_s5_rasterizes_at_full_dpi(
    mock_rast_pages,
    mock_rast_page,
    mock_classify,
    mock_vision_extract,
    mock_extract,
    mock_note,
    pdf_sun_hung_kai,
):
    """S5 should rasterize at dpi_scale=2.0 (not the S4b 1.5x)."""
    mock_rast_pages.return_value = {1: b"fake_png_1", 2: b"fake_png_2",
                                     3: b"fake_png_3", 4: b"fake_png_4"}
    mock_rast_page.return_value = b"fresh_png"

    result = run_pipeline(pdf_sun_hung_kai, dpi_scale=2.0)

    # Every rasterize_page call in S5 should use the pipeline's dpi_scale
    for c in mock_rast_page.call_args_list:
        _, kwargs = c
        args = c[0]
        # rasterize_page(pdf_bytes, page_num, scale) — scale is the 3rd positional arg
        assert args[2] == 2.0, f"Expected dpi_scale=2.0, got {args[2]}"


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
@patch("pipeline.orchestrator.extract_statement_from_image", side_effect=_mock_vision_extract)
@patch("pipeline.orchestrator.classify_scanned_pages", side_effect=_mock_classify_scanned)
@patch("pipeline.orchestrator.rasterize_page")
@patch("pipeline.orchestrator.rasterize_pages")
def test_s5_does_not_reuse_s4b_buffer(
    mock_rast_pages,
    mock_rast_page,
    mock_classify,
    mock_vision_extract,
    mock_extract,
    mock_note,
    pdf_sun_hung_kai,
):
    """Vision extraction receives fresh rasterized PNG, not the S4b buffer."""
    s4b_buffer = b"low_res_s4b_png"
    fresh_buffer = b"high_res_s5_png"

    mock_rast_pages.return_value = {1: s4b_buffer, 2: s4b_buffer,
                                     3: s4b_buffer, 4: s4b_buffer}
    mock_rast_page.return_value = fresh_buffer

    result = run_pipeline(pdf_sun_hung_kai)

    # extract_statement_from_image should receive the fresh buffer, not s4b
    for c in mock_vision_extract.call_args_list:
        image_arg = c[0][0]  # first positional arg is image_buffer
        assert image_arg == fresh_buffer, (
            "Vision extraction received S4b buffer instead of fresh S5 rasterization"
        )
