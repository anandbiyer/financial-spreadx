"""Service layer — the spec's 9 API routes (Section 09) as plain functions.

Both the Streamlit UI (now) and a future FastAPI/React backend call these. A
FastAPI migration becomes a thin set of route handlers delegating here.
"""

from __future__ import annotations

from db import queries
from spreading.spread_formatter import format_spread_output


# GET /api/coa-reference
def get_coa_reference(statement: str | None = None) -> list[dict]:
    if statement:
        return queries.get_coa_reference_by_statement(statement)
    return queries.get_all_coa_reference()


# GET /api/spread/[id]
def get_spread(document_id: str) -> dict:
    doc = queries.get_document(document_id)
    mappings = queries.get_coa_mappings_by_document(document_id)
    pending = queries.get_pending_unmapped(document_id)
    return {
        "document": doc,
        "coa_mappings": mappings,
        "balance_check": (doc or {}).get("balance_check_result"),
        "unmapped_count": len(pending),
    }


# GET /api/spread/[id]/output
def get_spread_output(document_id: str) -> dict:
    mappings = queries.get_coa_mappings_by_document(document_id)
    coa = queries.get_all_coa_reference()
    return format_spread_output(mappings, coa)


# GET /api/spread/[id]/unmapped — suggestions enriched with CoA definitions
def get_unmapped(document_id: str) -> list[dict]:
    pending = queries.get_pending_unmapped(document_id)
    coa_by_id = {c["coa_id"]: c for c in queries.get_all_coa_reference()}
    for item in pending:
        enriched = []
        for sug in item.get("claude_suggestions", []) or []:
            coa = coa_by_id.get(sug.get("coa_id"), {})
            enriched.append({
                **sug,
                "line_item_name": coa.get("line_item_name", ""),
                "definition": coa.get("definition", ""),
                "broad_category": coa.get("broad_category", ""),
            })
        item["claude_suggestions"] = enriched
    return pending


# POST /api/spread/[id]/resolve-unmapped
def resolve_unmapped(unmapped_item_id: str, selected_coa_id: str,
                     analyst_rationale: str, analyst_id: str = "AS") -> dict:
    return queries.resolve_unmapped(unmapped_item_id, selected_coa_id,
                                    analyst_rationale, analyst_id)


# POST /api/spread/[id]/override-mapping
def override_mapping(coa_mapping_id: str, new_coa_id: str, rationale: str,
                     analyst_id: str = "AS") -> dict:
    return queries.override_coa_mapping(coa_mapping_id, new_coa_id, rationale, analyst_id)


# GET /api/learned-mappings
def list_learned_mappings(template_type: str | None = None,
                          statement_type: str | None = None) -> list[dict]:
    return queries.list_learned_mappings(template_type, statement_type)


# DELETE /api/learned-mappings/[id]
def delete_learned_mapping(learned_id: str) -> bool:
    return queries.delete_learned_mapping(learned_id)


# POST /api/spread/[id]/export/xlsx
def export_spread_xlsx(document_id: str) -> bytes:
    from export.spread_xlsx import build_spread_xlsx

    mappings = queries.get_coa_mappings_by_document(document_id)
    coa = queries.get_all_coa_reference()
    formatted = format_spread_output(mappings, coa)
    unmapped = queries.get_unmapped_for_display(document_id)
    doc = queries.get_document(document_id) or {}
    return build_spread_xlsx(formatted, mappings, unmapped,
                             reconciliation=doc.get("reconciliation_result"),
                             usage=doc.get("usage_result"))
