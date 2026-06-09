# Revised_SpreadX — Latest Work Log

_Last updated: 2026-06-09. Scope: everything done in the Stage 11 (COA Mapping &
Spreading) build, verification, prompt update, subtotal-reconciliation work, the
equity-statement skip change, the confidence-threshold study + lowering to 0.55,
extraction-ID traceability + LLM token/cost tracking, the live 6-doc runs, and the
GitHub push. **The code is now committed & pushed** to `anandbiyer/financial-spreadx`
under a `Revised SpreadX/` subfolder (§3.14) — but the local repo still has it on an
unpushed branch (`origin` = Nitish's repo). This log update postdates the push._

---

## 1. What this project is (recap)

**SpreadX** is a financial-statement extraction pipeline (Python port of an older
TS/Next.js app). PDF → classify pages (S2) → filter (S3) → extract line items via
Claude text/vision (S5) → extract notes (S6) → Excel. A new **Stage 11 — COA
Mapping & Spreading** layer maps each extracted line item to a standardized 184-entry
Chart of Accounts (116 BS + 68 P&L), routes low-confidence items to an unmapped
queue, learns from manual mappings, runs balance/subtotal checks, and exports a
multi-sheet spread workbook. Stage 11 is gated (`run_spreading=False` /
`--spread`), off by default. Persistence = SQLite via SQLAlchemy (`spreadx.db`,
gitignored).

Plans & background: `AddnlReq_ImplPlan.md` (the live T0–T14 checklist),
`Current_State.md`, `Migration_Plan.md`.

---

## 2. Environment (important — changed this session)

- **Native Windows `.venv` (Python 3.14.5)** at repo root now has the FULL stack
  (`PyMuPDF`, `streamlit`, `pandas`, `pillow`, `anthropic`, `boto3`, `pydantic`,
  `SQLAlchemy`, `openpyxl`, `pytest`). The whole pipeline, Streamlit, and tests run
  natively on this machine. Run everything with `.venv\Scripts\python.exe ...`.
- The committed Linux `venv/` is redundant (slated for cleanup).
- **`.env`** at repo root holds a live `ANTHROPIC_API_KEY`. Default provider =
  `anthropic` (Claude direct); no `LLM_PROVIDER`/AWS creds, so Bedrock mode is
  untested here. `.env`, `.venv/`, `venv/` are all gitignored.
- **`.env` loading gotcha:** parsed manually only by `main.py` and
  `tests/conftest.py`. **`app.py` (Streamlit) does NOT load `.env`** — to run the
  UI, set `ANTHROPIC_API_KEY` in the shell first (this is how the Streamlit smoke
  run was launched). Pending task **T2** would add a loader to `app.py`.

---

## 3. Work completed this session (chronological)

### 3.1 Verification of the Stage 11 build (tasks T0, T1)
- **T0 — unit tests:** green. Fixed one stale test
  (`test_text_segmentation::SINGLE_STATEMENT` enlarged past the 200-char
  false-match guard that `segment_page_text` now enforces).
- **T1 — seed CoA DB:** `python -m db.seed_coa` → **184 rows = 116 BS + 68 P&L**;
  spot-checks pass; derived flags faithful (6 subtotal / 8 memo / 14 contra /
  21 negative).

### 3.2 Two fixes found during verification (T11, T12)
- **T11 — balance-check subtotal double-count (BUG, fixed).**
  `spreading/balance_checks.py` `_sum()`, `_imbalance_contributors()`,
  `verify_subtotals()` now **exclude `is_subtotal` CoA rows** (the identity must
  sum leaf items only). Was inflating Assets by restating subtotals (e.g. Net Block
  on top of Gross − Depreciation). +2 unit tests.
- **T12 — batched CoA mapping (perf).** New `map_rows_batch()` in
  `spreading/map_row_to_coa.py` maps up to `MAP_BATCH_SIZE=8` same-statement rows
  per LLM call (amortises the large candidate block). `coa_mapper.py` refactored to
  a two-pass loop (triage learning-store hits → batch the rest). Per-row fallback on
  parse failure so coverage never regresses. Cut Sterling's Stage-11 calls **38 → 7**
  and wall-clock ~halved.

### 3.3 Sample runs (6 real documents from `Financials_Provided/`)
Full extract→spread runs (`main.py … --spread`). All structurally sound: statement
gating perfect (0 cross-statement violations), cash-flow rows correctly skipped,
multi-sheet CoA-ordered XLSX produced, batching active.

| Doc | Type | Rows | Mapped/Unmapped | Balance |
|-----|------|------|-----------------|---------|
| Sterling Biotech 2008 | digital | 77/82 | 28–29 / 9–12 | False (Equity=0) |
| Fubon Securities 2017 | digital FI | 226 | 55 / 39 | False (assets under-captured) |
| Jane Street 2024 | scanned | 93 | 32 / 14 | **3.08% — closest** |
| Aspect Capital 2023 | scanned | 95 | 28 / 21 | False (neg L+E) |
| Infigen Energy 2008 | scanned | 19 | 12 / 7 | False (neg L+E) |
| HDFC Credila 2023 | digital | 123 | 44 / 29 | False |

**No statement balances within 0.1% tol — but every failure is extraction/mapping
data-completeness, not a code defect.**

### 3.4 Negative-L+E root cause (investigation only)
Aspect & Infigen showed **negative Total Liabilities+Equity**. Root cause: they are
**UK/FRS "net-assets" vertical-format** statements that print creditors (liabilities)
as **negative deductions**. Extraction faithfully captured the negatives; the CoA
sign layer (liabilities = `positive`, no flip) doesn't normalize them, so liabilities
stay negative and A=L+E can't hold. Only the two UK-format filings were affected —
the horizontal A=L+E filings (India/Taiwan/US) were fine. This is a sign-
normalization sub-case (logged under T13); **not yet fixed**.

### 3.5 Mapping system-prompt update (`Updated_spreading_prompt.docx`)
Replaced `_SYSTEM_PROMPT` in `spreading/map_row_to_coa.py` with the user's updated
prompt (Core Principles, 7 steps with explicit confidence bands, R1–R14 accounting
rules, strict-JSON output). Connected-file changes that were required:
- Rebuilt `_BATCH_SYSTEM_PROMPT` to **append** a batch I/O contract (the old
  `.replace()`-based derivation would have silently broken on the new prompt text).
- Handled the new **`"UNMAPPED"` sentinel** (R12) in both `map_row_to_coa` and the
  batch `_coerce` so it routes to the unmapped queue instead of being overridden by
  the candidate-fallback guard. +`tests/unit/test_map_row_to_coa.py` (4 tests).
- Re-ran Infigen with it: identical balance (the prompt can't fix the extraction-
  sign issue) but **much richer, auditable unmapped rationales** (correctly declining
  UK structural subtotals).

### 3.6 Unmapped visibility in the spread workbook
Added an **"Unmapped Items"** sheet to `export/spread_xlsx.py` so every extracted
BS/P&L line is visible (mapped on the statement sheets, or listed unmapped here)
with its top CoA suggestion, score, alternatives, and reason. Wired via
`service.export_spread_xlsx` → flows to CLI and Streamlit. +tests.

### 3.7 Unmapped analysis + root-cause study
- **`Unmapped_Analysis.xlsx`** (via `build_unmapped_analysis.py`): a single sheet
  of all 141 unmapped items across the 7 docs — report, statement, line item,
  Main/Sub-total/Total classification, top suggested CoA + score, band, reason.
- **Root cause of unmapped items (37% overall rate):**
  1. **Equity statement routed to P&L candidates** (`equity_statement → "P&L"`) →
     83% of equity rows unmapped (42% of ALL unmapped). SOCE movement rows have no
     CoA home and equity balances are offered the wrong candidate set. **Biggest.**
  2. **No CoA target for subtotals/totals** (chart is component-level, only 6 of
     184 are subtotals) → Net income, Net assets, Shareholders' funds etc. unmapped.
  3. **0.60 confidence-threshold near-misses** (22% have a viable top candidate at
     0.55–0.59) — recoverable.
  4. Aggregated/composite lines (no breakdown); minor extraction noise.

### 3.8 Subtotal Reconciliation (POC — APPROVED plan, built & validated)
Plan: `C:\Users\anand\.claude\plans\on-the-totals-and-luminous-horizon.md`.
Goal: use each extracted subtotal/total as a **cross-foot checksum** to validate
component mappings and surface missing/mis-signed/mis-mapped components.

- **New `spreading/subtotal_reconciliation.py`** — pure module.
  `reconcile_subtotals(rows, outcomes, coa_by_id)` groups each subtotal's component
  leaves by **document order + indentation + section_path**, sums **RAW extracted
  values** (the printed signs the document foots on, not CoA-sign-applied), compares
  to the subtotal value (0.1% tol + abs floor). Flags unmapped components and
  sign-flips. Cash-flow excluded.
- **Foot-driven grouping refinement** (key): try leaves-since-last-subtotal first;
  if they don't foot AND a preceding same-level sibling subtotal exists, **greedily
  absorb preceding siblings until the checksum closes** — fixing nested UK
  net-assets stacks (Net current assets → Total assets less CL → Net assets)
  WITHOUT making independent siblings over-absorb (only absorbs when leaves alone
  fail). `grouping_method` ∈ {leaves, absorbed, unresolved, llm}. The optional LLM
  contributor fallback hook exists but **was not needed** — the heuristic sufficed.
- **Wired into Stage 11:** `coa_mapper.run_coa_mapping_stage` builds a per-row
  `outcomes` lookup, calls `reconcile_subtotals`, returns + persists it. New
  **`Document.reconciliation_result`** JSON column (added to `db/models.py`; an
  additive `ALTER TABLE` was run on the existing `spreadx.db`).
- **Integrated into the spread export:** `export/spread_xlsx.build_spread_xlsx` now
  writes a **6th "Subtotal Reconciliation" sheet** (subtotal rows + component rows,
  PASS/FAIL/INCOMPLETE, a "missing leaf line(s)" flag that counts only non-subtotal
  unmapped components). `service.export_spread_xlsx` passes the doc's
  reconciliation_result → flows to CLI + Streamlit.
- **Validated on Aspect (UK nested):** 17 subtotals, **11 PASS / 0 FAIL** (was 3
  PASS / 7 FAIL before the refinement). Whole UK chain foots via `absorbed`;
  independent siblings stayed `leaves`. PASS rows carrying "missing leaf" flags
  surface subtotals that reconcile arithmetically but include an unmapped line.
- **`build_subtotal_reconciliation.py`** — standalone multi-doc roll-up workbook
  (`Financials_Provided/Subtotal_Reconciliation.xlsx`).

### 3.9 Equity-statement skip (T13(a) — DONE; plan approved & implemented)
Plan: `C:\Users\anand\.claude\plans\the-equity-statement-should-be-memoized-cerf.md`.
Addresses the **biggest unmapped driver** (§3.7.1: equity routed to P&L candidates →
83% of equity rows unmapped, 42% of ALL unmapped). Decision: treat `equity_statement`
like `cash_flow` — **never runs through mapping/reconciliation** (no LLM calls) — but,
unlike cash flow, every equity row is recorded as a **terminal `not_spread` unmapped
item** so it stays visible without becoming analyst work.

- **`spreading/map_row_to_coa.py`** — `_STMT_TO_COA["equity_statement"]` flipped
  `"P&L"` → `None`. Equity now resolves to "no CoA target" and never reaches
  `map_rows_batch`.
- **`spreading/coa_mapper.py`** — Pass-1 `coa_statement is None` branch splits equity
  out into a separate `equity_unmapped` list (`status="not_spread"`, fixed reason note
  `_EQUITY_NOTE`); cash-flow/unknown stay silently skipped. `_record_unmapped`
  refactored to take explicit `candidates`/`note`/`status`/`bucket`. Document
  `status`/`unmapped_count` stay driven by the **pending** `unmapped` list only — so
  equity does NOT block `spread_complete` or inflate the pending count. Both lists
  persist; new `counts["equity_unmapped"]`; log line + return dict updated.
- **`spreading/subtotal_reconciliation.py`** — `equity_statement` added to the
  exclusion set (now `("", "cash_flow", "equity_statement")`).
- **`db/queries.py`** — new `get_unmapped_for_display()` returns `pending` +
  `not_spread`. `get_pending_unmapped` left untouched (analyst UI + `unmapped_count`
  stay pending-only). Note: `not_spread` is a NEW, distinct status from the analyst
  `"skipped"` set by `skip_unmapped`.
- **`spreading/service.py`** — `export_spread_xlsx` uses `get_unmapped_for_display`, so
  equity rows show on the Unmapped Items sheet (self-label `not_spread` in the existing
  Status column — no sheet code change).
- **`main.py` / `spreading/ui_streamlit.py`** — both summaries surface the
  "Equity (not spread)" count.
- **Net effect:** no tokens on equity; P&L sheet no longer polluted by equity rows;
  reconciliation drops equity subtotals; pending-unmapped count now reflects only
  actionable items. **Not yet validated end-to-end** (needs a live API run on an
  equity-heavy filing, e.g. Fubon 2017 / HDFC Credila 2023).

### 3.10 Confidence-threshold study + lowering to 0.55 (T13(c) — DONE)
Plan: `C:\Users\anand\.claude\plans\the-equity-statement-should-be-memoized-cerf.md`
(reused). The COA-mapping gate (`coa_mapper.py:193`,
`result.confidence >= confidence_threshold`) is a **post-hoc gate** — it doesn't change
the LLM call, only whether the model's top pick is accepted. So lowering it is fully
**reconstructable offline** from the persisted top suggestions (`claude_suggestions`).

- **`build_threshold_sensitivity.py`** (new, offline, no LLM, no DB writes) — simulates
  thresholds `[0.60, 0.55, 0.45, 0.20, 0.00]` per latest-per-filename doc and reports
  coverage, the recomputed Balance-Sheet identity (reusing `check_balance_sheet_identity`
  + `apply_sign_to_spread`), reconciliation unmapped-component flags, band breakdown, and
  a "Flipped @ 0.20" quality sheet → `Financials_Provided/Threshold_Sensitivity.xlsx`.
  **Validated:** at T=0.60 the reconstruction reproduces every doc's stored
  `balance_check_result` exactly. (Excludes equity — now `not_spread`; ignores the R12
  `UNMAPPED` sentinel / hallucinated ids; uses the top-suggestion score as the
  confidence proxy.)
- **Finding:** recovering only the **near-miss band (~0.55)** improves the A=L+E balance
  for most filings (Fubon −144.2M→−3.0M, HDFC −1.75M→−117k, Jane Street/Aspect closer);
  going to **0.20/0.00 reaches ~100% coverage but the balance diverges** (the added
  low-confidence picks are mostly wrong). So **0.55 is the sweet spot**, not 0.
- **Threshold made configurable, default lowered 0.60 → 0.55:**
  `config.SPREAD_CONFIDENCE_THRESHOLD` (env `SPREAD_CONFIDENCE_THRESHOLD`),
  `coa_mapper.CONFIDENCE_THRESHOLD` now sources it, plumbed through
  `run_pipeline(confidence_threshold=…)` and a new `main.py --confidence-threshold` CLI.
- **Republished the 7 docs at 0.55 with NO LLM re-run** via new
  **`republish_at_threshold.py`**: promotes each pending BS/P&L unmapped item whose top
  real-CoA suggestion ≥ 0.55 into a `coa_mapping` (sign applied, merged into the existing
  aggregated row so one row per `coa_id`), flips pre-§3.9 equity pending → `not_spread`,
  recomputes `balance_check_result` + reconciliation unmapped-component flags +
  `unmapped_count`/`spread_status`, then re-exports `<stem>_spread.xlsx`. **Idempotent**
  (2nd run promotes 0). Promotions matched the study's 0.55 column (Aspect +4, Fubon +9,
  Jane St +4, Rathbone +4, HDFC/Infigen/Sterling +1). Promoted unmapped items get status
  `auto_mapped` (hidden from the Unmapped sheet). DB backed up to `spreadx.db.bak` first.

