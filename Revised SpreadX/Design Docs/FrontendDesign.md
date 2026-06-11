# Financial SpreadX — Detailed Frontend Feature Design

**Version 1.0 · 2026-06-10 · Status: DRAFT for review (no implementation started)**

Companion to `Frontend_DesignPlan.md` (architecture + phased build plan) and
`Frontend_GapAnalysis.md` (capability matrix + resolved decisions Q1–Q21).

This document specifies **how each v1 feature is built** — data lineage (exact
tables/columns/joins), the API route, the React component breakdown, the interaction
flow (including the optimistic-write pattern across the Python subprocess boundary),
edge cases, and acceptance criteria. Section 1 (CoA tree + extraction-ID leaf) is the
**reference example**; later sections reuse its patterns.

### Conventions used throughout

- **Read** = Next.js route handler queries SQLite directly via `lib/db.ts`
  (better-sqlite3, WAL). **Write** = route spawns `python -m webapi.ops <cmd>` and
  returns its JSON (per Q9).
- **Confidence bands (cosmetic, Q18):** `≥0.90` green · `0.75–0.89` amber · `<0.75` red.
- **Statement mapping:** backend `statement_type` (`balance_sheet`/`income_statement`/
  `cash_flow`/`equity_statement`) ↔ UI labels (Balance Sheet / P&L / Cash Flow / Equity).
  `CoaReference.statement` is `"Balance Sheet"`/`"P&L"`.
- **Year values:** backend `value_spread` / `raw_values` are `{year: value}` dicts; the
  route projects them to `fy1`/`fy2` (latest two years, descending).
- **New tables** referenced (`extracted_rows`, `notes`, `app_settings`) and new
  `documents` columns are defined in `Frontend_DesignPlan.md` §4 (B1–B8).

---

## 1. CoA Tree + Extraction-ID Leaf Drill-down (Screens 7 & 8) — REFERENCE

The aggregated CoA spread rendered as an expandable tree; each parent CoA line expands
to the **source extracted rows** that fed it, linked by `extraction_id`. This is the
single most-reused pattern in the app.

### 1.1 Data lineage

**Parent rows** — one per CoA line for the document:
```sql
SELECT m.id, m.coa_id, m.statement_type, m.confidence, m.mapping_source,
       m.learned_mapping_id, m.value_spread, m.sign_applied, m.aggregated_from,
       m.source_extraction_ids, m.rationale,
       r.line_item_name, r.broad_category, r.sub_category, r.is_subtotal, r.sign_convention
FROM coa_mappings m
JOIN coa_reference r ON r.coa_id = m.coa_id
WHERE m.document_id = ?
ORDER BY r.coa_id;            -- BS-001…BS-NNN then PL-001…PL-NNN
```

**Leaf rows (drill-down)** — authoritative link is `source_extraction_ids` (§4.6 of the
plan). For a parent `m`:
```ts
const ids = JSON.parse(m.source_extraction_ids);   // e.g. [3, 7, 12]
// SELECT extraction_id, raw_label, raw_values, page, note_ref, indentation_level
// FROM extracted_rows WHERE document_id = ? AND extraction_id IN (ids)
```
`aggregated_from === ids.length`. Each leaf supplies `raw_label`, `raw_values`
(→ fy1/fy2), `page` (drives page-jump in Compare), `note_ref`.

**Section grouping & subtotals** — group parents by `broad_category` (section headers);
parents where `coa_reference.is_subtotal` render with the subtotal style.

**Reconciliation overlay (Q7)** — from `documents.reconciliation_result`. Build a lookup
of subtotal raw_label → `{pass, has_unmapped_component}`; attach a PASS/FAIL chip +
"missing leaf" flag to the matching subtotal nodes. *No standalone tab.*

**Source attribution** — `mapping_source` → chip (claude/learned/manual). If
`learned_mapping_id`, fetch `LearnedMapping.source_document` for the "Learned from …"
tooltip.

### 1.2 API

