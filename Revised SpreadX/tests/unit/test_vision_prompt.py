"""Unit tests for the enhanced vision extraction prompt and max_tokens config."""

from __future__ import annotations

from unittest.mock import patch

from claude.extract_vision import _VISION_PROMPT_TEMPLATE, extract_statement_from_image
from config import VISION_EXTRACT_MAX_TOKENS, TEXT_EXTRACT_MAX_TOKENS


def test_prompt_contains_multi_column_guidance():
    """Vision prompt must include dual-column layout instructions."""
    assert "DUAL-COLUMN" in _VISION_PROMPT_TEMPLATE
    assert "WIDE TABLE" in _VISION_PROMPT_TEMPLATE


def test_prompt_contains_entire_page_instruction():
    """Vision prompt must instruct Claude to read the entire page."""
    assert "ENTIRE page" in _VISION_PROMPT_TEMPLATE


def test_prompt_contains_all_columns_instruction():
    """Vision prompt must instruct to extract from every column."""
    assert "EVERY column" in _VISION_PROMPT_TEMPLATE


def test_prompt_format_variables_populated():
    """All template placeholders must resolve without leftover braces."""
    rendered = _VISION_PROMPT_TEMPLATE.format(
        page_number=4,
        statement_type_display="cash flow",
        template_type="T1",
    )
    # No unresolved single braces (double braces {{ }} resolve to literal { })
    # Check there are no {word} patterns left
    import re
    unresolved = re.findall(r"\{[a-z_]+\}", rendered)
    assert unresolved == [], f"Unresolved placeholders: {unresolved}"

    assert "page 4" in rendered
    assert "cash flow" in rendered
    assert "T1" in rendered


def test_vision_max_tokens_is_8192():
    """VISION_EXTRACT_MAX_TOKENS must be 8192 (up from 4096)."""
    assert VISION_EXTRACT_MAX_TOKENS == 8192


def test_text_max_tokens_is_8192():
    """TEXT_EXTRACT_MAX_TOKENS must be 8192 (up from 4096)."""
    assert TEXT_EXTRACT_MAX_TOKENS == 8192


def test_prompt_includes_supplemental_disclosures():
    """Vision prompt should handle supplemental disclosure sections."""
    assert "supplemental" in _VISION_PROMPT_TEMPLATE.lower()
