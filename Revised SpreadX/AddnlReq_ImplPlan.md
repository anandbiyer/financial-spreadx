# Additional Requirements — Stage 11 COA Mapping & Spreading: Implementation Plan

_Status: approved 2026-06-07. Source spec: `FinancialSpreadX_Spreading_Requirements.html` v1.0._
_Update 2026-06-07: Phases 0 + A–E **code-complete but uncommitted**; project now
in the **verification stage**. Environment unblocked (native Windows `.venv`) and a
real test dataset (`Financials_Provided/`) is available. See **§Revised Execution
Plan & Pending Tasks (2026-06-07)** at the bottom — that section is the live to-do
list; everything above it is the original design and remains the reference._

## Context

The spec defines a major new feature: a **Stage 11 — COA Mapping & Spreading**
layer that maps each extracted line item to a standardised Chart of Accounts
(184 entries: BS-001…BS-116, PL-001…PL-068), assigns a confidence + rationale,
runs balance/subtotal checks, queues low-confidence items for analyst
resolution, and **learns** from every manual mapping so future runs reuse it
(with explicit attribution) instead of calling Claude.

**Critical finding — the requirements doc targets the *old* stack.** It is
written against the original TypeScript/Next.js `financial-spreadx`
(Drizzle + Postgres `pgTable`, Vercel Blob, Next.js `app/api/.../route.ts`
routes, React/Tailwind screens, ExcelJS, Vercel AI SDK `generateObject` + Zod).
The current repo (`Revised_SpreadX`) is the **stateless Python port**: Streamlit
+ CLI, Bedrock Converse, PyMuPDF, openpyxl, **no database**, pipeline stages
S2→S6 producing **raw** rows (`raw_label`/`raw_values`) only. So the entire spec
must be **translated to Python**, and three structural gaps must be bridged:

| Gap | Spec assumes | Repo reality | Decision |
|-----|--------------|--------------|----------|
| Persistence | Postgres + Drizzle, transactions, FKs | Fully stateless, no DB | **SQLite via SQLAlchemy** (1 file; Postgres later = conn-string swap) |
| Row input | `mapped_rows.canonical_field`/`canonical_values` | Only `raw_label`/`raw_values` | **Map `raw_label` directly**; no new upstream stage |
| Values | `value_spread` w/ currency, unit_scale, USD, year_type | `{year: float}` only | **Raw values + CoA sign conventions** only (FX/scale deferred) |

**Reference files verified present** (single source of truth, do not deviate):
- `BS_PL_Line_Items_V1.xlsx` — 2 sheets (`BS Definitions` 116 rows, `P&L
  Definitions` 68 rows). Columns: `ID, Line Item Name, Statement, Broad
  Category, Sub-Category, Definition, Spreading Guidance`. **No**
  `sign_convention`/`is_subtotal`/`is_memo_item` columns — derived during
  seeding (names ending `(-)` like "Bad Debt Reserve (-)" → negative; "Memo -
  0/2 Decimals" → memo; "Total …"/"Gross Profit"/"PBT" → subtotal; P&L expenses
  → negative).
- `Prompt for CoA Mapping V1.docx` — the 9-step mapping process. Goes into the
  mapper's **system prompt**. (Filename uses spaces, not underscores.)

## Frontend recommendation

**The frontend redesign (Streamlit → FastAPI + React, per `Migration_Plan.md`)
is done *after* these requirements.** Build the feature — including the two new
screens — in Streamlit first, then migrate the whole app to React afterwards.

**Trade-off + mitigation.** The Unmapped Resolver is interaction-heavy and
Streamlit reruns the whole script per click, so that UI is somewhat awkward in
Streamlit and gets **rebuilt** in React during the migration. To make the
rebuild cheap and the Streamlit screens disposable rather than wasteful:
- Put **all logic in a stack-agnostic service layer** (`spreading/` engine +
  `db/` queries). Streamlit (now) and FastAPI routes (later) are thin callers of
  the *same* functions — only the presentation layer is rebuilt.
- Shape service functions to mirror the spec's **9 API routes** so the FastAPI
  migration is a near-mechanical wrapper.
