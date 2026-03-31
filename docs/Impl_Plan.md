# Financial SpreadX - Implementation Plan

## Overview

Financial SpreadX is a demo tool for extracting, mapping, and validating financial data from 19 pre-loaded PDF annual reports across 8 template families (US GAAP, Ind AS NBFC, UK Companies Act, IFRS Asia, etc.). It uses Claude AI for document classification and row extraction, a 9-module rule-based mapping engine, 12 accounting identity validations, and exports to XLSX/JSON. Built as a Next.js 14 app with Neon Postgres, Vercel Blob, and a 6-screen UI.

**Tech Stack**: Next.js 14 | TypeScript | Tailwind + shadcn/ui | Neon Postgres + Drizzle ORM | Claude AI (Vercel AI SDK) | Vercel Blob | exceljs | pdf-parse | react-pdf

---

## Test Sample Files

Two sample files from `Sample_Data/` are used for testing throughout all phases:

| ID | File | Size | Template | Type | Purpose |
|----|------|------|----------|------|---------|
| **DIGITAL** | `Aspect Capital Limited_2023.pdf` | 369 KB | T5 — UK Companies Act | Digital text-based PDF | Tests the standard text extraction path, financial page filtering, T5 template rules, GBP currency handling, and the full mapping + validation pipeline on clean digital pages. |
| **SCANNED** | `Sun Hung Kai & Co. Limited_AR_2024.pdf` | 3.2 MB | T8 — IFRS Asia | Large PDF, likely contains scanned/image pages | Tests the OCR/vision extraction path, page classification (digital vs scanned detection), rasterization pipeline, HKD currency handling, and T8 IFRS Asia template rules on a complex multi-page report. |

These two files are referenced as **DIGITAL** and **SCANNED** in the testing sections below.

---

## Phase 0 - Project Initialization (Manual Setup)

| # | Task | Command / Action |
|---|------|-----------------|
| 0.1 | Create Next.js project | `npx create-next-app@latest financial-spreadx --typescript --tailwind --app --src-dir=false --import-alias="@/*"` |
| 0.2 | Install runtime deps | `npm install drizzle-orm @neondatabase/serverless ai @ai-sdk/anthropic @anthropic-ai/sdk @vercel/blob zod exceljs pdf-parse pdfjs-dist @napi-rs/canvas react-pdf date-fns` |
| 0.3 | Install dev deps | `npm install -D drizzle-kit dotenv-cli tsx @types/node vitest @testing-library/react @testing-library/jest-dom` |
| 0.4 | Create Neon Postgres database | neon.tech -> New project -> copy DATABASE_URL and DATABASE_URL_UNPOOLED |
| 0.5 | Connect Neon to Vercel | Vercel -> Storage -> Connect Neon -> env vars auto-injected |
| 0.6 | Set up Vercel Blob | Vercel -> Storage -> Create Blob store -> copy BLOB_READ_WRITE_TOKEN |
| 0.7 | Create `.env.local` | 6 vars: ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN, DATABASE_URL, DATABASE_URL_UNPOOLED, DEMO_API_KEY=demo-spreadx-2025, NEXT_PUBLIC_APP_URL=http://localhost:3000 |
| 0.8 | Configure configs | `next.config.ts` (serverExternalPackages, bodySizeLimit: 52mb) + `drizzle.config.ts` + `vercel.json` (300s timeout) |
| 0.9 | Init shadcn/ui | `npx shadcn@latest init` then add button, input, select, badge, table, card |
| 0.10 | Place 19 PDFs | Copy from `Sample_Data/` to `/demo-docs/` with filenames matching seed script |
| 0.11 | Set up Vitest | Create `vitest.config.ts` with path aliases, test globals, and environment setup |
| 0.12 | Create test fixtures folder | Copy **DIGITAL** and **SCANNED** PDFs into `__tests__/fixtures/` for use in all subsequent phase tests |

### Phase 0 — Testing

| # | Test | Expected Result |
|---|------|-----------------|
| T0.1 | Run `npm run build` | Clean build, zero TypeScript errors |
| T0.2 | Run `npm run dev`, open `http://localhost:3000` | Next.js dev server starts, default page renders |
| T0.3 | Run `npx vitest --run` | Vitest runs successfully (zero tests, zero failures) |
| T0.4 | Verify `.env.local` is loaded | `console.log(process.env.DEMO_API_KEY)` prints `demo-spreadx-2025` in a test script |
| T0.5 | Verify **DIGITAL** PDF readable | `fs.readFileSync('__tests__/fixtures/Aspect_Capital_Limited_2023.pdf')` returns a Buffer with length > 0 |
| T0.6 | Verify **SCANNED** PDF readable | `fs.readFileSync('__tests__/fixtures/Sun_Hung_Kai_Co_Limited_AR_2024.pdf')` returns a Buffer with length > 3MB |

---

## Phase 1 - Data Layer (Database Schema, Queries, Seeds)

### Schema & Database

| # | Task | File(s) |
|---|------|---------|
| 1.1 | Define 8 database tables with Drizzle ORM | `lib/db/schema.ts` |
| | - `documents`: uuid pk, file_name, company_name, report_year int[], blob_url, page_count, ocr_required, template_type (T1-T8), classification_confidence, currency_code, unit_scale, status enum, page_classification_summary jsonb, statement_scopes text[] | |
| | - `document_pages`: per-page classification (digital/scanned/hybrid), word_count, section_type, note_number, is_selected, text_content, ocr_method | |
| | - `extracted_rows`: statement_type, raw_label, raw_values jsonb, page, section_path text[], indentation_level, note_ref, is_subtotal, statement_scope, column_metadata jsonb | |
| | - `mapped_rows`: canonical_field, canonical_group, parent_canonical_field, normalized_values jsonb, mapping_method enum, mapping_confidence, validation_results jsonb, review_status enum, statement_scope | |
| | - `canonical_fields`: ontology reference table (display_name, statement_type, field_group, parent_field, formula_rule, supported_templates) | |
| | - `mapping_rules`: knowledge base (template_type, normalized_label, context_pattern jsonb, canonical_field, confidence, source enum, active) | |
| | - `review_overrides`: analyst corrections (old/new canonical_field, old/new value, reviewer, reason) | |
| | - `note_entries`: note_number, note_title, pages int[], raw_text, extracted_subtables jsonb, linked_row_ids uuid[] | |
| 1.2 | Create database client | `lib/db/index.ts` - Neon serverless + Drizzle |
| 1.3 | Run migration | `npx drizzle-kit generate && npx drizzle-kit migrate` |

### Query Files

| # | Task | File |
|---|------|------|
| 1.4 | Document queries: getById, list (paginated+filtered), create, updateStatus, updateTemplate, updateValidation | `lib/db/queries/documents.ts` |
| 1.5 | Extracted row queries: insertBatch, getByDocument (filterable by statement_type) | `lib/db/queries/extracted-rows.ts` |
| 1.6 | Mapped row queries: insertBatch, getByDocument (filterable), updateReviewStatus, bulkApproveAboveThreshold | `lib/db/queries/mapped-rows.ts` |
| 1.7 | Review override queries: insert, getByDocument | `lib/db/queries/review-overrides.ts` |
| 1.8 | Document page queries: insertBatch, getSelectedPageText, updatePageSection | `lib/db/queries/document-pages.ts` |
| 1.9 | Note entry queries: insertBatch, getByDocument, getByNumber, updateLinkedRows | `lib/db/queries/note-entries.ts` |

