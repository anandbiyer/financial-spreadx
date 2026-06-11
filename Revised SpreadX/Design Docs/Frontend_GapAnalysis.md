# Financial SpreadX — Frontend ↔ Backend Gap Analysis

**Version 1.0 · 2026-06-10**
Evaluates `SpreadX_Frontend_Spec_v1_2.md` + `SpreadX_Interactive_v6.html` (mockup)
against the **implemented Python backend** (`Revised_SpreadX`, branch
`stage11-spreading-traceability-usage`).

Purpose: a feature-by-feature matrix showing **which frontend features can be enabled
on the backend as it stands today**, and **which require additional backend development**
— with the specific data/logic gap named for each.

> No implementation has been started. This is an evaluation document only.

---

## 1. Executive Summary

The backend is a **CLI + Streamlit pipeline**, not a service. Its data layer (SQLite
via SQLAlchemy) persists **only the Stage 11 spreading outputs** — it does **not**
persist the upstream extraction artifacts (raw rows, notes, page classification, page
images). This single fact drives most of the gaps below.

**Three structural realities shape everything:**

| # | Reality | Consequence for the frontend |
|---|---------|------------------------------|
| **A** | **No HTTP/API layer exists.** The pipeline runs synchronously from `main.py`/Streamlit. | Every `/api/*` route in spec §6 must be built from scratch (Next.js routes → Python via subprocess/FastAPI, or port logic to TS reading the same SQLite DB). This is a prerequisite for *all* screens, but it is integration work, not new analytical capability. |
| **B** | **Only Stage 11 outputs are persisted.** `Document`, `CoaMapping`, `UnmappedItem`, `LearnedMapping`, `CoaReference` are in the DB. **Raw extracted rows, notes, and page classification are in-memory only** and discarded after each run. | The **Spread / Output** screens are well-supported. The **Extract / Ingestion** screens are largely *not*, because their source data is never saved. |
| **C** | **No async job system.** A run is one blocking call; there is no `jobId`, per-stage status, or batch queue. | Live pipeline progress (Screen 2) and batch mode need a job-orchestration layer that does not exist. |

**Bottom line by screen:**

| Tier | Screens | Status |
|------|---------|--------|
| 🟢 **Ready** (data + logic exist; needs API/UI wiring only) | **10 Unmapped Resolver**, **7 Spread Review** (aggregate level), **9 LLM Cost** (most), **6 Export** (XLSX) | Backend already produces and persists everything needed. |
| 🟡 **Partial** (core data exists; needs moderate backend additions) | **1 Document Library**, **8 Compare & Resolve** (minus PDF pane), **4 Statement Tree** | Resolve logic / aggregate data present, but missing fields (health, flagged, per-source-line detail) or persistence (extracted rows). |
| 🔴 **Needs backend development** (data/logic absent) | **2 Upload & Classify** (live progress/batch), **3 Review Workbench**, **5 Validation**, **11 Settings** | Requires new persistence (extracted rows, notes, pages), a validation engine, a settings store, and/or a job system. |

---

## 2. What the backend persists today (the source of truth)

**Persisted in SQLite** (survives a run, queryable by a frontend):

- **`Document`** — `id`, `filename`, `template_type` (T0–T8), `scope`
  (consolidated/standalone/group/unknown), `spread_status`, `unmapped_count`,
  `balance_check_result` (JSON), `reconciliation_result` (JSON), `usage_result`
  (JSON token/cost), `created_at`.
- **`CoaMapping`** — `coa_id`, `raw_label`, `statement_type`, `confidence`,
  `rationale`, `mapping_source` (claude/learned/manual), `learned_mapping_id`,
  `value_spread` (`{year: value}`, **sign applied**), `sign_applied`,
  `aggregated_from` (count of merged source rows), `source_extraction_ids` (list).
- **`UnmappedItem`** — `raw_label`, `canonical_field`, `statement_type`,
  `value_spread` (raw, unsigned), `claude_suggestions` (top-3 `{coa_id, score,
  reason}`), `ambiguity_note`, `source_extraction_ids`, `status`
  (pending/resolved/skipped/not_spread), `resolved_coa_id/at/by`.
- **`LearnedMapping`** — `canonical_field`, `coa_id`, `learned_confidence`,
  `rationale`, `source_document(_id)`, `times_applied`, `last_applied_at`,
  `times_overridden`.
- **`CoaReference`** — 184 entries: `coa_id`, `line_item_name`, `statement`,
  `broad_category`, `sub_category`, **`definition`**, `spreading_guidance`,
  `sign_convention`, `is_subtotal`, `is_memo_item`.

**Produced but NOT persisted (in-memory, lost after the run):**

