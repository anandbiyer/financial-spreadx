"""Learning store — retrieve and attribute prior analyst mappings (Section 07).

The Python port has no `canonical_field` upstream, so the lookup key is the
NORMALISED raw label. Lookup priority (LRN-001):
    1. exact   : norm(label) + statement_type + template_type
    2. any tmpl: norm(label) + statement_type + '*'
    3. fuzzy   : raw_label_pattern LIKE %norm(label)% within the statement
Demoted mappings (times_overridden >= 2) are excluded (LRN-004) — handled in
db.queries.find_learned_candidates.
"""

from __future__ import annotations

import re

from db.queries import find_learned_candidates


def normalise_label(raw_label: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace — the lookup key."""
    s = (raw_label or "").lower().strip()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def find_learned_mapping(
    raw_label: str,
    statement_type: str,
    template_type: str,
) -> dict | None:
    """Return the best learned mapping for this row, or None.

    Tries exact → any-template → fuzzy, in that order.
    """
    key = normalise_label(raw_label)
    if not key:
        return None
    cands = find_learned_candidates(key, statement_type, template_type)
    return cands["exact"] or cands["any_template"] or cands["fuzzy"]


def build_attribution_message(learned: dict) -> str:
    """Format the attribution rationale stored on a learned coa_mapping (LRN-002).

    Mirrors the example in Section 07: source company/year, date applied,
    original rationale, inherited confidence, and prior application count.
    """
    created = learned.get("created_at")
    date_str = ""
    if created is not None:
        try:
            date_str = created.date().isoformat()
        except AttributeError:
            date_str = str(created)[:10]
    source = learned.get("source_document") or "a prior document"
    confidence = learned.get("learned_confidence", 0.95)
    times = learned.get("times_applied", 0)
    original = learned.get("rationale", "").strip()
    return (
        f"Mapped using analyst learning from {source} (applied {date_str}). "
        f"Original rationale: {original} "
        f"Confidence inherited: {confidence}. Applied {times} time(s) previously."
    )
