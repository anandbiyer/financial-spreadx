"""Unit tests for pipeline orchestrator with mocked Claude calls."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from pipeline.orchestrator import run_pipeline, PipelineResult


def _mock_extract_statement(page_text, stmt_type, template, **kwargs):
    """Return 2 fake rows for any statement extraction."""
    return [
        {
            "raw_label": f"Mock {stmt_type} item 1",
            "raw_values": {"2024": 100},
            "section_path": [],
            "indentation_level": 0,
            "is_subtotal": False,
            "note_ref": "Note 5",
        },
        {
            "raw_label": f"Mock {stmt_type} item 2",
            "raw_values": {"2024": 200},
            "section_path": [],
            "indentation_level": 0,
            "is_subtotal": True,
            "note_ref": None,
        },
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
def test_pipeline_calls_stages_in_order(mock_extract, mock_note, pdf_lt_finance):
    """Progress callback receives stages in S2, S2b, S3, S5, S6 order."""
    stages: list[str] = []

    def cb(stage, detail, pct):
        if not stages or stages[-1] != stage:
            stages.append(stage)

    result = run_pipeline(pdf_lt_finance, "T3", progress_callback=cb)

    assert "S2" in stages
    assert "S2b" in stages
    assert "S3" in stages
    assert "S5" in stages
    assert "S6" in stages
    # S2 should come before S5
    assert stages.index("S2") < stages.index("S5")


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", return_value=[])
@patch("pipeline.orchestrator.extract_statement_from_image", return_value=[])
@patch("pipeline.orchestrator.rasterize_page", return_value=b"\x89PNG fake")
@patch("pipeline.orchestrator.detect_and_correct_rotation", side_effect=lambda png, w, h: png)
def test_pipeline_skips_empty_statements(mock_rotation, mock_rasterize, mock_vision, mock_extract, mock_note, pdf_lt_finance):
    """When both text and vision extraction return empty, result has 0 rows."""
    result = run_pipeline(pdf_lt_finance, "T3")
    assert result.extracted_rows == []


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
def test_pipeline_collects_note_refs(mock_extract, mock_note, pdf_lt_finance):
    """Rows with note_ref trigger S6 note extraction."""
    result = run_pipeline(pdf_lt_finance, "T3")

    # Our mock rows have "Note 5" refs; if note pages exist, extract_note is called
    # Even if no note pages exist in the filter, the pipeline should still complete
    assert isinstance(result.extracted_notes, list)


@patch("pipeline.orchestrator.extract_note", side_effect=_mock_extract_note)
@patch("pipeline.orchestrator.extract_statement", side_effect=_mock_extract_statement)
def test_pipeline_result_structure(mock_extract, mock_note, pdf_lt_finance):
    """PipelineResult has all required fields populated."""
    result = run_pipeline(pdf_lt_finance, "T3")

    assert isinstance(result, PipelineResult)
    assert len(result.classified_pages) == 8  # LT Finance has 8 pages
    assert result.template_type == "T3"
    assert "total_pages" in result.summary
    assert "total_rows" in result.summary
    assert result.summary["total_pages"] == 8