- **`ExtractedRow`** — `raw_label`, `raw_values` (`{year: value}`), `section_path`,
  `indentation_level`, `is_subtotal`, `note_ref`, `statement_type`,
  `statement_scope`, `page`, `column_metadata`, `extraction_id`. *(No per-row
  confidence field exists at all.)*
- **`NoteExtraction`** — `note_number`, `note_title`, `summary`, `sub_tables`.
- **`ClassifiedPage`** — `classification` (digital/scanned/hybrid), `page_number`,
  `image_buffer` (PNG, **explicitly cleared** after vision use), section types.

**Does not exist anywhere:**

- Validation rule framework (V01–V12). Only the **A = L + E balance check** and
  **subtotal reconciliation** exist.
- Settings persistence (config is env-var + in-memory only).
- Any web server / API / async job or batch orchestration.
- Structured **company/year** (only the raw `filename`), `healthScore`,
  `flaggedCount`, extraction-status lifecycle (only `spread_status`).

---

## 3. Master Feature Matrix

**Legend:** 🟢 Ready (wire only) · 🟡 Partial (moderate backend add) · 🔴 Needs backend development

| Screen / Feature | Status | Backend data/logic available | Gap → backend work needed |
|---|---|---|---|
| **Cross-cutting: `/api/*` layer** | 🔴 | None — CLI/Streamlit only | Build the HTTP layer (Next.js routes → Python subprocess/FastAPI, or TS reading SQLite). Prereq for all screens. |
| **Cross-cutting: company/year fields** | 🟡 | `Document.filename` only | Parse or extract company name + fiscal year into structured `Document` columns. |
| **1 · Document Library — list, template badge, spread status, CoA-mapped numerator, filter pills** | 🟡 | `Document` table: `template_type`, `spread_status`, `unmapped_count`; mapped count = `COUNT(CoaMapping)` | Library only lists docs that ran **Stage 11** (extract-only runs create no `Document`). |
| · Health bar (`healthScore`) | 🔴 | Not produced | Define + compute a health score. |
| · Flagged count | 🔴 | Not produced (no per-row confidence/flagging) | Requires extracted-row persistence + a flag rule. |
| · Extraction status (queued/processing/needs_review/approved/error) | 🔴 | Only `spread_status` exists | Add an extraction-status lifecycle to `Document`. |
| · CoA-Mapped ratio **denominator** (e.g. 28/**49**) | 🟡 | Numerator yes; total mappable rows not persisted | Persist total extracted BS/P&L row count per doc. |
| **2 · Upload & Classify — drop zone + trigger pipeline** | 🟡 | Pipeline exists (`run_pipeline`) | Wrap as an upload endpoint that stores the PDF and launches a run. |
| · Live PipelineProgress (S2→S11, 1.5 s poll) | 🔴 | Synchronous run; no job/status store | Build async job runner + `jobId` + per-stage status endpoint (SSE/poll). |
| · Run Summary card | 🟢 | Counts + cost available post-run | Return the run summary from the job. |
| · Batch mode (up to 10, queue, per-row status) | 🔴 | Single-file CLI only; no queue | Build batch orchestration + per-file status. |
| · Stage 11 toggle / model / confidence controls | 🟡 | `--spread`, `ANTHROPIC_MODEL`, `SPREAD_CONFIDENCE_THRESHOLD` exist | Surface as request params; no persistence needed for a single run. |
| **3 · Review Workbench — extracted-row mapping table** | 🔴 | **Raw extracted rows not persisted** | Persist `ExtractedRow` (table + write step). Core blocker for this screen. |
| · Per-row confidence + flagged tint (75–89) | 🔴 | `ExtractedRow` has **no confidence field** | Produce + persist per-row extraction confidence. |
| · Inline `<select>` canonical override | 🔴 | No extracted-row store, no override API at row level | Persist rows + add a row-level override/correction endpoint. |
| · PDF pane (`react-pdf`) | 🟡 | PDFs not retained by backend | Retain the uploaded PDF on disk + serve it. (File display only.) |
| · PDF ↔ table cross-highlight | 🔴 | No per-row bounding-box / coordinates produced | Capture source-line coordinates during extraction. |
| · Note links → NoteDrawer | 🔴 | **Notes not persisted** | Persist `NoteExtraction` + add a notes endpoint. |
| **4 · Statement Tree — accordion BS/P&L/CF/Notes** | 🟡 | Hierarchy fields (`section_path`, `indentation_level`, `is_subtotal`, `note_ref`, `page`) **exist on `ExtractedRow` but are not persisted** | Persist extracted rows (the model already carries every field the tree needs). *Note: contrary to the initial assumption, extraction data is **produced** but **not saved** — a moderate persistence add is required.* |
| · Notes Index sub-tree | 🔴 | Notes not persisted | Persist `NoteExtraction`. |
| · Consolidated/Standalone scope filter | 🟡 | `statement_scope` on rows; `Document.scope` persisted | Persist rows to filter at row level. |
| **5 · Validation — V01–V12 cards, re-validate** | 🔴 | **No validation framework** | Build a validation-rule engine + persistence. |
| · Balance-check card (A=L+E) | 🟢 | `Document.balance_check_result` (full per-year + contributors) | Surface existing JSON as one/two cards. |
| · Subtotal-reconciliation card | 🟢 | `Document.reconciliation_result` (PASS/FAIL/INCOMPLETE per subtotal) | Surface existing JSON. |
| **6 · Export Centre — XLSX download** | 🟢 | `export/` writes `_extracted.xlsx` + 7-sheet `_spread.xlsx`; spread is re-exportable from DB | Serve the file via a download endpoint. |
| · JSON export | 🟡 | Data in DB, no JSON exporter | Add a JSON serializer (trivial). |
| · Tier selector (raw / canonical / reviewed) | 🟡 | Raw xlsx + spread xlsx = 2 tiers; "reviewed" = post-resolution re-export | Map tiers to the two existing exports; raw tier needs the retained extraction file. |
| · CSV / PDF export | 🔴 | Deferred (also deferred in spec) | Out of scope for v1. |
| **7 · Spread Review — BS/P&L CoA tree (parent rows)** | 🟢 | `CoaMapping` (coa_id, value_spread signed, confidence, source, aggregated_from) + `CoaReference` (name, is_subtotal, category) | Wire to UI. Fully supported at the aggregate level. |
| · Expandable **source-line children** (rawLabel, value, page, noteRef, per-line confidence) | 🟡 | Only `source_extraction_ids` (IDs) + `aggregated_from` (count) persisted — **not** the per-line label/value/page/note | Persist extracted rows to render the child detail the spec's `SourceLine` requires. |
| · Source chips (learned/claude/manual) + Learned badge + `learnedFromDoc` | 🟢 | `mapping_source` + `learned_mapping_id` → `LearnedMapping.source_document` | Wire to UI. ("auto"/near-miss not distinctly tagged in `mapping_source` — minor.) |
| · Unmapped Items tab | 🟢 | `UnmappedItem` (status=pending) | Wire to UI. |
| · Confidence & Source tab | 🟢 | `confidence`, `mapping_source`, `source_extraction_ids` | Wire to UI. |
| · Learned Mappings tab | 🟢 | `LearnedMapping` fully queryable per doc | Wire to UI. |
| **8 · Compare & Resolve — 3-pane drag-drop** | 🟡 | See sub-rows | Functional minus the PDF pane. |
| · Pane 2 CoA spread tree (drop targets) | 🟢 | Same data as Screen 7 | Wire to UI. |
| · Pane 3 Unmapped items (draggable + top suggestion/score) | 🟢 | `UnmappedItem.claude_suggestions` | Wire to UI. |
| · Drag-drop → **Save Mappings** | 🟢 | **`resolve_unmapped()` exists** (atomic CoaMapping + LearnedMapping insert, status update, count recalc) | Add `POST /api/spread/[id]/mappings` calling it. Logic already built. |
| · Live balance-check update on save | 🟢 | `check_balance_sheet_identity()` recomputes from DB | Recompute + return on save. |
| · Pane 1 **Extracted Page image** (react-pdf, row highlight) | 🔴 | **Page images not stored** (`image_buffer` cleared); no PDF retained; no coordinates | Retain PDF/page rasters + capture per-row coordinates. (User's cited example — confirmed.) |
| **9 · LLM Cost — KPIs + charts** | 🟢 | `Document.usage_result` (by_stage extraction/spreading, in/out/cache tokens, cost) | Aggregate across docs; wire to Recharts. |
| · Cost-per-doc (stacked), stage donut, token breakdown | 🟢 | All in `usage_result` | Wire to UI. |
| · "Saved via Learning" KPI | 🔴 | Not computed | Estimate tokens/cost avoided by learned-store hits (learned mappings skip LLM calls). |
| · "Scanned vs Digital" chart | 🔴 | Page classification not persisted | Persist `ClassifiedPage` summary per doc. |
| **10 · Unmapped Resolver — list/detail/suggestions/confirm** | 🟢 | `UnmappedItem` (raw_label, statement, values, `ambiguity_note`, `claude_suggestions`) + `CoaReference.definition` for suggestion cards | **Best-supported interactive screen.** `resolve_unmapped()` already stores to the learning store. Wire to UI only. |
| · AI-rationale prefill | 🟢 | `ambiguity_note` / suggestion `reason` | Wire to UI. |
| · Progress bar (N/M resolved) | 🟢 | Derivable from `status` counts | Wire to UI. |
| **11 · Settings — model/provider/thresholds/toggles/paths** | 🔴 | **No settings persistence** (env-var + in-memory only) | Build a settings store + `GET/POST /api/settings`. |
| · Threshold sliders | 🟡 | `SPREAD_CONFIDENCE_THRESHOLD` exists (single value, not 4 bands) | Persist; the spec's 4-band model exceeds the backend's single gate. |
| · Connection indicator / latency | 🔴 | Not produced | Add a provider health check. |

---

## 4. Corrections to the briefing assumptions

The task framed three examples. Two hold; one needs a caveat:

1. **"Statement Tree can be implemented because extraction is done."**
   ⚠️ **Partly.** The extraction *logic* produces every field the tree needs
   (`section_path`, `indentation_level`, `is_subtotal`, `note_ref`, `page`), but
   those rows are **in-memory only and discarded after the run** — nothing is
   persisted for a frontend to read. Enabling Statement Tree requires a **moderate
   backend add: persist `ExtractedRow`** (the data model already exists; it just
   needs a table + a write step in the orchestrator). Not a from-scratch build, but
   not free either.

2. **"Spread view with tree breakdown can be implemented (Extraction IDs exist)."**
   ✅ **Yes at the aggregate level** — `CoaMapping` carries `coa_id`,
   `value_spread`, `confidence`, `source`, `aggregated_from`, and
   `source_extraction_ids`. ⚠️ The **expandable per-source-line children** (the
   spec's `SourceLine`: rawLabel/value/page/noteRef/confidence) need the same
   extracted-row persistence as #1, because only the *IDs* — not the line detail —
   are stored.

3. **"Compare view's extracted page image cannot be shown (PDFs/images not stored)."**
   ✅ **Correct.** Page rasters (`ClassifiedPage.image_buffer`) are explicitly
   cleared after vision extraction, the source PDF is not retained, and no per-row
   coordinates are captured. The left PDF pane of Screens 3 & 8 needs new backend
   work. The **rest of Compare & Resolve is ready** (the resolve logic exists).

---

## 5. Backend Development Backlog (prioritized)

Grouped by how many frontend features each unblocks.

### Tier 1 — Foundational (unblocks everything)
1. **API/service layer** — expose the DB + pipeline over HTTP. Decision needed:
   (a) Next.js routes → Python subprocess, (b) standalone FastAPI service, or
   (c) port read-side to TS over the same SQLite. *(See open question Q1.)*

### Tier 2 — High leverage (unblocks multiple Extract/Spread screens)
2. **Persist `ExtractedRow`** (new table + orchestrator write). Unblocks: Statement
   Tree (4), Spread Review source-line children (7), Review Workbench rows (3),
   CoA-mapped denominator (1), scope filtering (4).
3. **Persist `NoteExtraction`** + notes endpoint. Unblocks: NoteDrawer (3),
   Notes Index (4).

### Tier 3 — Per-screen capability
4. **Async job runner + status** (`jobId`, per-stage S2–S11 progress). Unblocks:
   live PipelineProgress (2).
5. **Batch orchestration** (queue, per-file status). Unblocks: batch mode (2).
6. **Validation engine** (V01–V12 rules + persistence; reuse existing balance +
   reconciliation as 2 rules). Unblocks: Validation (5).
7. **Settings store** + `GET/POST /api/settings`; reconcile 4-band thresholds vs the
   backend's single gate. Unblocks: Settings (11).

### Tier 4 — Enhancements
8. **Retain source PDF** + capture **per-row coordinates** / page rasters. Unblocks:
   PDF panes + cross-highlight (3, 8).
9. **Persist `ClassifiedPage` summary** (digital/scanned counts). Unblocks: Scanned
   vs Digital chart (9), and Run-Summary page stats.
10. **Structured company/year**, **health score**, **flagged count**,
    **extraction-status lifecycle**. Unblocks: full Document Library columns (1).
11. **"Saved via Learning" estimate** (tokens avoided by learned hits). Unblocks:
    that KPI (9).
12. **JSON exporter**. Unblocks: JSON tier (6).

---

## 6. Quick-win path (max screens, min backend)

To get a working demo soonest, in order:

1. **API layer** (Tier 1) → then these screens light up with **zero new analytical
   backend**: **Unmapped Resolver (10)**, **Spread Review aggregate (7)**, **Compare
   & Resolve minus PDF pane (8)**, **LLM Cost core (9)**, **Export XLSX (6)**, and a
   **basic Document Library (1)**.
2. **Persist `ExtractedRow`** (Tier 2 #2) → unlocks **Statement Tree (4)** and the
   **source-line drill-down** in Spread Review (7).

That sequence delivers ~6 of 11 screens before any work on notes, validation,
settings, jobs, batch, or PDF rendering.

---

## 7. Data-contract notes (frontend ↔ backend field reconciliation)

The spec's TypeScript interfaces (§5) don't match backend field names/shapes 1:1.
The API layer should translate:

| Spec field | Backend reality |
|---|---|
| `CoaEntry.statementType: 'balance_sheet' \| 'income_statement'` | `CoaReference.statement` = `"Balance Sheet"` / `"P&L"`; `CoaMapping.statement_type` = `balance_sheet`/`income_statement` |
| `CoaEntry.sourceLines[]` (rawLabel, pageNum, value, priorValue, noteRef, confidence) | Not persisted per line — only `source_extraction_ids` + `aggregated_from`. Needs `ExtractedRow` persistence. |
| `CoaEntry.source: 'auto'` | `CoaMapping.mapping_source` has `claude`/`learned`/`manual` only (no distinct `auto`) |
| `UnmappedItem.fy1Value` / `fy2Value` | `value_spread: {year: value}` dict — map years → FY1/FY2 |
| `UnmappedItem.topSuggestions[].definition` | Not on the suggestion; join `coa_id` → `CoaReference.definition` |
| `Document.healthScore` / `flaggedCount` | Not produced |
| CoA range `BS-001…BS-116 / PL-001…PL-068` (spec §6) | Backend = 184 entries; verify the exact BS/P&L split + ID ranges against `seed_coa` before hard-coding ranges |
| `AppSettings.thresholdAutoAccept/Review/Confirm/Floor` (4 bands) | Backend has a single `SPREAD_CONFIDENCE_THRESHOLD` gate |

---

## 8. Open questions for product/eng

### 8.1 Resolved (round 1, 2026-06-10)

| # | Question | Decision |
|---|---|---|
| Q1 | API strategy | **Next.js routes → Python subprocess.** |
| Q2 | Extraction persistence scope | **Persist all** (resolve exact scope in Q11). |
| Q3 | Validation framework | **Just the 2 existing checks** (A=L+E balance + subtotal reconciliation) for now — no V01–V12 engine. |
| Q4 | Threshold model | **Single `SPREAD_CONFIDENCE_THRESHOLD` gate** (not the 4-band model). |
| Q5 | Document Library scope | **List all annual reports uploaded and processed through the extraction + spreading pipeline.** |
| Q6 | Canonical field at extraction | **Remove it** — a canonical column in the Extract stage does not make sense in the port. Use the mapped CoA line item instead. |
| Q7 | Reconciliation surface | **No standalone tab for now** — reconciliation is an enrichment overlay on the CoA tree only. |

### 8.1b Resolved (round 2, 2026-06-10)

| # | Question | Decision |
|---|---|---|
| Q8 | Pipeline progress granularity | **Coarse status for v1** (`queued → processing → done/error`); per-stage S2→S11 tracker deferred. |
| Q11 | Persistence scope | **Persist all three** — extracted rows + notes + page-classification summary. |
| Q12 | Retain source PDF | **Retain**, *and* provide a **user-driven delete** mechanism (delete a report's PDF + its persisted run data). |
| Q13 | Company + Year origin | **Capture during extraction** (more reliable than filename parsing). |
| Q14 | Health / Flagged columns | **Simple proxies** — health = balance-pass + mapped ratio; flagged = unmapped / low-confidence count. |
| Q16 | v1 screen cut-list | **Batch mode DROPPED** for v1. **Settings screen IN.** **PDF / Compare left pane IN** (fidelity tier → Q20). |
| Q18 | Confidence colour bands | **Cosmetic** display thresholds: ≥0.90 green, 0.75–0.89 amber, <0.75 red (independent of the single gate). |
| Q19 | Auth / identity | **Single-user, no auth** for v1; fixed analyst id. |

### 8.2 Outstanding (round 3 — recommendations given, awaiting confirmation)

**Q9 — Write path (reuse Python vs reimplement TS).** *Recommendation:* **hybrid** —
reads direct in TS; correctness-critical writes (`resolve_unmapped`,
`override_coa_mapping`, save-drag-drop, balance recompute) go **through Python** to
avoid duplicating intricate learning-store / sign / balance logic; mask the ~0.5–1.5s
subprocess latency with **optimistic UI**. *Cost of reusing Python:* per-write process
startup + write-entrypoint plumbing + SQLite lock handling. *Cost of TS reimpl:* two
copies of central logic kept in sync forever (drift risk).

**Q10 — Repo layout & DB sharing.** *Recommendation:* **monorepo with a `web/`
subfolder** at the Python root; Python untouched at root. **Single shared
`spreadx.db` in WAL mode**; Python is the sole writer of pipeline data, Next.js reads
directly and delegates complex writes to Python. (SQLite is fine for single-user;
revisit → Postgres only if multi-user server hosting enters scope.)

**Q15 — Re-run semantics.** *Recommendation:* **new `Document` per run (append-only
history)**; Library shows **latest-per-filename**, older runs kept as history;
Q12 delete prunes growth. Non-destructive, enables run comparison, and the **global
learning store** means each re-run auto-improves. (Overwrite is simpler/smaller but
destroys per-run analyst resolutions + history.)

**Q17 — Run trigger & parameters.** *Recommendation:* **every upload runs the full
extract + Stage 11** (no extract-only path in v1, per Q5); **model + single confidence
threshold are sourced from persisted Settings** (global) and passed to the Python
subprocess as run args; **no per-run override UI** in v1.

**Q20 — PDF pane fidelity (NEW, from Q16).** Retaining the PDF (Q12) makes a viewer
feasible, but per-row highlight/cross-highlight needs **bounding-box coordinates the
backend does not produce.** Tiers: **(a)** viewer + page nav only; **(b)** page-level
jump (click row → PDF jumps to `ExtractedRow.page` — cheap, no new extraction work);
**(c)** line-level highlight (requires adding coordinate capture to extraction —
real backend work, feasibility of reliable boxes from the current prompt is unproven).
*Recommendation: (b) page-level jump for v1.*

**Q21 — Settings functional scope (NEW, from Q16).** Which Settings are **functional**
(persisted + passed to the pipeline) vs **display-only** in v1? Several mockup controls
are fixed/always-on in the port (equity always skipped; Stage 11 always runs; prompt
caching unused). *Recommendation: functional = model + provider + single confidence
threshold; render the rest read-only/disabled with an explanatory tooltip.*

### 8.x Outstanding (round 2 — superseded; see 8.1b / 8.2)

**A · Integration & architecture**
- **Q8 — Pipeline run model & progress granularity.** A run is long (LLM calls,
  minutes), so Next.js must spawn a **detached** Python subprocess that records
  progress, and the UI polls a status endpoint. Do we add a **run/job table** +
  instrument the pipeline to emit **per-stage S2→S11 progress** (for Screen 2's live
  tracker), or is a coarse `queued → processing → done/error` status enough for v1?
- **Q9 — Write path for analyst actions.** Should resolve-unmapped, override-mapping,
  and save-drag-drop go **through the Python subprocess** (reusing the tested atomic
  `resolve_unmapped()` / `override_coa_mapping()`), or be **re-implemented in TS**
  against the shared SQLite? *(Recommend: reuse Python — single source of truth, no
  logic drift.)*
- **Q10 — Repo layout & DB sharing.** Where does the Next.js app live (e.g. a
  `web/` subfolder beside the Python root)? Confirm both sides share the **single
  `spreadx.db`**, with Python as the only writer of pipeline data.

**B · Persistence scope**
- **Q11 — "Persist all" — exactly what?** Extracted rows only, or rows **+ notes
  (`NoteExtraction`) + page classification (`ClassifiedPage` summary)**? Notes unblock
  the NoteDrawer (3) / Notes Index (4); page classification unblocks the Scanned-vs-
  Digital chart (9) and run-summary page stats.
- **Q12 — Retain the source PDF on disk?** Needed for the Library, re-runs, the raw
  export tier, and any future PDF pane. If yes, where do uploaded PDFs live, and is the
  original filename the key?

**C · Document Library specifics**
- **Q13 — Company + Year origin.** The backend stores only `filename`. Derive
  Company/Year by **parsing the filename**, or add a light step to **capture them
  during extraction**? *(Parsing is cheaper; extraction is more reliable.)*
- **Q14 — Health bar & Flagged count.** Neither is produced today. **Drop them in
  v1**, or define **simple proxies** (e.g. health = balance-pass + mapped ratio;
  flagged = unmapped / low-confidence count)?
- **Q15 — Re-upload / re-run semantics.** A re-run of the same report — create a
  **new `Document` each run** (version history) or **replace / keep latest-per-
  filename**? Affects Library dedup and how IDs are shown.

**D · v1 scope / phasing**
- **Q16 — Which screens are in the first build vs deferred?** In particular:
  **Batch mode** (Screen 2) — in or out? **Settings** (Screen 11) — in or out, given
  the single threshold + env-managed keys? **PDF / Compare left pane** — drop for v1
  (no stored images)? A clear cut-list drives the build plan's phasing.
- **Q17 — Upload always runs full extract + Stage 11?** Is there any UI path for
  *extract-only*, and any **per-run model/threshold override** in the UI, or are those
  fixed from `config`/env for v1?

**E · UI semantics & access**
- **Q18 — Confidence colour bands.** The mockup colours confidence green/amber/red.
  With a single mapped/unmapped gate, are these bands **purely cosmetic display
  thresholds** (e.g. ≥0.90 green, 0.75–0.89 amber, <0.75 red), independent of the
  gate? Confirm the display cut-offs.
- **Q19 — Auth / analyst identity.** Single-user, **no auth** for v1, with a fixed
  analyst id (e.g. `"AS"` written to `resolved_by`)? Or is multi-user / login in scope?

---

## 9. Review: the "Canonical Field" in the Review Workbench

**Question:** the mockup (Screen 3) shows a *Canonical field* column with an inline
`<select>` override for low-confidence rows. The port has no canonical field at
extraction time. Do we need this functionality?

**Recommendation: No — do not build a canonical-field layer. It is a legacy artifact
of the original TS app's architecture, and its role is already filled by the CoA.**

### Why the concept exists in the mockup but not the port

The original TS/Next.js `financial-spreadx` used a **two-step** normalization model:

```
extract raw rows ─► map to a CANONICAL FIELD ─► map canonical field to output
```

The Python port deliberately **collapsed this into one step** (see `db/models.py:6`):

```
extract RAW rows (raw_label/raw_values) ─► map directly to the 184-entry CoA
```

The port's design comment is explicit: *"The port produces RAW rows
(`raw_label`/`raw_values`), not canonical fields … no separate `mapped_rows` table
is needed."* The **CoA standard line item (`CoaReference.line_item_name`) IS the
canonical concept** — mapping a raw label to `BS-001 Cash and Cash Equivalents`
*is* the canonicalization. Adding a separate canonical field would re-introduce a
redundant intermediate taxonomy the port intentionally removed.

### Don't be misled by the `canonical_field` column that already exists

`UnmappedItem.canonical_field` and `LearnedMapping.canonical_field` **are not a
semantic taxonomy.** `normalise_label()` (`spreading/learning_store.py:19`) is pure
string hygiene — `lower()`, strip punctuation, collapse whitespace — used **only as
the learning-store lookup key**. It should stay **internal plumbing** and never be
surfaced as an editable field. It is not what the mockup's "canonical field" implies.

### What to do instead

The workbench's intent — *"see the normalized concept this row became, and override
it if the model got it wrong"* — is **already fully supported**, just under a
different name:

| Mockup concept | Port equivalent |
|---|---|
| "Canonical field" value | The mapped **CoA line item** (`CoaMapping.coa_id` → `CoaReference.line_item_name`) |
| Confidence on the canonical field | `CoaMapping.confidence` |
| Inline `<select>` override below 75% | **`override_coa_mapping()`** — already implemented (re-points the CoA, updates the learning store, handles demotion) |

**Action:** relabel the column **"Mapped CoA line item"** and wire the inline override
to the existing `override_coa_mapping()` path. The only real dependency is persisting
extracted rows with their **pre-aggregation** per-row CoA assignment (today the mapping
is persisted only *after* rows are aggregated by CoA). No new canonical-field
modelling, taxonomy, or extra LLM step is warranted.

> **One open product question (Q6):** the Review Workbench in the spec sits in the
> **Extract** stage, conceptually *before* Stage 11. In the port, a row has no CoA
> until Stage 11 runs. So either (a) the workbench becomes a *post-Stage-11* review of
> per-row mappings, or (b) we accept the column shows "—/awaiting" until spreading
> runs. (a) is the natural fit.

---

## 10. Review: Direct frontend feeds vs. Supporting (indirect) capabilities

**Question:** of everything implemented, which capabilities **feed the frontend
directly**, and which **don't surface but support** the work (e.g. subtotal
reconciliation enriches the CoA tree rather than being its own screen)?

I affirm and extend the framing. Three roles emerge, not two — several capabilities
are **dual-role** (a small direct surface *plus* a larger supporting job).

### 10.1 Direct feeds — rendered as primary UI data

| Backend capability | Persisted? | Feeds (screen/widget) |
|---|---|---|
| **CoA mapping** (`CoaMapping`: coa_id, confidence, value_spread, mapping_source, aggregated_from) | ✅ | Spread Review tree (7), Compare CoA pane (8), Confidence & Source (7) |
| **Unmapped queue** (`UnmappedItem`: suggestions, ambiguity_note) | ✅ | Unmapped Resolver (10), Compare unmapped pane (8), Unmapped tab (7) |
| **Balance check** (`balance_check_result`, incl. `imbalanceContributors`) | ✅ | Balance banner (7, 8), Validation card (5) |
| **Learning store** (`LearnedMapping` attribution + quality) | ✅ | Learned Mappings tab (7), Learned badge (7, 8) |
| **LLM usage** (`usage_result`) | ✅ | LLM Cost screen (9) |
| **Template/scope** (`Document.template_type`, `scope`) | ✅ | Library badge (1), scope filter (4) |
| **CoA reference** (184 entries: name, definition, category) | ✅ | Suggestion-card definitions (10), CoA tree section grouping (7), CoA-reference endpoint |
| **Excel export** (`_extracted` + 7-sheet `_spread`) | ✅ (files) | Export Centre download (6) |
| **Row extraction** (raw_label, values, section_path, indentation, is_subtotal, note_ref, page) | ❌ in-memory | Statement Tree (4), Workbench rows (3), source-line children (7) — *blocked until persisted* |
| **Notes** (note_number, title, summary, sub_tables) | ❌ in-memory | NoteDrawer (3), Notes Index (4) — *blocked until persisted* |

### 10.2 Supporting / indirect — enrich or validate a direct feed, not their own primary surface

| Backend capability | Role (what it supports) |
|---|---|
| **Subtotal reconciliation** (`reconciliation_result`) | **The user's example — confirmed.** Its component grouping (leaves grouped under each subtotal by doc-order + indentation + section_path) is effectively a **pre-computed tree skeleton**, and it tells the CoA-map tree: *does this subtotal foot against its mapped components (PASS/FAIL), and which components are unmapped?* It **enriches** the tree (roll-up checkmarks, "missing leaf" flags) rather than being a standalone screen. *(It also has a thin direct surface — a reconciliation tab/sheet — so it is dual-role, but its primary value is indirect support for the tree.)* |
| **Sign conventions** (`sign_applied`, +/−/contra) | Behind-the-scenes correctness — ensures `value_spread` numbers display with the right sign. Not its own UI element. |
| **Aggregation** (SPR-004: `aggregated_from`, `source_extraction_ids`) | Produces each CoA parent's value by merging duplicate raw rows. The mechanism is indirect; the `aggregated_from` count + ID list are a thin direct surface (drill-down). |
| **Extraction-ID traceability** (`source_extraction_ids`) | The **join key** linking a CoA line back to its source rows — the plumbing behind every tree drill-down and audit. Indirect, occasionally displayed as an "Extraction ID(s)" column. |
| **Confidence threshold gate** (`SPREAD_CONFIDENCE_THRESHOLD`) | Decides the mapped-vs-unmapped split that the UI then shows. The logic is indirect; the threshold value is a (future) Settings feed. |
| **Page classification** (digital/scanned/hybrid) | Routes extraction (text vs vision). Currently internal/not persisted. Would *become* a direct feed (Scanned-vs-Digital chart, run summary) **only if persisted**. |
| **Page filtering** (S3) | Decides which pages get extracted. Pure internal gating — never surfaced. |
| **Statement-type / column classification** | Assigns `statement_type` + `column_metadata` (actual/budget/restated). Supports correct tree grouping and year columns; mostly indirect (though `statement_type` is needed for the direct tree feed). |

### 10.3 Internal tooling — neither a feed nor a runtime support; informs configuration

| Capability | Role |
|---|---|
| `build_unmapped_analysis.py`, `build_threshold_sensitivity.py`, `build_subtotal_reconciliation.py`, `republish_at_threshold.py` | **Offline analyst/dev tools.** They produced the evidence for decisions (e.g. lowering the gate to 0.55) but do **not** feed the live frontend. Keep as a back-office utility set; do not wire to the UI. |

### 10.4 The key insight

The capabilities that **don't** directly feed the UI are mostly the ones that make
the **direct feeds trustworthy**: sign conventions and aggregation make the tree's
*numbers* correct; reconciliation and the balance check make them *verifiable*;
extraction IDs make them *auditable*; the learning store makes them *improve over
time*. When building the CoA-map tree (7/8), plan to **overlay** the supporting
signals onto the direct feed — e.g. each subtotal node carries a reconciliation
PASS/FAIL chip and a "missing leaf" flag sourced from `reconciliation_result`, and
each parent shows its `aggregated_from` count — rather than giving them separate
screens.

> **Q7 — surface or suppress reconciliation?** Decide whether reconciliation is *only*
> an enrichment overlay on the tree (recommended primary use) or *also* keeps its own
> tab/sheet for analysts who want the full cross-foot report. Both can coexist cheaply.