### Seed Data

| # | Task | File |
|---|------|------|
| 1.10 | Define 40+ canonical fields (field_name, display_name, statement_type, field_group, parent_field, formula_rule, supported_templates) | `lib/mapping/canonical-fields.ts` |
| 1.11 | Seed canonical fields into DB | `scripts/seed-canonical-fields.ts` |
| 1.12 | Seed 60+ mapping rules across all 8 template families | `scripts/seed-mapping-rules.ts` |

### Phase 1 — Testing

| # | Test | Expected Result |
|---|------|-----------------|
| T1.1 | Run `npx drizzle-kit generate` | Migration SQL files generated without errors |
| T1.2 | Run `npx drizzle-kit migrate` | All 8 tables created in Neon. Verify via Neon console or `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` |
| T1.3 | **Schema validation unit test**: Import schema.ts and assert all 8 table exports exist (`documents`, `documentPages`, `extractedRows`, `mappedRows`, `canonicalFields`, `mappingRules`, `reviewOverrides`, `noteEntries`) | All exports defined with correct column types |
| T1.4 | **CRUD test — documents**: Insert a test document record for **DIGITAL** (company='Aspect Capital Limited', report_year=[2023], template_type='T5', currency_code='GBP'), read it back by ID, update status to 'extracting', verify update | Insert returns uuid, read returns matching record, status update persists |
| T1.5 | **CRUD test — documents**: Insert a test document record for **SCANNED** (company='Sun Hung Kai & Co', report_year=[2024], template_type='T8', currency_code='HKD'), read it back, verify all fields | Insert returns uuid, all fields match including template_type='T8' |
| T1.6 | **CRUD test — extracted_rows**: Insert 5 mock extracted rows for the **DIGITAL** document (statement_type='income_statement', raw_label samples like 'Turnover', 'Administration expenses'), retrieve by document_id with statement_type filter | Batch insert succeeds, filter returns only income_statement rows |
| T1.7 | **CRUD test — mapped_rows**: Insert 3 mock mapped rows for **DIGITAL**, test getMappedRowsByDocument with review_status='needs_review' filter and confidence_below=0.8 filter | Filters return correct subsets |
| T1.8 | **CRUD test — document_pages**: Insert 5 mock page classification records for **SCANNED** (3 digital, 1 hybrid, 1 scanned), query and verify classification counts | Returns 5 records with correct classification distribution |
| T1.9 | **CRUD test — note_entries**: Insert 2 mock note entries for **DIGITAL**, test getNoteByNumber returns correct note | Returns note with matching note_number and document_id |
| T1.10 | **Seed test — canonical_fields**: Run `seed-canonical-fields.ts`, query `SELECT count(*) FROM canonical_fields` | Count >= 40, includes key fields: net_income, total_assets, total_revenue, cash_end |
| T1.11 | **Seed test — mapping_rules**: Run `seed-mapping-rules.ts`, query `SELECT count(*) FROM mapping_rules` | Count >= 60, includes rules for T5 (e.g., 'turnover' -> total_revenue) and T8 (e.g., 'brokerage handling fee income' -> commission_income) |
| T1.12 | **Pagination test**: Insert 25 document records, test listDocuments with page=1 limit=10 and page=3 limit=10 | Page 1 returns 10 records, page 3 returns 5 records |
| T1.13 | Run `npm run build` | Zero TypeScript errors after all schema + query additions |

---

## Phase 2 - PDF Processing Modules

| # | Task | File |
|---|------|------|
| 2.1 | **Page Classifier**: `classifyPdfPages(buffer)` -> `ClassifiedPage[]`. Per-page word count + ASCII ratio. Digital (>=80 words, >=90% ASCII) / hybrid (20-79) / scanned (<20). Uses pdf-parse pagerender callback. | `lib/pdf/page-classifier.ts` |
| 2.2 | **Financial Page Filter**: `filterFinancialPages(classifiedPages)` -> `FilterResult`. Regex patterns for income_statement, balance_sheet, cash_flow, equity_statement, notes headings. 5-page trailing continuation window. Note page detection with notePageMap. | `lib/pdf/page-filter.ts` |
| 2.3 | **Column Classifier**: `classifyColumnHeaders(rawHeaders)` -> `ColumnMetadata[]`. Classify year columns as actual/budget/forecast/restated via pattern matching. | `lib/pdf/column-classifier.ts` |
| 2.4 | **Page Rasterizer**: `rasterizePage(pdfBuffer, pageNumber, scale=2.0)` using pdfjs-dist + @napi-rs/canvas. Returns PNG Buffer for OCR path. | `lib/pdf/page-rasterizer.ts` |

### Phase 2 — Testing

| # | Test | Expected Result |
|---|------|-----------------|
| T2.1 | **Page classifier — DIGITAL**: Run `classifyPdfPages()` on **DIGITAL** (Aspect Capital 2023, 46 pages) | Returns ClassifiedPage[] with length=46. Majority of pages classified as 'digital' (word_count >= 80). Zero or near-zero 'scanned' pages. |
| T2.2 | **Page classifier — SCANNED**: Run `classifyPdfPages()` on **SCANNED** (Sun Hung Kai 2024, ~200+ pages) | Returns ClassifiedPage[] with length > 100. Should detect at least some 'scanned' or 'hybrid' pages (word_count < 80). Log the classification breakdown: {digital: N, scanned: N, hybrid: N}. |
| T2.3 | **Page classifier — edge cases unit test**: Create synthetic page data with (a) 0 words, (b) 19 words, (c) 20 words, (d) 79 words, (e) 80 words, (f) 100 words with 89% ASCII ratio | (a) scanned, (b) scanned, (c) hybrid, (d) hybrid, (e) digital, (f) hybrid (ASCII < 90%) |
| T2.4 | **Page filter — DIGITAL**: Run `filterFinancialPages()` on classified pages from **DIGITAL** | Returns FilterResult with selectedPages containing at least income_statement and balance_sheet sections. reductionRatio < 1.0 (some pages filtered out). filteredPageCount < totalPageCount. |
| T2.5 | **Page filter — SCANNED**: Run `filterFinancialPages()` on classified pages from **SCANNED** | Returns FilterResult with multiple sections detected. reductionRatio significantly < 1.0 (large report, many non-financial pages). notePageMap has at least some entries. |
| T2.6 | **Page filter — regex unit test**: Test each SECTION_PATTERNS regex against known heading strings: "Statement of Profit and Loss" -> income_statement, "Consolidated Balance Sheet" -> balance_sheet, "Statement of Cash Flows" -> cash_flow, "Changes in Shareholders' Equity" -> equity_statement, "Notes to the Financial Statements" -> notes | All 5 headings matched to correct section |
| T2.7 | **Page filter — continuation window test**: Create mock pages where page 10 matches 'balance_sheet' heading. Verify pages 11-15 are included in the 5-page trailing window. Verify page 16 is NOT included. | Pages 10-15 selected, page 16 excluded |
| T2.8 | **Column classifier — unit test**: Test with headers ["2024", "2023", "2022 (Restated)", "Budget 2025", "Forecast 2026"] | Returns: [{year:2024, type:'actual'}, {year:2023, type:'actual'}, {year:2022, type:'restated'}, {year:2025, type:'budget'}, {year:2026, type:'forecast'}] |
| T2.9 | **Page rasterizer — SCANNED**: Run `rasterizePage()` on page 1 of **SCANNED** at scale=2.0 | Returns a PNG Buffer with length > 0 (typically 150-300 KB). Verify buffer starts with PNG magic bytes (0x89504E47). |
| T2.10 | **Page rasterizer — DIGITAL**: Run `rasterizePage()` on page 1 of **DIGITAL** at scale=2.0 | Returns a valid PNG Buffer. Even digital pages should rasterize successfully (used as fallback). |
| T2.11 | Run `npm run build` | Zero TypeScript errors |

