"""Unit tests for Frontend Phase 1 persistence:
extracted_rows / notes round-trip, per-row mapper outcomes, company/year capture.

Offline — the LLM call is monkeypatched; no network or fixtures required.
"""

from __future__ import annotations

import pytest

import spreading.coa_mapper as cm
from db.queries import (
    create_document,
    get_all_coa_reference,
    get_extracted_rows,
    get_notes,
    insert_extracted_rows,
    insert_notes,
)
from models.extraction import NoteExtraction, NoteSubTable, NoteSubTableRow
from pipeline.orchestrator import _derive_company, _derive_fiscal_year
from spreading.map_row_to_coa import Candidate, CoaMappingResult


@pytest.fixture
def coa_ids(spread_db):
    coa = get_all_coa_reference()
    return {
        "asset": next(c["coa_id"] for c in coa if c["broad_category"] == "Current Assets"),
    }


def _fake(route):
    """Fake the batched mapper: one CoaMappingResult per row, routed by raw_label."""
    def fake_batch(rows, candidates, template_type, coa_statement, max_tokens=None):
        out = []
        for row in rows:
            coa_id, conf = route.get(row["raw_label"].lower(), (candidates[0]["coa_id"], 0.8))
            out.append(CoaMappingResult(
                coa_id=coa_id, confidence=conf, rationale="x" * 60,
                ambiguities=([] if conf >= 0.6 else ["amb"]),
                candidates=[Candidate(coa_id=candidates[0]["coa_id"], score=conf, reason="r")],
            ))
        return out
    return fake_batch


# ── company / fiscal year capture (pure helpers) ────────────────────────────

@pytest.mark.parametrize("filename,expected", [
    ("Aspect Capital Limited_2023.pdf", "Aspect Capital Limited"),
    ("Fubon Securities Co Ltd_2017.pdf", "Fubon Securities Co Ltd"),
    ("hdfc credila 2023.pdf", "hdfc credila"),
    ("Infigen Energy (Eifel) Limited 2008.pdf", "Infigen Energy (Eifel) Limited"),
])
def test_derive_company(filename, expected):
    assert _derive_company(filename) == expected


def test_derive_fiscal_year_from_data_then_filename():
    rows = [{"raw_values": {"2022": 1.0, "2023": 2.0}}, {"raw_values": {"2021": 3.0}}]
    assert _derive_fiscal_year(rows, "x_2017.pdf") == 2023  # data wins
    assert _derive_fiscal_year([], "report_2017.pdf") == 2017  # filename fallback
    assert _derive_fiscal_year([], "nofour.pdf") is None


# ── extracted_rows round-trip ───────────────────────────────────────────────

def test_insert_and_get_extracted_rows(spread_db):
    doc_id = create_document("X_2023.pdf", "T3", "consolidated")
    rows = [
        {"extraction_id": 1, "raw_label": "Cash", "raw_values": {"2023": 100.0},
         "section_path": ["Assets", "Current"], "indentation_level": 1,
         "is_subtotal": False, "note_ref": "Note 5", "statement_type": "balance_sheet",
         "statement_scope": "consolidated", "page": 3,
         "column_metadata": {"2023": {"type": "actual", "label": "2023"}}},
        {"extraction_id": 2, "raw_label": "Total assets", "raw_values": {"2023": 100.0},
         "is_subtotal": True, "statement_type": "balance_sheet", "page": 3},
        {"extraction_id": 3, "raw_label": "Op cash flow", "raw_values": {"2023": 5.0},
         "statement_type": "cash_flow", "page": 9},  # no outcome -> not_spread
    ]
    outcomes = {
        1: {"coa_id": "BS-001", "mapping_status": "mapped", "confidence": 0.9},
        2: {"coa_id": None, "mapping_status": "unmapped", "confidence": None},
    }
    assert insert_extracted_rows(doc_id, rows, outcomes) == 3

    got = get_extracted_rows(doc_id)
    assert [g["extraction_id"] for g in got] == [1, 2, 3]  # ordered by extraction_id

    r1 = got[0]
    assert r1["raw_label"] == "Cash"
    assert r1["raw_values"] == {"2023": 100.0}
    assert r1["section_path"] == ["Assets", "Current"]
    assert r1["note_ref"] == "Note 5"
    assert r1["page"] == 3
    assert r1["column_metadata"] == {"2023": {"type": "actual", "label": "2023"}}
    assert r1["coa_id"] == "BS-001"
    assert r1["mapping_status"] == "mapped"
    assert r1["confidence"] == 0.9

    assert bool(got[1]["is_subtotal"]) is True
    assert got[1]["mapping_status"] == "unmapped"
    assert got[1]["coa_id"] is None
    # row with no outcome defaults to not_spread
    assert got[2]["mapping_status"] == "not_spread"