`GET /api/spread/[id]` (Read) returns:
```ts
interface SpreadTreeResponse {
  documentId: string;
  balance: BalanceCheckResult;            // documents.balance_check_result
  reconciliation: ReconciliationSummary;  // condensed from reconciliation_result
  sections: {
    statement: 'balance_sheet' | 'income_statement';
    category: string;                     // broad_category header
    nodes: CoaNode[];
  }[];
}
interface CoaNode {
  mappingId: string; coaId: string; name: string;
  fy1: number | null; fy2: number | null;
  confidence: number; source: 'claude'|'learned'|'manual';
  learnedFromDoc?: string;
  isSubtotal: boolean; aggregatedFrom: number;
  reconcile?: { pass: boolean|null; missingLeaf: boolean };
  leaves: LeafLine[];                     // lazy or inlined (see 1.4)
}
interface LeafLine {
  extractionId: number; rawLabel: string;
  fy1: number|null; fy2: number|null; page: number; noteRef?: string;
}
```
The route owns all backend→UI field translation.

### 1.3 Components

```
<SpreadReviewPage>           // Screen 7: tabs BS/P&L/Unmapped/Confidence/Learned
  <BalanceBanner>            // balance.isBalanced → bb-ok / bb-fail
  <CoaTree sections>
    <CoaSection>             // category header
      <CoaParentRow>         // click → toggle; arrow rotates 90°
        <ReconChip>          // PASS/FAIL + missing-leaf (subtotals only)
        <SourceChip> <ConfidenceBar>
      <CoaLeafRows>          // tree-connector └──, rawLabel, value, page, note link
```
Shared `<CoaTree>` is reused by Screen 8 (Compare centre pane) with a `droppable` prop
(§2). State: `openIds: Set<string>` (zustand); "Expand all / Collapse all" toggles it.

### 1.4 Interaction flow

- Default render: parents collapsed. Expand → reveal `leaves`.
- **Leaf payload strategy:** inline leaves in the `GET /api/spread/[id]` response (counts
  are small per document) for v1 simplicity; switch to lazy
  `GET /api/spread/[id]/node/[coaId]/leaves` only if payloads prove large.
- In Compare (8), a leaf's `page` → click jumps the PDF pane to that page (Q20).

### 1.5 Edge cases

- Parent with `aggregated_from > 1` but a stale/empty `source_extraction_ids` → show the
  parent, render a muted "source rows unavailable (re-run to populate)" note (covers
  pre-B1 documents that predate row persistence).
