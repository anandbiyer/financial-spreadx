# Financial SpreadX — Frontend Design Document & Build Plan

**Version 1.0 · 2026-06-10 · Status: DRAFT for approval (no implementation started)**

Companion to:
- `SpreadX_Frontend_Spec_v1_2.md` — UI requirement spec (screens, CSS, data shapes)
- `SpreadX_Interactive_v6.html` — visual mockup
- `Frontend_GapAnalysis.md` — backend capability matrix + all resolved decisions (§8)

This document turns the gap analysis and the resolved Q1–Q21 decisions into an
**architecture, a concrete backend-change list, an API contract, a screen-by-screen v1
design, and a phased build plan.**

---

## 1. Goals & Scope

**Goal:** ship a Next.js web frontend over the existing Python extraction + Stage 11
spreading pipeline, surfacing the implemented functionality (extraction, CoA mapping,
unmapped resolution, learning store, balance/reconciliation checks, token/cost) as an
analyst-facing app.

**In scope for v1 (9 screens):** Document Library (1), Upload & Classify single-file (2),
Review Workbench (3), Statement Tree (4), Validation — 2 checks (5), Export Centre (6),
Spread Review (7), Compare & Resolve (8), LLM Cost (9), Unmapped Resolver (10),
Settings (11).

**Explicitly OUT of v1** (per decisions): batch upload mode; V01–V12 validation engine
(only A=L+E + subtotal reconciliation); line-level PDF highlight / cross-highlight (page-
level jump only); CSV/PDF export; standalone reconciliation tab; per-run model/threshold
overrides; 4-band confidence model; multi-user/auth; "Saved via Learning" KPI (optional
stretch). See §10.

---

## 2. Resolved Decisions (authoritative summary)

| Topic | Decision |
|---|---|
| **Q1** API strategy | Next.js routes → **Python subprocess** |
| **Q2/Q11** Persistence | **Persist all**: extracted rows + notes + page-classification summary |
| **Q3** Validation | **Only 2 checks** (balance + reconciliation) — no V01–V12 |
| **Q4** Threshold | **Single** `SPREAD_CONFIDENCE_THRESHOLD` gate |
| **Q5** Library | Lists **all uploaded reports processed through extract + spread** |
| **Q6** Canonical field | **Removed** — use mapped CoA line item |
| **Q7** Reconciliation | **Overlay on the CoA tree only**, no standalone tab |
| **Q8** Progress | **Coarse status** (`queued→processing→done/error`) for v1 |
| **Q9** Writes | **Hybrid** — TS reads; complex writes via Python; optimistic UI |
| **Q10** Layout | **`web/` subfolder monorepo**; shared `spreadx.db` (WAL); Python sole writer |
| **Q12** PDF | **Retain** uploaded PDF + **user-driven delete** |
| **Q13** Company/Year | **Capture during extraction** |
| **Q14** Health/Flagged | **Simple proxies** (health = balance-pass + mapped ratio; flagged = unmapped/low-confidence count) |
| **Q15** Re-run | **New `Document` per run**; Library shows latest-per-filename; history kept |
| **Q16** Screens | Batch **dropped**; Settings **in**; PDF/Compare pane **in** |
| **Q17** Trigger | **Always full extract + Stage 11**; params from Settings; no per-run override |
| **Q18** Confidence bands | **Cosmetic** display: ≥0.90 green, 0.75–0.89 amber, <0.75 red |
| **Q19** Auth | **Single-user, no auth**; fixed analyst id |
| **Q20** PDF fidelity | **Page-level jump** (row click → PDF jumps to `page`) |
| **Q21** Settings scope | Functional = **model + provider + threshold**; rest read-only |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Revised_SpreadX/  (repo root — Python pipeline unchanged)        │
│                                                                   │
│   main.py · app.py · config.py · pipeline/ · spreading/ · db/ …   │
│   spreadx.db  ◄──────────────────────────────┐  (WAL mode)        │
│                                              │                    │
│   webapi/  (NEW — thin Python CLI dispatch)  │ writes (sole writer│
│     ops.py  ─ run / resolve / override /     │  of pipeline data) │
│              save / delete / export          │                    │
│                                              │                    │
│   web/  (NEW — Next.js 15 app)               │                    │
│     app/  api/  components/  lib/            │                    │
│       lib/db.ts  ──── direct reads ──────────┘ (better-sqlite3)   │
│       lib/python.ts ─ spawn subprocess ─► webapi/ops.py           │
│     uploads/  (retained source PDFs, keyed by document_id)        │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow:**
- **Reads** (Library, trees, cost, etc.): Next.js route handler → `lib/db.ts`
  (better-sqlite3) → SQLite **directly**. Fast, no Python.
- **Pipeline run** (upload): Next.js → spawn **detached** `python -m webapi.ops run …`
  → process extracts/spreads and updates `documents.pipeline_status`. Frontend **polls**
  a status route.
- **Complex writes** (resolve / override / save-drag-drop / delete / balance recompute):
  Next.js → spawn `python -m webapi.ops <cmd> --json '{…}'` → reuses tested
  `db.queries` / `spreading` logic → returns JSON. UI updates **optimistically**, then
  reconciles on the subprocess result.