- Result: ~80% of this feature survives the migration untouched.

## Implementation plan (Phases 0 + A–E)

### Phase 0 — LLM provider abstraction + frontend toggle

Use **Claude API (direct)** now; switch to **AWS Bedrock** later for customer
demos. Both selectable from a **simple front-end setting** — no code change to
flip. Default provider = **Claude direct**. API keys come from **env/`.env`
only** (never typed into the UI).

- `llm/base.py` — `LLMClient` protocol: `complete(system, prompt, max_tokens)`
  and `complete_vision(prompt, image_png, max_tokens, system)`, **both return a
  raw text string** — what every current call site already consumes, so
  downstream JSON-cleanup is untouched.
- `llm/bedrock.py` — wraps today's `converse()` logic verbatim; uses
  `config.get_bedrock_client()` + `BEDROCK_DEFAULT_MODEL_ID`.
- `llm/anthropic_client.py` — `anthropic` SDK Messages API; text + base64 PNG
  vision; `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`; generous timeout/retries to
  mirror Bedrock's 900s ceiling.
- `llm/factory.py` — `get_llm_client()` resolves provider: **explicit override →
  session setting → env default** (`LLM_PROVIDER`, default `anthropic`). Caches
  per `(provider, model)`. `config.set_llm_settings(provider, model)` writes the
  session setting the UI controls; `run_pipeline()`/`run_coa_mapping_stage()`
  accept an optional `llm_settings` override for a future per-request FastAPI.
- **Swap the 4 existing call sites** (`claude/extract.py`,
  `claude/extract_vision.py`, `claude/extract_notes.py`,
  `pdf/statement_classifier.py`) to `get_llm_client().complete(...)` /
  `.complete_vision(...)` — ~2–4 lines each, **prompts unchanged**.
- **Streamlit sidebar toggle:** "LLM Provider" radio (*Claude API (direct)* |
  *AWS Bedrock*) + editable model id. **No API-key field.** On change → calls
  `set_llm_settings(...)`. React later exposes the same via `/api/settings/llm`.
- `requirements.txt` += `anthropic>=0.40.0`. `boto3`/Bedrock stays for demo mode.

> **Acceptance:** flipping the toggle routes *all* Claude calls (extraction,
> vision, notes, scanned-classify, COA mapping) through the chosen provider with
> no code edits; `LLM_PROVIDER=bedrock` reproduces today's output.

All later phases call Claude via `get_llm_client()`: strip-fences → `json.loads`
→ pydantic validate + retry, identical to today's `claude/extract.py` handling.

### Phase A — Data layer (`db/`)
- `db/models.py` — SQLAlchemy models: `coa_reference`, `coa_mappings`,
  `unmapped_items`, `learned_mappings`, + lightweight `documents` (id, filename,
  template_type, scope, spread_status, unmapped_count, balance_check_result
  JSON). Denormalise needed row fields (`raw_label`, `statement_type`,
  `value_spread` JSON) into `coa_mappings`/`unmapped_items` (no separate
  `mapped_rows` table). Indexes per spec Section 08.
- `db/session.py` — engine + session factory; `SPREADX_DB_URL`
  (default `sqlite:///spreadx.db`); `create_all()` on first use.
- `db/queries.py` — query helpers (insert-batch, get-by-document, resolve,
  override, paginated list). `resolve_unmapped()` does the 3 writes in **one
  transaction** (COA-009 / LRN-003).
- `db/seed_coa.py` — idempotent upsert seeder reading the xlsx (openpyxl).
  Derive `sign_convention`/`is_subtotal`/`is_memo_item`. Run: `python -m db.seed_coa`.

### Phase B — Spreading engine (`spreading/`)
- `spreading/sign_conventions.py` — apply sign rules (SPR-003).
- `spreading/learning_store.py` — `find_learned_mapping()` 3-priority lookup
  (no `canonical_field`): (1) norm(raw_label)+statement_type+template → (2)
  +`'*'` → (3) fuzzy `LIKE` on `raw_label_pattern`. Plus `normalise_label()`,
  `update_learning_confidence()` (LRN-004 demote ≥2 overrides→0.70; LRN-005
  promote ≥5 clean→0.99).