---

## Phase 3 - Mapping Engine (9 Modules + 8 Template Rules)

### Core Modules (M1-M6)

| # | Module | Task | File |
|---|--------|------|------|
| 3.1 | M1 - Label Normalizer | Strip leading numerals, remove note refs `(Note 21)`, expand abbreviations (PBT->profit before tax, PAT, EPS), normalize whitespace/case, handle multi-line Asian labels | `lib/mapping/label-normalizer.ts` |
| 3.2 | M2 - Canonical Dictionary | ~400 label-to-canonical lookups by template family. `lookupCanonicalField(normalizedLabel, templateType)` with confidence scores | `lib/mapping/dictionary.ts` |
| 3.3 | M3 - Disambiguator | Context-aware disambiguation using statement_type, section_path, row_neighbors, template_type (e.g., "other income" in IS vs BS; "interest income" in CF vs IS) | `lib/mapping/disambiguator.ts` |
| 3.4 | M4 - Hierarchy Engine | `buildStatementTree()` from indentation + subtotal detection. `inferMissingSubtotals()` where arithmetic is unambiguous. Validate children sum to parent. | `lib/mapping/hierarchy-engine.ts` |
| 3.5 | M5 - Formula Validator | 12 checks V01-V12. V01: assets=liabilities+equity (0.1%). V02: PBT=income-expenses (0.5%). V03: net_income=PBT-tax (0.1%). V05: cash reconciliation (0.5%). V10: EPS check (T1/T3 only). V11: members' capital (T6 only). V12: YoY comparative match. | `lib/mapping/formula-validator.ts` |
| 3.6 | M6 - Confidence Engine | Composite score (0-1). Weights: dictionary 50%, context 20%, formula 20%, historical 10%. Auto-approve >=0.95. Flag <0.80. OCR rows get -0.05 penalty. | `lib/mapping/confidence-engine.ts` |

### Additional Modules (M7-M9)

| # | Module | Task | File |
|---|--------|------|------|
| 3.7 | M7 - Scope Detector | `detectScope(pageText)` -> 'standalone'\|'consolidated'\|'unknown'. Pattern match "Consolidated"/"Group" vs "Standalone"/"Company" | `lib/mapping/scope-detector.ts` |
| 3.8 | M9 - Entity Linker | `parseNoteNumber(noteRef)` + `linkNotesToRows(documentId, rows, noteEntries)`. Bidirectional FK: row->note and note->linked_row_ids | `lib/mapping/entity-linker.ts` |

### Orchestrator

| # | Task | File |
|---|------|------|
| 3.9 | `runMappingEngine(rows, templateType, documentId)` orchestrating M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7 -> M8 -> M9 in sequence | `lib/mapping/index.ts` |

### Template Rule Files (8 files)

| # | Template | Covers Documents | File |
|---|----------|-----------------|------|
| 3.10 | T1 - US GAAP Standard Corporate | Cash America (2007), Freddie Mac (2023), LaBranche (2008) | `lib/mapping/template-rules/t1-us-gaap.ts` |
| 3.11 | T2 - US GAAP Alt Investment/LP/LLC | TPG Group (2022), Jane Street (2024) | `lib/mapping/template-rules/t2-us-alt-investment.ts` |
| 3.12 | T3 - Ind AS / NBFC (India) | HDFC Credila (2023), L&T Finance (2019), Aditya Birla Finance (2024) | `lib/mapping/template-rules/t3-ind-as-nbfc.ts` |
| 3.13 | T4 - Old Indian GAAP (Pre-Ind AS) | Sterling Biotech (2008) | `lib/mapping/template-rules/t4-old-indian-gaap.ts` |
| 3.14 | T5 - UK Companies Act (Asset Mgr) | Aspect Capital (2023), Rathbone (2024), Babcock & Brown Eifel (2008) | `lib/mapping/template-rules/t5-uk-companies-act.ts` |
| 3.15 | T6 - UK LLP / Partnership | Jade Merchant (2021), TFG Asset Management (2024) | `lib/mapping/template-rules/t6-uk-llp.ts` |
| 3.16 | T7 - UK Specialist Lender / Mortgage | Paratus AMC (2024), Southern Pacific Mortgage (2021) | `lib/mapping/template-rules/t7-uk-mortgage.ts` |
| 3.17 | T8 - IFRS Asia Securities / Broker | Orient Securities (2024), Fubon Securities (2017), Sun Hung Kai (2024) | `lib/mapping/template-rules/t8-ifrs-asia.ts` |

### Phase 3 — Testing

#### M1 — Label Normalizer Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.1 | Normalize "VII. Profit for the year" | `"profit for the year"` |
| T3.2 | Normalize "Interest income (Note 21)" | `"interest income"` |
| T3.3 | Normalize "PBT" | `"profit before tax"` |
| T3.4 | Normalize "  Net\n  Income   (Restated) " | `"net income"` |
| T3.5 | Normalize T8-style multi-line label "手续费及佣金收入\nCommission and fee income" | `"commission and fee income"` (extracts English portion) |

#### M2 — Dictionary Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.6 | Look up "turnover" with template T5 | Returns `{canonical_field: 'total_revenue', confidence: >= 0.95}` |
| T3.7 | Look up "brokerage handling fee income" with template T8 | Returns `{canonical_field: 'commission_income', confidence: >= 0.95}` |
| T3.8 | Look up "reserve u/s 45-ic of reserve bank of india act 1934" with T3 | Returns `{canonical_field: 'statutory_reserve_rbi', confidence: 1.0}` |
| T3.9 | Look up unknown label "xyz miscellaneous widget" with T5 | Returns null or confidence < 0.5 |

#### M3 — Disambiguator Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.10 | Disambiguate "other income" in context {statement_type: 'income_statement'} | Returns `other_income` |
| T3.11 | Disambiguate "other income" in context {statement_type: 'balance_sheet', section_path: ['assets']} | Flags for review (ambiguous in BS context) |
| T3.12 | Disambiguate "interest income" in context {statement_type: 'cash_flow', section_path: ['investing']} | Returns `interest_received_investing` |
| T3.13 | Disambiguate "interest income" in context {statement_type: 'income_statement'} | Returns `interest_income` |

#### M4 — Hierarchy Engine Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.14 | Build tree from mock T5 income statement rows: [{label:'Turnover', indent:0, value:5000}, {label:'Cost of sales', indent:1, value:-3000}, {label:'Gross profit', indent:0, is_subtotal:true, value:2000}] | Tree built with Gross profit as parent of Turnover + Cost of sales. Children sum (5000 + -3000 = 2000) matches subtotal. |
| T3.15 | Build tree from mock T8 rows with missing subtotal: [{label:'Fee income', indent:1, value:100}, {label:'Interest income', indent:1, value:200}] — no explicit total_revenue | `inferMissingSubtotals()` inserts total_revenue = 300 |