**SQLite concurrency:** enable **WAL** + `busy_timeout`. Python is the only writer of
pipeline/mapping data; the frontend's direct writes are limited to nothing in v1 (all
writes routed through Python), so there is a single logical writer — no contention beyond
read-during-write, which WAL handles.

**Why this shape:** reuses the entire tested backend with zero logic duplication (Q9),
keeps the Python CLI/Streamlit paths working, and needs no long-running service (Q1/Q10).

---

## 4. Backend Changes Required

These are **additive** (mirroring the prior `reconciliation_result` / `usage_result`
`ALTER TABLE` pattern). Existing CLI/Streamlit behaviour must remain unchanged.

### 4.1 New persistence (orchestrator + schema)

**B1 — Persist extracted rows.** New table `extracted_rows`:

| Column | Type | Source |
|---|---|---|
| `id` | String PK | uuid |
| `document_id` | FK→documents.id | |
| `extraction_id` | Integer | `ExtractedRow.extraction_id` (1-based, minted in orchestrator) |
| `raw_label` | Text | |
| `raw_values` | JSON | `{year: value}` (unsigned) |
| `section_path` | JSON | list |
| `indentation_level` | Integer | |
| `is_subtotal` | Boolean | |
| `note_ref` | String null | |
| `statement_type` | String | |
| `statement_scope` | String | |
| `page` | Integer | |
| `column_metadata` | JSON null | |
| `coa_id` | String null | **per-row pre-aggregation mapping outcome** |
| `mapping_status` | String | `mapped` / `unmapped` / `not_spread` |
| `confidence` | Float null | per-row mapping confidence |

> Persisting the **per-row** `coa_id`/`status`/`confidence` (captured in the mapper
> before aggregation) is what powers the Review Workbench's per-row "Mapped CoA line
> item" column and the inline override, and the Spread tree's source-line children —
> without fragile JSON-list-containment queries against `source_extraction_ids`.

**B2 — Persist notes.** New table `notes`: `id`, `document_id`, `note_number`,
`note_title`, `summary`, `sub_tables` (JSON). Powers NoteDrawer (3) + Notes Index (4).

**B3 — Persist page-classification summary.** New JSON column
`documents.page_summary` = `{digital: n, scanned: n, hybrid: n, pages:[{page,
classification, section_type}]}`. Powers Scanned-vs-Digital chart (9) + run summary.

### 4.2 Document lifecycle & new columns

**B4 — Create the `Document` at upload, not mid-pipeline.** Today the row is created when
Stage 11 runs; for the Library to show `processing` from upload onward, create it up front.
New columns on `documents`:

| Column | Type | Purpose |
|---|---|---|
| `company` | String | captured during extraction (B6) |
| `fiscal_year` | Integer null | captured during extraction (B6) |
| `pdf_path` | String null | retained source PDF (B5) |
| `pipeline_status` | String | `queued`/`processing`/`done`/`error` (Q8) |
| `pipeline_stage` | String null | last completed stage label (coarse; optional display) |
| `error_message` | Text null | on failure |
| `page_summary` | JSON null | B3 |

**B5 — Retain the source PDF + delete.** Save the uploaded PDF to `web/uploads/<document_id>.pdf`;
store the path in `documents.pdf_path`. Add a `delete_document` op (B7) that removes the
PDF file and cascades the document's rows (`extracted_rows`, `notes`, `coa_mappings`,
`unmapped_items`, the `documents` row). *(Learned mappings are global and are NOT deleted.)*

**B6 — Capture company + fiscal year.** Add a lightweight capture in extraction (derive
from the statement header already parsed, or a dedicated field in the extraction prompt)
→ persist to `documents.company` / `fiscal_year`. *(Fallback: parse from filename if the
capture is empty.)*

### 4.6 Extraction-ID lineage (traceability backbone) — explicit

The `extraction_id` traceability built in work-log §3.12 is the **authoritative spine**
of the tree/leaf display in Spread Review (7) and Compare & Resolve (8). Documented here
so it is not left implicit:

- **Mint once:** `extraction_id` (1-based) is stamped in the orchestrator after dedup —
  the single source of truth. Persisted on `extracted_rows.extraction_id` (B1).
- **Parent → leaf link is `source_extraction_ids` (authoritative).** A tree **parent**
  is a `CoaMapping`; its **leaves** are exactly the rows where
  `extracted_rows.extraction_id ∈ CoaMapping.source_extraction_ids`. The route reads the
  parent's list, then `SELECT … FROM extracted_rows WHERE extraction_id IN (…)` (indexed
  integer IN — not JSON containment). `aggregated_from = len(source_extraction_ids)`.
- **Leaf payload** (spec `CoaEntry.sourceLines`): `raw_label`, `raw_values`, `page`,
  `note_ref` — all from `extracted_rows`. `page` drives the **page-jump** (Q20).
- **Unmapped → resolve:** `UnmappedItem.source_extraction_ids` ties an unmapped row back
  to its extracted source; on drag-drop the inserted leaf is that row, and the resolve op
  preserves the IDs (as `republish_at_threshold.py` already does on promotion).