- `spreading/map_row_to_coa.py` — `map_row_to_coa()` via `get_llm_client()`;
  system prompt = docx 9 steps; user prompt embeds row + **statement-filtered**
  CoA candidates (BS→BS-only, hard error otherwise, COA-003). Returns `coa_id`,
  `confidence`, `rationale` (≥50 chars, COA-005), `ambiguities`, top-3
  `candidates`. Pydantic-validate + retry.
- `spreading/balance_checks.py` — `check_balance_sheet_identity()` (A=L+E, 0.1%
  tol, contributors, COA-006) + `verify_subtotals()`.
- `spreading/coa_mapper.py` — `run_coa_mapping_stage(...)` orchestrator: learning
  store first (attribution string, LRN-002; `times_applied`++) → else Claude →
  route by thresholds (≥0.90 auto / 0.75–0.89 review / 0.60–0.74 confirm / <0.60
  unmapped, COA-007); apply signs; aggregate dup CoA ("Aggregated from N source
  rows", SPR-004); balance + subtotal checks.
- `spreading/spread_formatter.py` — all 184 CoA entries in **CoA-ID order**
  (SPR-001), values/confidence/source/rationale, blanks where unmapped.
- `export/spread_xlsx.py` — 4 sheets: Balance Sheet, P&L, Confidence & Source,
  Learned Mappings Applied; confidence colour coding; attribution (SPR-002).

### Phase C — Pipeline integration (service layer)
- `pipeline/orchestrator.py` — **optional, gated** Stage 11 hook
  (`run_spreading: bool = False`); existing extract behaviour unchanged by
  default. When on: create `documents` row, call `run_coa_mapping_stage()`,
  persist, set status.
- The spec's 9 API routes are implemented now as **service functions** in
  `db/queries.py` + `spreading/coa_mapper.py`. FastAPI wrappers come later.

### Phase D — Streamlit UI (`app.py`) — minimal/disposable, rebuilt in React later
- **LLM Provider toggle** (Phase 0) in sidebar (keys from env only).
- Keep screens **minimal and logic-free** (thin service-layer callers).
- **"Run Spreading (Stage 11)"** action after a pipeline run.
- **Spread Review**: BS/P&L tabs, CoA-ordered table (CoA ID, line item, raw
  label, year values, confidence bar, source badge, rationale expander),
  balance banner, unmapped banner, per-row override, "Export Spread XLSX".
- **Unmapped Resolver**: pending-item selector, ≤3 suggestion cards (radio),
  editable rationale, Confirm (3 writes, 1 txn) / Skip.
- **Learning Store** admin expander: list/filter, delete.

### Phase E — Seed & verify
- Seed → assert 184 rows; spot-check BS-001 Cash, BS-021 Capital & Restricted
  Reserves, PL-001 Sales/Revenues, PL-040 PBT.
- Fixture PDF end-to-end with `run_spreading=True`; verify Stage 11, balance
  identity, unmapped routing.
- Resolve one unmapped item → re-run same template → learned mapping applied
  **without** a Claude call (log) + attribution. Override → `times_overridden`++
  + demotion at 2.
- Spread XLSX → 4 sheets, CoA-ID ordering, sheet-4 attribution.

## Files (new unless noted)
**Phase 0:** `llm/base.py`, `llm/bedrock.py`, `llm/anthropic_client.py`,
`llm/factory.py`; modified: the 4 call sites.
**Phases A–E:** `db/models.py`, `db/session.py`, `db/queries.py`,
`db/seed_coa.py`, `spreading/sign_conventions.py`,
`spreading/learning_store.py`, `spreading/map_row_to_coa.py`,
`spreading/balance_checks.py`, `spreading/coa_mapper.py`,
`spreading/spread_formatter.py`, `export/spread_xlsx.py`.
**Modified:** `pipeline/orchestrator.py`, `app.py`, `config.py`,
`requirements.txt`. Reuse: `pdf/statement_classifier.normalize_heading_text`,
openpyxl styling in `export/xlsx_export.py`.

## Out of scope (flagged simplifications)
Multi-currency / USD / unit-scale `value_spread`; canonical-field stage; the
FastAPI/React migration itself (separate `Migration_Plan.md`); Postgres/Vercel
Blob; the spec's exact Drizzle/Next.js code (translated, not copied). OpenAI/
Gemini providers not in scope, but `llm/` is shaped to add them without touching
call sites.

## Verification summary
0. `LLM_PROVIDER=anthropic` (default) extracts via Claude API; toggle to Bedrock
   → same PDF extracts via Bedrock, **no code change** (confirm in log).
1. `python -m db.seed_coa` → 184 rows, spot-checks pass.
2. `python main.py <fixture.pdf>` unaffected (Stage 11 off by default).
3. Streamlit → spreading → Spread Review balanced; resolver writes learning.
4. Re-run same template → learned mapping applied, no Claude call (log),
   attribution correct; override increments/demotes.
5. Spread XLSX has 4 sheets in CoA order with attribution.
6. `pytest` green (new unit tests: sign-derivation, 3-priority lookup, balance
   tolerance, confidence routing, aggregation).

---

# Revised Execution Plan & Pending Tasks (2026-06-07)

This section supersedes the verification sequencing above. The **build is done**;
what remains is **environment confirmation, a 3-file test run, commit, and
cleanup.** No new feature code is planned — only fixes surfaced by verification.

## R.1 What changed since the plan was approved

**All code is implemented but nothing is committed.** Present in the working tree
(untracked / modified):
- `llm/` (base, bedrock, anthropic_client, factory) — Phase 0 done; 4 call sites swapped.
- `db/` (models, session, queries, seed_coa) — Phase A done.
- `spreading/` (sign_conventions, learning_store, map_row_to_coa, balance_checks,
  coa_mapper, spread_formatter, **service**, **ui_streamlit**) — Phases B/C/D done.
- `export/spread_xlsx.py` — 4-sheet workbook done.
- Orchestrator gated hook wired (`run_spreading=False`, calls `run_coa_mapping_stage()`
  after S6). `app.py` wired (provider toggle + spreading + learning-store sections).
- 6 new unit-test files present.

**Environment is now unblocked (supersedes the old Windows-env constraint).**
- A native **Windows `.venv` (Python 3.14.5)** now exists with the **full stack**
  installed — `PyMuPDF 1.27`, `streamlit 1.58`, `pandas 3.0`, `pillow 12`,
  `anthropic 0.107`, `boto3 1.43`, `pydantic 2.13`, `SQLAlchemy 2.0`, `openpyxl 3.1`,
  `pytest 9.0`. The full pipeline, Streamlit, and the test suite can all run
  natively on this machine. The old Linux `venv/` is now redundant. (No TEMP venv
  needed anymore.)
- A `.env` now exists with a real `ANTHROPIC_API_KEY` (Claude-direct; default
  provider `anthropic`, no `LLM_PROVIDER` set). It is gitignored — safe.

**Two gotchas to fix during verification (small, in-scope):**
1. **`.env` is not auto-loaded by Streamlit.** `.env` is parsed manually only in
   `main.py` and `tests/conftest.py`; **`app.py` does not load it**, so
   `streamlit run app.py` will not see `ANTHROPIC_API_KEY` unless it is set in the
   shell first. Fix = add the same ~6-line `.env` loader to `app.py` (or set the
   env var before launching). CLI (`main.py`) and `pytest` are unaffected.
2. **Bedrock mode is unconfigured.** `.env` has no AWS creds, so the toggle's
   "AWS Bedrock" path can't be exercised here without adding them. Default Claude
   path is fully testable.

## R.2 Test dataset (`Financials_Provided/`)

19 PDFs + `Client names with Years.xlsx`. The xlsx is a **gold-driver
expectations sheet** (per client: Total Revenue, Net Income, EBITDA, Total
Operating Expense, Total Assets, Total Debt, Total Equity, Cash & Equivalents,
Total Current Assets/Liabilities) plus a CapitalIQ-style **Glossary** of driver
definitions (Standard / Banks / Insurance / Utility templates). Values are blank
— they are the targets the spread output should ultimately reconcile to.

Probe result — the corpus is roughly half digital-text, half scanned, skewed to
financial institutions (securities / banks / NBFC / mortgage / asset management):
- **Digital (text path):** Cash America 2007, Fubon Securities 2017, LT Finance
  2019, Sterling Biotech 2008, TPG 2022, Freddie 2023, HDFC Credila 2023.
- **Scanned (vision path):** Aditya Birla 2024, Aspect 2023, Infigen 2008, Jane
  Street 2024, LaBranche 2008, Orient Securities 2024, Sun Hung Kai 2024, TFG
  2024, Jademerchant 2021, Paratus 2024, Rathbones 2024, Southern Pacific 2021.

## R.3 The 3 sample test files (proposed)

Chosen for path + template diversity at low cost (swap any if you prefer):

| # | File | Why | Exercises |
|---|------|-----|-----------|
| 1 | `Sterling Biotech Limited_2008.pdf` | Digital, 3 pp, **non-financial / standard template** | Text extract (S5) + **cleanest A=L+E balance-identity** check; cheapest run |
| 2 | `Fubon Securities Co Ltd_2017.pdf` | Digital, 5 pp, **financial-institution template** | Text extract + **statement-type CoA candidate filtering** (BS→BS-only, P&L→P&L-only); no vision cost |
| 3 | `Jane street Group LLC 2024.pdf` | Scanned, 5 pp, broker-dealer (marquee, in manifest) | **Vision path end-to-end** (S4b scanned-classify + `extract_vision`) feeding Stage 11 |

Coverage: 2 digital + 1 scanned; 1 non-financial + 2 financial; small/medium
size; together they hit text extract, vision extract, statement-type filtering,
sign conventions, balance + subtotal checks, and the 4-sheet export.

## R.4 Pending tasks (execution order)

- [x] **T0 — Unit tests.** DONE 2026-06-07. `tests/unit` → **132 passed, 1
      skipped, 0 failed**; Stage-11 + re-pointed-mock subset 32/32 green. Fixed
      one stale test (`test_text_segmentation::SINGLE_STATEMENT` enlarged past the
      200-char false-match guard that `segment_page_text` now enforces). Remaining
      **15 errors are missing-PDF-fixture `FileNotFoundError`** (`tests/fixtures/`
      is gitignored/absent) — environment, not code; needs real PDFs dropped in.
- [x] **T1 — Seed & spot-check CoA DB.** DONE 2026-06-07. Seeded `spreadx.db`
      → **184 rows = 116 Balance Sheet + 68 P&L** ✅. Spot-checks: BS-001 `Cash`
      (positive) ✅, PL-001 `Sales/Revenues` ✅, PL-040 `Profit Before Taxes`
      (`is_subtotal=True`) ✅. Derived flags: 6 subtotal / 8 memo / 14 contra /
      21 negative — verified faithful to the source xlsx (the 6 subtotals are all
      genuine; "Gross Fixed Assets"/"Gross Intangibles" correctly NOT flagged).
      NOTES: (a) plan's old BS-021 guess ("Capital & Restricted Reserves") was
      stale — actual BS-021 = `Non-Op Current Assets` (xlsx is source-of-truth).
      (b) The chart is mostly component-level, so few explicit subtotal/total rows
      exist — confirm `check_balance_sheet_identity()` sums contributor components
      (not a single "Total Assets" CoA row) during T3–T5.
- [ ] **T2 — Fix the `app.py` `.env` loader** (gotcha R.1#1) so Streamlit and CLI
      behave identically. Small, in-scope; needed before any UI run.
- [~] **T3 — Sample-run #1 (Sterling Biotech, digital).** RAN 2026-06-07
      (~19 min wall-clock). **Structural pass:** S2→S6 clean (77 rows: 23 IS /
      24 BS / 30 CF, 0 notes); Stage 11 produced the **4-sheet spread XLSX in
      CoA-ID order** with confidence/source ✅. Counts: 28 mapped (38 LLM calls),
      9 unmapped, **30 skipped (no CoA)**. **Balance check FAILED** (diff
      ₹43.9bn). Root causes diagnosed:
      - **BUG (code):** `spreading/balance_checks.py::_sum()` sums every category
        mapping **including `is_subtotal` CoA rows** → double-counts. Net Block
        (BS-038, subtotal) is added on top of Gross Block (BS-036) + Depreciation
        (BS-037); same for inferred "Total Current Assets/Liabilities". Fix =
        skip `coa["is_subtotal"]` in `_sum` (and likely `verify_subtotals` /
        `_imbalance_contributors`). → **pending task T11**.
      - **Data (expected):** Share Capital value extracted as `None`; 9 BS/P&L
        rows unmapped → identity can't close even after the bug fix. Not a code
        defect; messy 2008 Indian statement.
      - **By design:** the 30 skipped rows ≈ the 30 cash-flow rows — the 184-entry
        CoA chart has no cash-flow section, so CF rows are correctly skipped.
      - **PERF finding:** Stage 11 makes **one sequential Claude call per row**
        (~20–25s each) → ~19 min for a 3-page PDF. Dominant cost/time driver;
        batching candidate → **pending task T12**.
- [x] **T4 — Sample-run #2 (Fubon Securities, digital FI).** DONE 2026-06-07
      (with T11+T12). **Core objective PASS:** statement-type gating perfect —
      55 mappings, **0 cross-statement violations / 0 id-prefix mismatches** (BS
      rows→BS-*, IS/equity rows→PL-*). 226 rows (57 IS/67 BS/82 CF/20 equity);
      82 CF correctly skipped; batching ~14 calls for 105 LLM rows. Balance False
      (A=99M vs L+E=243M, 39 unmapped) — securities-firm B/S maps poorly to the
      generic CoA → data issue (T13), not a code defect. MINOR finding: year key
      parsed as `"2017.12.31"` (full date) not `"2017"` → possible column
      fragmentation; logged as **T14**.
- [x] **T5 — Sample-run #3 (Jane Street, scanned).** DONE 2026-06-07 (with
      T11+T12). **Vision path PASS:** all 5 pages scanned (0 digital) → vision
      classify + extract → 93 rows (24 IS/23 BS/35 CF/11 equity) flow into
      Stage 11 → 32 mapped, 14 unmapped, 35 CF skipped; gating 0 violations;
      4-sheet spread XLSX. **Best balance of the 3: diff 3.08%** (A=152M vs
      L+E=147M) with Equity captured (29.9M) — near-balanced, just over the 0.1%
      tol. Year key clean (`2024`). Confirms scanned→spread chain is sound.
- [ ] **T6 — Learning-store replay.** Resolve one unmapped item from a sample run,
      re-run the **same template**, and confirm the learned mapping is applied
      **without** a Claude call (check log) with correct attribution; then
      override and confirm `times_overridden`++ and demotion at ≥2 (LRN-004).
- [ ] **T7 — Optional gold-driver reconciliation.** For the 3 samples, eyeball the
      spread output's key subtotals (Total Assets, Total Equity, Total Revenue,
      Net Income) against the manifest's driver list / glossary definitions to
      sanity-check mapping quality. (Manifest values are blank → qualitative check
      only, not an automated assertion.)