- CoA line with `value_spread` having only one year → `fy2 = null`, render "—".
- Subtotal with no reconciliation entry → no chip (don't fabricate PASS).
- `not_spread` (equity) rows never appear here — they're on the Unmapped sheet.

### 1.6 Acceptance

- Every parent's expanded leaf set equals `source_extraction_ids`, and the leaves' fy1
  sum (sign-applied) matches the parent's fy1 within rounding.
- Subtotal nodes show the same PASS/FAIL as `reconciliation_result`.
- Re-running a doc and re-opening the tree shows the refreshed leaves (new extraction IDs).

---

## 2. Drag-Drop Resolution + Optimistic Save (Screen 8)

Resolve an unmapped item by dragging it onto a CoA parent; batch the pending mappings;
save through Python; refresh the balance.

### 2.1 Data lineage

- **Centre pane** = the §1 CoA tree (each `<CoaParentRow>` is a drop target).
- **Right pane** = `GET /api/spread/[id]/unmapped` → `unmapped_items` where
  `status='pending'`: `id`, `raw_label`, `statement_type`, `value_spread`,
  `claude_suggestions` (top `{coa_id, score, reason}`), `source_extraction_ids`.
- **Left pane** = PDF (§4 viewer); unmapped-source rows listed by their `page`.

### 2.2 API

- `POST /api/spread/[id]/mappings` (Write → `webapi.ops save_mappings`):
  ```ts
  body: { mappings: { unmappedItemId: string; coaId: string; rationale?: string }[] }
  ```
  Server loops `resolve_unmapped()` per item (atomic each: insert `CoaMapping` +
  `LearnedMapping`, set item `status='resolved'`, decrement `unmapped_count`, flip
  `spread_status`), then recomputes `check_balance_sheet_identity`. Returns:
  ```ts
  { saved: number; remainingUnmapped: number; balance: BalanceCheckResult }
  ```
  The new `CoaMapping.source_extraction_ids` carries the item's IDs (so the resolved
  line's leaf is the original extracted row — §1 lineage holds post-resolve).

### 2.3 Components

```
<Compare3Pane>                       // height chain: flex:1; min-height:0; overflow:hidden
  <PdfPane>                          // §4
  <CoaTree droppable>                // §1 tree + useDroppable per parent
  <UnmappedDragPane>                 // useDraggable items + count badge
  <SaveBar>                          // slides up when pendingMappings.length > 0
```
@dnd-kit: `PointerSensor {distance:8}` + `KeyboardSensor`. `handleDragEnd` →
`addPendingMapping({item, coaId, coaName})` + `autoExpandCoaNode(coaId)`.

State (zustand `compareStore`): `pendingMappings[]`, `resolvedIds:Set`, `openIds:Set`.

### 2.4 Interaction flow (optimistic-write pattern — the canonical one)

1. **Drop** → append to `pendingMappings`; **optimistically** insert a green leaf under
   the target parent, mark the unmapped item resolved (strikethrough), auto-expand. No
   server call yet.
2. **Save & Update Spread** → `POST …/mappings`. While in-flight: Save bar shows a
   spinner; tree stays in its optimistic state.
3. **On success** → replace optimistic state with server truth: update the balance banner
   from `balance`, set the resolved counter to `saved`, clear `pendingMappings`, toast
   "✓ N mappings saved · Spread updated".
4. **On error** → roll back the optimistic leaves + un-strike the items, keep
   `pendingMappings`, toast the error, leave the Save bar so the user can retry.

> This 4-step optimistic/rollback sequence is reused verbatim by §3 (resolver confirm)
> and §4 (inline override).

### 2.5 Edge cases

- Drop onto a subtotal CoA line → allow, but warn (subtotals are usually computed, not
  mapped targets); or disable drops on `isSubtotal` nodes (decide in feature build).
- Same item dropped twice → dedupe in `pendingMappings` by `unmappedItemId` (last wins).
- Concurrent run for the same doc in progress (`pipeline_status='processing'`) → disable
  saving; show "spread updating…".
- Partial batch failure → `save_mappings` is per-item atomic; return per-item results so
  the UI only rolls back the failed ones.

### 2.6 Acceptance

- After save, the resolved item leaves the pending pane, the CoA line shows the new leaf
  via `source_extraction_ids`, and the balance banner reflects the recompute.
- A forced server error rolls the UI back with no orphaned optimistic leaves.

---

## 3. Unmapped Resolver Confirm Flow (Screen 10)

The best-supported screen — list / detail / suggestions / confirm, writing straight to
the learning store. Minimal new backend.

### 3.1 Data lineage

`GET /api/spread/[id]/unmapped` (as §2.1). Suggestion cards enrich each
`claude_suggestions[i].coa_id` with `CoaReference.line_item_name` + `definition`.
Detail panel: `raw_label`, `statement_type`, document name, `value_spread`,
`ambiguity_note` (why unmapped). Rationale textarea pre-filled from the selected
suggestion's `reason` / `ambiguity_note`.

### 3.2 API

`POST /api/spread/[id]/resolve-unmapped` (Write → `webapi.ops resolve_unmapped`):
```ts
body: { itemId: string; coaId: string; rationale: string }
returns: { coaMappingId: string; learnedMappingId: string; remainingUnmapped: number }
```
Reuses `db.queries.resolve_unmapped` (inserts mapping + learned entry, stores rationale).

### 3.3 Components

```
<UnmappedResolverPage>          // ur-layout: list(190) / detail(flex) / suggs(255)
  <UrList>                      // active = blue left-border; resolved = strikethrough
  <UrDetail>                    // dkv rows, why-unmapped (red tint), rationale textarea
  <UrSuggestions>               // 3 <SuggestionCard> (coaId, name, definition, conf bar)
  <Topbar><ProgressBar>         // N / M resolved
```
State: `currentItemId`, `selectedCoaId`, `rationaleDraft`, `resolvedIds:Set`.

### 3.4 Interaction flow

1. Select an item → load detail + suggestions; pre-select top suggestion; prefill
   rationale. Confirm button label shows the selected CoA id.
2. **Confirm** → optimistic: mark resolved (strikethrough), increment progress bar.
3. `POST …/resolve-unmapped`; on success toast "✓ Mapping confirmed + stored in learning
   store", **auto-advance** to next unresolved after 500ms (advance is local, doesn't wait
   on the write — snappy per Q9).