- **Per-row `coa_id` on `extracted_rows` is a denormalized convenience only** (powers the
  Workbench row→CoA column). It is written **from the same mapper outcome** in one place;
  `source_extraction_ids` remains the source of truth for aggregation membership, so the
  two cannot drift. If kept minimal, the Workbench may instead reverse-derive row→CoA from
  `source_extraction_ids` and drop the column — decided at Phase 1.
- **Stability note:** `extraction_id` re-mints on re-extraction (new run = new `Document`,
  Q15), so IDs are scoped per run — consistent with append-only run history.

### 4.3 Settings store

**B8 — `app_settings` (single-row) table** (or `settings.json`): `llm_provider`,
`llm_model`, `confidence_threshold`. The upload op reads these and passes them to the
pipeline as run args (Q17). Other mockup settings render read-only (Q21).

### 4.4 Python op layer (the subprocess contract)

**B9 — `webapi/ops.py`** — a thin CLI dispatch (`python -m webapi.ops <cmd> --json '…'`),
each command reusing existing `db.queries` / `spreading` / `export` code and printing a
JSON result to stdout. Commands:

| Command | Wraps | Returns |
|---|---|---|
| `run` | `run_pipeline(pdf, model, threshold)` detached; updates status | `{document_id}` (immediately); status via DB |
| `resolve_unmapped` | `db.queries.resolve_unmapped` | `{coa_mapping_id, remaining_unmapped, balance}` |
| `override_mapping` | `db.queries.override_coa_mapping` | `{coa_mapping_id}` |
| `save_mappings` | loop of resolve (drag-drop batch) | `{saved, balance}` |
| `recompute_balance` | `check_balance_sheet_identity` | balance JSON |
| `delete_document` | B7 cascade | `{deleted: true}` |
| `export` | `export/` writers (+ new JSON serializer) | file path / bytes |

**B10 — JSON exporter** (new, small) for Export Centre's JSON tier.

### 4.5 Migration & tests

**B11 — Additive migration script** (idempotent `ALTER TABLE` + `CREATE TABLE`, backup to
`.bak` first), matching the established pattern. New unit tests for: row/note/page
persistence, company/year capture, `webapi.ops` command I/O, delete cascade, JSON export.

**B12 — Test-corpus harness** (§7.0): `scripts/seed_test_corpus.py` runs the four
canonical fixtures (Aspect, Fubon, HDFC Credila, Infigen) through the pipeline into the
new schema (idempotent, latest-per-filename, backs up `spreadx.db` first), and
`webapi/test_corpus.py` exports the manifest (paths + expected row counts / type /
company / year) consumed by dev tooling and tests. This is the seed/reset mechanism used
across all build & test phases.

---

## 5. API Contract (Next.js routes → read or Python)

| Method · Path | Impl | Notes |
|---|---|---|
| `GET /api/documents` | TS read | latest-per-filename; Library rows |
| `GET /api/documents/[id]` | TS read | header, status, summary |
| `POST /api/upload` | Python `run` | stores PDF, spawns detached run |
| `GET /api/pipeline/[id]/status` | TS read | polls `pipeline_status`/`stage` (1.5s) |
| `GET /api/documents/[id]/rows` | TS read | `extracted_rows` (Workbench, Tree) |
| `GET /api/documents/[id]/notes` · `/notes/[n]` | TS read | `notes` |
| `GET /api/documents/[id]/validation` | TS read | balance + reconciliation JSON (2 checks) |
| `GET /api/spread/[id]` | TS read | CoA tree (`coa_mappings`+`coa_reference`+rows for children) |
| `GET /api/spread/[id]/unmapped` | TS read | `unmapped_items` (pending) |
| `POST /api/spread/[id]/mappings` | Python `save_mappings` | drag-drop save; returns balance |
| `POST /api/spread/[id]/resolve-unmapped` | Python `resolve_unmapped` | resolver confirm |
| `POST /api/spread/[id]/override` | Python `override_mapping` | workbench inline override |
| `GET /api/documents/[id]/export` | Python `export` | `?format=xlsx|json&tier=raw|reviewed` |
| `GET /api/usage` | TS read | aggregate `usage_result` across docs |
| `GET /api/coa-reference` | TS read | 184 CoA entries |
| `GET /api/settings` · `POST /api/settings` | TS read / Python or TS write | `app_settings` (functional subset) |
| `DELETE /api/documents/[id]` | Python `delete_document` | cascade + PDF removal |

**Data-contract translation** (TS ↔ backend), per gap analysis §7: map
`statement` ("Balance Sheet"/"P&L") ↔ `statement_type` (`balance_sheet`/`income_statement`);
`value_spread {year:value}` → `fy1Value/fy2Value`; suggestion `definition` via
`coa_id`→`CoaReference.definition`. The route layer owns this mapping.

---

## 6. Screen-by-Screen v1 Design

**Confidence colour bands (cosmetic, Q18):** ≥0.90 green · 0.75–0.89 amber · <0.75 red.
These are display-only and independent of the single mapped/unmapped gate.

