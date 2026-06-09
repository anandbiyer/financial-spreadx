"""Unit tests for the learning store (LRN-001 lookup priority, LRN-004 demotion)."""

from __future__ import annotations

from db.queries import get_all_coa_reference, insert_learned_mapping
from spreading.learning_store import find_learned_mapping, normalise_label


def test_normalise_label():
    assert normalise_label("  Cash & Cash Equivalents! ") == "cash cash equivalents"
    assert normalise_label("Trade/Other Receivables") == "trade other receivables"


def _coa_id(spread_statement="Balance Sheet"):
    return next(c["coa_id"] for c in get_all_coa_reference()
               if c["statement"] == spread_statement)


def test_exact_match_beats_any_template(spread_db):
    coa = _coa_id()
    key = normalise_label("Investments")
    insert_learned_mapping(canonical_field=key, raw_label_pattern=key,
                           template_type="*", statement_type="balance_sheet",
                           coa_id=coa, rationale="any", source_document="A")
    insert_learned_mapping(canonical_field=key, raw_label_pattern=key,
                           template_type="T3", statement_type="balance_sheet",
                           coa_id=coa, rationale="exact", source_document="B")
    found = find_learned_mapping("Investments", "balance_sheet", "T3")
    assert found is not None and found["rationale"] == "exact"


def test_falls_back_to_any_template(spread_db):
    coa = _coa_id()
    key = normalise_label("Goodwill")
    insert_learned_mapping(canonical_field=key, raw_label_pattern=key,
                           template_type="*", statement_type="balance_sheet",
                           coa_id=coa, rationale="any", source_document="A")
    found = find_learned_mapping("Goodwill", "balance_sheet", "T7")
    assert found is not None and found["template_type"] == "*"


def test_demoted_mapping_excluded(spread_db):
    coa = _coa_id()
    key = normalise_label("Weird Reserve")
    insert_learned_mapping(canonical_field=key, raw_label_pattern=key,
                           template_type="T3", statement_type="balance_sheet",
                           coa_id=coa, rationale="demoted", source_document="A",
                           times_overridden=2)
    # times_overridden >= 2 must no longer suppress Claude (LRN-004)
    assert find_learned_mapping("Weird Reserve", "balance_sheet", "T3") is None


def test_no_match_returns_none(spread_db):
    assert find_learned_mapping("Totally Unknown Item", "balance_sheet", "T3") is None