4. On error → roll back (un-strike, decrement), keep selection, toast error.

### 3.5 Edge cases

- No suggestions (`claude_suggestions` empty) → cards show "no AI suggestions"; user
  picks from a CoA search box (`GET /api/coa-reference`).
- Last item resolved → `spread_status` flips to `spread_complete` (handled by
  `resolve_unmapped`); show a completion state.
- "Skip" → no write; just advance (item stays `pending`). *(Backend `skip_unmapped` sets
  `status='skipped'` — decide whether Skip persists or is session-only; recommend
  session-only for v1.)*

### 3.6 Acceptance

- A confirm inserts both a `CoaMapping` and a `LearnedMapping`; re-running a document with
  the same raw label auto-applies the learned mapping (no LLM call) — verifiable in the
  Learned Mappings tab.

---

## 4. Review Workbench Rows + Inline Override + Page-Jump (Screen 3)

Per-row extracted data with its mapped CoA line, an inline override for low-confidence
rows, a PDF viewer with page-jump, and note links.

### 4.1 Data lineage

`GET /api/documents/[id]/rows` → `extracted_rows`: `extraction_id`, `raw_label`,
`raw_values`, `statement_type`, `page`, `note_ref`, `is_subtotal`, `indentation_level`,
`coa_id` (denormalized row→CoA, §4.6) + joined `coa_reference.line_item_name` and
`confidence`. **No canonical column** (Q6) — the mapped-CoA column replaces it. Statement
filter pills filter on `statement_type`.

### 4.2 API

- Read rows (above).
- `POST /api/spread/[id]/override` (Write → `webapi.ops override_mapping`):
  ```ts
  body: { mappingId?: string; extractionId: number; newCoaId: string; rationale?: string }
  returns: { coaMappingId: string }
  ```
  Reuses `override_coa_mapping` (re-points the CoA, bumps `times_overridden`, may demote
  the prior learned mapping, inserts a corrected learned entry).

### 4.3 Components

```
<ReviewWorkbenchPage>
  <PdfPane>                     // viewer + prev/next; activeRow.page drives jump
  <MappingTable>
    <MappingRow>                // raw label, values, "Mapped CoA line item", conf band
       <CoaOverrideSelect>      // shown when confidence < 0.75; options = coa-reference
  <NoteDrawer>                  // note_ref click → notes table
```
State: `activeExtractionId` (selecting a row highlights it and page-jumps the PDF),
`statementFilter`.

### 4.4 Interaction flow

- Row click → set `activeExtractionId`; PDF jumps to `row.page` (page-level, Q20 — no
  pixel highlight).
- Low-confidence row → inline `<select>`; choosing a new CoA → optimistic cell update →
  `POST …/override` → reconcile/rollback per §2.4.
- Note link → open `<NoteDrawer>` (focus-trapped, overlay-dismiss).

### 4.5 Edge cases & 4.6 Acceptance

- Row with `coa_id = null` (unmapped) → CoA cell shows "Unmapped" + a link to resolve in
  Compare/Resolver. · Row with no `note_ref` → no link. · Override on a `not_spread`
  (equity) row → disabled.
