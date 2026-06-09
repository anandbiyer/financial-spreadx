# Revised SpreadX

A standalone **Python pipeline** that turns a financial-statement PDF into a structured,
*spread* Excel workbook. It is a re-implementation of the original TypeScript/Next.js
`financial-spreadx` app (which lives at the root of this repository).

```
PDF ─► classify pages ─► filter ─► extract line items & notes (Claude text + vision)
    ─► Stage 11: COA mapping & spreading ─► multi-sheet Excel
```

---

## What it does

1. **Extraction (S2–S6).** Classifies each PDF page (digital / scanned / hybrid), filters to the
   financial statements, and extracts line items and footnotes with Claude — text extraction for
   digital pages, vision for scanned pages.
2. **Stage 11 — COA mapping & spreading.** Maps every extracted line to a standardized
   **184-entry Chart of Accounts** (116 Balance Sheet + 68 P&L), applies sign conventions,
   aggregates duplicates, runs the **A = L + E** balance-sheet identity check and per-subtotal
   **reconciliation** (cross-footing each subtotal against its components), routes low-confidence
   lines to an **unmapped queue**, and reuses prior analyst decisions via a **learning store**.
   Results are persisted to SQLite and exported as a multi-sheet workbook.

Stage 11 is **gated off by default** (`--spread`) so plain extraction behavior is unchanged.

### Outputs (per document)

- `<stem>_extracted.xlsx` — raw extracted rows, each with a stable **Extraction ID**.
- `<stem>_spread.xlsx` — 7 sheets: **Balance Sheet · P&L · Unmapped Items · Subtotal
  Reconciliation · Confidence & Source · Learned Mappings Applied · Run Usage & Cost**.
  Mapped lines carry an **Extraction ID(s)** column tracing each CoA line back to its source
  extraction rows, and every run reports estimated **LLM token usage & cost**.

---

## Folder layout

| Path | What it is |
|------|------------|
| `main.py` | CLI entry — extract a PDF (add `--spread` for Stage 11) |
| `app.py` | Streamlit UI |
| `config.py` | Settings: provider/model, cost-estimate pricing, `SPREAD_CONFIDENCE_THRESHOLD` |
| `claude/` | Claude extraction (text, vision, notes) |
| `pdf/` | Page classification, filtering, rasterization, statement-type detection |
| `pipeline/` | Orchestrator that wires S2 → S6 (→ S11) |
| `models/` | Pydantic models for extracted rows / notes |
| `spreading/` | Stage 11: COA mapper, learning store, balance/subtotal checks, reconciliation, formatter, service |
| `db/` | SQLAlchemy models, session, queries, CoA seeding |
| `export/` | Excel writers (raw extraction + spread workbook) |
| `llm/` | Provider abstraction (Anthropic + Bedrock) and the per-run token/cost **usage meter** |
| `build_*.py`, `republish_at_threshold.py` | Offline analysis / republish tools (run from this folder) |
| `tests/` | Unit tests |
| `docs/` | Design notes, plans, and prompt specs — **start with [`docs/Claude_Latest.md`](docs/Claude_Latest.md)** |
| `BS_PL_Line_Items_V1.xlsx` | Chart-of-Accounts seed source (read by `db/seed_coa.py`) |

---

## Setup

Requires **Python 3.11+**.

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt     # Windows  (use .venv/bin/pip on macOS/Linux)
```

Provide a Claude API key — either export `ANTHROPIC_API_KEY` or put it in a `.env` file at this
folder (loaded by `main.py`):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Seed the Chart of Accounts (idempotent — 184 rows from `BS_PL_Line_Items_V1.xlsx`):

```bash
.venv\Scripts\python -m db.seed_coa
```

---

## Usage

```bash
# Extract only -> <stem>_extracted.xlsx
.venv\Scripts\python main.py "path/to/report.pdf"

# Extract + Stage 11 spreading -> also writes the 7-sheet <stem>_spread.xlsx
.venv\Scripts\python main.py "path/to/report.pdf" --spread

# Override the COA-mapping confidence gate for one run (default 0.55)
.venv\Scripts\python main.py "path/to/report.pdf" --spread --confidence-threshold 0.60

# Streamlit UI
.venv\Scripts\python -m streamlit run app.py

# Offline analysis / republish (read the persisted DB; no LLM calls)
.venv\Scripts\python build_unmapped_analysis.py
.venv\Scripts\python build_threshold_sensitivity.py
.venv\Scripts\python republish_at_threshold.py
```

---

## Configuration (env vars)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | — | Claude API key (required for live runs) |
| `LLM_PROVIDER` | `anthropic` | `anthropic` (Claude API) or `bedrock` (AWS Bedrock Converse) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Model id for the Anthropic provider |
| `SPREAD_CONFIDENCE_THRESHOLD` | `0.55` | COA-mapping confidence gate (below → unmapped queue) |
| `SPREADX_DB_URL` | `sqlite:///spreadx.db` | Persistence backend |
| `AWS_REGION`, `BEDROCK_DEFAULT_MODEL_ID` | — | Used when `LLM_PROVIDER=bedrock` |

LLM cost figures are **estimates at Anthropic list price** (see `config.MODEL_PRICING`) and ignore
Bedrock pricing, volume/commit discounts, and prompt caching.

---

## Testing

```bash
.venv\Scripts\python -m pytest tests/unit -q
```

(Some tests require local PDF fixtures under `tests/fixtures/`, which are gitignored; those are
skipped/error out in a clean checkout — the rest run offline.)

---

## Notes

- **Persistence:** SQLite via SQLAlchemy (`spreadx.db`, gitignored). The CoA reference is seeded
  once; mappings, unmapped items, reconciliation, and per-run usage are stored per document.
- **Provider abstraction:** `llm/` selects Anthropic (default) or Bedrock at runtime; the same
  code path captures token usage for cost reporting.
- **Not committed here:** secrets (`.env`), the SQLite DB, virtualenvs, and the sample
  annual-report corpus (`Financials_Provided/`) are all gitignored.
- For the full build/decision history, see [`docs/Claude_Latest.md`](docs/Claude_Latest.md).