#### M5 — Formula Validator Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.16 | V01: total_assets=1000, total_liabilities=600, total_equity=400 | `passed` |
| T3.17 | V01: total_assets=1000, total_liabilities=600, total_equity=401 (diff=0.1%) | `passed` (within 0.1% tolerance) |
| T3.18 | V01: total_assets=1000, total_liabilities=600, total_equity=410 (diff=1.0%) | `failed` (exceeds 0.1% tolerance) |
| T3.19 | V03: PBT=100, tax=25, net_income=75 | `passed` |
| T3.20 | V05: cash_start=50, net_operating=30, net_investing=-10, net_financing=-5, cash_end=65 | `passed` |
| T3.21 | V10 with template T5 (no EPS): skip | `skipped` (T5 does not have EPS) |
| T3.22 | V11 with template T5 (not T6): skip | `skipped` (V11 is T6 only) |
| T3.23 | Run all 12 validations with complete mock **DIGITAL** (T5) canonical map | At minimum V01, V02, V03 return passed/failed (not skipped). V10, V11 return skipped. |

#### M6 — Confidence Engine Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.24 | Dictionary confidence=0.98, context=0.95, formula=passed, historical=0.90 | Composite >= 0.95 -> auto_approved |
| T3.25 | Dictionary confidence=0.70, context=0.60, formula=failed, historical=0.50 | Composite < 0.80 -> needs_review |
| T3.26 | Same as T3.24 but with ocr_method='claude_vision' | Composite = T3.24 result - 0.05 (OCR penalty) |

#### M7 — Scope Detector Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.27 | detectScope("Consolidated Statement of Profit and Loss") | `'consolidated'` |
| T3.28 | detectScope("Standalone Balance Sheet") | `'standalone'` |
| T3.29 | detectScope("Statement of Financial Position") — no scope keyword | `'unknown'` |

#### M9 — Entity Linker Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.30 | parseNoteNumber("Note 12") | `12` |
| T3.31 | parseNoteNumber("(Note 3.1)") | `3` |
| T3.32 | parseNoteNumber(null) | `null` |
| T3.33 | parseNoteNumber("See accompanying notes") | `null` |

#### Template Rules Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T3.34 | **T5 rules — DIGITAL**: Load t5-uk-companies-act.ts rules. Verify 'turnover' maps to 'total_revenue', 'administration expenses' maps to 'admin_expenses', 'operating (loss)/profit' maps to 'operating_income' | All 3 mappings correct with confidence >= 0.90 |
| T3.35 | **T8 rules — SCANNED**: Load t8-ifrs-asia.ts rules. Verify 'brokerage handling fees' maps to 'commission_income', 'securities lending income' maps to 'securities_lending_income', 'clearing settlement funds' maps to 'clearing_funds' | All 3 mappings correct with confidence >= 0.90 |
| T3.36 | **All 8 rule files load**: Import all 8 template rule files, verify each exports a valid rules array with length > 0 | All 8 files export non-empty rule arrays |

#### Orchestrator Integration Test

| # | Test | Expected Result |
|---|------|-----------------|
| T3.37 | Run `runMappingEngine()` with 10 mock extracted rows representing a T5 income statement (labels: Turnover, Cost of sales, Gross profit, Admin expenses, Operating loss, Interest payable, Loss before tax, Tax, Loss for year, Loss per share) | Returns 10 mapped rows. At least 8/10 have confidence >= 0.80. canonical_fields include total_revenue, operating_income, net_income. Statement tree is built correctly. |
| T3.38 | Run `runMappingEngine()` with 5 mock extracted rows representing a T8 balance sheet (labels: Cash and bank balances, Clearing settlement funds, Total assets, Borrowings, Total liabilities) | Returns 5 mapped rows. V01 check runs (assets = liabilities + equity, may skip if equity missing). |
| T3.39 | Run `npm run build` | Zero TypeScript errors |

---

## Phase 4 - Claude AI Integration

| # | Task | File |
|---|------|------|
| 4.1 | **Template Classifier**: `classifyDocument()` using Vercel AI SDK `generateObject()` + Zod schema. Returns template_type (T1-T8/T0_unknown), confidence (0-1), signals_matched, detected_currency, detected_unit_scale, statement_types_found, statement_scopes (standalone/consolidated). Falls back to T0_unknown if confidence <0.6. | `lib/claude/classify.ts` |
| 4.2 | **Row Extractor**: `extractStatement(pageText, statementType, templateType)` returning rows with all year columns. Each row: raw_label, raw_values (all years), section_path, indentation_level, is_subtotal, note_ref. | `lib/claude/extract.ts` |
| 4.3 | **Note Extractor**: `extractNote(noteText, noteNumber, templateType)` returning note_number, note_title, summary (max 500 chars), sub_tables array. Only extracts notes referenced by financial rows. | `lib/claude/extract-notes.ts` |
| 4.4 | **Vision Extractor (OCR)**: `extractStatementFromImage(imageBuffer, statementType, templateType, pageNumber)` using Anthropic SDK directly (not Vercel AI SDK) with base64 image blocks. Returns same ExtractedRow[] schema. For scanned pages. | `lib/claude/extract-vision.ts` |
| 4.5 | **Claude Mapping Fallback**: `claudeMapLabel()` for rows where dictionary confidence <0.7. Records mapping_method='claude'. | `lib/claude/map.ts` |
| 4.6 | **Explanation Streamer**: `streamMappingExplanation()` using `streamText()` returning ReadableStream for workbench Explain button. | `lib/claude/explain.ts` |

### Phase 4 — Testing

| # | Test | Expected Result |
|---|------|-----------------|
| T4.1 | **Classify — DIGITAL**: Extract text from first 10 financial pages of **DIGITAL** (Aspect Capital 2023), call `classifyDocument()` | Returns template_type='T5', confidence >= 0.7, detected_currency='GBP', statement_types_found includes 'income_statement' and 'balance_sheet'. signals_matched includes at least one of: 'Turnover', 'Administration expenses', 'Companies Act 2006'. |
| T4.2 | **Classify — SCANNED**: Extract text from first 10 financial pages of **SCANNED** (Sun Hung Kai 2024), call `classifyDocument()` | Returns template_type='T8', confidence >= 0.6, detected_currency='HKD'. statement_scopes includes 'consolidated'. |
| T4.3 | **Classify — Zod schema validation**: Pass malformed data to classification schema | Zod validation rejects: missing template_type, confidence out of 0-1 range, invalid template_type value |
| T4.4 | **Extract — DIGITAL**: Take one income statement page from **DIGITAL**, call `extractStatement(pageText, 'income_statement', 'T5')` | Returns ExtractedRow[] with length >= 5. Rows include labels like 'Turnover' or 'Administration expenses'. raw_values has at least one year column (e.g., "2023"). All rows have valid section_path arrays. |
| T4.5 | **Extract — SCANNED text pages**: Take one balance sheet page from **SCANNED** (digital page), call `extractStatement(pageText, 'balance_sheet', 'T8')` | Returns ExtractedRow[] with length >= 3. Rows include Asian financial labels. raw_values has year columns. |
| T4.6 | **Extract Vision — SCANNED**: Rasterize one page from **SCANNED** that was classified as 'scanned' or 'hybrid', call `extractStatementFromImage()` | Returns ExtractedRow[] (may be empty if page is not financial). If financial page: rows have raw_label and raw_values matching image content. Returns same schema shape as text extraction. |
| T4.7 | **Extract Notes — DIGITAL**: Find a note page from **DIGITAL**, call `extractNote()` with the note text | Returns object with note_number (integer), note_title (non-empty string), summary (length <= 500). Zod schema validates. |
| T4.8 | **Claude map fallback**: Call `claudeMapLabel()` with label "Profit available for discretionary distribution among members" and template_type='T6' | Returns a canonical_field suggestion (e.g., 'net_income') with mapping_method='claude' |
| T4.9 | **Explain streamer**: Call `streamMappingExplanation()` with a mock mapped row | Returns a ReadableStream that yields text chunks. Concatenated output is a coherent explanation. |
| T4.10 | Run `npm run build` | Zero TypeScript errors |