- **Acceptance:** selecting any row jumps the PDF to the correct page; an override persists
  and is reflected in the Spread tree (§1) and the learning store.

---

## 5. Statement Tree + Notes Drawer (Screen 4)

Accordion view of the raw extracted statements (pre-mapping structure), plus a Notes Index.

### 5.1 Data lineage

`extracted_rows` ordered by document order, grouped into accordions by `statement_type`
(Income Statement / Balance Sheet / Cash Flow). Hierarchy from `indentation_level` +
`section_path`; `is_subtotal` rows styled as subtotals. Scope pills filter on
`statement_scope` (consolidated / standalone / both). Notes Index from `notes`
(`note_number`, `note_title`, `summary`); "View note" → `<NoteDrawer>`.

### 5.2 API

`GET /api/documents/[id]/rows` (reused, grouped client-side) +
`GET /api/documents/[id]/notes` (list) + `/notes/[n]` (one note with `sub_tables`).

### 5.3 Components

```
<StatementTreePage>
  <ScopePills>                  // consolidated | standalone | both
  <Accordion> ×4                // IS / BS / CF / Notes Index
    <TreeRow indent={level}>    // subtotal rows get .sub style
  <NoteDrawer>
```
State: `openSections:Set`, `scope`.

### 5.4 Edge cases & 5.5 Acceptance

- Cash flow rows exist in `extracted_rows` but were never CoA-mapped — that's expected;
  the tree shows them for completeness. · Equity rows show as a section, labelled
  not-spread. · A note referenced by a row but missing from `notes` → link disabled.
- **Acceptance:** the tree's hierarchy and subtotal styling match the source document
  structure; scope filtering hides the non-selected scope's rows.

---

## 6. Upload + Detached Run + Coarse Status Polling (Screen 2, single-file)

Upload a PDF, kick off the full extract + Stage 11 run as a detached subprocess, and poll
coarse status (Q8). Batch mode is out (Q16).

### 6.1 Data & lifecycle

- `POST /api/upload` saves the PDF to `web/uploads/<uuid>.pdf`, creates a `documents` row
  (`pipeline_status='queued'`, `pdf_path` set), reads `app_settings` (model, provider,
  threshold), spawns **detached** `python -m webapi.ops run --json '{document_id, pdf_path,
  model, threshold}'`, and returns `{ documentId }` immediately.
- The Python `run` op walks the pipeline, updating `pipeline_status`
  (`processing` → `done`/`error`), `pipeline_stage` (coarse label), and on completion
  persists rows/notes/page_summary/mappings/usage/balance/reconciliation.
- `GET /api/pipeline/[id]/status` (Read) returns `{ status, stage, error?, summary? }`;
  the client polls every 1.5s via TanStack Query `refetchInterval` until terminal.

### 6.2 Components

```
<UploadPage>
  <DropZone>                    // react-dropzone, PDF MIME only
  <PipelineProgress>            // 6 stage rows (S2…S11) advanced by COARSE status
  <RunSummaryCard>              // on done: counts (rows, mapped/unmapped, equity), cost, links
```
With coarse status, stage rows render done/running/pending by mapping
`pipeline_stage` → step index (not per-stage animation, which is deferred).

### 6.3 Interaction flow, edge cases, acceptance

- Drop PDF → POST → switch to processing view → poll → on `done` show Run Summary with
  links to Spread (7) and Resolver (10); on `error` show `error_message` + retry.
- Edge: non-PDF rejected client-side; duplicate filename → still a new `Document` (Q15);
  process crash → status stuck `processing` → a `started_at` timeout marks it `error`.
- **Acceptance:** uploading a sample PDF creates a `processing` doc that reaches `done`,
  and all read screens then reflect it.

---

## 7. Document Library (Screen 1)

Latest-per-filename list of all processed reports, with proxies and delete.

### 7.1 Data lineage

