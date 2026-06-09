"""Unit tests for the enhanced text extraction prompt (robust formatting rules)."""

from __future__ import annotations

import re

from claude.extract import _EXTRACT_PROMPT_TEMPLATE


def test_prompt_handles_account_codes():
    """Prompt must mention account codes before line items."""
    assert "account code" in _EXTRACT_PROMPT_TEMPLATE.lower() or "401000" in _EXTRACT_PROMPT_TEMPLATE


def test_prompt_handles_spaced_parentheses():
    """Prompt must handle values with spaces inside parentheses."""
    assert "( 5,748)" in _EXTRACT_PROMPT_TEMPLATE or "spaces inside parentheses" in _EXTRACT_PROMPT_TEMPLATE.lower()


def test_prompt_handles_percentage_columns():
    """Prompt must mention percentage columns."""
    assert "ercentage" in _EXTRACT_PROMPT_TEMPLATE  # matches Percentage or percentage


def test_prompt_handles_note_ref_formats():
    """Prompt must mention unusual note reference formats."""
    assert "Note 6" in _EXTRACT_PROMPT_TEMPLATE or "unusual format" in _EXTRACT_PROMPT_TEMPLATE.lower()


def test_prompt_format_all_placeholders_resolved():
    """All template placeholders must resolve without leftover braces."""
    rendered = _EXTRACT_PROMPT_TEMPLATE.format(
        statement_type_display="income statement",
        statement_type="income_statement",
        template_type="T1",
        page_text="Sample text here",
    )
    unresolved = re.findall(r"\{[a-z_]+\}", rendered)
    assert unresolved == [], f"Unresolved placeholders: {unresolved}"
    assert "income statement" in rendered
    assert "T1" in rendered
    assert "Sample text here" in rendered