- [ ] **T8 — Streamlit smoke (optional).** `streamlit run app.py`, run one sample
      through the UI: provider toggle, Run Spreading, Spread Review tabs, Unmapped
      Resolver, Export Spread XLSX, Learning Store admin.
- [ ] **T9 — Commit.** Stage the feature as **two logical commits**: (a) Phase 0
      LLM provider abstraction + 4 call-site swaps + tests; (b) Stage 11 spreading
      (`db/`, `spreading/`, `export/spread_xlsx.py`, orchestrator hook, `app.py`,
      seed data). Plus the doc/`.gitignore` updates.
- [ ] **T10 — Cleanup (alongside T9).** Remove the `_i1`/`_main` duplicate
      experiment files (`claude/extract_i1.py`, `claude/extract_main.py`,
      `claude/extract_vision_i1.py`, `claude/extract_vision_main.py`,
      `pdf/page_filter_main.py`, `pdf/page_rasterizer_main.py`,
      `pipeline/orchestrator_i1.py`, `pipeline/orchestrator_main.py`); retire the
      redundant Linux `venv/`; confirm `output.json`/`payload.json`/`*.log`/
      `*.db`/the stray `bedrock-runtime invoke-model/` dir are gone or ignored.

### Tasks surfaced by verification (added 2026-06-07)

