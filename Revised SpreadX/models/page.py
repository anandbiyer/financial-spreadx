"""Pydantic models for PDF page classification and filtering."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field


PageClassification = Literal["digital", "scanned", "hybrid"]

StatementType = Literal[
    "balance_sheet",
    "income_statement",
    "cash_flow",
    "equity_statement",
    "notes",
    "other",
]


class ClassifiedPage(BaseModel):
    """A single PDF page with its classification metadata."""

    page_number: int
    classification: PageClassification
    word_count: int
    ascii_ratio: float
    text_content: str = ""
    requires_ocr: bool = False
    drawing_count: int = 0
    page_width: float = 0.0
    page_height: float = 0.0
    section_type: str | None = None
    secondary_section_type: str | None = None
    image_buffer: bytes | None = Field(default=None, exclude=True)

    model_config = {"arbitrary_types_allowed": True}


class ClassifiedStatement(BaseModel):
    """Result of classifying a page's statement type."""

    statement_type: StatementType
    confidence: float
    matched_pattern: str = ""


class StatementSignal(BaseModel):
    """A regex pattern used to detect financial statement types."""

    pattern: re.Pattern[str]
    type: StatementType
    weight: float
    template_hints: list[str] = Field(default_factory=list)

    model_config = {"arbitrary_types_allowed": True}


class FilterResult(BaseModel):
    """Result of grouping classified pages by statement type."""

    selected_pages: dict[str, list[int]] = Field(default_factory=dict)
    note_page_map: dict[int, list[int]] = Field(default_factory=dict)
    filtered_page_count: int = 0
    total_page_count: int = 0
    reduction_ratio: float = 0.0


class ScannedPageClassification(BaseModel):
    """Classification result for a scanned page via Claude vision."""

    statement_types: list[StatementType] = Field(default_factory=lambda: ["other"])
    confidence: float = 0.0
    visible_years: list[int] = Field(default_factory=list)
    heading_verbatim: str = ""
    scope: Literal[
        "consolidated", "standalone", "group", "company", "unknown"
    ] = "unknown"
    is_continuation: bool = False
