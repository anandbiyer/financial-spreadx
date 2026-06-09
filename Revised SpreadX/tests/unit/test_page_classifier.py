"""Unit tests for page classifier thresholds.

Ported from: __tests__/unit/page-classifier.test.ts (8 tests)
"""

from pdf.page_classifier import classify_by_thresholds


def test_0_words_scanned():
    assert classify_by_thresholds(0, 0.0) == "scanned"


def test_19_words_scanned():
    assert classify_by_thresholds(19, 0.95) == "scanned"


def test_20_words_hybrid():
    assert classify_by_thresholds(20, 0.95) == "hybrid"


def test_79_words_hybrid():
    assert classify_by_thresholds(79, 0.95) == "hybrid"


def test_80_words_90pct_digital():
    assert classify_by_thresholds(80, 0.90) == "digital"


def test_100_words_89pct_hybrid():
    """100 words but ASCII ratio below 90% -> hybrid, not digital."""
    assert classify_by_thresholds(100, 0.89) == "hybrid"


def test_80_words_91pct_digital():
    assert classify_by_thresholds(80, 0.91) == "digital"


def test_200_words_99pct_digital():
    assert classify_by_thresholds(200, 0.99) == "digital"