1. **Document Library** — latest-per-filename list. Columns: Company, Year (B6),
   Template badge (`template_type`), Status (combined `pipeline_status`/`spread_status`),
   Health proxy (balance-pass + mapped ratio), Flagged proxy (unmapped/low-conf count),
   Spread Status pill, CoA-Mapped ratio (mapped / total `extracted_rows` BS+P&L). Filter
   pills client-side. Row → routes per status. Delete action (B7) with confirm.

2. **Upload & Classify (single-file only)** — dropzone → `POST /api/upload`; Document
   created `queued`; **coarse** PipelineProgress driven by polling `pipeline_status`
   (the 6 stage rows render, advancing on coarse status — full per-stage animation
   deferred). Run Summary card on `done` (counts + cost + links). Batch panel removed.

3. **Review Workbench** — left **PDF pane** (react-pdf viewer + prev/next; **row click →
   jump to `page`**, Q20; no line highlight). Right table from `extracted_rows`:
   raw label, values, **"Mapped CoA line item"** (`coa_id`→name; *no canonical column*,
   Q6), confidence band. Inline `<select>` override on low-confidence rows →
   `POST …/override` (optimistic). Note links → NoteDrawer (`notes`).

4. **Statement Tree** — accordion (IS / BS / CF / Notes Index) from `extracted_rows`
   hierarchy (`section_path`, `indentation_level`, `is_subtotal`); scope pills filter on
   `statement_scope`. Notes Index from `notes` → NoteDrawer.

5. **Validation** — **two cards only**: A=L+E balance (`balance_check_result`, with
   imbalance contributors) and Subtotal Reconciliation summary
   (`reconciliation_result`). No V01–V12, no re-validate engine (recompute via
   `recompute_balance` if needed).

6. **Export Centre** — tiers **Raw extraction** (`_extracted.xlsx`) and **Reviewed final**
   (`_spread.xlsx`, re-exportable from DB). Formats: **XLSX** (active) + **JSON** (B10).
   CSV/PDF shown disabled. Download via `GET …/export`.

7. **Spread Review** — 5 tabs: **BS · P&L** (CoA tree: parent = `CoaMapping`+`CoaReference`,
   expandable **source-line children** from `extracted_rows` via per-row `coa_id`),
   **Unmapped Items**, **Confidence & Source**, **Learned Mappings**. **Reconciliation
   overlay** (Q7): subtotal nodes carry a PASS/FAIL chip + "missing leaf" flag from
   `reconciliation_result`; parents show `aggregated_from`. Source chips
   learned/claude/manual; Learned badge → `LearnedMapping.source_document`.

8. **Compare & Resolve (3-pane)** — Pane 1 **PDF** (viewer + page jump, unmapped-source
   rows listed; no pixel highlight). Pane 2 **CoA tree** = Screen 7 tree + each parent a
   **@dnd-kit drop target**. Pane 3 **Unmapped** draggable (`claude_suggestions`).
   Drop → optimistic leaf insert + Save bar → `POST …/mappings` (Python) → balance
   indicator updates from the returned `balance`.

9. **LLM Cost** — KPIs + 4 Recharts from aggregated `usage_result`: cost-per-doc
   (stacked extraction/spreading), stage donut, token breakdown, **Scanned-vs-Digital**
   (now available via `page_summary`, B3). "Saved via Learning" KPI = **deferred/optional**
   (not computed; show "—" or omit).

10. **Unmapped Resolver** — list / detail / 3 suggestion cards (defs via
    `coa_reference`) / confirm → `POST …/resolve-unmapped` (Python; stores to learning
    store). Progress bar from status counts; auto-advance (optimistic). **Best-supported
    screen — minimal new backend.**

11. **Settings** — **functional**: model, provider, single confidence threshold
    (`app_settings`, B8) → used by the next run (Q17). **Read-only/disabled** (Q21):
    4-band thresholds, equity toggle (always on), auto-run Stage 11 (always on), prompt
    caching (unused), output paths — each with an explanatory tooltip. No API-key field
    (env-managed).

---

## 7. Build Plan (phased)

Each phase ends green (typecheck + the noted acceptance) before the next starts.
Phases 2–6 can read against the **seeded test corpus** (§7.0), so frontend work isn't
blocked on the upload path.

### 7.0 Test Corpus & Fixtures

Four real annual reports are the **canonical test set** for the whole build, driving
every screen Upload → Extract → Map → Final report. They are chosen for coverage:
digital + scanned, 19–225 rows, four templates, all realistically unbalanced. PDFs live
in `Financials_Provided/` (gitignored); each already has golden `_extracted.xlsx` /
`_spread.xlsx` outputs and historical DB runs.

| # | File (`Financials_Provided/…`) | Company / Year | Type | Rows | Mapped/Unmapped | Est. live $ | Role in testing |
|---|---|---|---|---|---|---|---|
| 1 | `Aspect Capital Limited_2023.pdf` | Aspect Capital / 2023 | UK scanned | ~95 | ~23 / 37 | ~0.73 | Reconciliation-heavy (17 subtotals, UK net-assets, neg L+E); scope filter; scanned PDF pane |
| 2 | `Fubon Securities Co Ltd_2017.pdf` | Fubon Securities / 2017 | Taiwan digital (3d/2s) | ~225 | ~56 / 41 | ~2.12 | Largest; many unmapped → resolver/drag-drop; big imbalance for Validation |
| 3 | `hdfc credila 2023.pdf` | HDFC Credila / 2023 | Indian digital NBFC | ~123 | ~40 / 37 | ~1.09 | Digital path; mapped-tree + leaf drill-down; export tiers |
| 4 | `Infigen Energy (Eifel) Limited 2008.pdf` | Infigen Energy / 2008 | scanned | ~19 | ~14 / 4 | ~0.33 | Smallest/cheapest → fast iteration, routine e2e, delete test |

