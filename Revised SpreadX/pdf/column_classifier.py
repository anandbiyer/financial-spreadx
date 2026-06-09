"""Column header classifier — parses year and type from column headers.

Ported from: financial-spreadx/lib/pdf/column-classifier.ts
"""

from __future__ import annotations

import re

from models.column import ColumnMetadata, ColumnType

# Patterns for non-default column types
COLUMN_TYPE_PATTERNS: dict[ColumnType, list[re.Pattern[str]]] = {
    "restated": [re.compile(r"(restated|re-stated|revised|as\s+restated)", re.IGNORECASE)],
    "budget": [re.compile(r"(budget|budgeted)", re.IGNORECASE)],
    "forecast": [re.compile(r"(forecast|projected|estimate)", re.IGNORECASE)],
}


def classify_column_headers(raw_headers: list[str]) -> list[ColumnMetadata]:
    """Classify raw column header strings into typed metadata.

    Rules:
        - If header matches restated/budget/forecast pattern -> that type
        - Otherwise -> 'actual' (the default)
        - Year is extracted from the first 4-digit number matching 19xx or 20xx
    """
    results: list[ColumnMetadata] = []

    for header in raw_headers:
        # Extract year
        year_match = re.search(r"20\d{2}|19\d{2}", header)
        year = int(year_match.group(0)) if year_match else 0

        # Determine type
        col_type: ColumnType = "actual"
        for t, patterns in COLUMN_TYPE_PATTERNS.items():
            if any(p.search(header) for p in patterns):
                col_type = t
                break

        results.append(ColumnMetadata(label=header, year=year, type=col_type))

    return results
