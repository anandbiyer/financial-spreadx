"""Unit tests for extract_four_digit_year().

Tests the fiscal year parsing helper from claude/extract.py.
"""

from claude.extract import extract_four_digit_year


def test_plain_year():
    assert extract_four_digit_year("2019") == "2019"


def test_fiscal_year():
    assert extract_four_digit_year("2018-19") == "2019"


def test_fy_prefix():
    assert extract_four_digit_year("FY 2018-19") == "2019"


def test_year_ended():
    assert extract_four_digit_year("Year ended 2023") == "2023"


def test_multiple_years():
    """Fiscal year not at end of string -> falls through to last 4-digit year."""
    # "2022-23 Results" doesn't end with the fiscal pattern, so extracts "2022"
    assert extract_four_digit_year("Q4 2022-23 Results") == "2022"

    # But when the fiscal year IS the full value (as Claude typically returns):
    assert extract_four_digit_year("2022-23") == "2023"


def test_no_year():
    """No year found -> return original string."""
    assert extract_four_digit_year("no year here") == "no year here"
