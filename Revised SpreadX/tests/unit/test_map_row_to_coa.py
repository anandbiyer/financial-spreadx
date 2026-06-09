"""Unit tests for map_row_to_coa / map_rows_batch — focused on the UNMAPPED
sentinel introduced by Updated_spreading_prompt.docx (R12) and the candidate
guard. The LLM client is mocked, so these run offline and deterministically.
"""

from __future__ import annotations

import json

import spreading.map_row_to_coa as m


class _FakeClient:
    """Returns a fixed text payload for both complete() and the batch path."""

    def __init__(self, text: str):
        self._t = text

    def complete(self, system=None, prompt=None, max_tokens=None):
        return self._t


_CANDS = [
    {"coa_id": "BS-001", "line_item_name": "Cash", "definition": "d", "spreading_guidance": "g"},
    {"coa_id": "BS-002", "line_item_name": "Time Deposits", "definition": "d", "spreading_guidance": "g"},
]


def _patch(monkeypatch, payload: str):
    monkeypatch.setattr(m, "get_llm_client", lambda: _FakeClient(payload))


def test_unmapped_sentinel_single_routes_to_unmapped(monkeypatch):
    # R12: model returns "UNMAPPED" deliberately — must NOT be overridden by a
    # candidate; coa_id is cleared and confidence forced to 0 so it routes to the
    # unmapped queue downstream.
    _patch(monkeypatch, json.dumps({
        "coa_id": "UNMAPPED", "confidence": 0.9, "rationale": "x" * 60,
        "ambiguities": ["no logical CoA"], "candidates": [],
    }))
    r = m.map_row_to_coa({"raw_label": "Esoteric line"}, _CANDS, "T3", "Balance Sheet")
    assert r.coa_id == ""
    assert r.confidence == 0.0


def test_unmapped_sentinel_batch_routes_to_unmapped(monkeypatch):
    _patch(monkeypatch, json.dumps({"results": [
        {"row_index": 0, "coa_id": "UNMAPPED", "confidence": 0.9,
         "rationale": "x" * 60, "ambiguities": [], "candidates": []},
    ]}))
    out = m.map_rows_batch([{"raw_label": "Esoteric line"}], _CANDS, "T3", "Balance Sheet")
    assert len(out) == 1
    assert out[0].coa_id == ""
    assert out[0].confidence == 0.0


def test_valid_mapping_batch_happy_path(monkeypatch):
    # Sanity: a normal mapping still parses + coerces correctly under the new prompt.
    _patch(monkeypatch, json.dumps({"results": [
        {"row_index": 0, "coa_id": "BS-001", "confidence": 0.92,
         "rationale": "x" * 60, "ambiguities": [],
         "candidates": [{"coa_id": "BS-001", "score": 0.92, "reason": "r"}]},
    ]}))
    out = m.map_rows_batch([{"raw_label": "Cash"}], _CANDS, "T3", "Balance Sheet")
    assert out[0].coa_id == "BS-001"
    assert out[0].confidence == 0.92


def test_statement_routing_excludes_equity_and_cash_flow():
    # Equity and cash flow have no CoA target (None) — they are not spread.
    assert m.statement_to_coa_statement("balance_sheet") == "Balance Sheet"
    assert m.statement_to_coa_statement("income_statement") == "P&L"
    assert m.statement_to_coa_statement("equity_statement") is None
    assert m.statement_to_coa_statement("cash_flow") is None


def test_hallucinated_id_falls_back_to_top_candidate(monkeypatch):
    # A non-UNMAPPED id outside the candidate set still falls back to a valid
    # candidate (unchanged behaviour — UNMAPPED handling must not break this).
    _patch(monkeypatch, json.dumps({
        "coa_id": "ZZ-999", "confidence": 0.8, "rationale": "x" * 60,
        "ambiguities": [], "candidates": [{"coa_id": "BS-002", "score": 0.8, "reason": "r"}],
    }))
    r = m.map_row_to_coa({"raw_label": "Time deposits"}, _CANDS, "T3", "Balance Sheet")
    assert r.coa_id == "BS-002"
