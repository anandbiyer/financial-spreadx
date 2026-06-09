"""Unit tests for scope detector.

Ported from: __tests__/unit/scope-detector.test.ts (6 tests)
"""

from pdf.scope_detector import detect_scope


def test_consolidated():
    assert detect_scope("Consolidated Statement of Profit and Loss") == "consolidated"


def test_standalone():
    assert detect_scope("Standalone Balance Sheet") == "standalone"


def test_unknown():
    assert detect_scope("Statement of Financial Position") == "unknown"


def test_group():
    assert detect_scope("Group Balance Sheet as at 31 December 2024") == "consolidated"


def test_company():
    assert detect_scope("Company Balance Sheet as at 31 March 2023") == "standalone"


def test_companies_act_no_false_positive():
    """'Companies Act' should NOT trigger standalone (negative lookahead)."""
    assert (
        detect_scope("Prepared in accordance with the Companies Act 2006")
        == "unknown"
    )