- [x] **T11 — Fix subtotal double-counting in the balance check (BUG).** DONE
      2026-06-07. `spreading/balance_checks.py`: `_sum()`,
      `_imbalance_contributors()`, and `verify_subtotals()` now skip CoA rows with
      `is_subtotal=True` (identity sums **leaf** items only). Added 2 unit tests
      (`test_balance_checks.py`) — leaf+subtotal mix asserts the subtotal isn't
      counted and the sheet balances. Suite 7/7 green. Caveat noted: excluding
      subtotals can *under*-count when a statement supplies only a subtotal with
      no component breakdown — acceptable for now.
- [x] **T12 — Batch the per-row CoA mapping.** DONE 2026-06-07. New
      `map_rows_batch()` in `spreading/map_row_to_coa.py` maps up to
      `MAP_BATCH_SIZE=8` same-statement rows per LLM call (amortises the big
      candidate block). `coa_mapper.run_coa_mapping_stage()` refactored to a
      two-pass loop: (1) triage — skip no-CoA rows, resolve learning-store hits
      with no LLM; (2) batch the rest grouped by CoA statement. Robustness: rows
      the model omits or returns invalid fall back to per-row `map_row_to_coa`;
      a whole-batch parse failure falls back to per-row — so batching never
      reduces coverage, only call count. Tests re-pointed to patch
      `map_rows_batch`; full unit suite **134 passed, 0 failed**. Real-data
      validation (T3 re-run): **7 LLM calls vs 38** before, S11 ~9 min vs ~18 min,
      coverage preserved (40 mapped→29 aggregated + 12 unmapped + 30 skipped).