---

## Phase 5 - API Routes + Middleware

| # | Route | Method | Task |
|---|-------|--------|------|
| 5.1 | `middleware.ts` | - | API key auth: check `x-api-key` header or `demo-api-key` cookie against `DEMO_API_KEY`. Protect `/api/` and `/(dashboard)/` |
| 5.2 | `/api/documents` | POST | **Full 10-stage synchronous pipeline**: (1) Upload to Vercel Blob + create record, (2) Per-page classification, (3) Financial page filtering, (4) Template classification via Claude, (5) Row extraction with scope + column detection (OCR branch for scanned pages), (6) Note extraction for referenced notes, (7) Mapping engine M1-M9, (8) Entity linking notes<->rows, (9) Validation V01-V12 on actual columns only, (10) Status update + review queue |
| 5.2b | `/api/documents` | GET | Paginated list with `?status=` and `?template_type=` filters |
| 5.3 | `/api/documents/[id]` | GET/DELETE | Full record with counts / soft-delete |
| 5.4 | `/api/documents/[id]/rows` | GET | Paginated extracted rows with `?statement_type=` filter |
| 5.5 | `/api/documents/[id]/mapped` | GET | Paginated mapped rows with `?review_status=` and `?confidence_below=` filters |
| 5.6 | `/api/documents/[id]/validation` | GET | Run V01-V12, return ValidationReport |
| 5.7 | `/api/review/[mappedRowId]` | POST | Accept analyst override -> write to review_overrides -> update mapped_row |
| 5.8 | `/api/review/[id]/explain` | GET | Stream Claude explanation via SSE |
| 5.9 | `/api/export/[id]/xlsx` + `/json` + `/raw-json` | GET | Generate export, upload to Blob, return 7-day signed URL |
| 5.10 | `/api/notes/[documentId]/[noteNumber]` | GET | Return note_entry for note drawer |

### Phase 5 — Testing

#### Middleware Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T5.1 | Request `/api/documents` with no API key | 401 Unauthorized |
| T5.2 | Request `/api/documents` with wrong API key in `x-api-key` header | 401 Unauthorized |
| T5.3 | Request `/api/documents` with correct API key in `x-api-key` header | 200 OK (or appropriate response) |
| T5.4 | Request `/api/documents` with correct API key in `demo-api-key` cookie | 200 OK |
| T5.5 | Request to non-protected route (e.g., `/`) with no API key | Passes through (not blocked) |

#### Pipeline Integration Test — DIGITAL

| # | Test | Expected Result |
|---|------|-----------------|
| T5.6 | **Full pipeline — DIGITAL**: POST `/api/documents` with **DIGITAL** PDF (Aspect Capital 2023) | Returns 200 with `{documentId: uuid}`. Document record created with status 'ready_for_review' or 'reviewed'. |
| T5.7 | Verify Stage 2 output: GET `/api/documents/{id}` and check `page_classification_summary` | Shows `{digital: ~46, scanned: 0, hybrid: 0, total: 46}` (all digital) |
| T5.8 | Verify Stage 4 output: Check document `template_type` | `T5` with classification_confidence >= 0.7, currency_code='GBP' |
| T5.9 | Verify Stage 5 output: GET `/api/documents/{id}/rows` | Returns extracted rows with statement_type values including 'income_statement' and 'balance_sheet'. Total row count > 20. |
| T5.10 | Verify Stage 7 output: GET `/api/documents/{id}/mapped` | Returns mapped rows with canonical_field values. Mapping methods include 'dictionary'. At least 70% of rows have confidence >= 0.80. |
| T5.11 | Verify Stage 9 output: GET `/api/documents/{id}/validation` | Returns ValidationReport with V01-V12 results. At least V01, V02, V03 are not 'skipped'. |

#### Pipeline Integration Test — SCANNED

| # | Test | Expected Result |
|---|------|-----------------|
| T5.12 | **Full pipeline — SCANNED**: POST `/api/documents` with **SCANNED** PDF (Sun Hung Kai 2024) | Returns 200 with `{documentId: uuid}`. Document created. Processing completes within 300s timeout. |
| T5.13 | Verify Stage 2 output: Check `page_classification_summary` | Shows non-zero digital count. If scanned pages detected: `scanned > 0` and `ocr_required = true`. |
| T5.14 | Verify Stage 4 output: Check template_type | `T8` with currency_code='HKD' |
| T5.15 | Verify OCR branch: If scanned pages exist, check extracted rows for rows with `ocr_method='claude_vision'` | Rows from scanned pages have ocr_method set. Same schema as text-extracted rows. |

#### CRUD API Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T5.16 | GET `/api/documents` with `?status=ready_for_review` | Returns only documents with matching status |
| T5.17 | GET `/api/documents/{id}/mapped?review_status=needs_review` | Returns only flagged rows (confidence < 0.80) |
| T5.18 | GET `/api/documents/{id}/mapped?confidence_below=0.7` | Returns only rows with confidence < 0.7 |
| T5.19 | POST `/api/review/{mappedRowId}` with override payload `{new_canonical_field: 'total_revenue', reason: 'Test correction'}` | 200 OK. Override saved. Mapped row updated. |
| T5.20 | GET `/api/notes/{documentId}/{noteNumber}` for a known note from **DIGITAL** | Returns note_entry with note_title, raw_text, pages array |
| T5.21 | GET `/api/review/{id}/explain` | Returns SSE stream with text/event-stream content-type |
| T5.22 | Run `npm run build` | Zero TypeScript errors |

---

## Phase 6 - Frontend (6 Screens + Shared Components)

### Design Tokens & Shell