`GET /api/documents` (Read) — latest run per filename:
```sql
SELECT d.* FROM documents d
JOIN (SELECT filename, MAX(created_at) mx FROM documents GROUP BY filename) t
  ON t.filename = d.filename AND t.mx = d.created_at;
```
Per row: Company (`company`, B6), Year (`fiscal_year`), Template (`template_type`),
Status (combine `pipeline_status` + `spread_status`), **Health proxy** (Q14 =
`balance_check_result.isBalanced` ? high : scaled by mapped ratio), **Flagged proxy**
(count of `coa_mappings.confidence < 0.75` + `unmapped_count`), Spread pill
(`spread_status`), **CoA-mapped ratio** = `COUNT(coa_mappings)` /
`COUNT(extracted_rows WHERE statement_type IN ('balance_sheet','income_statement'))`.

### 7.2 API

- Read list (above). · `DELETE /api/documents/[id]` (Write → `webapi.ops delete_document`):
  cascade-deletes `extracted_rows`, `notes`, `coa_mappings`, `unmapped_items`, the
  `documents` row, and the `pdf_path` file. **Learned mappings are global → NOT deleted.**

### 7.3 Components

```
<DocumentLibraryPage>
  <StatsRow> ×5                 // totals
  <FilterPills>                 // All / Needs Review / Val Errors / Spread Complete (client-side)
  <DocTable>
    <DocRow>                    // click routes by status; Spread↗ / Resolve→ links; Delete (confirm)
```

### 7.4 Interaction flow, edge cases, acceptance

- Row click routes: `processing` → status view; `has_unmapped` → Resolver; `complete` →
  Spread; `error` → the run's error.
