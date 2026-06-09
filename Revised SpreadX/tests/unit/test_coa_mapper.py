"""Unit tests for the Stage 11 orchestrator (routing, aggregation, signs, learning).

The LLM call is monkeypatched so these run offline and deterministically.
"""

from __future__ import annotations

import pytest

import spreading.coa_mapper as cm
from db.queries import get_all_coa_reference, insert_learned_mapping
from spreading.learning_store import normalise_label
from spreading.map_row_to_coa import Candidate, CoaMappingResult


@pytest.fixture
def coa_ids(spread_db):
    coa = get_all_coa_reference()
    return {
        "asset": next(c["coa_id"] for c in coa if c["broad_category"] == "Current Assets"),
        "liab": next(c["coa_id"] for c in coa if c["broad_category"] == "Current Liabilities"),
        "contra": next(c["coa_id"] for c in coa
                       if c["sign_convention"] == "contra" and c["statement"] == "Balance Sheet"),
    }


def _fake(route, calls=None):
    """Fake the batched mapper: returns one CoaMappingResult per input row,
    routing by raw_label (case-insensitive). Records labels it was asked to map.
    """
    def fake_batch(rows, candidates, template_type, coa_statement, max_tokens=None):
        out = []
        for row in rows:
            if calls is not None:
                calls.append(row["raw_label"].lower())
            coa_id, conf = route.get(row["raw_label"].lower(), (candidates[0]["coa_id"], 0.8))
            out.append(CoaMappingResult(
                coa_id=coa_id, confidence=conf, rationale="x" * 60,
                ambiguities=([] if conf >= 0.6 else ["amb"]),
                candidates=[Candidate(coa_id=candidates[0]["coa_id"], score=conf, reason="r")],
            ))
        return out
    return fake_batch


def test_confidence_routing_and_skip(coa_ids, monkeypatch):
    monkeypatch.setattr(cm, "map_rows_batch", _fake({
        "good": (coa_ids["asset"], 0.9),
        "bad": ("", 0.2),
    }))
    rows = [
        {"raw_label": "Good", "statement_type": "balance_sheet", "raw_values": {"2024": 1.0}},
        {"raw_label": "Bad", "statement_type": "balance_sheet", "raw_values": {"2024": 1.0}},
        {"raw_label": "CF", "statement_type": "cash_flow", "raw_values": {"2024": 1.0}},
    ]
    s = cm.run_coa_mapping_stage(rows, template_type="T3", persist=False)
    assert s["counts"]["claude"] == 1
    assert s["counts"]["unmapped"] == 1
    assert s["counts"]["skipped_no_coa"] == 1


def test_equity_recorded_as_terminal_unmapped(coa_ids, monkeypatch):
    """equity_statement rows are not spread (no LLM call) but recorded as terminal
    'not_spread' unmapped items — without blocking spread_complete."""
    calls: list[str] = []
    monkeypatch.setattr(cm, "map_rows_batch", _fake({"good": (coa_ids["asset"], 0.9)}, calls))
    rows = [
        {"raw_label": "Good", "statement_type": "balance_sheet", "raw_values": {"2024": 1.0}},
        {"raw_label": "Dividends paid", "statement_type": "equity_statement",
         "raw_values": {"2024": -3.0}},
    ]
    s = cm.run_coa_mapping_stage(rows, template_type="T3", persist=False)
    assert s["counts"]["equity_unmapped"] == 1
    assert "dividends paid" not in calls  # equity must not reach the LLM
    assert len(s["equity_unmapped"]) == 1
    eq = s["equity_unmapped"][0]
    assert eq["status"] == "not_spread"
    assert eq["statement_type"] == "equity_statement"
    assert s["unmapped"] == []  # terminal items are not pending analyst work
    assert s["status"] == "spread_complete"  # equity does not block completion


def test_aggregation_sums_duplicates(coa_ids, monkeypatch):
    monkeypatch.setattr(cm, "map_rows_batch", _fake({
        "rev a": (coa_ids["asset"], 0.9),
        "rev b": (coa_ids["asset"], 0.9),
    }))
    rows = [
        {"raw_label": "Rev A", "statement_type": "balance_sheet", "raw_values": {"2024": 10.0},
         "extraction_id": 1},
        {"raw_label": "Rev B", "statement_type": "balance_sheet", "raw_values": {"2024": 15.0},
         "extraction_id": 2},
    ]
    s = cm.run_coa_mapping_stage(rows, template_type="T3", persist=False)
    assert len(s["mapped"]) == 1
    m = s["mapped"][0]
    assert m["aggregated_from"] == 2
    assert m["value_spread"]["2024"] == 25.0
    assert "Aggregated from 2" in m["rationale"]
    # both source extraction ids are carried onto the aggregated CoA line
    assert sorted(m["source_extraction_ids"]) == [1, 2]


def test_sign_convention_applied(coa_ids, monkeypatch):
    monkeypatch.setattr(cm, "map_rows_batch", _fake({"depr": (coa_ids["contra"], 0.9)}))
    rows = [{"raw_label": "Depr", "statement_type": "balance_sheet", "raw_values": {"2024": 8.0}}]
    s = cm.run_coa_mapping_stage(rows, template_type="T3", persist=False)
    m = s["mapped"][0]
    assert m["value_spread"]["2024"] == -8.0
    assert m["sign_applied"] is True


def test_learned_path_skips_llm(coa_ids, monkeypatch):
    key = normalise_label("Borrowings")
    insert_learned_mapping(canonical_field=key, raw_label_pattern=key,
                           template_type="T3", statement_type="balance_sheet",
                           coa_id=coa_ids["liab"], learned_confidence=0.95,
                           rationale="known", source_document="Prior 2023")
    calls: list[str] = []
    monkeypatch.setattr(cm, "map_rows_batch", _fake({}, calls))
    rows = [{"raw_label": "Borrowings", "statement_type": "balance_sheet", "raw_values": {"2024": 5.0}}]
    s = cm.run_coa_mapping_stage(rows, template_type="T3", persist=False)
    assert s["counts"]["learned"] == 1
    assert "borrowings" not in calls  # LLM must not be called
    assert s["mapped"][0]["mapping_source"] == "learned"
    assert "analyst learning" in s["mapped"][0]["rationale"]
