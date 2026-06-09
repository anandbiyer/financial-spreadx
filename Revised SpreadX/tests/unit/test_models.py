"""Unit tests for Pydantic models."""

import pytest
from pydantic import ValidationError

from models.page import ClassifiedPage
from models.column import ColumnMetadata
from models.extraction import ExtractedRow


def test_classified_page_creation():
    page = ClassifiedPage(
        page_number=1,
        classification="digital",
        word_count=120,
        ascii_ratio=0.95,
        text_content="Some text",
    )
    assert page.page_number == 1
    assert page.classification == "digital"


def test_classified_page_invalid_classification():
    with pytest.raises(ValidationError):
        ClassifiedPage(
            page_number=1,
            classification="invalid_type",  # type: ignore[arg-type]
            word_count=50,
            ascii_ratio=0.5,
        )


def test_column_metadata_defaults():
    meta = ColumnMetadata(label="2024")
    assert meta.year == 0
    assert meta.type == "actual"


def test_extracted_row_round_trip():
    row = ExtractedRow(
        raw_label="Total Revenue",
        raw_values={"2024": 1234.56, "2023": None},
        section_path=["Revenue"],
        indentation_level=0,
        is_subtotal=True,
        note_ref="Note 5",
        statement_type="income_statement",
        page=3,
    )
    data = row.model_dump()
    restored = ExtractedRow(**data)
    assert restored.raw_label == "Total Revenue"
    assert restored.raw_values["2024"] == 1234.56
    assert restored.raw_values["2023"] is None
    assert restored.is_subtotal is True