### 3.11 Design decision — per-file threshold optimization (REJECTED, analysis only)
Full write-up: `C:\Users\anand\.claude\plans\the-equity-statement-should-be-memoized-cerf.md`.
Question raised: instead of the fixed 0.55 default, run a per-file optimizer that picks the
threshold **minimizing the A=L+E gap**. Conclusion: **do not do this; keep the fixed 0.55.**

- **Feasibility is trivial** (and it isn't really "optimization"): the threshold is a post-hoc
  gate, so `gap(T)` is a piecewise-constant step function changing only at the discrete
  suggestion scores. The per-file minimizer is an exact sort-and-scan over the BS near-miss
  items — O(N log N), offline, no LLM (the `build_threshold_sensitivity.py` reconstruction).
- **Why it's the wrong objective:** (a) **Goodhart** — A=L+E is our only *independent*
  correctness check; tuning the threshold to make it balance converts the validator into a
  fitted output and destroys it. (b) **Silent, correlated errors** — the optimizer accepts
  low-confidence / wrong-side picks whenever their signed value coincidentally offsets the
  residual; with no mapping-level ground truth these hide behind a green checkmark. (c) **The
  gap floor is structural** (UK net-assets signs T13(b); Sterling scale blow-up) — a
  gap-minimizer chases an unreachable zero and injects the most noise into the docs that fail.
  (d) **Instability** — a scalar T chosen by extraction noise breaks cross-file / year-over-year
  comparability (the point of spreading).
- **Recommended instead:** keep fixed 0.55; use the gap as a **diagnostic, not a target** —
  optionally a guarded "suggest-don't-commit" flag within `[0.55, 0.60]`, with analyst accepts
  flowing into the **learning store** (compounds across the corpus, unlike a per-file T); and
  spend real effort on the **structural root cause T13(b)**, which helps every file permanently.
- **At scale:** pros (cheap, adaptive, better headline coverage) are outweighed by cons
  (lost validator, hidden correlated errors, non-comparable thresholds, masked systemic
  defects, auditability/regulatory risk, MLOps churn, no learning convergence). See the plan
  doc §4 for the full pro/con table. **No code built; no behavior change.**

### 3.12 Extraction-ID traceability + LLM token/cost tracking (DONE)
Plan: `C:\Users\anand\.claude\plans\the-equity-statement-should-be-memoized-cerf.md`. Two
additive features, both implemented + unit-tested (live end-to-end run still pending).

**(A) Extraction-ID traceability.** Every extracted row gets a stable 1-based `extraction_id`,
minted **once** in `pipeline/orchestrator.py` right after `all_rows` is deduped (single source of
truth → the same id appears in both workbooks). Threaded through Stage 11 as a **list**
(`source_extraction_ids`) because mapping aggregates many rows into one CoA line:
`coa_mapper._record_mapped`/`_record_unmapped` stamp `[extraction_id]`; `_aggregate` extends the
list when merging duplicate `coa_id`s. New JSON columns on `CoaMapping` + `UnmappedItem`;
surfaced as an **"Extraction ID(s)"** column on the extraction sheet (first column,
`export/xlsx_export.py`) and on the spread workbook's Balance Sheet, P&L, Unmapped Items, and
Confidence & Source sheets (`spread_formatter` + `export/spread_xlsx.py`). `republish_at_threshold.py`
carries the ids on promotion. So any spread line traces to its source extraction rows (eases
testing/audit). IDs are stable within a run (re-extraction re-mints — natural semantics).

**(B) LLM token & cost tracking.** Both providers already received `usage` and discarded it; now
a per-run **`UsageMeter`** (`llm/usage.py`, contextvar-scoped, thread-safe) accumulates
input/output (+cache) tokens by `(stage, model)`. The four provider methods call `record_usage(...)`
(no-op when no meter active → tests unaffected). The orchestrator activates the meter, flips stage
`extraction`→`spreading`, attaches `result.summary["usage"]`, and persists to a new
`Document.usage_result` JSON column. Cost is an **estimate at Anthropic list price**
(`config.MODEL_PRICING`: Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5, Opus 4.8 $5/$25; `normalize_model_id`
strips Bedrock prefixes; cache mults 0.1/1.25). Surfaced in: CLI summary (`main.py`), Streamlit
(`ui_streamlit.py`, which meters its standalone spread call), and a 7th **"Run Usage & Cost"**
spread sheet. Caveats labelled everywhere: list-price only (ignores Bedrock pricing, discounts,
caching); caching unused today (cache fields 0); vision tokens fold into `input_tokens`; offline
`build_*`/`republish` scripts record no usage.

**DB migration (additive, like `reconciliation_result`):** added
`coa_mappings.source_extraction_ids`, `unmapped_items.source_extraction_ids`, `documents.usage_result`
to the existing `spreadx.db` via a one-off idempotent `ALTER TABLE` script (backed up to `.bak`
first); new DBs get them from the models.

**Tests:** new `test_usage_meter.py` (per-provider extraction, model normalization, Sonnet cost
math, unknown-model flag, no-op-when-inactive); `test_spread_xlsx` updated for 7 sheets + the
Extraction-ID columns + usage sheet; `test_coa_mapper` asserts aggregation merges id lists;
`test_xlsx_export` updated for the new first column.

### 3.13 Live end-to-end runs of 6 docs at 0.55 (DONE)
Ran `main.py … --spread` (live, provider=anthropic, model=claude-sonnet-4-6) for **Aspect,
Fubon, HDFC Credila, Infigen, Jane Street, Rathbone** — verifying the §3.12 features on real
data. All produced fresh `_extracted.xlsx` (with the **Extraction ID** first column) and
`_spread.xlsx` (7 sheets incl. **Run Usage & Cost**, plus the **Extraction ID(s)** columns); CLI
printed the per-stage token/cost block each run.

| Doc | Pages | Rows | Mapped/Unmapped | Equity ns | Balance diff | Est. $ |
|-----|-------|------|-----------------|-----------|--------------|--------|
| Aspect | 6 scan | 95 | 23 / 7 | 30 | 85,097 | 0.73 |
| Fubon | 5 (3d/2s) | 225 | 56 / 21 | 20 | −161,055,988 | 2.12 |
| HDFC Credila | 4 dig | 123 | 40 / 11 | 26 | +106,250 | 1.09 |
| Infigen | 2 scan | 19 | 14 / 4 | 0 | +14,800,342 | 0.33 |
| Jane Street | 5 scan | 93 | 32 / 5 | 11 | −1,883,637 | 0.81 |
| Rathbone | 4 scan | 121 | 36 / 4 | 25 | +103 | 0.93 |

- **Total est. cost ≈ $6.74** (list price; ~$6.01 first pass + ~$0.73 Aspect re-run).
- **Aspect file-lock gotcha:** the first pass aborted Aspect's workbook writes with a
  `PermissionError` because its `_extracted.xlsx` was **open in Excel** (extraction+spreading had
  run and persisted to the DB; only the file writes failed). After the file was closed, a **full
  re-run** regenerated both workbooks. Note: the `_extracted.xlsx` is NOT reconstructable from the
  DB (raw extracted rows aren't persisted — only aggregated/sign-applied CoA results), so a
  re-run is the only way to refresh it; the `_spread.xlsx` IS re-exportable from the DB for free.
- Balances differ from the §3.10 offline 0.55 study because these are **fresh extractions**
  (LLM non-deterministic) — e.g. Rathbone now near-balanced (+103), HDFC +106,250. Fubon hit one
  transient JSON-parse error mid-extraction but recovered via retry/fallback (225 rows).

### 3.14 Committed & pushed to GitHub (DONE)
The whole working-tree effort was committed and pushed to the user's own repo.
- **Local:** branch `stage11-spreading-traceability-usage`, commit `8aefa35` (62 files, +7,578),
  authored `Anand Iyer <anandbiyer@gmail.com>` (repo-local identity). `.gitignore` extended with
  `*.bak` and `Financials_Provided/`. **Excluded:** `.env` (API key), `*.db` + `.bak`, venvs, the
  `Financials_Provided/` corpus + generated `*.xlsx`, and the `_i1`/`_main` scratch duplicates
  (left untracked on disk).
- **The configured `origin` (`nitish017dec-akf/my-spreadx-bedrock`) rejected the push (403 — no
  write access for `anandbiyer`).** So the code was pushed to the user's own repo instead:
  **`anandbiyer/financial-spreadx`** (private; turned out to be the original TS/Next.js
  financial-spreadx app this project is a port of). The Python project was added as a
  self-contained **`Revised SpreadX/` subfolder** (commit `b6cd794` on `master`, additive on top
  of the TS history) via a clean `git archive` of the committed branch — the **local working tree
  was not touched**. Repo created/confirmed via the GitHub API using the cached credential
  (token scope: `repo`).
- **Caveats:** the local repo's `origin` still points at Nitish's repo and is NOT linked to
  `financial-spreadx` (structures differ — local has code at root, the new repo has it under the
  subfolder). The push is a single snapshot commit, not per-feature history. This `Claude_Latest.md`
  update was made **after** the push, so the pushed copy predates §3.13–§3.14.

---

## 4. New & modified files

**New packages/modules:** `llm/` (provider abstraction: base, bedrock,
anthropic_client, factory, **usage** [§3.12 token/cost meter]), `db/` (models, session, queries, seed_coa),
`spreading/` (coa_mapper, map_row_to_coa, learning_store, balance_checks,
sign_conventions, spread_formatter, **subtotal_reconciliation**, service,
ui_streamlit), `export/spread_xlsx.py`.

**New root scripts/data:** `build_unmapped_analysis.py`,
`build_subtotal_reconciliation.py`, **`build_threshold_sensitivity.py`** (§3.10 study),
**`republish_at_threshold.py`** (§3.10 no-LLM 0.55 republish), `Financials_Provided/`
(19 sample PDFs + gold manifest + generated `_extracted`/`_spread` workbooks +
`Unmapped_Analysis.xlsx` + `Subtotal_Reconciliation.xlsx` + `Threshold_Sensitivity.xlsx`),
`Updated_spreading_prompt.docx`, `BS_PL_Line_Items_V1.xlsx`,
`Prompt for CoA Mapping V1.docx`, the plan/state docs. (`spreadx.db.bak` = pre-republish
DB backup, gitignored.)

**New tests:** `test_balance_checks`, `test_coa_mapper`, `test_learning_store`,
`test_map_row_to_coa`, `test_seed_sign_derivation`, `test_sign_conventions`,
`test_spread_formatter`, `test_spread_xlsx`, `test_subtotal_reconciliation`,
**`test_usage_meter`** (§3.12).

**Modified:** `app.py`, `config.py`, `main.py`, `requirements.txt`,
`claude/extract.py`, `claude/extract_vision.py`, `claude/extract_notes.py`,
`pdf/statement_classifier.py`, `pipeline/orchestrator.py`, `.gitignore`,
`tests/conftest.py`, `tests/unit/test_extract_mocked.py`,
`tests/unit/test_text_segmentation.py`, plus the in-session edits to
`spreading/coa_mapper.py`, `spreading/map_row_to_coa.py`,
`spreading/balance_checks.py`, `spreading/service.py`, `export/spread_xlsx.py`,
`db/models.py`, and (equity skip, §3.9) `spreading/subtotal_reconciliation.py`,
`db/queries.py`, `spreading/ui_streamlit.py` + the equity test additions in
`test_coa_mapper.py` / `test_subtotal_reconciliation.py` / `test_map_row_to_coa.py`;
and (threshold, §3.10) `config.py` (`SPREAD_CONFIDENCE_THRESHOLD`), `spreading/coa_mapper.py`
(sources the config value), `pipeline/orchestrator.py` + `main.py`
(`--confidence-threshold` plumbing).

---

## 5. Test status

`.venv\Scripts\python.exe -m pytest tests/unit -q` → **164 passed, 1 skipped,
15 errors** (158 after the equity-skip change; +6 from §3.12: the new
`test_usage_meter.py` 5 tests + extraction-id/usage assertions in `test_spread_xlsx`,
`test_coa_mapper`, `test_xlsx_export`). The 15 errors are all missing-PDF-fixture
`FileNotFoundError` (`tests/fixtures/` is gitignored/absent) — environment, not code.

---

## 6. The spread workbook today (per document, `<stem>_spread.xlsx`)

7 sheets: **Balance Sheet** · **P&L** · **Unmapped Items** · **Subtotal
Reconciliation** · **Confidence & Source** · **Learned Mappings Applied** · **Run
Usage & Cost** (§3.12). The statement/unmapped/confidence sheets now carry an
**"Extraction ID(s)"** column tracing each line back to its source extraction rows.
Produced automatically by every `--spread` run and the Streamlit "Export Spread XLSX".
**The 7 sample docs' books were republished at the 0.55 threshold (§3.10)** — they carry
the near-miss promotions and show equity rows as `not_spread` on the Unmapped sheet
(re-run them to pick up the new Extraction-ID + usage columns).

---

## 7. Pending tasks / next steps

- **T2** — add `.env` loader to `app.py` (Streamlit) — small, in-scope.
- **T6** — learning-store replay verification (resolve → re-run → learned mapping
  applied with no LLM call; override demotion).
- **T13** — mapping/extraction quality, in priority order:
  (a) ~~**equity_statement routing**~~ **DONE (§3.9)** — equity now skips spreading and
  is recorded as terminal `not_spread` unmapped (still needs end-to-end validation on a
  live run); (b) **liability sign normalization** for UK net-assets format (fixes
  negative L+E) — **still open, biggest remaining balance blocker**; (c) ~~threshold
  tuning~~ **DONE (§3.10)** — studied + lowered to 0.55 + republished; subtotal
  recognition refinement still open.
- **T14** — normalize year/period keys (`"2017.12.31"`, `"Group_2023"` seen).
- **Reconciliation follow-ups (deferred in the POC plan):** persist
  `section_path/indentation/is_subtotal/row_seq` on `coa_mappings`/`unmapped_items`
  for offline reconciliation without a re-run; enable the LLM contributor fallback
  only if a non-UK layout defeats the heuristic.
- **Roll out** — the 7 sample docs are republished at 0.55 (§3.10); any newly-added
  docs should be run with `--spread` (now defaults to 0.55) to carry the new sheets.
- **T9/T10 — commit & cleanup:** ~~commit~~ **DONE (§3.14)** — pushed to
  `anandbiyer/financial-spreadx` under `Revised SpreadX/`. **Cleanup still open:** the
  `_i1`/`_main` duplicate experiment files remain untracked on disk (excluded from the commit,
  not deleted); the redundant Linux `venv/` (if still tracked) and `spreadx.db.bak` could be
  removed. Optional: link the local repo to `financial-spreadx` (awkward due to the
  root-vs-subfolder structure mismatch).

---

## 8. How to run / test (this machine)

```
# unit tests
.venv\Scripts\python.exe -m pytest tests/unit -q

# seed CoA (idempotent)
.venv\Scripts\python.exe -m db.seed_coa

# full extract + spread for one PDF (writes _extracted.xlsx + 6-sheet _spread.xlsx)
# COA-mapping gate defaults to config SPREAD_CONFIDENCE_THRESHOLD = 0.55; override:
.venv\Scripts\python.exe main.py "Financials_Provided\<file>.pdf" --spread
.venv\Scripts\python.exe main.py "Financials_Provided\<file>.pdf" --spread --confidence-threshold 0.60

# analysis workbooks (read the latest DB doc per filename; no pipeline re-run)
.venv\Scripts\python.exe build_unmapped_analysis.py
.venv\Scripts\python.exe build_subtotal_reconciliation.py
.venv\Scripts\python.exe build_threshold_sensitivity.py     # threshold what-if study
.venv\Scripts\python.exe republish_at_threshold.py          # promote >=0.55 + rewrite books (no LLM)

# Streamlit UI (set the key first — app.py doesn't load .env yet)
$env:ANTHROPIC_API_KEY = (Get-Content .env | Where-Object {$_ -match '^ANTHROPIC_API_KEY='}) -replace '^ANTHROPIC_API_KEY=',''
.venv\Scripts\python.exe -m streamlit run app.py
```

Memory files (cross-session): `spreadx-stage11-spreading`, `spreadx-windows-env`.
