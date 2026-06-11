"""Unit tests for webapi.ops write commands (resolve / save / recompute balance).

Offline — uses the isolated spread_db fixture; no LLM, no real DB mutation.
"""

from __future__ import annotations

import pytest

from db.queries import (
    create_document,
    delete_document,
    get_all_coa_reference,
    get_coa_mappings_by_document,
    get_document,
    get_extracted_rows,
    insert_coa_mappings,
    insert_extracted_rows,
    insert_learned_mapping,
    insert_unmapped_items,
    list_learned_mappings,
)
from webapi import ops


@pytest.fixture
def coa_ids(spread_db):
    coa = get_all_coa_reference()
    return {
        "asset": next(c["coa_id"] for c in coa if c["broad_category"] == "Current Assets"),
        "liab": next(c["coa_id"] for c in coa if c["broad_category"] == "Current Liabilities"),
    }


def _seed_doc_with_unmapped(coa_ids) -> tuple[str, str]:
    doc_id = create_document("Test_2023.pdf", "T3", "consolidated")
    # one existing mapped line so balance has something to compute
    insert_coa_mappings([{
        "document_id": doc_id, "coa_id": coa_ids["asset"], "raw_label": "Cash",
        "statement_type": "balance_sheet", "confidence": 0.9, "rationale": "x",
        "mapping_source": "claude", "value_spread": {"2023": 100.0},
        "sign_applied": True, "source_extraction_ids": [1],
    }])
    [item_id] = insert_unmapped_items([{
        "document_id": doc_id, "raw_label": "Trade payables",
        "canonical_field": "trade payables", "statement_type": "balance_sheet",
        "value_spread": {"2023": 40.0},
        "claude_suggestions": [{"coa_id": coa_ids["liab"], "score": 0.5, "reason": "r"}],
        "ambiguity_note": "below threshold", "status": "pending",
        "source_extraction_ids": [2],
    }])
    return doc_id, item_id


def test_resolve_unmapped_op(coa_ids):
    doc_id, item_id = _seed_doc_with_unmapped(coa_ids)
    out = ops.COMMANDS["resolve_unmapped"]({
        "documentId": doc_id, "itemId": item_id, "coaId": coa_ids["liab"],
        "rationale": "analyst says payables",
    })
    assert out["coa_mapping_id"]
    assert out["learned_mapping_id"]
    assert out["remaining_unmapped"] == 0
    assert "balance" in out and "isBalanced" in out["balance"]

    # item resolved, learning store grew, document flipped to complete
    doc = get_document(doc_id)
    assert doc["spread_status"] == "spread_complete"
    assert doc["unmapped_count"] == 0
    assert any(l["coa_id"] == coa_ids["liab"] for l in list_learned_mappings())


def test_save_mappings_op_batch(coa_ids):
    doc_id, item_id = _seed_doc_with_unmapped(coa_ids)
    out = ops.COMMANDS["save_mappings"]({
        "documentId": doc_id,
        "mappings": [{"unmappedItemId": item_id, "coaId": coa_ids["liab"]}],
    })
    assert out["saved"] == 1
    assert out["results"][0]["ok"] is True
    assert "isBalanced" in out["balance"]  # recomputed from current mappings


def test_save_mappings_reports_per_item_errors(coa_ids):
    doc_id, _ = _seed_doc_with_unmapped(coa_ids)
    out = ops.COMMANDS["save_mappings"]({
        "documentId": doc_id,
        "mappings": [{"unmappedItemId": "does-not-exist", "coaId": coa_ids["liab"]}],
    })
    assert out["saved"] == 0
    assert out["results"][0]["ok"] is False
    assert "error" in out["results"][0]


def test_delete_document_cascade_preserves_learning(coa_ids):
    doc_id, _ = _seed_doc_with_unmapped(coa_ids)
    insert_extracted_rows(doc_id, [
        {"extraction_id": 1, "raw_label": "Cash", "statement_type": "balance_sheet",
         "raw_values": {"2023": 100.0}},
    ], {1: {"coa_id": coa_ids["asset"], "mapping_status": "mapped", "confidence": 0.9}})
    lid = insert_learned_mapping(
        canonical_field="cash", raw_label_pattern="cash", template_type="T3",
        statement_type="balance_sheet", coa_id=coa_ids["asset"],
        source_document="Test_2023.pdf", source_document_id=doc_id,
    )

    res = delete_document(doc_id)
    assert res["deleted"] is True

    # document + all its children are gone
    assert get_document(doc_id) is None
    assert get_extracted_rows(doc_id) == []
    assert get_coa_mappings_by_document(doc_id) == []

    # the learned mapping survives; only its source-doc FK is nulled
    learned = [l for l in list_learned_mappings() if l["id"] == lid]
    assert len(learned) == 1
    assert learned[0]["source_document_id"] is None
    assert learned[0]["source_document"] == "Test_2023.pdf"  # attribution string kept