**Two roles:**
- **(A) Golden fixtures** — after Phase 1, run all four **once** (live LLM) to populate
  the new persistence (`extracted_rows`, `notes`, `page_summary`, company/year/template).
  The resulting DB + the existing `_extracted`/`_spread` workbooks are the **oracles** the
  read screens (Phases 2–4, 6) render against and are checked by — **no further LLM spend**
  for those phases.
- **(B) End-to-end pipeline test** — in Phase 5, the same four exercise the live
  Upload → Extract → Map → Report flow through the web UI.

**Cost discipline.** A full live pass of all four ≈ **$4.27** (list price). Spend only
where needed: seed **once** in Phase 1; reuse that persisted data for read-screen phases;
in Phase 5 use **Infigen (~$0.33)** for routine e2e and add HDFC (digital) + Aspect
(scanned) for breadth; reserve full four-file live runs for milestone/regression
checkpoints. Each seeding run backs up `spreadx.db` to `.bak` first (resettable).

**Harness — B12 (added to Phase 1):** `scripts/seed_test_corpus.py` runs the four files
through `run_pipeline(..., run_spreading=True)` with the new persistence, idempotently
(latest-per-filename), and a `webapi/test_corpus.py` manifest (paths + expected
characteristics from the table above) that dev tooling and tests import. This is how the
corpus is loaded and reset throughout build & test.

### Phase 0 — Foundations ✅ DONE (2026-06-10)
- Scaffolded `web/` (**Next.js 16** / React 19, TS, Tailwind v4) + Sidebar/Topbar shell +
  CSS tokens (spec §2). *(react-pdf, recharts, shadcn/ui deferred to the phases that use
  them; core state/query/DnD libs installed.)*
- `lib/db.ts` (better-sqlite3, **WAL**, read helpers) + `lib/python.ts` (subprocess + JSON).
  WAL enabled on `spreadx.db`.
- `webapi/ops.py` dispatch skeleton (B9) with the `echo` command.
- **Acceptance — PASSED:** app boots; `/api/coa-reference` returns 184 real rows;
  `/api/health` round-trips the Python op (both bridges verified live).

### Phase 1 — Backend persistence (B1–B6, B11, **B12 corpus harness**) — ✅ DONE (2026-06-10)
- ✅ New tables `extracted_rows`, `notes` (`db/models.py`); new `documents` columns; `page_summary`.
- ✅ Orchestrator persists rows (with per-row CoA outcome from the mapper's new
  `row_outcomes`), notes, page summary; captures company (`_derive_company`) + fiscal
  year (`_derive_fiscal_year`); sets `pipeline_status='done'`. `pdf_path` recorded by the
  seed harness. *(Upload-time Document creation deferred to Phase 5; CLI/seed unchanged.)*
- ✅ Migration `scripts/migrate_phase1.py` (`.bak` backup + idempotent ALTER + create_all),
  applied to `spreadx.db`. Insert/read helpers in `db/queries.py`.
- ✅ **B12:** `scripts/seed_test_corpus.py` + `webapi/test_corpus.py` manifest.
- ✅ Tests: `tests/unit/test_phase1_persistence.py` (9 new) green; full suite **173 passed**
  (+9, 0 regressions; 15 pre-existing fixture-absence errors unchanged).
- ✅ **Validated live on Infigen** ($0.33): 19 extracted_rows persisted with per-row
  CoA outcomes, page_summary `{scanned:2}`, company/year `Infigen Energy (Eifel) Limited·2008`,
  and `source_extraction_ids ↔ extraction_id` traceability intact.
- ✅ **All four corpus docs seeded** (total ≈ $4.27): Aspect (95 rows, 6 scanned),
  Fubon (225, 3d/2s), HDFC (123, 4 digital — nominal classification, post-reroute fix),
  Infigen (19, 2 scanned). Each has company/year, page_summary, `pdf_path`, and intact
  `source_extraction_ids ↔ extraction_id` traceability. **Phase 1 acceptance met.**
- **Acceptance:** seeding the **four corpus files** populates the new tables;
  `extracted_rows` count per doc matches the row count in that file's `_extracted.xlsx`;
  `page_summary` digital/scanned matches known type (Aspect/Infigen scanned, Fubon/HDFC
  digital); company/year/template captured (Aspect Capital·2023, Fubon·2017, HDFC
  Credila·2023, Infigen·2008); 164 existing tests still green + new persistence tests pass;
  CLI/Streamlit unaffected.