- Delete → confirm dialog ("removes the report's PDF and all spread data; learned mappings
  are kept") → `DELETE` → optimistic row removal → reconcile.
- Edge: a `processing` doc shows a live status pill (polled); proxies show "—" until `done`.
- **Acceptance:** the Library lists exactly one row per filename (latest run); delete
  removes files + rows and leaves learned mappings intact.

---

## 8. Validation (5), Export (6), LLM Cost (9), Settings (11)

### 8.1 Validation — two checks only (Q3)

- `GET /api/documents/[id]/validation` (Read) returns `balance_check_result` +
  `reconciliation_result` summary. Two cards: **A=L+E** (per-year + imbalance
  contributors) and **Subtotal Reconciliation** (passed/failed/incomplete counts). No
  V01–V12, no rule grid. "Re-validate" → `webapi.ops recompute_balance`.
- **Acceptance:** cards mirror the persisted JSON exactly; re-validate refreshes them.

### 8.2 Export Centre

- Tiers: **Raw** (`_extracted.xlsx`) and **Reviewed** (`_spread.xlsx`, re-exportable from
  DB). Formats: **XLSX** (existing writers) + **JSON** (new serializer, B10). CSV/PDF
  disabled. `GET /api/documents/[id]/export?format=&tier=` (Write → `webapi.ops export`)
  streams the file.
- Edge: raw tier requires the `_extracted.xlsx` (not reconstructable from DB) — if absent,
  prompt to re-run. · **Acceptance:** XLSX + JSON download for both tiers (raw subject to
  the file existing).

### 8.3 LLM Cost

- `GET /api/usage` (Read) aggregates `documents.usage_result` across docs. KPIs: total
  input/output tokens, estimated total, avg/report. Charts (Recharts): cost-per-doc
  (stacked extraction/spreading), stage donut, token breakdown, **Scanned-vs-Digital**
  (from `page_summary`, B3). **"Saved via Learning" omitted** (not computed — show "—").
- Edge: docs without `usage_result` (offline republish) excluded from cost, noted in a
  footnote. · **Acceptance:** totals reconcile with the sum of per-doc `usage_result`.

### 8.4 Settings — functional subset (Q21)

- `GET/POST /api/settings` over `app_settings` (B8). **Functional:** model, provider,
  single confidence threshold → consumed by the next `run` (Q17). **Read-only/disabled**
  with tooltips: 4-band thresholds, equity toggle (always on), auto-run Stage 11 (always
  on), prompt caching (unused), output paths, max-concurrency. **No API-key field**
  (env-managed). Save → `POST /api/settings`.
- **Acceptance:** changing the threshold in Settings changes the mapped/unmapped split of
  the next upload; read-only controls cannot be saved.

---

## 9. Cross-Cutting Designs

### 9.1 Subprocess op contract (`webapi/ops.py`)

`python -m webapi.ops <cmd> --json '<payload>'` → prints one JSON object to stdout; exit 0
= success, non-zero + `{error}` on stderr = failure. `lib/python.ts` spawns, captures
stdout, parses JSON, maps non-zero to a typed error. Commands: `run` (detached),
`resolve_unmapped`, `override_mapping`, `save_mappings`, `recompute_balance`,
`delete_document`, `export`. Each reuses existing `db.queries` / `spreading` / `export`
code — **no business logic in TS** (Q9).

### 9.2 Optimistic-write pattern (canonical)

All Python-backed writes follow §2.4: (1) apply optimistic state + enqueue, (2) call op,
(3) on success reconcile to server truth + toast, (4) on error roll back + keep retry
affordance. TanStack Query mutations with `onMutate`/`onError`/`onSuccess` encode it once
as a `useOptimisticOp` hook reused by §2/§3/§4/§7.

### 9.3 SQLite / WAL access (`lib/db.ts`)

better-sqlite3, `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`. Read-only prepared
statements; JSON columns parsed in the route layer. Python remains the **sole writer** of
pipeline/mapping data; the frontend never writes SQLite directly.

### 9.4 Shared UI primitives & states

`<ConfidenceBar>`, `<SourceChip>`, `<StatusPill>`, `<NoteDrawer>`, `<Toast>`,
`<CoaTree>` (the §1 reusable). Every data view defines **loading** (skeleton),
**empty** (no docs / no unmapped / no notes), and **error** (failed fetch, with retry)
states. DnD is keyboard-accessible (`KeyboardSensor`). Height-chain QA per spec §2/§8 on
Screens 8 & 10 (`flex:1; min-height:0; overflow:hidden`).

### 9.5 Routing map

`/documents` (1) · `/upload` (2) · `/review/[id]` (3) · `/tree/[id]` (4) ·
`/validation/[id]` (5) · `/export/[id]` (6) · `/spread/[id]` (7) · `/compare/[id]` (8) ·
`/cost` (9) · `/resolver/[id]` (10) · `/settings` (11). Sidebar order + section labels
per spec §3 (pink "Spread" accent).

---

## 10. Traceability matrix (feature → backend dependency)

| Feature (screen) | Reads | Writes (Python op) | New backend needed |
|---|---|---|---|
| CoA tree + leaves (7,8) | coa_mappings, coa_reference, extracted_rows, reconciliation_result | — | B1 (extracted_rows) |
| Drag-drop resolve (8) | unmapped_items | save_mappings | — (logic exists) |
| Resolver confirm (10) | unmapped_items, coa_reference | resolve_unmapped | — |
| Workbench + override (3) | extracted_rows, notes | override_mapping | B1, B2 |
| Statement Tree (4) | extracted_rows, notes | — | B1, B2 |
| Upload + status (2) | documents (status) | run (detached) | B3–B6, B8 |
| Document Library (1) | documents, counts | delete_document | B4, B6, B7 |
| Validation (5) | balance/recon JSON | recompute_balance | — |
| Export (6) | — | export | B10 (JSON) |
| LLM Cost (9) | usage_result, page_summary | — | B3 |
| Settings (11) | app_settings | (settings write) | B8 |

---

## 11. Status

Design only — **no implementation started.** On approval, build proceeds per
`Frontend_DesignPlan.md` §7 (Phase 0 → 7), with §1 (CoA tree + extraction-ID leaf) and
§2 (optimistic write) as the reference patterns the remaining features follow.