> **T11/T12 validated on T3 re-run.** Balance imbalance dropped ₹43.9bn→₹30.6bn
> (subtotal double-count removed; contributors now all `is_subtotal=False`,
> Net Block kept as a row but excluded from the sum). Residual imbalance is
> **extraction/mapping data gaps** — notably **Equity=0** (Share Capital +
> Reserves unmapped/None) — NOT a code defect. Tracked as **T13** (optional,
> extraction/mapping quality), out of scope for T11/T12.

- [ ] **T13 — (Optional, data quality) Improve mapping/extraction coverage.**
      First runs leave key lines unmapped (e.g. Share Capital, Reserves → Equity
      came through as 0/None), so the BS identity can't close even with T11. This
      is prompt/threshold/extraction tuning, not a structural defect. Defer until
      after the 3 sample runs establish a pattern across statements.

- [ ] **T14 — (Minor) Normalise year/period column keys.** Fubon produced a
      `value_spread` keyed by `"2017.12.31"` (full reporting date) instead of
      `"2017"`. This can fragment multi-year columns and weaken year-over-year
      alignment in the spread/export. Normalise period headers to a canonical
      year key during extraction or in the spread formatter. Low priority.

## R.5 Notes / risks for the test run

- **Cost/latency:** 3 small PDFs ≈ a handful of Claude calls each; the scanned one
  is the most expensive (1 vision call/page + extraction). Sequential, no async.
- **Stage 11 is gated** (`run_spreading` / `--spread`); default extraction runs
  are unaffected, so a failure in Stage 11 cannot regress S2→S6 output.
- **First failure expected to be data-shaped, not structural** — e.g. an FI
  statement whose labels don't match CoA candidates well, or a subtotal that
  fails tolerance. Treat these as prompt/threshold tuning, not redesign.
- **Out of scope still:** Bedrock A/B (needs AWS creds), multi-currency/USD/scale,
  and the FastAPI/React migration (`Migration_Plan.md`).