### Phase 2 — Read APIs + Library + Spread Review (read-only) — ✅ DONE (2026-06-10)
- ✅ Routes: `/api/documents`, `/api/documents/[id]`, `/api/documents/[id]/rows`,
  `/api/spread/[id]`, `/api/usage` (+ `/api/coa-reference` from Phase 0). Read layer
  expanded in `web/lib/db.ts` (documents/spread-tree/rows/usage, JSON parsing, fy1/fy2,
  reconciliation overlay). Library filters to Phase-1+ docs (`page_summary` set) so stale
  pre-Phase-1 runs don't surface.
- ✅ Screens **1 Document Library** (`DocumentTable`, filter pills, health/flagged proxies,
  latest-per-filename, row→`/spread/[id]`) + **7 Spread Review** (`SpreadReview` 5 tabs +
  reusable `CoaTree` with extraction-id leaf drill-down + reconciliation overlay +
  balance/recon banner). Shared `ui.tsx` (ConfidenceBar/SourceChip/StatusPill/HealthBar/
  ReconChip), `format.ts`.
- ✅ **Acceptance PASSED (verified live):** Library lists the 4 corpus docs; **Aspect**
  shows recon PASS/FAIL chips on subtotals (8 foot/0 fail/3 incomplete); **HDFC** leaf
  drill-down via `source_extraction_ids`, and aggregated `BS-079` leaf-sum (−80,355) ties
  exactly to the parent. Production build typechecks clean.
- **(Original acceptance text:)** Library lists the **four corpus docs** (latest-per-filename) with
  template/company/year; **Aspect**'s Spread tree shows reconciliation PASS/FAIL chips on
  its subtotals; **HDFC**'s tree expands with leaf drill-down whose `source_extraction_ids`
  leaves match its `_extracted.xlsx` rows and whose fy1 leaf-sum ties to the parent.

### Phase 3 — Resolve write path (Python) + Resolver + Compare — ✅ DONE (2026-06-10)
- ✅ `webapi/ops.py`: `resolve_unmapped`, `save_mappings` (per-item atomic + per-item
  errors), `override_mapping`, `recompute_balance` (+ `_recompute_balance` helper).
  Write routes `/api/spread/[id]/resolve-unmapped|mappings|override`. `lib/api.ts` client
  helpers; `Toast` (zustand) for feedback.
- ✅ Screens **10 Unmapped Resolver** (`UnmappedResolver` — list/detail/suggestion cards,
  optimistic confirm + auto-advance, progress bar) + **8 Compare & Resolve**
  (`CompareResolve` — @dnd-kit 3-pane drag-drop, optimistic green leaves, save bar,
  balance chip; PDF pane stubbed for Phase 4). Spread Review links to both.
- ✅ **Backend fix:** `resolve_unmapped`/`override_coa_mapping` now carry
  `source_extraction_ids` onto the new mapping **and** update `extracted_rows`
  (`mapping_status`/`coa_id`), so resolved lines keep leaf traceability; `getSpreadTree`
  merges mappings by `coa_id` (one row per CoA, leaves combined).
- ✅ **Acceptance PASSED (verified live, DB restored after):** Fubon resolve persisted +
  learned mapping + balance recompute; resolved leaf `#49` appears under the merged
  `PL-051` node (source `manual`); Aspect drag-drop `save_mappings` saved with
  `source_extraction_ids`; forced bad-id → HTTP 500 (rollback path). Tests: **176 passed**
  (+3 `test_ops.py`); production build typechecks clean.
- **(Original acceptance:)** resolving an unmapped item in **Fubon** (41 pending) persists via Python,
  inserts a `LearnedMapping`, and refreshes the balance; a **drag-drop** save in **Aspect**
  inserts the leaf via `source_extraction_ids` and updates the balance banner; optimistic
  rollback works on a forced error.

### Phase 4 — Workbench + Statement Tree + Notes + PDF pane — ✅ DONE (2026-06-10)
- ✅ Routes: `/api/documents/[id]/notes`, `/api/documents/[id]/pdf` (streams retained PDF).
  Read helpers `getNotes`/`getWorkbenchRows`(+mappingId for override)/`getCoaOptions`/
  `getDocumentPdfPath`; `page` added to unmapped detail.
- ✅ **PDF pane via native browser viewer** (`PdfPane` = `<iframe src=…/pdf#page=N>`,
  remount-to-jump) instead of react-pdf — Q20 is page-level only, and this avoids the
  pdfjs-worker/SSR friction in Next 16/React 19 (swap in react-pdf later only if
  line-level highlighting is ever needed; **react-pdf NOT installed**).
- ✅ Screens **3 Review Workbench** (`ReviewWorkbench` — rows table, "Mapped CoA line
  item", inline `<select>` override on flagged <0.75 rows → optimistic + `override`, PDF
  page-jump on row click, statement filter, note links) + **4 Statement Tree**
  (`StatementTree` — IS/BS/CF/Equity accordions, indentation/subtotals, scope filter,
  Notes Index) + `NoteDrawer`. Compare PDF pane wired (page-jump on unmapped click);
  Spread Review links to Workbench/Tree.
