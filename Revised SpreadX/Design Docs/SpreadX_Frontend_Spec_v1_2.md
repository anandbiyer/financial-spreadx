# Financial SpreadX — Frontend Requirements Specification
**Version 1.2 · For Claude Code implementation · June 2026**
*Supersedes v1.1 · Adds layout constraints, CSS rules, blank-screen fixes*

---

## 1. Tech Stack Recommendation

| Layer | Technology | Rationale |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | SSR, API routes, streaming, file-based routing |
| Language | **TypeScript 5** | Type safety across CoA IDs, confidence scores, pipeline states |
| Styling | **Tailwind CSS v4** | Utility-first; warm neutral palette (`stone-*` / custom tokens) |
| UI Primitives | **shadcn/ui** | Accessible tables, dialogs, tooltips; Tailwind-compatible |
| Icons | **Lucide React** | Consistent, lightweight |
| Drag & Drop | **@dnd-kit/core + @dnd-kit/sortable** | Accessible DnD, React 19, no jQuery |
| State | **Zustand** | Lightweight global state (spread data, resolved mappings, session) |
| Server State | **TanStack Query v5** | Pipeline polling, background refetch, pagination |
| Charts | **Recharts** | Declarative; used in LLM Cost screen |
| PDF Viewer | **react-pdf (pdfjs-dist)** | Native in-browser PDF for Compare View left pane |
| File Upload | **react-dropzone** | Drag-drop with MIME validation |
| Tables | **TanStack Table v8** | Virtualised rows for large CoA tables (700+ rows) |

---

## 2. Design System & CSS Rules

### Colour tokens (`globals.css`)
```css
:root {
  --bg-base:        #f4f3f0;
  --bg-card:        #ffffff;
  --bg-muted:       #f9f8f5;
  --bg-subtle:      #f1f0eb;
  --border:         #e4e2dc;
  --border-strong:  #ccc9bf;
  --text-primary:   #1a1917;
  --text-secondary: #4a4844;
  --text-muted:     #8a8880;
  --sidebar-bg:     #0f1117;
  --brand-blue:     #1d4ed8;
  --conf-green:     #15803d;
  --conf-amber:     #b45309;
  --conf-red:       #b91c1c;
  --unmapped:       #f59e0b;
}
```

### SPA Layout — CRITICAL height chain
The entire app is a fixed viewport (`html, body { height: 100%; overflow: hidden }`).
The height chain must be unbroken for every screen:

```
html (100vh)
└─ body (100vh, display:flex)
   ├─ aside#sidebar (width:210px, height:100vh, overflow-y:auto)
   └─ div#app-main (flex:1, display:flex, flex-direction:column, overflow:hidden)
      └─ div.screen.active (display:flex, flex-direction:column, height:100vh, overflow:hidden)
         ├─ div.tb (height:48px, flex-shrink:0)          ← topbar
         ├─ div.tabs (if present, flex-shrink:0)         ← tab bar (screens 7+)
         └─ div.screen-body (flex:1, overflow-y:auto)    ← scrollable content
```

**Screens with internal flex layouts (8, 10)** must override `.screen-body` to prevent double scrollbar:
```css
/* Screen 8 — Compare & Resolve */
.screen-body.compare-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  flex: 1;
  min-height: 0;        /* ← required to prevent flex overflow */
  overflow: hidden;     /* ← managed internally by cpane scroll */
}

/* Screen 10 — Unmapped Resolver */
.screen-body.resolver-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

### Key layout classes
```css
/* Settings 2-column grid */
.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px;
}
.settings-full { grid-column: 1 / -1; }   /* spans both columns */