# ── notes round-trip ────────────────────────────────────────────────────────

def test_insert_and_get_notes(spread_db):
    doc_id = create_document("X.pdf", "T3", "consolidated")
    notes = [
        NoteExtraction(
            note_number=7, note_title="Loans and Advances", summary="Breakdown of loans.",
            sub_tables=[NoteSubTable(table_title="By type", rows=[
                NoteSubTableRow(label="Secured", values={"2023": 50.0}),
            ])],
        ),
        NoteExtraction(note_number=3, note_title="Cash", summary=""),
    ]
    assert insert_notes(doc_id, notes) == 2

    got = get_notes(doc_id)
    assert [g["note_number"] for g in got] == [3, 7]  # ordered by note_number
    n7 = next(g for g in got if g["note_number"] == 7)
    assert n7["note_title"] == "Loans and Advances"
    assert n7["sub_tables"][0]["table_title"] == "By type"
    assert n7["sub_tables"][0]["rows"][0]["label"] == "Secured"


# ── per-row outcomes from the mapper ────────────────────────────────────────

def test_mapper_returns_row_outcomes(coa_ids, monkeypatch):
    monkeypatch.setattr(cm, "map_rows_batch", _fake({
        "good": (coa_ids["asset"], 0.9), "bad": ("", 0.2),
    }))
    rows = [
        {"raw_label": "Good", "statement_type": "balance_sheet",
         "raw_values": {"2024": 1.0}, "extraction_id": 1},
        {"raw_label": "Bad", "statement_type": "balance_sheet",
         "raw_values": {"2024": 1.0}, "extraction_id": 2},
        {"raw_label": "Dividends", "statement_type": "equity_statement",
         "raw_values": {"2024": -1.0}, "extraction_id": 3},
        {"raw_label": "CF", "statement_type": "cash_flow",
         "raw_values": {"2024": 1.0}, "extraction_id": 4},
    ]
    s = cm.run_coa_mapping_stage(rows, template_type="T3", persist=False)
    ro = s["row_outcomes"]
    assert ro[1] == {"coa_id": coa_ids["asset"], "mapping_status": "mapped", "confidence": 0.9}
    assert ro[2]["mapping_status"] == "unmapped" and ro[2]["coa_id"] is None
    assert ro[3]["mapping_status"] == "not_spread"  # equity
    assert 4 not in ro  # cash flow skipped, no outcome


def test_extracted_rows_persisted_with_mapper_outcomes(coa_ids, monkeypatch):
    """End-to-end: mapper outcomes → insert_extracted_rows → read back the per-row CoA."""
    monkeypatch.setattr(cm, "map_rows_batch", _fake({"good": (coa_ids["asset"], 0.9)}))
    rows = [{"raw_label": "Good", "statement_type": "balance_sheet",
             "raw_values": {"2024": 1.0}, "extraction_id": 1}]
    s = cm.run_coa_mapping_stage(rows, template_type="T3", persist=True)
    doc_id = s["document_id"]

    insert_extracted_rows(doc_id, rows, s["row_outcomes"])
    got = get_extracted_rows(doc_id)
    assert len(got) == 1
    assert got[0]["coa_id"] == coa_ids["asset"]
    assert got[0]["mapping_status"] == "mapped"
    assert got[0]["confidence"] == 0.9