- ✅ **Acceptance PASSED (verified live, DB restored):** Infigen PDF served (200, 69KB);
  inline override `PL-001→PL-002` persisted (mapping + extracted_row re-pointed) and the
  spread tree now shows `PL-002`; Aspect Statement Tree renders with scope pills.
  Production build typechecks clean.
- ⚠️ **Data note:** the 4 corpus docs have **0 extracted notes** (153 rows carry a
  `note_ref`, but the note *pages* weren't captured during extraction), so the NoteDrawer
  has no content to open on this corpus — refs render as muted text; the drawer is built +
  wired and works when notes exist. (Improving note-page capture is an extraction concern,
  not a frontend one.)
- **(Original acceptance:)** on **Infigen** (small/fast), a row click jumps the PDF to that row's
  `page`, an inline override persists and shows in the Spread tree, and a note opens in the
  drawer; on **Aspect**, the Statement Tree hierarchy + consolidated/standalone scope
  filter render correctly over the scanned PDF.

### Phase 5 — Upload pipeline + Validation + Export — ✅ DONE (2026-06-10)
- ✅ Backend: threaded a pre-created `document_id` through `run_pipeline`/
  `run_coa_mapping_stage` (B4); `create_document(doc_id=…)`. New ops `register_upload`
  (fast, status=processing), `run_pipeline` (detached, loads `.env`, updates
  `pipeline_stage`, sets done/error), `export` (XLSX reviewed via
  `service.export_spread_xlsx` + raw via DB-shim `build_raw_extraction_xlsx` + JSON).
  `runDetached` in `lib/python.ts`; `default=str` in the op JSON dump (datetimes).
- ✅ **B13:** `_recompute_reconciliation` (rebuilds rows+outcomes from `extracted_rows`,
  re-applies signs) wired into resolve/save/override via `_refresh_checks` (balance +
  reconciliation both refresh on edits); DB-backed export reflects all post-resolve state.
- ✅ Routes: `POST /api/upload`, `GET /api/pipeline/[id]/status`,
  `GET /api/documents/[id]/validation`, `GET /api/documents/[id]/export`,
  `POST /api/spread/[id]/recompute`. Read helpers `getPipelineStatus`/`getValidation`.
- ✅ Screens **2 Upload** (`UploadClient` — dropzone, detached run, 1.5s status poll,
  6-step progress driven by `pipeline_stage`, Run Summary) + **5 Validation**
  (`ValidationView` — A=L+E card w/ contributors + reconciliation card + Re-validate) +
  **6 Export Centre** (`ExportCentre` — Raw/Reviewed tiers × XLSX/JSON; CSV/PDF disabled).
  Spread Review hub links to Validation/Export.
- ✅ **Acceptance PASSED (live e2e, $0.31, DB restored after):** uploading Infigen via the
  UI created a `processing` doc that advanced `queued→S4b→S5→S11→Done` (~3.8 min) and
  appeared in the Library + spread tree; Aspect Validation shows recon 8-foot/0-fail/3-incomplete;
  HDFC export downloads — reviewed XLSX (43KB), raw XLSX (14KB), reviewed JSON (142KB).
  176 Python tests pass; production build clean (26 routes).
- 💡 **Cost note:** ran only the Infigen upload e2e ($0.31); the HDFC/Aspect "breadth"
  uploads were skipped (validation/export verified on existing seeded docs) to save ~$1.82.
- **(Original acceptance:)** `POST /api/upload` (detached `run` + status), `GET /pipeline/[id]/status` polling;
- **B13 — Resolve→export consistency (added 2026-06-10):** (a) **recompute reconciliation
  on resolve/override** (today only the balance is recomputed, so the reconciliation sheet
  goes stale after analyst edits) — recompute `reconciliation_result` in
  `resolve_unmapped`/`override` (or at export time); (b) **wire the DB-backed XLSX export**
  via `webapi.ops export` → `service.export_spread_xlsx` so a download reflects all
  post-resolve DB state (mappings, balance, reconciliation). Also consider applying the CoA
  **sign convention** to resolved-line `value_spread` (currently raw, `sign_applied=False`).
- **Acceptance (live e2e):** uploading **Infigen** (~$0.33) creates a `processing` doc that
  reaches `done` and appears across the read screens; repeat once each for **HDFC**
  (digital) and **Aspect** (scanned) for breadth; Validation cards reflect **Aspect**
  (reconciliation) and **Fubon** (large imbalance); XLSX + JSON download for **HDFC** in
  both tiers.

### Phase 6 — LLM Cost + Settings — ✅ DONE (2026-06-10)
- ✅ **B8 app_settings:** new `AppSettings` model (single row; create_all auto-creates),
  `get_settings`(config defaults)/`update_settings` queries, `get_settings`/`save_settings`
  ops + `/api/settings` (GET/POST via Python). `run_pipeline` op now sources model +
  threshold from `app_settings` (Q17).
- ✅ Screen **9 LLM Cost** (`CostView`, recharts) — 5 KPIs + 4 charts: cost-per-doc stacked,
  stage donut, token breakdown, Scanned-vs-Digital; "Saved via Learning" omitted.
  `getUsageDetail` aggregates per-doc by-stage cost/tokens + docType from `page_summary`.
- ✅ Screen **11 Settings** (`SettingsView`) — functional model cards + provider + single
  confidence-threshold slider (→ `app_settings`); 4-band thresholds / equity / auto-Stage-11 /
  prompt-caching / output-paths rendered read-only with tooltips (Q21).
- ✅ **Acceptance PASSED (verified live, DB restored after):** cost aggregate reconciles
  ($4.264; scanned avg $0.52 [Aspect/Infigen] vs digital $1.61 [HDFC/Fubon]); changing the
  threshold in Settings (0.55→0.20) and re-uploading Infigen changed the split **13→17 mapped /
  6→2 unmapped** ($0.31). 176 Python tests pass; build clean. *(recharts SVGs render
  client-side via ResponsiveContainer — not in SSR HTML; KPIs/data verified server-side.)*
- **Acceptance:** cost charts aggregate the **four corpus** `usage_result`s and reconcile
  with their sum; Scanned-vs-Digital separates **Aspect/Infigen** (scanned) from
  **Fubon/HDFC** (digital); changing the threshold in Settings then re-running **Infigen**
  changes its mapped/unmapped split.

### Phase 7 — Delete, polish, E2E — ✅ DONE (2026-06-10) · v1 COMPLETE
- ✅ **B7:** `delete_document` query (cascade rows/notes/mappings/unmapped; **preserves
  learned mappings**, nulls their `source_document_id`) + op (removes the retained PDF,
  **guarded to `web/uploads/`** so seeded-corpus PDFs are never deleted) +
  `DELETE /api/documents/[id]`. Library delete button + confirm modal + optimistic removal.
- ✅ Polish: global `error.tsx` + `not-found.tsx`; toasts; empty states across screens;
  DnD keyboard a11y via @dnd-kit `KeyboardSensor` + spread attributes; height-chain
  (`flex:1; min-height:0; overflow:hidden`) on Compare/Resolver verified.
- ✅ **Acceptance PASSED (verified live, DB restored after):** delete removed the doc's PDF
  (uploads) + rows + mappings; the **corpus PDF was protected by the guard**; the learned
  mapping survived with `source_document_id` nulled. Full **11-screen + 9-API click-through
  all 200** on a corpus doc. 177 Python tests pass; production build clean.
- **🎉 v1 complete:** all 11 screens except batch upload (per Q16). Deferred items remain in
  §10 (batch, V01–V12, line-level PDF highlight, CSV/PDF export, "Saved via Learning", auth).
- **(Original acceptance:)** deleting one **Infigen** run removes its PDF + rows + mappings while
  global learned mappings survive; a full click-through of all 11 screens passes across the
  **four corpus** docs plus one freshly-uploaded doc.

---

## 8. Dependency Map (what unblocks what)

```
Phase 0 (scaffold + db + ops skeleton)
  └─ Phase 1 (persist rows/notes/pages + Document lifecycle)
       ├─ Phase 2 (Library, Spread Review)          ── needs rows for source-line children
       ├─ Phase 3 (Resolver, Compare)               ── needs ops write path
       ├─ Phase 4 (Workbench, Tree, Notes, PDF)     ── needs rows + notes + PDF retention
       ├─ Phase 5 (Upload, Validation, Export)      ── needs Document-at-upload + status
       └─ Phase 6 (Cost, Settings)                  ── needs page_summary + app_settings
  Phase 7 (delete + polish) ── after the screens it cleans up
```

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Subprocess write latency** (~0.5–1.5s/op) | Optimistic UI; reconcile on result; consider a persistent Python sidecar later if it grates |
| **SQLite read-during-write** | WAL mode + `busy_timeout`; single logical writer (Python) |
| **Company/year capture quality** | Filename-parse fallback; surface as editable later if needed |
| **PDF page-jump accuracy** depends on `ExtractedRow.page` correctness | Acceptable for v1 (page granularity); line-level deferred (Q20) |
| **Long pipeline runs vs request timeouts** | Detached subprocess + poll, never a blocking HTTP call |
| **Orchestrator change (Document-at-upload) regressing CLI** | Keep the create idempotent; full existing test suite must stay green (Phase 1 gate) |
| **Re-run DB growth** (Q15 append-only) | User-driven delete (B7); Library shows latest-per-filename |

---

## 10. Out of Scope (v1) — deferred backlog

Batch upload · per-stage live progress animation · V01–V12 validation engine ·
line-level PDF highlight + cross-highlight (needs extraction coordinate capture) ·
CSV/PDF export · standalone reconciliation tab · per-run model/threshold overrides ·
4-band confidence model · "Saved via Learning" KPI · multi-user/auth · Postgres /
server hosting · Electron "Browse" path pickers · provider connection/latency indicator.

---

## 11. Approval checklist (before implementation)

- [ ] Architecture (§3) — `web/` monorepo + shared WAL SQLite + Python ops layer
- [ ] Backend change list (§4, B1–B11) — additive schema + orchestrator persistence
- [ ] API contract (§5) — read-in-TS / write-via-Python split
- [ ] v1 screen scope (§6) + out-of-scope (§10)
- [ ] Phased build plan (§7) and acceptance gates

*On approval, implementation begins at Phase 0. No code will be written before sign-off.*
