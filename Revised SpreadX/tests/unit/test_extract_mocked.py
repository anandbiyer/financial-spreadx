"""Unit tests for Claude extraction modules with the LLM client mocked.

All extraction calls go through llm.get_llm_client(); these tests patch that
seam in each module so no provider (Anthropic/Bedrock) or API key is needed.
The fake client's complete()/complete_vision() return the raw model text — the
same contract the real backends satisfy.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from claude.extract import extract_statement
from claude.extract_vision import extract_statement_from_image
from claude.extract_notes import extract_note


def _fake_client(text: str | None = None, raises: Exception | None = None):
    """A fake LLMClient whose complete()/complete_vision() return `text`."""
    client = MagicMock()
    if raises is not None:
        client.complete.side_effect = raises
        client.complete_vision.side_effect = raises
    else:
        client.complete.return_value = text
        client.complete_vision.return_value = text
    return client


# ── extract_statement tests ──


@patch("claude.extract.get_llm_client")
def test_extract_statement_parses_rows(mock_get):
    """Valid 3-row JSON -> returns 3 dicts with correct fields."""
    mock_get.return_value = _fake_client(
        '{"rows": ['
        '{"raw_label": "Revenue", "year_values": [{"year": "2024", "value": 100}], '
        '"section_path": ["Revenue"], "indentation_level": 0, "is_subtotal": false, "note_ref": null},'
        '{"raw_label": "Cost of Sales", "year_values": [{"year": "2024", "value": -50}], '
        '"section_path": ["Expenses"], "indentation_level": 1, "is_subtotal": false, "note_ref": "Note 5"},'
        '{"raw_label": "Net Income", "year_values": [{"year": "2024", "value": 50}], '
        '"section_path": [], "indentation_level": 0, "is_subtotal": true, "note_ref": null}'
        "]}"
    )

    rows = extract_statement("some text", "income_statement", "T1")
    assert len(rows) == 3
    assert rows[0]["raw_label"] == "Revenue"
    assert rows[0]["raw_values"]["2024"] == 100
    assert rows[1]["note_ref"] == "Note 5"
    assert rows[2]["is_subtotal"] is True


@patch("claude.extract.get_llm_client")
def test_extract_statement_year_conversion(mock_get):
    """Fiscal year '2018-19' in year_values -> raw_values key '2019'."""
    mock_get.return_value = _fake_client(
        '{"rows": [{"raw_label": "Total", "year_values": [{"year": "2018-19", "value": 999}], '
        '"section_path": [], "indentation_level": 0, "is_subtotal": true, "note_ref": null}]}'
    )

    rows = extract_statement("text", "income_statement", "T3")
    assert "2019" in rows[0]["raw_values"]
    assert rows[0]["raw_values"]["2019"] == 999


# ── extract_statement_from_image tests ──


@patch("claude.extract_vision.get_llm_client")
def test_extract_vision_strips_fences(mock_get):
    """Response wrapped in ```json ... ``` -> parses correctly."""
    mock_get.return_value = _fake_client(
        '```json\n{"rows": [{"raw_label": "Assets", "raw_values": {"2024": 500}, '
        '"section_path": [], "indentation_level": 0, "is_subtotal": false, "note_ref": null}]}\n```'
    )

    rows = extract_statement_from_image(b"\x89PNG fake", "balance_sheet", "T8", 1)
    assert len(rows) == 1
    assert rows[0]["raw_label"] == "Assets"


@patch("claude.extract_vision.get_llm_client")
def test_extract_vision_fallback_empty(mock_get):
    """Invalid JSON from Claude -> returns empty list."""
    mock_get.return_value = _fake_client("I cannot extract data from this image.")

    rows = extract_statement_from_image(b"\x89PNG fake", "balance_sheet", "T8", 1)
    assert rows == []


# ── extract_note tests ──


@patch("claude.extract_notes.get_llm_client")
def test_extract_note_fallback(mock_get):
    """Unparseable Claude response -> returns fallback NoteExtraction."""
    mock_get.return_value = _fake_client(raises=Exception("API error"))

    result = extract_note("Note 5: Loans and Advances\nSome detail...", 5, "T3")
    assert result.note_number == 5
    assert result.note_title == "Note 5: Loans and Advances"
    assert result.sub_tables == []
    assert len(result.summary) > 0
