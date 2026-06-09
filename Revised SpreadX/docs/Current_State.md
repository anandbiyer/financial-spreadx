# Revised_SpreadX — Current State

_Last updated: 2026-06-05_

## 1. What this project is

**SpreadX** is a financial-statement extraction pipeline. It takes a PDF of a
company's financial statements (annual report / accounts) and produces a
structured, "raw" extraction of every line item across the four primary
statements plus referenced footnotes, then exports the result to Excel.

It is a Python port of an earlier TypeScript project (`financial-spreadx`,
Next.js). Almost every module carries a `Ported from: financial-spreadx/...`
docstring, so the stage naming (S2, S2b, S3, S4b, S5, S6) mirrors the original.

- **Input:** one PDF (digital, scanned, or hybrid pages).
- **Output:** an `.xlsx` workbook with a *Summary* tab and a *Raw Extraction*
  tab, plus an in-memory `PipelineResult` object.
- **Statelessness:** PDF bytes in → result out. No database, no persistence.

## 2. Architecture overview

```
                ┌─────────────────────────────────────────────┐
   PDF bytes →  │            pipeline/orchestrator.py          │  → PipelineResult
                │            run_pipeline(...)                 │
                └─────────────────────────────────────────────┘
                        │ orchestrates stages in order
   ┌────────────────────┼──────────────────────────────────────────────┐
   │                    │                                                │
 S2 page_classifier   S2b/S4b statement_classifier        S5 claude/extract(+vision)
 (PyMuPDF, rules)     (regex digital + Bedrock vision)     (Bedrock text + vision)
   │                    │                                   S6 claude/extract_notes
 S3 page_filter       pdf/scope_detector,                  (Bedrock text)
 (grouping)           pdf/column_classifier                        │
                                                          export/xlsx_export (openpyxl)
```

### Stage-by-stage

| Stage | Module | Role | Uses LLM? |
|-------|--------|------|-----------|
| S2  | `pdf/page_classifier.py` | Classify each page as digital / scanned / hybrid via word-count + ASCII-ratio thresholds (PyMuPDF `fitz`). | No |
| S2b | `pdf/statement_classifier.py` `classify_statement_type()` | Regex (39 signal patterns) assigns statement type to **digital** pages from heading text. | No |
| S2c | `pipeline/orchestrator.py` (inline) | Reroute "digital" pages that are actually vector-drawn (high drawing count, low word count) to the scanned/vision path. | No |
| S3  | `pdf/page_filter.py` | Group pages by statement type; expand with boundary-aware continuation pages; build note→page map. | No |
| S4b | `pdf/statement_classifier.py` `classify_scanned_pages()` | **Vision** classification of scanned pages (1 call/page). | **Yes (Bedrock)** |
| S5  | `claude/extract.py` (text) + `claude/extract_vision.py` (OCR) | Extract financial line-item rows. Digital pages: segment → concatenate → 1 text call, with per-page and vision fallbacks. Scanned pages: per-page vision call with rotation correction + adaptive-DPI retry. | **Yes (Bedrock)** |
| S6  | `claude/extract_notes.py` | Extract structured tables/summaries for footnotes referenced by extracted rows. | **Yes (Bedrock)** |
| Export | `export/xlsx_export.py` | Build the Summary + Raw Extraction workbook (openpyxl). | No |

### Supporting modules
- `pdf/page_rasterizer.py` — rasterize pages to PNG, rotation detection/correction.
- `pdf/scope_detector.py` — detect consolidated / standalone / group scope.
- `pdf/column_classifier.py` — classify column headers (year vs. label vs. other).
- `models/` — `page.py`, `column.py`, `extraction.py` (Pydantic models +
  dataclasses for `ClassifiedPage`, `FilterResult`, `NoteExtraction`, etc.).

## 3. Entry points

| Entry point | File | How to run |
|-------------|------|-----------|
| **Web UI** | `app.py` | `streamlit run app.py` — upload PDF, see live progress, preview rows/notes, download XLSX. |
| **CLI** | `main.py` | `python main.py <pdf> [--template T1] [--output out.xlsx] [--dpi 2.0]` — loads `.env`, prints a progress bar, writes XLSX. |

Both call the single shared function `pipeline.orchestrator.run_pipeline()`.
**The orchestrator is fully UI-agnostic** — it only takes `pdf_bytes`, a few
options, and an optional `progress_callback(stage, detail, pct)`. This clean
separation is what makes a frontend swap low-risk (see recommendations).

## 4. LLM integration (current: AWS Bedrock)

The LLM is reached **only** through the AWS Bedrock **Converse API**. Config
lives in `config.py`:

```python
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
BEDROCK_DEFAULT_MODEL_ID = os.getenv("BEDROCK_DEFAULT_MODEL_ID",
                                     "global.anthropic.claude-sonnet-4-6")

def get_bedrock_client():
    config = Config(connect_timeout=120, read_timeout=900,
                    retries={'max_attempts': 3})
    return boto3.client("bedrock-runtime", region_name=AWS_REGION, config=config)
```

