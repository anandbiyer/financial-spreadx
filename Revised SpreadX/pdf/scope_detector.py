"""M7 — Scope Detector.

Detects whether a financial statement is standalone or consolidated
by scanning heading text for keywords.

Ported from: financial-spreadx/lib/mapping/scope-detector.ts
"""

from __future__ import annotations

import re
from typing import Literal

StatementScope = Literal["standalone", "consolidated", "unknown"]

CONSOLIDATED_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bconsolidated\b", re.IGNORECASE),
    re.compile(r"\bgroup\b", re.IGNORECASE),
]

STANDALONE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bstandalone\b", re.IGNORECASE),
    re.compile(r"\bcompany\b(?!\s+act)", re.IGNORECASE),  # "Company" but not "Companies Act"
    re.compile(r"\bparent\s+entity\b", re.IGNORECASE),
]


def detect_scope(page_text: str) -> StatementScope:
    """Detect the scope of a financial statement from its heading/page text.

    Checks the first 500 characters (heading area).
    """
    heading = page_text[:500]

    if any(p.search(heading) for p in CONSOLIDATED_PATTERNS):
        return "consolidated"

    if any(p.search(heading) for p in STANDALONE_PATTERNS):
        return "standalone"

    return "unknown"
