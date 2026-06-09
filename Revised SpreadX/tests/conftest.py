"""Shared pytest fixtures — PDF file loaders for all 5 sample documents."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Ensure the project root is on sys.path so bare imports like
# ``from models.page import ...`` work without installing the package.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

# Load .env file so ANTHROPIC_API_KEY is available for integration tests
_env_path = _PROJECT_ROOT / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def spread_db(tmp_path, monkeypatch):
    """Isolated, freshly-seeded SQLite DB for Stage 11 spreading tests."""
    db_path = tmp_path / "spreadx_test.db"
    monkeypatch.setenv("SPREADX_DB_URL", f"sqlite:///{db_path}")
    from db import session

    session.reset_engine()
    session.init_db()
    from db.seed_coa import seed_coa_reference

    seed_coa_reference()
    yield
    session.reset_engine()


@pytest.fixture(scope="session")
def pdf_lt_finance() -> bytes:
    """LT Finance Limited 2019 — T3 Indian AS NBFC, 8 pages, all digital."""
    return (FIXTURES_DIR / "LT_Finance_Limited_2019.pdf").read_bytes()


@pytest.fixture(scope="session")
def pdf_aspect_capital() -> bytes:
    """Aspect Capital Limited 2023 — T5 UK Companies Act, digital."""
    return (FIXTURES_DIR / "Aspect_Capital_Limited_2023.pdf").read_bytes()


@pytest.fixture(scope="session")
def pdf_sun_hung_kai() -> bytes:
    """Sun Hung Kai & Co. Limited 2024 — T8 IFRS Asia, scanned/hybrid, 3.2 MB."""
    return (FIXTURES_DIR / "Sun_Hung_Kai___Co__Limited_AR_2024.pdf").read_bytes()


@pytest.fixture(scope="session")
def pdf_cash_america() -> bytes:
    """Cash America International 2007 — T1 US GAAP, digital."""
    return (FIXTURES_DIR / "Cash_America_International_2007.pdf").read_bytes()


@pytest.fixture(scope="session")
def pdf_tfg_llp() -> bytes:
    """TFG Asset Management UK LLP 2024 — T6 UK LLP, digital."""
    return (FIXTURES_DIR / "TFG_Asset_management_UK_LLP_2024.pdf").read_bytes()


# ── Regression fixtures (diagnosed failure cases) ──


@pytest.fixture(scope="session")
def pdf_freddie2023() -> bytes:
    """Freddie Mac 2023 — multi-statement pages, split balance sheet."""
    path = FIXTURES_DIR / "freddie2023.pdf"
    if not path.exists():
        pytest.skip(f"Fixture not found: {path}")
    return path.read_bytes()


@pytest.fixture(scope="session")
def pdf_fubon() -> bytes:
    """Fubon Securities Co Ltd 2017 — vector-drawn, landscape balance sheet."""
    path = FIXTURES_DIR / "Fubon_Securities_Co_Ltd_2017.pdf"
    if not path.exists():
        pytest.skip(f"Fixture not found: {path}")
    return path.read_bytes()


@pytest.fixture(scope="session")
def pdf_hdfc_credila() -> bytes:
    """HDFC Credila 2023 — hybrid pages with vector-drawn labels."""
    path = FIXTURES_DIR / "hdfc_credila_2023.pdf"
    if not path.exists():
        pytest.skip(f"Fixture not found: {path}")
    return path.read_bytes()


@pytest.fixture(scope="session")
def pdf_labranche() -> bytes:
    """LaBranche & Co Inc 2008 — all vector-drawn, dense cash flow page."""
    path = FIXTURES_DIR / "LaBranche___Co_Inc_2008.pdf"
    if not path.exists():
        pytest.skip(f"Fixture not found: {path}")
    return path.read_bytes()
