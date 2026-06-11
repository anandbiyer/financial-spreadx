"""Seed the canonical test corpus into the DB (Frontend Phase 1, B12).

Runs each corpus PDF through the full pipeline with Stage 11 + the new persistence
(extracted_rows, notes, page_summary, company/year). LIVE — makes LLM calls.

Usage (from repo root):
    .venv\\Scripts\\python.exe -m scripts.seed_test_corpus            # all four
    .venv\\Scripts\\python.exe -m scripts.seed_test_corpus infigen    # one (cheapest)
    .venv\\Scripts\\python.exe -m scripts.seed_test_corpus hdfc aspect

Each run creates a NEW Document (append-only history, Q15); the Library shows
latest-per-filename. Back up / reset via the .bak written by migrate_phase1.
"""

from __future__ import annotations

import os
import sys

from webapi.test_corpus import TEST_CORPUS, BY_KEY


def _load_env() -> None:
    """Minimal .env loader (mirrors main.py) so ANTHROPIC_API_KEY is available."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(root, ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


def seed_one(entry: dict) -> dict:
    from pipeline.orchestrator import run_pipeline

    path = entry["path"]
    if not os.path.exists(path):
        print(f"  ✗ MISSING: {path}")
        return {"key": entry["key"], "ok": False, "reason": "missing pdf"}

    with open(path, "rb") as fh:
        pdf_bytes = fh.read()

    print(f"=== {entry['key']}  ({entry['filename']}) ===")
    result = run_pipeline(
        pdf_bytes,
        run_spreading=True,
        filename=entry["filename"],
    )
    spread = result.spread_result or {}
    doc_id = spread.get("document_id")
    counts = spread.get("counts", {})

    # Record the source PDF location so the Phase 4 PDF pane can serve it without
    # a re-upload (B5; web upload will set this for user-uploaded docs).
    if doc_id and doc_id != "ephemeral":
        from db.queries import update_document
        update_document(doc_id, pdf_path=os.path.abspath(path))
    ps = result.summary.get("digital_pages"), result.summary.get("scanned_pages")
    print(f"  doc_id={doc_id}")
    print(f"  rows={result.summary.get('total_rows')} notes={result.summary.get('total_notes')} "
          f"pages(d/s/h)={result.summary.get('digital_pages')}/"
          f"{result.summary.get('scanned_pages')}/{result.summary.get('hybrid_pages')}")
    print(f"  mapped={counts.get('mapped')} unmapped={counts.get('unmapped')} "
          f"equity_ns={counts.get('equity_unmapped')} "
          f"balanced={spread.get('balance_check', {}).get('isBalanced')}")
    cost = result.summary.get("usage", {}).get("total", {}).get("cost_usd")
    print(f"  est_cost=${cost}")
    return {"key": entry["key"], "ok": True, "document_id": doc_id,
            "rows": result.summary.get("total_rows"), "cost": cost}


def main(argv: list[str]) -> int:
    _load_env()
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set (.env not found?)", file=sys.stderr)
        return 1

    keys = argv or [c["key"] for c in TEST_CORPUS]
    unknown = [k for k in keys if k not in BY_KEY]
    if unknown:
        print(f"ERROR: unknown corpus key(s): {unknown}. Valid: {list(BY_KEY)}",
              file=sys.stderr)
        return 1

    results = []
    for k in keys:
        results.append(seed_one(BY_KEY[k]))

    ok = [r for r in results if r.get("ok")]
    total_cost = sum(r.get("cost") or 0 for r in ok)
    print(f"\nseeded {len(ok)}/{len(results)} docs · est total ${round(total_cost, 2)}")
    return 0 if len(ok) == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
