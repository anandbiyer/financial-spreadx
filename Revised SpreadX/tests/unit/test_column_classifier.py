"""Unit tests for column header classifier.

Ported from: __tests__/unit/column-classifier.test.ts (7 tests)
"""

from pdf.column_classifier import classify_column_headers


def test_plain_years():
    result = classify_column_headers(["2024", "2023"])
    assert len(result) == 2
    assert result[0].year == 2024
    assert result[0].type == "actual"
    assert result[1].year == 2023
    assert result[1].type == "actual"


def test_restated():
    result = classify_column_headers(["2022 (Restated)"])
    assert result[0].year == 2022
    assert result[0].type == "restated"


def test_as_restated():
    result = classify_column_headers(["As Restated 2021"])
    assert result[0].year == 2021
    assert result[0].type == "restated"


def test_re_stated_hyphen():
    result = classify_column_headers(["2020 Re-stated"])
    assert result[0].year == 2020
    assert result[0].type == "restated"


def test_year_ended_format():
    result = classify_column_headers(["Year ended Mar 31, 2022"])
    assert result[0].year == 2022
    assert result[0].type == "actual"


def test_no_year():
    result = classify_column_headers(["Current Period"])
    assert result[0].year == 0
    assert result[0].type == "actual"


def test_empty_list():
    assert classify_column_headers([]) == []
