"""Apply CoA sign conventions to spread values (SPR-003).

The target CoA marks contra-assets (e.g. Bad Debt Reserve, Accumulated
Depreciation) and P&L reductions (Returns, Interest Expense, Income Tax) with a
'contra'/'negative' sign convention. These must always carry a negative sign in
the spread output regardless of how the source document presented them.

'positive'-convention items are left exactly as extracted — they may legitimately
be negative (e.g. accumulated losses / net loss), so we do NOT force them positive.
"""

from __future__ import annotations

_NEGATIVE_CONVENTIONS = {"contra", "negative"}


def apply_sign(value: float | None, sign_convention: str) -> float | None:
    """Return the value with the CoA sign convention applied."""
    if value is None:
        return None
    if sign_convention in _NEGATIVE_CONVENTIONS:
        return -abs(value)
    return value


def apply_sign_to_spread(
    value_spread: dict[str, float | None],
    sign_convention: str,
) -> tuple[dict[str, float | None], bool]:
    """Apply the sign convention to every year in a value_spread.

    Returns (new_spread, applied) where `applied` is True if any value changed.
    """
    if sign_convention not in _NEGATIVE_CONVENTIONS:
        return dict(value_spread), False
    new_spread: dict[str, float | None] = {}
    applied = False
    for year, val in value_spread.items():
        new_val = apply_sign(val, sign_convention)
        if new_val != val:
            applied = True
        new_spread[year] = new_val
    return new_spread, applied
