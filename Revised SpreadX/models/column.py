"""Pydantic models for column header classification."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


ColumnType = Literal["actual", "budget", "forecast", "restated", "unknown"]


class ColumnMetadata(BaseModel):
    """Metadata for a single year column header."""

    label: str
    year: int = 0
    type: ColumnType = "actual"
