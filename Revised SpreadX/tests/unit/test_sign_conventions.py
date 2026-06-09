"""Unit tests for sign-convention application (SPR-003)."""

from __future__ import annotations

from spreading.sign_conventions import apply_sign, apply_sign_to_spread


def test_contra_forces_negative_magnitude():
    assert apply_sign(10, "contra") == -10
    assert apply_sign(-10, "contra") == -10  # already negative stays negative
    assert apply_sign(10, "negative") == -10


def test_positive_left_unchanged():
    assert apply_sign(10, "positive") == 10
    assert apply_sign(-5, "positive") == -5  # accumulated losses stay as-is


def test_none_passthrough():
    assert apply_sign(None, "contra") is None


def test_apply_to_spread_reports_changed():
    spread, applied = apply_sign_to_spread({"2024": 10, "2023": -3}, "negative")
    assert spread == {"2024": -10, "2023": -3}
    assert applied is True


def test_apply_to_spread_positive_noop():
    spread, applied = apply_sign_to_spread({"2024": 10}, "positive")
    assert spread == {"2024": 10}
    assert applied is False
