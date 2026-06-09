"""CLI entry point for the SpreadX raw extraction pipeline.

Usage:
    python main.py <pdf_path> [--template T1] [--output output.xlsx] [--dpi 2.0]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Ensure project root is on sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

# Load .env file for AWS credentials if present
_env_path = _PROJECT_ROOT / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def _progress(stage: str, detail: str, pct: float) -> None:
    bar_len = 30
    filled = int(bar_len * pct)
    bar = "#" * filled + "-" * (bar_len - filled)
    print(f"\r  [{bar}] {pct:5.1%}  {stage}: {detail}", end="", flush=True)
    if pct >= 1.0:
        print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SpreadX Raw Extraction — extract financial data from PDF to Excel"
    )
    parser.add_argument("pdf_path", help="Path to the input PDF file")
    parser.add_argument(
        "--template", "-t",
        default="T0_unknown",
        help="Template type hint (T1-T8, default: T0_unknown)",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output XLSX path (default: <input_stem>_extracted.xlsx)",
    )
    parser.add_argument(
        "--dpi",
        type=float,
        default=2.0,
        help="Render scale for scanned pages (default: 2.0)",
    )
    parser.add_argument(
        "--spread",
        action="store_true",
        help="Run Stage 11 (COA mapping & spreading) after extraction",
    )
    parser.add_argument(
        "--confidence-threshold",
        type=float,
        default=None,
        help="Stage 11 COA-mapping confidence gate (default: config "
             "SPREAD_CONFIDENCE_THRESHOLD = 0.55)",
    )
    parser.add_argument(
        "--provider",
        choices=["anthropic", "bedrock"],
        default=None,
        help="LLM provider override (default: env LLM_PROVIDER, then 'anthropic')",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="LLM model id override",
    )

    args = parser.parse_args()

    if args.provider or args.model:
        from config import set_llm_settings
        set_llm_settings(provider=args.provider, model=args.model)

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"Error: File not found: {pdf_path}")
        sys.exit(1)

    output_path = Path(args.output) if args.output else pdf_path.with_name(
        pdf_path.stem + "_extracted.xlsx"
    )

    print(f"Input:    {pdf_path}")
    print(f"Template: {args.template}")
    print(f"Output:   {output_path}")
    print()

    # Read PDF
    pdf_bytes = pdf_path.read_bytes()
    print(f"PDF size: {len(pdf_bytes):,} bytes")
    print()

    # Run pipeline
    from pipeline.orchestrator import run_pipeline
    from export.xlsx_export import build_raw_extraction_xlsx

    result = run_pipeline(
        pdf_bytes,
        template_type=args.template,
        dpi_scale=args.dpi,
        progress_callback=_progress,
        filename=pdf_path.name,
        run_spreading=args.spread,
        confidence_threshold=args.confidence_threshold,
    )

    print()
    print("Summary:")
    s = result.summary
    print(f"  Pages:     {s['total_pages']} ({s['digital_pages']} digital, {s['scanned_pages']} scanned, {s['hybrid_pages']} hybrid)")
    print(f"  Filtered:  {s['filtered_pages']} financial pages")
    print(f"  Rows:      {s['total_rows']} extracted")
    for st, count in s.get("rows_by_type", {}).items():
        if count > 0:
            print(f"    - {st}: {count}")
    print(f"  Notes:     {s['total_notes']} extracted")

    usage = s.get("usage")
    if usage and usage.get("total", {}).get("calls"):
        t = usage["total"]
        print()
        print("LLM usage (estimated, list price):")
        for stage, b in usage.get("by_stage", {}).items():
            print(f"  {stage:11} {b['input_tokens']:>9,} in / {b['output_tokens']:>8,} out "
                  f"({b['calls']} calls)  ~${b['cost_usd']:.4f}")
        print(f"  {'TOTAL':11} {t['input_tokens']:>9,} in / {t['output_tokens']:>8,} out "
              f"({t['calls']} calls)  ~${t['cost_usd']:.4f}"
              + ("  [unknown model pricing]" if usage.get("unknown_model_pricing") else ""))
    print()

    # Export
    xlsx_bytes = build_raw_extraction_xlsx(result)
    output_path.write_bytes(xlsx_bytes)
    print(f"Excel written: {output_path} ({len(xlsx_bytes):,} bytes)")

    # Stage 11 output (if requested)
    if args.spread and result.spread_result:
        sp = result.spread_result
        c = sp["counts"]
        print()
        print("Spreading (Stage 11):")
        print(f"  Document:  {sp['document_id']}")
        print(f"  Mapped:    {c['mapped']} ({c['learned']} learned, {c['claude']} via LLM)")
        print(f"  Unmapped:  {c['unmapped']}   Equity (not spread): {c['equity_unmapped']}"
              f"   Skipped (no CoA): {c['skipped_no_coa']}")
        bc = sp["balance_check"]
        if bc.get("applicable"):
            print(f"  Balanced:  {bc.get('isBalanced')} (year {bc.get('primary_year')}, "
                  f"diff {bc.get('difference', 0):,.0f})")
        from spreading.service import export_spread_xlsx
        spread_path = pdf_path.with_name(pdf_path.stem + "_spread.xlsx")
        spread_path.write_bytes(export_spread_xlsx(sp["document_id"]))
        print(f"  Spread XLSX written: {spread_path}")


if __name__ == "__main__":
    main()