| # | Task | File |
|---|------|------|
| 6.1 | Add CSS design tokens (sidebar colors, template badge T1-T8 colors, confidence thresholds, validation borders, flagged row styles) | `app/globals.css` |
| 6.2 | Dashboard shell layout: 200px dark sidebar (#0f1117), logo, nav groups (Ingestion/Review/Output) with colored dots + count badges, user avatar footer, 48px topbar, 14px scrollable content area | `app/(dashboard)/layout.tsx` |

### Shared Components

| # | Component | Spec | File |
|---|-----------|------|------|
| 6.3 | StatCard | Label (9.5px uppercase), large number (19px), sub-label. Colored number for alerts. | `components/ui/StatCard.tsx` |
| 6.4 | TemplateBadge | T1-T8 color-coded pill (10px, 20px radius). Accepts templateType prop. | `components/ui/TemplateBadge.tsx` |
| 6.5 | StatusBadge | Approved=green, Needs review=amber, Error=red, Processing=blue pill. | `components/ui/StatusBadge.tsx` |
| 6.6 | HealthBar | 52px wide, 4px tall progress bar. >=90% green, 60-89% amber, <60% red. | `components/ui/HealthBar.tsx` |
| 6.7 | ConfidenceBar | 32px wide, 3px tall inline bar + % text. >=90% green, 70-89% amber, <70% red. | `components/ui/ConfidenceBar.tsx` |

### Screens

| # | Screen | Route | Key Features |
|---|--------|-------|-------------|
| 6.8 | **Document Library** | `/documents` | 4 stat cards + TanStack table (Company, Year, Template badge, Status, Health bar, Review count, Export badges, Action link). Filter pills. React Query 5s polling. |
| 6.9 | **Upload & Classify** | `/upload` | Two-column: drop zone + classification result card (confidence ring, template, currency, scale, statements, page count, OCR, signals) | recent uploads list. 10-stage pipeline step card with animated progress. |
| 6.10-6.14 | **Review Workbench** | `/review/[id]` | Split pane: PdfViewer (238px, amber highlight) + MappingTable (TanStack, flagged rows amber bg, inline dropdown, scope badge, column type badges). MappingExplainer (SSE stream). NoteDrawer (320px, note title/summary/sub-tables). |
| 6.15 | **Statement Tree** | `/review/[id]/tree` | 4 accordion sections (IS/BS/CF/Equity). Tree rows: section, canonical_field, source_label, current_value, prior_value, status_dot. Subtotals bold. BS/CF/Equity collapsed by default. |
| 6.16 | **Validation Dashboard** | `/validation/[id]` | Health gauge (large score + 200px bar). 3-column V01-V12 card grid. Green 3px left border=pass, red=fail. Each card: check ID, name, formula, result. |
| 6.17 | **Export Centre** | `/export/[id]` | Tier selector (Raw/Canonical/Reviewed). Format cards: XLSX (8 tab pills), JSON, CSV (deferred), PDF (deferred). Bulk export panel with FX rates. |

### Phase 6 — Testing

#### Component Unit Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T6.1 | **TemplateBadge**: Render with templateType='T5' | Renders pill with text "T5", background color #ccfbf1, text color #134e4a |
| T6.2 | **TemplateBadge**: Render with templateType='T8' | Renders pill with text "T8", background color #ccfbf1, text color #134e4a |
| T6.3 | **StatusBadge**: Render with status='needs_review' | Renders amber pill with text "Needs review" |
| T6.4 | **StatusBadge**: Render with status='auto_approved' | Renders green pill with text "Approved" |
| T6.5 | **HealthBar**: Render with value=95 | Green fill bar at 95% width |
| T6.6 | **HealthBar**: Render with value=50 | Red fill bar at 50% width |
| T6.7 | **ConfidenceBar**: Render with value=0.97 | Green 32px bar + "97%" text |
| T6.8 | **ConfidenceBar**: Render with value=0.65 | Red 32px bar + "65%" text |
| T6.9 | **StatCard**: Render with label="Total Docs", value=19, subLabel="across 8 templates" | All three text elements visible |

#### Shell & Navigation Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T6.10 | **Layout renders**: Mount `(dashboard)/layout.tsx` | Sidebar visible (200px wide, #0f1117 bg). Logo "Financial SpreadX" present. All 3 nav groups rendered (Ingestion, Review, Output). |
| T6.11 | **Active nav**: Navigate to `/documents` | "Documents" nav item has active styling (white text, #ffffff10 bg). Other items at 45% opacity. |
| T6.12 | **Nav routing**: Click each nav item | Navigates to correct route without errors |

#### Screen-Level Tests — Using DIGITAL document data

| # | Test | Expected Result |
|---|------|-----------------|
| T6.13 | **/documents page**: Load with **DIGITAL** and **SCANNED** documents in DB | Table renders 2 rows. Aspect Capital shows T5 badge, GBP. Sun Hung Kai shows T8 badge, HKD. Stat cards show correct totals. |
| T6.14 | **/documents filter**: Click "Needs review" filter pill | Table filters to show only documents with needs_review status |
| T6.15 | **/upload page**: Render with no upload in progress | Drop zone visible with dashed border. "Choose file" button present. Recent uploads list empty or showing prior uploads. |
| T6.16 | **/review/[id] — DIGITAL**: Load workbench for **DIGITAL** document | Left pane: PDF renders (Aspect Capital PDF visible). Right pane: MappingTable shows rows with raw_label, canonical_field, values, confidence bars. At least some rows flagged with amber bg. |
| T6.17 | **/review/[id] — SCANNED**: Load workbench for **SCANNED** document | Same layout renders. If OCR rows exist, they show amber "OCR" badge. Note links present for rows with note_ref. |
| T6.18 | **/review/[id] — NoteDrawer**: Click a "Note N ->" link on a row in **DIGITAL** workbench | 320px drawer slides open from right. Shows note title, summary text, sub-tables (if any), "View in PDF" link. |
| T6.19 | **/review/[id] — override**: Click "Edit" on a flagged row, select new canonical_field from dropdown, submit | POST to /api/review/{id} succeeds. Row updates to show new canonical_field. Review status changes. |
| T6.20 | **/review/[id]/tree — DIGITAL**: Load statement tree for **DIGITAL** | 4 accordion sections rendered. Income Statement expanded by default. Tree rows show canonical_field, source_label, values, status dots. Subtotals are bold. |
| T6.21 | **/validation/[id] — DIGITAL**: Load validation dashboard for **DIGITAL** | Health gauge shows score (e.g., "8 / 12"). V01-V12 cards rendered in 3-column grid. Passing cards have green left border. Failing/skipped cards have red/gray border. |
| T6.22 | **/export/[id] — DIGITAL**: Load export centre for **DIGITAL** | Tier selector shows 3 pills. XLSX card shows 8 sheet tab pills. JSON card active. CSV and PDF cards show "Deferred" state. |
| T6.23 | Run `npm run build` | Zero TypeScript errors |
| T6.24 | **Visual regression**: Open each screen in browser, compare against `docs/Demo_Mockup.html` | Layout matches mockup: sidebar width, topbar height, card styles, badge colors, table formatting. No broken layouts or overflows. |

---

## Phase 7 - Export Service

| # | Task | File |
|---|------|------|
| 7.1 | `getFxRate(currency, date)` with hardcoded DEMO_FX_RATES fallback: GBP=1.2653, INR=0.01203, RMB=0.14062, NTD=0.03182, HKD=0.12796, USD=1.0 | `lib/export/fx-rates.ts` |
| 7.2 | `generateXlsx(doc, mappedRows)` using exceljs. **8 tabs**: Summary (metadata + V01-V12 scorecard), Income Statement, Balance Sheet, Cash Flow, Equity Statement, Validation (check details), Raw Extraction (audit trail), Metadata. Frozen headers, auto-filters, conditional formatting, bold subtotals. | `lib/export/xlsx-export.ts` |
| 7.3 | `generateReviewedJson(documentId)` returning canonical JSON: document metadata, statements with rows (canonical_field, display_name, raw_label, values, values_usd_thousands, confidence, review_status), validation per statement, FX conversion. | `lib/export/json-export.ts` |

### Phase 7 — Testing

#### FX Rates Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T7.1 | `getFxRate('GBP')` | Returns 1.2653 |
| T7.2 | `getFxRate('HKD')` | Returns 0.12796 |
| T7.3 | `getFxRate('USD')` | Returns 1.0 |
| T7.4 | `getFxRate('XYZ')` — unknown currency | Returns 1.0 (fallback) or throws descriptive error |

#### XLSX Export Tests — DIGITAL

| # | Test | Expected Result |
|---|------|-----------------|
| T7.5 | **Generate XLSX — DIGITAL**: Call `generateXlsx()` with **DIGITAL** document and its mapped rows | Returns Buffer with length > 0. Buffer is valid XLSX (exceljs can re-read it). |
| T7.6 | **XLSX tab count**: Read generated XLSX with exceljs | Workbook has exactly 8 worksheets |
| T7.7 | **XLSX tab names**: Check sheet names | Names are: "Summary", "Income Statement", "Balance Sheet", "Cash Flow", "Equity Statement", "Validation", "Raw Extraction", "Metadata" |
| T7.8 | **XLSX Summary tab**: Read Summary sheet | Contains company_name "Aspect Capital Limited", template_type "T5", currency "GBP". V01-V12 scorecard table present. |
| T7.9 | **XLSX Income Statement tab**: Read Income Statement sheet | Has frozen header row (row 1). Columns include canonical_field, display_name, value (2023), confidence, review_status. At least 5 data rows. Subtotal rows are bold. |
| T7.10 | **XLSX formatting**: Check conditional formatting on Income Statement | Confidence < 0.8 cells have amber fill. Negative values rendered in red. |
| T7.11 | **XLSX Validation tab**: Read Validation sheet | Contains rows for V01-V12. Each row has check_id, formula, lhs, rhs, status. Pass rows have green fill. Fail rows have red fill. |

#### XLSX Export Tests — SCANNED

| # | Test | Expected Result |
|---|------|-----------------|
| T7.12 | **Generate XLSX — SCANNED**: Call `generateXlsx()` with **SCANNED** document | Returns valid XLSX Buffer. Summary tab shows "Sun Hung Kai & Co", "T8", "HKD". |
| T7.13 | **XLSX currency conversion**: Check values_usd_thousands column in Income Statement tab | Values are original HKD values * 0.12796 / 1000. At least one row has non-null USD conversion. |

#### JSON Export Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T7.14 | **Generate JSON — DIGITAL**: Call `generateReviewedJson()` for **DIGITAL** document | Returns valid JSON string. Parsed object has `document`, `statements` keys. |
| T7.15 | **JSON document metadata**: Check `document` section | Contains document_id (uuid), company_name "Aspect Capital Limited", template_type "T5", currency_code "GBP", export_tier "reviewed". |
| T7.16 | **JSON statements**: Check `statements.income_statement.rows` | Array with length >= 5. Each row has canonical_field, display_name, raw_label, values, mapping_confidence, review_status. |
| T7.17 | **JSON FX conversion**: Check `values_usd_thousands` in rows | GBP values converted at rate 1.2653. (e.g., GBP 1000 -> USD 1265.3 -> usd_thousands 1.2653) |
| T7.18 | **JSON validation section**: Check `statements.income_statement.validation` | Contains V02 and/or V03 check results with status field. |
| T7.19 | **Generate JSON — SCANNED**: Call `generateReviewedJson()` for **SCANNED** | Returns valid JSON with template_type "T8", currency_code "HKD", fx_rates including HKD_USD. |
| T7.20 | Run `npm run build` | Zero TypeScript errors |

---

## Phase 8 - Seed, Verify & Deploy

| # | Task | Action |
|---|------|--------|
| 8.1 | Build seed script | `scripts/seed-demo-docs.ts` - process all 19 PDFs through the full 10-stage pipeline sequentially |
| 8.2 | Run seed script | `npx tsx scripts/seed-demo-docs.ts` - verify all 19 docs appear in /documents |
| 8.3 | E2E check: Aspect Capital 2023 | Verify: template=T5, Turnover->total_revenue >=95% confidence, V02 passes, XLSX Income Statement tab has correct net_income=-14097 |
| 8.4 | E2E check: HDFC Credila 2023 | Verify: template=T3, V01 and V05 shown as failed in Validation Dashboard |
| 8.5 | Push to GitHub | `git init && git add . && git commit -m "demo build" && git push -u origin main` |
| 8.6 | Deploy to Vercel | Import project, add ANTHROPIC_API_KEY + DEMO_API_KEY env vars |
| 8.7 | Production migration | `npx drizzle-kit migrate` against production DATABASE_URL_UNPOOLED |
| 8.8 | Seed production DB | `DATABASE_URL=<prod_url> npx tsx scripts/seed-demo-docs.ts` |

### Phase 8 — Testing (Full E2E Verification)

#### Seed Verification

| # | Test | Expected Result |
|---|------|-----------------|
| T8.1 | **Seed completes**: Run `npx tsx scripts/seed-demo-docs.ts` | All 19 documents process without errors. Console logs "All 19 documents seeded." |
| T8.2 | **Document count**: Query `SELECT count(*) FROM documents` | Returns 19 |
| T8.3 | **Template distribution**: Query `SELECT template_type, count(*) FROM documents GROUP BY template_type` | T1: 3, T2: 2, T3: 3, T4: 1, T5: 3, T6: 2, T7: 2, T8: 3 |

#### E2E — DIGITAL (Aspect Capital 2023, T5)

| # | Test | Expected Result |
|---|------|-----------------|
| T8.4 | Open `/documents` in browser | Aspect Capital row visible with T5 badge, GBP, status = ready_for_review or reviewed |
| T8.5 | Click "Review" on Aspect Capital row | Workbench loads. PDF renders in left pane. Mapping table shows rows. |
| T8.6 | Verify 'Turnover' -> 'total_revenue' mapping | Mapped with confidence >= 0.95, mapping_method = 'dictionary' |
| T8.7 | Open Statement Tree for Aspect Capital | Income Statement tree renders with hierarchy. Subtotals computed correctly. |
| T8.8 | Open Validation Dashboard for Aspect Capital | V02 (PBT = income - expenses) shows 'passed'. Health gauge shows meaningful score. |
| T8.9 | Download XLSX export for Aspect Capital | 8-tab workbook downloads. Income Statement tab shows net_income = -14097 (loss). GBP->USD conversion applied. |
| T8.10 | Download JSON export for Aspect Capital | Valid JSON with template_type T5, currency GBP, all statement rows present. |

#### E2E — SCANNED (Sun Hung Kai 2024, T8)

| # | Test | Expected Result |
|---|------|-----------------|
| T8.11 | Open `/documents` in browser | Sun Hung Kai row visible with T8 badge, HKD |
| T8.12 | Check page classification summary | Shows page breakdown. If scanned pages exist: OCR column shows count in amber. |
| T8.13 | Open Workbench for Sun Hung Kai | PDF renders. Mapping table shows rows. If OCR rows exist, they have amber "OCR" badge. |
| T8.14 | Check T8-specific mappings | Labels like "brokerage handling fees" mapped to commission_income. HKD values present. |
| T8.15 | Open Validation Dashboard | V01-V12 results displayed. Checks appropriate for T8 (V10 EPS may be present, V11 skipped). |
| T8.16 | Download XLSX export | 8-tab workbook. Summary shows T8, HKD. Currency conversion uses HKD rate 0.12796. |

#### Cross-Document Verification

| # | Test | Expected Result |
|---|------|-----------------|
| T8.17 | **HDFC Credila E2E**: Check template=T3, V01 and V05 in Validation Dashboard | V01 (assets=liabilities+equity) and V05 (cash reconciliation) shown as 'failed' |
| T8.18 | **Filter test**: On `/documents`, filter by "Needs review" | Shows only documents with flagged rows. Both **DIGITAL** and **SCANNED** may appear if they have rows with confidence < 0.80. |
| T8.19 | **Export Centre**: On `/export/{id}` for any document, click "Download XLSX" and "Download JSON" | Both generate successfully. Signed URLs returned. Files downloadable within 7-day window. |

#### Production Deployment Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T8.20 | **Vercel build**: Push to Vercel, check build logs | Build succeeds with zero errors |
| T8.21 | **Production middleware**: Access production URL `/api/documents` without API key | 401 Unauthorized |
| T8.22 | **Production middleware**: Access with correct DEMO_API_KEY | 200 OK, returns document list |
| T8.23 | **Production seed**: Run seed against production DB | All 19 documents visible on production `/documents` page |
| T8.24 | **Production E2E — DIGITAL**: Open Aspect Capital in production workbench | Full workbench renders. PDF, mapping table, validation all functional. |
| T8.25 | **Production E2E — SCANNED**: Open Sun Hung Kai in production workbench | Full workbench renders. OCR path functional if scanned pages present. |

---

## Project Folder Structure

```
financial-spreadx/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Sidebar + topbar shell
│   │   ├── upload/page.tsx
│   │   ├── documents/page.tsx
│   │   ├── review/[id]/
│   │   │   ├── page.tsx                # Review Workbench
│   │   │   └── tree/page.tsx           # Statement Tree
│   │   ├── validation/[id]/page.tsx
│   │   └── export/[id]/page.tsx
│   ├── api/
│   │   ├── documents/route.ts          # POST = 10-stage pipeline, GET = list
│   │   ├── documents/[id]/route.ts
│   │   ├── documents/[id]/rows/route.ts
│   │   ├── documents/[id]/mapped/route.ts
│   │   ├── documents/[id]/validation/route.ts
│   │   ├── review/[mappedRowId]/route.ts
│   │   ├── review/[id]/explain/route.ts
│   │   ├── notes/[documentId]/[noteNumber]/route.ts
│   │   └── export/[id]/{xlsx,json,raw-json}/route.ts
│   └── globals.css                     # Design tokens
├── __tests__/
│   ├── fixtures/
│   │   ├── Aspect_Capital_Limited_2023.pdf   # DIGITAL test file
│   │   └── Sun_Hung_Kai_Co_Limited_AR_2024.pdf  # SCANNED test file
│   ├── unit/
│   │   ├── label-normalizer.test.ts
│   │   ├── dictionary.test.ts
│   │   ├── disambiguator.test.ts
│   │   ├── hierarchy-engine.test.ts
│   │   ├── formula-validator.test.ts
│   │   ├── confidence-engine.test.ts
│   │   ├── scope-detector.test.ts
│   │   ├── entity-linker.test.ts
│   │   ├── page-classifier.test.ts
│   │   ├── page-filter.test.ts
│   │   ├── column-classifier.test.ts
│   │   ├── fx-rates.test.ts
│   │   └── components/
│   │       ├── TemplateBadge.test.tsx
│   │       ├── StatusBadge.test.tsx
│   │       ├── HealthBar.test.tsx
│   │       ├── ConfidenceBar.test.tsx
│   │       └── StatCard.test.tsx
│   ├── integration/
│   │   ├── db-queries.test.ts
│   │   ├── mapping-engine.test.ts
│   │   ├── pdf-pipeline-digital.test.ts
│   │   ├── pdf-pipeline-scanned.test.ts
│   │   ├── claude-classify.test.ts
│   │   ├── claude-extract.test.ts
│   │   └── export.test.ts
│   └── e2e/
│       ├── middleware.test.ts
│       ├── api-documents.test.ts
│       ├── api-review.test.ts
│       ├── api-export.test.ts
│       └── full-pipeline.test.ts
├── components/
│   ├── ui/
│   │   ├── StatCard.tsx
│   │   ├── TemplateBadge.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── HealthBar.tsx
│   │   └── ConfidenceBar.tsx
│   └── review/
│       ├── PdfViewer.tsx
│       ├── MappingTable.tsx
│       ├── MappingExplainer.tsx
│       └── NoteDrawer.tsx
├── lib/
│   ├── pdf/
│   │   ├── page-classifier.ts
│   │   ├── page-filter.ts
│   │   ├── column-classifier.ts
│   │   └── page-rasterizer.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── index.ts
│   │   └── queries/{documents,extracted-rows,mapped-rows,review-overrides,document-pages,note-entries}.ts
│   ├── claude/
│   │   ├── classify.ts
│   │   ├── extract.ts
│   │   ├── extract-vision.ts
│   │   ├── extract-notes.ts
│   │   ├── map.ts
│   │   └── explain.ts
│   ├── mapping/
│   │   ├── index.ts                    # runMappingEngine() orchestrator
│   │   ├── label-normalizer.ts         # M1
│   │   ├── dictionary.ts              # M2
│   │   ├── disambiguator.ts           # M3
│   │   ├── hierarchy-engine.ts        # M4
│   │   ├── formula-validator.ts       # M5 (V01-V12)
│   │   ├── confidence-engine.ts       # M6
│   │   ├── scope-detector.ts          # M7
│   │   ├── entity-linker.ts           # M9
│   │   ├── canonical-fields.ts
│   │   └── template-rules/
│   │       ├── t1-us-gaap.ts
│   │       ├── t2-us-alt-investment.ts
│   │       ├── t3-ind-as-nbfc.ts
│   │       ├── t4-old-indian-gaap.ts
│   │       ├── t5-uk-companies-act.ts
│   │       ├── t6-uk-llp.ts
│   │       ├── t7-uk-mortgage.ts
│   │       └── t8-ifrs-asia.ts
│   └── export/
│       ├── xlsx-export.ts
│       ├── json-export.ts
│       └── fx-rates.ts
├── scripts/
│   ├── seed-demo-docs.ts
│   ├── seed-canonical-fields.ts
│   └── seed-mapping-rules.ts
├── demo-docs/                          # 19 PDF files
├── middleware.ts
├── drizzle.config.ts
├── next.config.ts
├── vitest.config.ts
├── vercel.json
└── .env.local
```

---

## Total Checkpoints

| Phase | Description | Build Tasks | Tests | Total |
|-------|-------------|-------------|-------|-------|
| 0 | Project Initialization | 12 | 6 | 18 |
| 1 | Data Layer | 12 | 13 | 25 |
| 2 | PDF Processing Modules | 4 | 11 | 15 |
| 3 | Mapping Engine | 17 | 39 | 56 |
| 4 | Claude AI Integration | 6 | 10 | 16 |
| 5 | API Routes + Middleware | 10 | 22 | 32 |
| 6 | Frontend (6 Screens) | 17 | 24 | 41 |
| 7 | Export Service | 3 | 20 | 23 |
| 8 | Seed, Verify & Deploy | 8 | 25 | 33 |
| **Total** | | **89** | **170** | **259** |

---

*Financial SpreadX - Demo Design v2.1 - Implementation Plan with Testing*
