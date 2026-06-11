"""Canonical test corpus (Frontend_DesignPlan §7.0).

Four real annual reports drive the whole build/test — Upload → Extract → Map → Report.
Chosen for coverage: digital + scanned, 19–225 rows, four templates, all realistically
unbalanced. PDFs live in ``Financials_Provided/`` (gitignored); each already has golden
``_extracted.xlsx`` / ``_spread.xlsx`` outputs used as oracles.

Imported by ``scripts/seed_test_corpus.py`` and by tests/dev tooling.
"""

from __future__ import annotations

import os

# Repo root = parent of this file's package directory.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_FIN = os.path.join(_ROOT, "Financials_Provided")


def _p(name: str) -> str:
    return os.path.join(_FIN, name)


TEST_CORPUS: list[dict] = [
    {
        "key": "aspect",
        "filename": "Aspect Capital Limited_2023.pdf",
        "path": _p("Aspect Capital Limited_2023.pdf"),
        "company": "Aspect Capital Limited",
        "fiscal_year": 2023,
        "doc_type": "scanned",          # UK Co. Act, reconciliation-heavy, neg L+E
        "approx_rows": 95,
    },
    {
        "key": "fubon",
        "filename": "Fubon Securities Co Ltd_2017.pdf",
        "path": _p("Fubon Securities Co Ltd_2017.pdf"),
        "company": "Fubon Securities Co Ltd",
        "fiscal_year": 2017,
        "doc_type": "digital",          # Taiwan IFRS, largest, many unmapped
        "approx_rows": 225,
    },
    {
        "key": "hdfc",
        "filename": "hdfc credila 2023.pdf",
        "path": _p("hdfc credila 2023.pdf"),
        "company": "hdfc credila",
        "fiscal_year": 2023,
        "doc_type": "digital",          # Indian NBFC (Ind AS)
        "approx_rows": 123,
    },
    {
        "key": "infigen",
        "filename": "Infigen Energy (Eifel) Limited 2008.pdf",
        "path": _p("Infigen Energy (Eifel) Limited 2008.pdf"),
        "company": "Infigen Energy (Eifel) Limited",
        "fiscal_year": 2008,
        "doc_type": "scanned",          # smallest/cheapest — routine e2e + delete test
        "approx_rows": 19,
    },
]

# Convenience lookups.
BY_KEY: dict[str, dict] = {c["key"]: c for c in TEST_CORPUS}


def get(key: str) -> dict:
    return BY_KEY[key]


def existing() -> list[dict]:
    """Corpus entries whose PDF is present on disk."""
    return [c for c in TEST_CORPUS if os.path.exists(c["path"])]
