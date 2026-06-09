"""Unit tests for parse_note_number().

Ported from entity-linker tests (6 tests).
"""

from models.extraction import parse_note_number


def test_note_12():
    assert parse_note_number("Note 12") == 12


def test_note_3_1():
    """Extracts first integer: '3' from '3.1'."""
    assert parse_note_number("(Note 3.1)") == 3


def test_none_input():
    assert parse_note_number(None) is None


def test_see_accompanying():
    """No digit found -> None."""
    assert parse_note_number("See accompanying notes") is None


def test_refer_note():
    assert parse_note_number("Refer Note 5") == 5


def test_note_21_3():
    assert parse_note_number("Note 21.3") == 21
