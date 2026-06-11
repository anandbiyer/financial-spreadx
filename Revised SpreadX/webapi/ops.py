"""webapi.ops — CLI dispatch for frontend-initiated backend operations.

Contract (Design Docs/FrontendDesign.md §9.1):

    python -m webapi.ops <command> [--json '<payload>']

- The payload is a JSON object, supplied via ``--json`` or, if omitted, read from stdin.
- On success: a single JSON object is printed to **stdout** and the process exits 0.
- On failure: a JSON object ``{"error", "type"}`` is printed to **stderr** and the
  process exits 1.

Each command handler takes the parsed payload ``dict`` and returns a JSON-serialisable
``dict``. Handlers reuse the tested ``db.queries`` / ``spreading`` / ``export`` code so
no business logic is duplicated in the frontend (decision Q9).

Phase 0 ships only the ``echo`` command (round-trip smoke test). Later phases register
``run``, ``resolve_unmapped``, ``override_mapping``, ``save_mappings``,
``recompute_balance``, ``delete_document`` and ``export`` here.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Callable


# --------------------------------------------------------------------------- #
# Command handlers
# --------------------------------------------------------------------------- #
def _cmd_echo(payload: dict[str, Any]) -> dict[str, Any]:
    """Round-trip the payload — the Phase 0 acceptance smoke test."""
    return {"ok": True, "command": "echo", "echo": payload}


# --------------------------------------------------------------------------- #
# Phase 3 — resolve / override write path (reuses tested db.queries logic)
# --------------------------------------------------------------------------- #
def _recompute_balance(document_id: str) -> dict[str, Any]:
    """Recompute the A=L+E balance from the document's current CoA mappings and
    persist it. Returns the balance JSON."""
    from db.queries import (
        get_all_coa_reference,
        get_coa_mappings_by_document,
        update_document,
    )
    from spreading.balance_checks import check_balance_sheet_identity

    coa_by_id = {c["coa_id"]: c for c in get_all_coa_reference()}
    mappings = get_coa_mappings_by_document(document_id)
    balance = check_balance_sheet_identity(mappings, coa_by_id)
    update_document(document_id, balance_check_result=balance)
    return balance


def _recompute_reconciliation(document_id: str) -> dict[str, Any]:
    """Recompute subtotal reconciliation from the persisted extracted rows + their
    current per-row CoA outcome, and persist it (B13). Keeps the reconciliation sheet
    in sync after analyst resolve/override edits."""
    from db.queries import (
        get_all_coa_reference,
        get_coa_mappings_by_document,
        get_extracted_rows,
        update_document,
    )
    from spreading.sign_conventions import apply_sign_to_spread
    from spreading.subtotal_reconciliation import reconcile_subtotals

    coa_by_id = {c["coa_id"]: c for c in get_all_coa_reference()}
    src_by_coa = {m["coa_id"]: m.get("mapping_source", "")
                  for m in get_coa_mappings_by_document(document_id)}
    rows = get_extracted_rows(document_id)  # document order (by extraction_id)

    outcomes: dict[tuple, dict] = {}
    for er in rows:
        key = (str(er.get("raw_label", "")).strip().lower(), er.get("statement_type", ""))
        if er.get("mapping_status") == "mapped" and er.get("coa_id"):
            coa_id = er["coa_id"]
            sign = (coa_by_id.get(coa_id) or {}).get("sign_convention", "positive")
            vs, _ = apply_sign_to_spread(er.get("raw_values") or {}, sign)
            outcomes[key] = {"status": "mapped", "coa_id": coa_id,
                             "confidence": er.get("confidence"),
                             "source": src_by_coa.get(coa_id, ""),
                             "value_spread": vs, "sign_applied": True}
        else:
            outcomes[key] = {"status": "unmapped", "coa_id": "", "confidence": None,
                             "source": "", "value_spread": er.get("raw_values") or {},
                             "sign_applied": False}

    recon = reconcile_subtotals(rows, outcomes, coa_by_id)
    update_document(document_id, reconciliation_result=recon)
    return recon


def _refresh_checks(document_id: str) -> dict[str, Any]:
    """Recompute + persist both checks after an analyst edit; return the balance."""
    balance = _recompute_balance(document_id)
    _recompute_reconciliation(document_id)
    return balance


def _cmd_resolve_unmapped(payload: dict[str, Any]) -> dict[str, Any]:
    """Resolve one unmapped item (analyst confirm) + refresh balance."""
    from db.queries import resolve_unmapped

    res = resolve_unmapped(
        payload["itemId"], payload["coaId"],
        payload.get("rationale", ""), payload.get("analystId", "AS"),
    )
    balance = _refresh_checks(payload["documentId"])
    return {**res, "balance": balance}


def _cmd_save_mappings(payload: dict[str, Any]) -> dict[str, Any]:
    """Save a batch of drag-drop resolutions (Compare View) + refresh balance.

    Per-item atomic via resolve_unmapped; returns per-item results so the UI can
    roll back only the ones that failed.
    """
    from db.queries import resolve_unmapped

    document_id = payload["documentId"]
    analyst_id = payload.get("analystId", "AS")
    results: list[dict[str, Any]] = []
    for m in payload.get("mappings", []):
        try:
            r = resolve_unmapped(m["unmappedItemId"], m["coaId"],
                                 m.get("rationale", ""), analyst_id)
            results.append({"unmappedItemId": m["unmappedItemId"], "ok": True, **r})
        except Exception as exc:  # noqa: BLE001 — report per-item, don't abort the batch
            results.append({"unmappedItemId": m["unmappedItemId"], "ok": False,
                            "error": str(exc)})
    saved = sum(1 for r in results if r.get("ok"))
    balance = _refresh_checks(document_id)
    remaining = next((r.get("remaining_unmapped") for r in reversed(results)
                      if r.get("ok")), None)
    return {"saved": saved, "results": results,
            "remaining_unmapped": remaining, "balance": balance}


def _cmd_override_mapping(payload: dict[str, Any]) -> dict[str, Any]:
    """Override an existing CoA mapping (Workbench inline override) + refresh balance."""
    from db.queries import override_coa_mapping

    res = override_coa_mapping(
        payload["mappingId"], payload["newCoaId"],
        payload.get("rationale", ""), payload.get("analystId", "AS"),
    )
    balance = _refresh_checks(payload["documentId"])
    return {"coa_mapping_id": res["id"], "balance": balance}


def _cmd_recompute_balance(payload: dict[str, Any]) -> dict[str, Any]:
    return {"balance": _refresh_checks(payload["documentId"])}


# --------------------------------------------------------------------------- #
# Phase 5 — upload / run / export
# --------------------------------------------------------------------------- #
def _load_env() -> None:
    """Load repo-root .env so ANTHROPIC_API_KEY is available to the pipeline."""
    import os

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(root, ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def _cmd_register_upload(payload: dict[str, Any]) -> dict[str, Any]:
    """Create the Document at upload time (status=processing) — fast, synchronous.
    The frontend then fires `run_pipeline` detached."""
    from db.queries import create_document, update_document
    from pipeline.orchestrator import _derive_company

    doc_id = payload["documentId"]
    create_document(payload["filename"], "T0_unknown", "unknown", doc_id=doc_id)
    update_document(doc_id, pdf_path=payload.get("pdfPath"),
                    pipeline_status="processing", pipeline_stage="queued",
                    company=_derive_company(payload["filename"]))
    return {"document_id": doc_id}


def _cmd_run_pipeline(payload: dict[str, Any]) -> dict[str, Any]:
    """Run the full extract+spread pipeline for a pre-registered document.
    Intended to be spawned DETACHED; updates pipeline_status as it goes."""
    _load_env()
    from db.queries import update_document

    doc_id = payload["documentId"]
    try:
        with open(payload["pdfPath"], "rb") as fh:
            pdf_bytes = fh.read()
        from pipeline.orchestrator import run_pipeline

        last = {"stage": None}

        def cb(stage: str, _detail: str, _pct: float) -> None:
            if stage != last["stage"]:
                last["stage"] = stage
                try:
                    update_document(doc_id, pipeline_stage=stage)
                except Exception:  # noqa: BLE001 — progress is best-effort
                    pass

        from db.queries import get_settings
        settings = get_settings()

        kwargs: dict[str, Any] = {"document_id": doc_id, "run_spreading": True,
                                  "filename": payload.get("filename", "document.pdf"),
                                  "progress_callback": cb}
        # Run params come from persisted Settings (Q17); payload may override.
        threshold = payload.get("threshold")
        if threshold is None:
            threshold = settings.get("confidence_threshold")
        if threshold is not None:
            kwargs["confidence_threshold"] = threshold
        model = payload.get("model") or settings.get("llm_model")
        if model:
            kwargs["llm_settings"] = {"model": model}

        run_pipeline(pdf_bytes, **kwargs)  # sets pipeline_status='done' on success
        return {"document_id": doc_id, "status": "done"}
    except Exception as exc:  # noqa: BLE001 — record failure for the UI to poll
        update_document(doc_id, pipeline_status="error", error_message=str(exc))
        return {"document_id": doc_id, "status": "error", "error": str(exc)}


def _build_raw_xlsx(document_id: str) -> bytes:
    """Raw-extraction workbook rebuilt from the persisted extracted rows."""
    from types import SimpleNamespace

    from db.queries import get_document, get_extracted_rows
    from export.xlsx_export import build_raw_extraction_xlsx

    doc = get_document(document_id) or {}
    rows = get_extracted_rows(document_id)
    ps = doc.get("page_summary") or {}
    rows_by_type: dict[str, int] = {}
    for r in rows:
        st = r.get("statement_type", "")
        rows_by_type[st] = rows_by_type.get(st, 0) + 1
    summary = {
        "template_type": doc.get("template_type", "—"),
        "total_pages": ps.get("total", 0), "digital_pages": ps.get("digital", 0),
        "scanned_pages": ps.get("scanned", 0), "hybrid_pages": ps.get("hybrid", 0),
        "total_rows": len(rows), "rows_by_type": rows_by_type,
    }
    shim = SimpleNamespace(extracted_rows=rows, summary=summary)
    return build_raw_extraction_xlsx(shim)


def _build_json_export(document_id: str, tier: str) -> dict[str, Any]:
    from db.queries import (
        get_coa_mappings_by_document,
        get_document,
        get_extracted_rows,
        get_unmapped_for_display,
    )

    doc = get_document(document_id) or {}
    if tier == "raw":
        return {"document": {"id": document_id, "filename": doc.get("filename")},
                "extracted_rows": get_extracted_rows(document_id)}
    return {
        "document": {"id": document_id, "filename": doc.get("filename"),
                     "company": doc.get("company"), "fiscal_year": doc.get("fiscal_year")},
        "coa_mappings": get_coa_mappings_by_document(document_id),
        "unmapped": get_unmapped_for_display(document_id),
        "balance_check": doc.get("balance_check_result"),
        "reconciliation": doc.get("reconciliation_result"),
        "usage": doc.get("usage_result"),
    }


def _cmd_export(payload: dict[str, Any]) -> dict[str, Any]:
    """Generate a downloadable artifact from the live DB (B13). XLSX returns base64."""
    import base64

    from db.queries import get_document

    doc_id = payload["documentId"]
    fmt = payload.get("format", "xlsx")
    tier = payload.get("tier", "reviewed")
    stem = (get_document(doc_id) or {}).get("filename", doc_id).rsplit(".", 1)[0]

    if fmt == "xlsx":
        if tier == "raw":
            data = _build_raw_xlsx(doc_id)
        else:
            from spreading.service import export_spread_xlsx
            data = export_spread_xlsx(doc_id)
        return {"format": "xlsx", "tier": tier,
                "filename": f"{stem}_{tier}.xlsx",
                "base64": base64.b64encode(data).decode("ascii")}

    return {"format": "json", "tier": tier, "filename": f"{stem}_{tier}.json",
            "json": _build_json_export(doc_id, tier)}


def _cmd_delete_document(payload: dict[str, Any]) -> dict[str, Any]:
    """Cascade-delete a document + remove its retained PDF (B7).

    PDF removal is guarded to the `web/uploads` directory so seeded-corpus PDFs (whose
    `pdf_path` points at the source `Financials_Provided/` files) are never deleted.
    """
    import os

    from db.queries import delete_document

    res = delete_document(payload["documentId"])
    pdf = res.get("pdf_path")
    if pdf:
        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        uploads = os.path.abspath(os.path.join(repo, "web", "uploads"))
        if os.path.abspath(pdf).startswith(uploads):
            try:
                os.remove(pdf)
            except OSError:
                pass
    return {"deleted": res.get("deleted", False)}


def _cmd_get_settings(_payload: dict[str, Any]) -> dict[str, Any]:
    from db.queries import get_settings
    return get_settings()


def _cmd_save_settings(payload: dict[str, Any]) -> dict[str, Any]:
    from db.queries import update_settings
    fields = {k: payload[k] for k in ("llm_provider", "llm_model", "confidence_threshold")
              if k in payload}
    return update_settings(**fields)


# Dispatch table. Extend this in later phases.
COMMANDS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "echo": _cmd_echo,
    "resolve_unmapped": _cmd_resolve_unmapped,
    "save_mappings": _cmd_save_mappings,
    "override_mapping": _cmd_override_mapping,
    "recompute_balance": _cmd_recompute_balance,
    "register_upload": _cmd_register_upload,
    "run_pipeline": _cmd_run_pipeline,
    "export": _cmd_export,
    "get_settings": _cmd_get_settings,
    "save_settings": _cmd_save_settings,
    "delete_document": _cmd_delete_document,
}


# --------------------------------------------------------------------------- #
# Dispatch plumbing
# --------------------------------------------------------------------------- #
def _parse_payload(raw: str | None) -> dict[str, Any]:
    """Parse the JSON payload from ``--json`` or stdin; ``{}`` when absent."""
    if raw is None:
        raw = sys.stdin.read().strip() if not sys.stdin.isatty() else ""
    if not raw:
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="webapi.ops", description=__doc__)
    parser.add_argument("command", choices=sorted(COMMANDS), help="operation to run")
    parser.add_argument("--json", dest="json_payload", default=None,
                        help="JSON object payload (else read from stdin)")
    args = parser.parse_args(argv)

    try:
        payload = _parse_payload(args.json_payload)
        result = COMMANDS[args.command](payload)
        # default=str serialises datetimes (and other non-JSON types) safely.
        json.dump(result, sys.stdout, default=str)
        sys.stdout.write("\n")
        return 0
    except Exception as exc:  # noqa: BLE001 — boundary: every failure → JSON on stderr
        json.dump({"error": str(exc), "type": type(exc).__name__}, sys.stderr)
        sys.stderr.write("\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