`client.converse(...)` is called directly in **four** places:

1. `claude/extract.py` — `extract_statement()` (text, maxTokens 8192)
2. `claude/extract_vision.py` — `extract_statement_from_image()` (image+text, 8192)
3. `claude/extract_notes.py` — `extract_note()` (text, maxTokens 4096)
4. `pdf/statement_classifier.py` — `classify_scanned_pages()` (image+text, 512)

Each call:
- Builds a prompt string from a module-level template.
- Sends Bedrock-shaped messages (`{"role","content":[{"text":...}]}`, images
  as `{"image":{"format":"png","source":{"bytes":...}}}`).
- Reads `response["output"]["message"]["content"][0]["text"]`.
- Strips ``` fences and slices from first `{` to last `}` before `json.loads`.

> **Coupling note:** there is no LLM abstraction layer today. The Bedrock
> client, message shape, and response shape are hard-coded into all four call
> sites. Switching providers means either editing those four sites or (better)
> introducing a small client wrapper. See §7.

Credentials use standard boto3 resolution (env vars `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY`, or `~/.aws`, or `.env` loaded by `main.py`).

## 5. Tech stack & dependencies

- **Language:** Python ≥ 3.11 (`pyproject.toml`); the bundled `venv` is 3.10.
- **PDF:** PyMuPDF (`fitz`) for text, drawings, rasterization.
- **LLM:** `boto3` → Bedrock Converse (Anthropic Claude Sonnet 4.6 by default).
- **Models:** `pydantic` v2.
- **Export:** `openpyxl`.
- **UI:** `streamlit`.
- **Imaging:** `Pillow`.
- **Data preview:** `pandas`.
- **Tests:** `pytest` (unit, integration, regression).

`requirements.txt` pins minimum versions; `.streamlit/config.toml` holds UI
config; secrets (`.env`, `.streamlit/secrets.toml`) are gitignored.

## 6. Testing

Substantial test suite under `tests/`:
- `tests/unit/` — ~20 files: classifiers, parsers, prompts, DPI logic, vision
  fallback, orchestrator (mocked), xlsx export, etc.
- `tests/integration/` — full pipeline, digital/scanned PDFs, Claude extract &
  notes, Streamlit smoke test. Gated by the `integration` marker (needs PDF
  fixtures / credentials).
- `tests/regression/` — regression cases.
- Markers: `integration`, `slow`. Fixtures dir (`tests/fixtures/`) is gitignored.

## 7. Repository state & housekeeping notes

Current working tree contains several items worth cleaning up:

- **Duplicated experiment files** (untracked): `claude/extract_i1.py`,
  `claude/extract_main.py`, `claude/extract_vision_i1.py`,
  `claude/extract_vision_main.py`, `pdf/page_filter_main.py`,
  `pdf/page_rasterizer_main.py`, `pipeline/orchestrator_i1.py`,
  `pipeline/orchestrator_main.py`. These look like ad-hoc variant/backup copies
  and add noise — recommend consolidating into git branches.
- **Committed artifacts that should be ignored:** `output.json`, `payload.json`,
  `spread_pipeline.log`, and the entire `venv/` directory are present in the tree
  (`venv/` and logs should be added to `.gitignore`).
- **A directory literally named `bedrock-runtime invoke-model`** exists at the
  root — almost certainly an accidental artifact from a CLI command.
- **Modified but uncommitted:** `claude/extract.py`, `claude/extract_vision.py`,
  `config.py`, `pdf/page_filter.py`, `pdf/page_rasterizer.py`,
  `pipeline/orchestrator.py`.

### Recent git history (context)
The last five commits are all stabilization fixes around the **Bedrock
migration**: migrating the Anthropic SDK to the Bedrock Converse API, robust
JSON extraction, token-ceiling fixes, integer note-ref parsing, and Boto3
request-timeout tuning for 8192-token queries. In other words, the codebase very
recently moved *onto* Bedrock and is now being asked to support a provider
*outside* Bedrock as well — so a provider-abstraction layer (§4 coupling note)
is the natural next step.

## 8. Known characteristics / design decisions

- **Robustness-first prompting:** prompts are long and defensive (inferred
  labels, dual-column layouts, parenthetical negatives, account-code stripping).
- **Multiple fallback layers** in S5: concat → per-page text → vision; vision
  retries sweep rotation angles and bump DPI.
- **Dedup logic** keys on label + values + type + page + section_path +
  indentation to drop true duplicates while keeping legitimately repeated labels.
- **Adaptive DPI:** dense vector pages (drawing_count > 2000) render at ≥3.0×.
- **No async/concurrency:** LLM calls are sequential per page; large scanned PDFs
  can be slow (hence the 900s read timeout).