/* 3-pane compare layout */
.compare-3 {
  display: flex;
  gap: 8px;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
.cpane {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.cpane-pdf      { width: 255px; flex-shrink: 0; }
.cpane-coa      { flex: 1; min-width: 0; }
.cpane-unmapped { width: 242px; flex-shrink: 0; }

/* Unmapped resolver 3-column layout */
.ur-layout {
  display: flex;
  gap: 10px;
  flex: 1;
  overflow: hidden;
  min-height: 0;     /* ← required */
}
.ur-list { width: 190px; flex-shrink: 0; overflow-y: auto; }
.ur-detail { flex: 1; overflow-y: auto; }
.ur-suggs  { width: 255px; flex-shrink: 0; overflow-y: auto; }
```

### Typography
- Body: `system-ui, -apple-system, sans-serif` · 13px base
- Monospace (CoA IDs, values, tokens): `ui-monospace, 'Cascadia Code', monospace`

---

## 3. Navigation & Sidebar

**Order** (top to bottom in sidebar):
1. Settings (`/settings`, nav id: 12)
2. **Ingestion** — Upload & Classify (`/upload`, nav id: 2)
3. **Extract** — Document Library (1), Review Workbench (3), Statement Tree (4), Validation (5)
4. **Spread** — Spread Review (7), Compare & Resolve (8), Unmapped Resolver (10)
5. **Output** — Export Centre (6), LLM Cost (9)

Section labels: "Settings" / "Ingestion" / "Extract" / "Spread" / "Output"
The "Spread" section header uses a pink accent colour (`#f9a8d4`) to distinguish it.

---

## 4. Screen Inventory

### Screen 1 — Document Library (`/documents`)
**Columns:** Company, Year, Template badge, Extraction status, Health bar, Flagged count, Spread Status pill, CoA Mapped ratio, Action link

**Filter pills:** All (19) · Needs Review · Val. Errors · Spread Complete — client-side filter on `data-status` attribute

**Row click routing:**
- `error` status → `/validation/[id]`
- `review` status → `/review/[id]`
- `complete` status → `/spread/[id]`
- "Spread ↗" link → `/spread/[id]`
- "Resolve →" link → `/compare/[id]`

---

### Screen 2 — Upload & Classify (`/upload`)
**Mode toggle:** "Single File" | "Batch (up to 10)" — pill switcher in topbar right

**Single File mode:**
- `DropZone`: PDF only, click or drag-drop
- `PipelineProgress`: 6 stages (S2 → S3 → S4 → S5 → S6 → S11), each animating queued → running (pulse) → done (green)
- Poll `GET /api/pipeline/[jobId]/status` every 1.5s via TanStack Query `refetchInterval`
- After complete: show `RunSummary` card with links to Spread View and Unmapped Resolver

**Batch mode:**
- `BatchQueue` table: up to 10 files, drag-drop or "Add demo files" button
- Each row: filename, detected template, estimated pages, Stage 11 toggle, status pill, estimated cost, remove ✕
- "Run Batch" button → `POST /api/batch` → animate each row queued → running → done
- Right panel: Batch Settings (model, confidence slider, batch size pills 4/8/12/16, output path, toggles)
- Cost Preview card auto-calculates as files are added

**Stage 11 banner:** always visible at top of screen, links to Settings for threshold configuration

---

### Screen 3 — Review Workbench (`/review/[id]`)
**Layout:** 230px PDF pane (left, fixed) + flex mapping table (right)

**Statement filter pills:** Income Stmt · Balance Sheet · Cash Flow — switches content rows

**PDF pane (`react-pdf`):**
- `Document` + `Page` components
- Row highlighting: clicking a mapping table row highlights the corresponding PDF source line (amber background)
- Click-anywhere-on-PDF triggers reverse highlight in mapping table

**Mapping table row states:**
- Normal: white background
- Flagged (confidence 75–89): amber tint (`#fffbeb`)
- Selected (active cross-highlight): blue tint (`#eff6ff`)
- Canonical field cells below 75% confidence: show inline `<select>` for user override

**Note links (e.g. "Note 7 →"):** open `NoteDrawer` — fixed right panel, translateX animation, focus-trapped when open, dismissible via overlay click or close button

---

### Screen 4 — Statement Tree (`/tree/[id]`)
**Scope selector pills:** Consolidated · Standalone · Both — filters displayed rows

**Accordion sections:** Income Statement · Balance Sheet · Cash Flow · Notes Index
- Each uses CSS height transition for expand/collapse
- Toggle state managed via `openIds: Set<string>` in local React state
- Notes Index rows have "View note" links opening `NoteDrawer`

---

### Screen 5 — Validation (`/validation/[id]`)
**Filter pills:** All (11) · Passing · Failing

**Validation cards grid** (`grid-template-columns: repeat(3, 1fr)`):
- `pass` variant: green left border
- `fail` variant: red left border, "Fix rows →" button linking to `/review/[id]`

**"Re-validate" button** → `POST /api/documents/[id]/validate` → refetch validation results

---

### Screen 6 — Export Centre (`/export/[id]`)
**Tier selector:** Raw extraction · Canonical mapped · Reviewed final (3-button pill group)

**Export cards:** 2×2 grid
- XLSX (active, primary — blue border)
- JSON (active)
- CSV (deferred — dashed border, reduced opacity)
- PDF (deferred)

**Download:** `GET /api/documents/[id]/export?format=xlsx&tier=reviewed` — browser file download

---

### Screen 7 — Spread Review (`/spread/[id]`)
**Tabs (5):** Balance Sheet · P&L Statement · Unmapped Items · Confidence & Source · Learned Mappings

#### CoA Tree (BS and P&L tabs)
Every CoA entry renders as an expandable parent + collapsible children:

```
▶ BS-001  Cash and Cash Equivalents    30,441  ──── 0.97   [Learned]
          ├── Cash and bank balances    8,441
          └── Fixed deposits          22,000
▶ BS-039  LT Trade Receivables            —    ──── awaiting  [Suggested ↓]
▶ BS-009  Income Tax Receivable        4,218   ──── 0.57   [Auto 0.57↑]
```

**Data shape:**
```typescript
interface CoaEntry {
  coaId: string;           // "BS-001"
  standardName: string;
  aggregateValue: number;  // sum of source lines that map to this entry
  priorValue: number;
  confidence: number;
  source: 'learned' | 'claude' | 'auto' | 'manual' | 'unmapped';
  sourceLines: SourceLine[];
}
interface SourceLine {
  rawLabel: string;
  pageNum: number;
  value: number;
  priorValue: number;
  noteRef?: string;
  confidence: number;
}
```

**Tree behaviour:**
- Parent row click → toggle `openIds` → show/hide tbody of child rows
- Arrow icon rotates 90° when open (CSS `transform: rotate(90deg)`)
- "Expand all" / "Collapse all" buttons in card header
- Unmapped rows: amber left-border, no expand arrow, "Drag-resolve ⇆" button

**Unmapped Items tab:** table of all `status: 'pending'` items with "⇆ Drag-Resolve in Compare View" CTA

---

### Screen 8 — Compare & Resolve (`/compare/[id]`)
**Layout:** 3-pane horizontal flex, fills viewport height after topbar

> ⚠️ **Critical CSS:** The `.screen-body` for this screen must use `flex:1; min-height:0; overflow:hidden` (not `overflow-y:auto`). The three panes manage their own internal scrolling. Missing `min-height:0` causes the middle pane to collapse.

**Instruction banner** (above the 3 panes, `flex-shrink:0`):
"↔ Drag & drop any item from the Unmapped panel (right) onto a CoA node in the Spread panel (centre) to resolve its mapping. Then click Save Mappings."

#### Pane 1 — Extracted Page (255px fixed, `flex-shrink:0`)
- `react-pdf` Document + Page
- Prev/next navigation
- Row highlighting: amber on active, red left-border on unmapped-source rows
- Legend: amber swatch = "Active", red-left swatch = "Unmapped"

#### Pane 2 — CoA Spread Tree (`flex:1`, `min-width:0`)
Renders the **same expandable CoA tree** as Screen 7 (BS tab), with all functionality preserved AND each parent row being a **drop target**.

**Tree + drop target behaviour:**
- Parent row: **click** = toggle expand/collapse (same as Screen 7)
- Parent row: **dragover/drop** = drop target for unmapped items
- These are two independent interactions on the same element
- `isDragOver` state: add dashed blue outline (`outline: 2px dashed #1d4ed8`) to parent row
- On successful drop:
  1. Append a new leaf child row (green background, "Mapped → BS-xxx" badge) inside the children section
  2. Auto-expand the parent row to reveal the new leaf
  3. The leaf includes: tree connector (`└──`), raw label, value, "Mapped → CoA-ID" badge
- Save bar (bottom of pane, `flex-shrink:0`) slides up: shows count of pending mappings, "Save & Update Spread" and "Discard" buttons
- Balance check indicator (in Total Assets row) updates colour when gap is resolved

**Suggested-target rows:** AI-recommended CoA rows highlighted amber with "(Suggested ↓)" badge — these appear when a match was just below threshold

#### Pane 3 — Unmapped Items (242px fixed, `flex-shrink:0`)
- Header shows count badge ("N pending" in amber, turns green as items resolve)
- Each draggable item:
  - `⠿` drag handle (visible on hover)
  - Raw label (truncated with ellipsis)
  - Document name · Statement · Value
  - Top CoA suggestion · score
  - On resolved: strikethrough, green checkmark badge, `draggable="false"`
- Footer: "+ N more pending in full resolver" link → `/resolver/[id]`

**@dnd-kit implementation:**
```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(KeyboardSensor)
);

function handleDragEnd({ active, over }: DragEndEvent) {
  if (!over) return;
  const item    = active.data.current as UnmappedItem;
  const target  = over.data.current as { coaId: string; coaName: string };
  addPendingMapping({ item, coaId: target.coaId, coaName: target.coaName });
  autoExpandCoaNode(target.coaId);
}
```

**Save flow:**
- "Save & Update Spread" → `POST /api/spread/[id]/mappings` with `PendingMapping[]`
- Server: writes to `coa_mappings`, recalculates balance check, updates spread
- On success: toast "✓ N mappings saved · Spread updated", hide save bar, update resolved counter

---

### Screen 9 — LLM Cost (`/cost`)
**KPI row** (5 stat cards): Total Input Tokens · Total Output Tokens · Estimated Total · Saved via Learning · Avg per Report

**Charts** (Recharts):
1. **`BarChart` — Cost per Document:** horizontal bars, stacked Extraction (blue) + Stage 11 (purple), labelled with dollar amount. Data sorted by total cost descending.
2. **`PieChart` donut — Stage Breakdown:** 2 segments (Extraction / Stage 11). Centre label = total cost. Legend shows $/% per segment + learning savings row.
3. **Grouped `BarChart` — Token Breakdown:** input tokens (blue) and output tokens (lavender) per document as vertical bars.
4. **`BarChart` — Scanned vs Digital:** average cost per doc type with premium % callout.

**Filter dropdown:** All documents · Extraction only · Stage 11 only — filters all 4 charts simultaneously

---

### Screen 10 — Unmapped Resolver (`/resolver/[id]`)

> ⚠️ **Critical CSS:** `.screen-body` must use `flex:1; min-height:0; overflow:hidden`. The `.ur-layout` inside also needs `min-height:0` to prevent its flex children from overflowing the viewport.

**Layout:** `ur-layout` — 3-column horizontal flex:
- `.ur-list` (190px, `flex-shrink:0`, `overflow-y:auto`) — item list
- `.ur-detail` (`flex:1`, `overflow-y:auto`) — detail panel + rationale textarea + action buttons
- `.ur-suggs` (255px, `flex-shrink:0`, `overflow-y:auto`) — 3 suggestion cards + learning store note

**Item list:**
- Scrollable list of all unmapped items
- Active item highlighted (blue left-border)
- Resolved items: strikethrough, reduced opacity

**Detail panel:**
- Key-value rows: Raw label · Statement · Document · Values
- "Why unmapped" reason box (red tint)
- Analyst rationale textarea (pre-filled with AI-generated rationale, user editable)
- Buttons: "✓ Confirm Mapping" · "Skip" · "Next →"

**Suggestion cards (3):**
- CoA ID (monospace blue)
- CoA standard name
- Definition
- Confidence bar + score
- Click to select (blue border)
- Selected card's CoA ID populates confirm button label

**Confirm flow:**
1. `POST /api/spread/[id]/resolve-unmapped` `{ itemId, coaId, rationale }`
2. Item marked resolved in list (strikethrough)
3. Progress bar in topbar increments
4. Auto-advance to next unresolved item (500ms delay)
5. Toast: "✓ Mapping confirmed + stored in learning store"

**Progress bar:** topbar right, shows "N / M resolved"

---

### Screen 11 — Settings (`/settings`)

> ⚠️ **Critical CSS:** `.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px }` — `display:grid` is mandatory; without it the two-column layout collapses.

**Layout:** full-width cards with `.settings-full` class spanning both columns.

**Section 1 — LLM Model** (`.settings-full` — spans full width):
- 3 model cards in `grid-template-columns: repeat(3, 1fr)`:
  - `claude-sonnet-4-5` — "Best balance of accuracy and speed" — $3/$15 per M tokens
  - `claude-haiku-4-5` — "Fastest and cheapest" — $0.80/$4 per M tokens
  - `claude-opus-4-5` — "Highest accuracy" — $15/$75 per M tokens
- Click to select (blue border + "Selected" badge)
- Provider dropdown below: Anthropic API · AWS Bedrock · Azure Anthropic
- Connection indicator: green dot + "● Connected · latency ~420ms"
- **No API key field** — API key managed via environment variables only

**Section 2 — Confidence Thresholds** (left column of `.settings-grid`):
- 4 independent range sliders, each with live numeric readout:
  - Auto-accept (default 0.90) — green accent — "≥ this value → auto-mapped, no review"
  - Review recommended (default 0.75) — amber accent — "0.75–0.89 → flagged for optional review"
  - Confirm required (default 0.60) — red accent — "0.60–0.74 → confirm required"
  - Min accept / floor (default 0.55) — grey accent — "0.55–0.59 → auto-promoted near-miss"
- Threshold band visualiser below sliders: colour-coded horizontal bar showing all 5 bands

**Section 3 — Pipeline Defaults** (right column of `.settings-grid`):
- Toggle switches: Auto-run Stage 11 · Auto-apply learned mappings · Skip equity statement · Prompt caching
- Default export formats: XLSX · JSON · CSV · PDF checkboxes
- Max concurrent LLM calls: select (1 · 3 · 5 · 10)

**Section 4 — Output Paths** (`.settings-full` — spans full width):
- 6 path input rows in a 2-column grid:
  - XLSX output · JSON output
  - Logs directory · Learning store DB
  - PDF input watch · Batch output root
- Each row: label (130px) + text input + "Browse" button
- Browse → Electron `dialog.showOpenDialog` in desktop build; disabled with tooltip in web build

**Save / Reset buttons** in topbar right. On save: `POST /api/settings`.

---

## 5. Core Data Models

```typescript
type TemplateType = 'T1_US_GAAP' | 'T2_US_LP' | 'T3_IND_AS' | 'T4_OLD_INDIAN'
                 | 'T5_UK_CO'   | 'T6_UK_LLP' | 'T7_UK_MORTGAGE' | 'T8_IFRS_ASIA';

interface Document {
  id: string;
  company: string;
  year: number;
  template: TemplateType;
  extractionStatus: 'queued' | 'processing' | 'needs_review' | 'approved' | 'error';
  spreadStatus: 'none' | 'running' | 'has_unmapped' | 'complete';
  coaMapped: number;
  coaTotal: number;
  flaggedCount: number;
  healthScore: number;
}

interface CoaEntry {
  coaId: string;
  standardName: string;
  statementType: 'balance_sheet' | 'income_statement';
  aggregateValue: number;
  priorValue: number;
  confidence: number;
  source: 'learned' | 'claude' | 'auto' | 'manual' | 'unmapped';
  learnedFromDoc?: string;
  sourceLines: SourceLine[];
}

interface SourceLine {
  rawLabel: string;
  pageNum: number;
  value: number;
  priorValue: number;
  noteRef?: string;
  confidence: number;
}

interface UnmappedItem {
  id: string;
  documentId: string;
  rawLabel: string;
  statementType: 'balance_sheet' | 'income_statement' | 'cash_flow';
  fy1Value: number;
  fy2Value: number;
  confidence: number;
  topSuggestions: { coaId: string; coaName: string; definition: string; confidence: number }[];
  reason: string;
}

interface PendingMapping {
  item: UnmappedItem;
  coaId: string;
  coaName: string;
  analystRationale?: string;
}

interface AppSettings {
  model: 'sonnet45' | 'haiku' | 'opus45';
  provider: 'anthropic' | 'bedrock' | 'azure';
  thresholdAutoAccept: number;
  thresholdReview: number;
  thresholdConfirm: number;
  thresholdFloor: number;
  batchSize: 4 | 8 | 12 | 16;
  autoRunStage11: boolean;
  autoApplyLearned: boolean;
  skipEquityStatement: boolean;
  promptCaching: boolean;
  maxConcurrentCalls: number;
  outputXlsx: string;
  outputJson: string;
  outputLogs: string;
  outputDb: string;
  inputPdfWatch: string;
  outputBatch: string;
  exportFormats: ('xlsx' | 'json' | 'csv' | 'pdf')[];
}
```

---

## 6. API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/documents` | List all documents |
| `POST` | `/api/upload` | Single PDF upload → start pipeline |
| `POST` | `/api/batch` | Batch PDF upload |
| `GET` | `/api/pipeline/[jobId]/status` | Poll pipeline stage (TanStack Query 1.5s interval) |
| `GET` | `/api/documents/[id]/review` | Extracted rows for workbench |
| `GET` | `/api/documents/[id]/notes/[num]` | Note content |
| `GET` | `/api/documents/[id]/validation` | Validation results V01–V12 |
| `POST` | `/api/documents/[id]/validate` | Re-run validation |
| `GET` | `/api/spread/[id]` | Full CoA spread tree |
| `POST` | `/api/spread/[id]/mappings` | Save drag-drop resolved mappings |
| `GET` | `/api/spread/[id]/unmapped` | Unmapped items list |
| `POST` | `/api/spread/[id]/resolve-unmapped` | Confirm single item via resolver |
| `GET` | `/api/documents/[id]/export` | Download XLSX/JSON (`?format=&tier=`) |
| `GET` | `/api/usage` | LLM usage records |
| `GET` | `/api/settings` | Load settings |
| `POST` | `/api/settings` | Save settings |
| `GET` | `/api/coa-reference` | Full CoA reference (BS-001→BS-116, PL-001→PL-068) |

---

## 7. Animation & Transition Timings

| Element | Transition |
|---|---|
| Sidebar active item | background 150ms ease |
| Note drawer | `translateX(100%) → 0`, 250ms ease |
| Tree row expand | height `0 → auto`, 200ms ease-out (or display toggle for table rows) |
| DnD drag item | opacity 0.5, `scale(1.02)` |
| DnD drop target hover | `outline: 2px dashed #1d4ed8; background: #dbeafe`, 100ms |
| Save bar appear | height `0 → 52px`, 200ms ease |
| Toast | `translateY(60px) opacity-0 → translateY(0) opacity-1`, 280ms; auto-dismiss 2.8s |
| Pipeline step (running) | `opacity 1 → 0.35 → 1`, 1.2s ease-in-out, infinite |
| Confidence bar fill | `width` transition 500ms on mount |
| Upload zone hover | border-color + background, 200ms |
| Model card select | border-color + background, 150ms |

---

## 8. Known Rendering Issues Fixed in v6 (Reference for Claude Code)

These were rendering bugs in the HTML prototype — implement correctly from the start:

1. **`settings-grid` needs `display:grid`** — without it the two-column threshold + pipeline layout collapses into a single column.

2. **`.screen-body` on screens with internal flex layouts (Compare View, Unmapped Resolver)** must use `flex:1; min-height:0; overflow:hidden` instead of `overflow-y:auto`. Without `min-height:0`, the flex child does not shrink below its content size and overflows the viewport.

3. **`compare-3` flex children** — each of the 3 panes (PDF, CoA, Unmapped) must be a **direct child** of the `compare-3` flex container. The save bar lives inside `.cpane-coa` above the closing tag; there must be a proper closing `</div>` for `.cpane-coa` before the third pane opens.

4. **`.ur-layout` children** need `overflow-y:auto` individually (list, detail, suggestions) — the container has `overflow:hidden` and `min-height:0`. Without per-child overflow, content clips instead of scrolling.

5. **Tree children in compare view** use `display:none / display:''` toggling on table `<tr>` elements directly — not class toggling on `<tbody>`. For React, use a `isOpen` boolean to conditionally render the child rows.

---

## 9. Development Phases

### Phase 1 — Scaffold (Day 1)
- `npx create-next-app@latest spreadx --typescript --tailwind --app`
- Install: shadcn/ui, zustand, @tanstack/react-query, @dnd-kit/core, lucide-react, recharts
- Build `Sidebar` + `Topbar` layout, CSS variables, screen switching

### Phase 2 — Document Library + Upload (Day 2)
- `DocumentLibraryPage` with filter pills, mock data
- `UploadPage` single/batch mode toggle, `PipelineProgress`

### Phase 3 — Workbench + Statement Tree (Day 3)
- `ReviewWorkbenchPage` — split layout, react-pdf, cross-highlight, `NoteDrawer`
- `StatementTreePage` — accordion sections

### Phase 4 — Spread Review CoA Tree (Day 4)
- `CoaTree` component: expand/collapse, source line children, section headers
- All 5 tabs in Spread Review

### Phase 5 — Compare & Resolve 3-Pane (Day 5–6)
- `Compare3Pane` layout with correct height chain
- `CoaDropPane` = CoA tree + @dnd-kit `useDroppable` on each parent row
- `UnmappedDragPane` with `useDraggable` items
- Drop → leaf insertion + auto-expand + save bar

### Phase 6 — Unmapped Resolver (Day 7)
- 3-column layout with correct `min-height:0` chain
- Confirm flow, progress bar, suggestion card selection

### Phase 7 — LLM Cost + Settings (Day 8)
- 4 Recharts charts with filter
- Settings 2-column grid (with `display:grid`), model cards, sliders

### Phase 8 — API + Database (Day 9–11)
- SQLite via Drizzle ORM
- All API routes
- Connect to Python extraction backend (subprocess or HTTP)
- Pipeline polling via SSE or WebSocket

---

*Prototype reference: SpreadX Interactive Mockup v6 (HTML). All layouts, interactions, and data shapes have been validated in the prototype. See "Known Rendering Issues Fixed in v6" section before beginning implementation.*
