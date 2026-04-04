import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  real,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────

export const documentStatusEnum = pgEnum('document_status', [
  'uploaded',
  'preprocessing',
  'classifying',
  'extracting',
  'mapping',
  'ready_for_review',
  'reviewed',
  'exported',
]);

export const statementTypeEnum = pgEnum('statement_type', [
  'income_statement',
  'balance_sheet',
  'cash_flow',
  'equity_statement',
]);

export const mappingMethodEnum = pgEnum('mapping_method', [
  'dictionary',
  'claude',
  'override',
]);

export const reviewStatusEnum = pgEnum('review_status', [
  'auto_approved',
  'needs_review',
  'reviewed',
  'rejected',
]);

export const ruleSourceEnum = pgEnum('rule_source', [
  'seed',
  'analyst_correction',
  'claude_suggestion',
]);

// ─── 1. documents ────────────────────────────────────────

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileName: text('file_name').notNull(),
    companyName: text('company_name'),
    reportYear: integer('report_year').array(),
    blobUrl: text('blob_url'),
    pageCount: integer('page_count'),
    ocrRequired: boolean('ocr_required').default(false),
    templateType: text('template_type'), // T1-T8 or T0_unknown
    classificationConfidence: real('classification_confidence'),
    currencyCode: text('currency_code'), // ISO 4217, e.g. 'GBP'
    unitScale: text('unit_scale'), // thousands / lakhs / crore / millions
    status: documentStatusEnum('status').default('uploaded'),
    pageClassificationSummary: jsonb('page_classification_summary'), // {digital:N, scanned:N, hybrid:N, total:N}
    statementScopes: text('statement_scopes').array(), // ['standalone','consolidated']
    validationResults: jsonb('validation_results'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_documents_status').on(table.status),
    index('idx_documents_template_type').on(table.templateType),
  ],
);

// ─── 2. document_pages ───────────────────────────────────

export const documentPages = pgTable(
  'document_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    classification: text('classification').default('digital'), // 'digital' | 'scanned' | 'hybrid'
    wordCount: integer('word_count').default(0),
    sectionType: text('section_type').default('unclassified'), // income_statement | balance_sheet | cash_flow | equity_statement | notes | other | unclassified
    noteNumber: integer('note_number'), // set if page belongs to a specific note
    isSelected: boolean('is_selected').default(false), // selected for financial extraction
    textContent: text('text_content'), // only stored for selected pages
    ocrMethod: text('ocr_method').default('none'), // 'none' | 'claude_vision'
    // Req F additions:
    secondarySectionType: text('secondary_section_type'), // for dual-statement pages
    classificationConfidence: real('classification_confidence'), // 0.0-1.0; null for digital (deterministic = 1.0)
    headingVerbatim: text('heading_verbatim'), // verbatim heading text from page scan or vision
  },
  (table) => [
    index('idx_document_pages_document_id').on(table.documentId),
  ],
);

// ─── 3. extracted_rows ───────────────────────────────────

export const extractedRows = pgTable(
  'extracted_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    statementType: statementTypeEnum('statement_type').notNull(),
    rawLabel: text('raw_label').notNull(),
    rawValues: jsonb('raw_values'), // {"2024": 131584.01, "2023": 108291.00}
    page: integer('page'),
    sectionPath: text('section_path').array(), // e.g. ["revenue", "interest income"]
    indentationLevel: integer('indentation_level').default(0),
    noteRef: text('note_ref'),
    isSubtotal: boolean('is_subtotal').default(false),
    statementScope: text('statement_scope').default('unknown'), // 'standalone' | 'consolidated' | 'unknown'
    columnMetadata: jsonb('column_metadata'), // {"2024": {"type":"actual"}, "2023R": {"type":"restated"}}
    noteEntryId: uuid('note_entry_id'), // resolved FK to note_entries (set by entity linker)
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_extracted_rows_document_id').on(table.documentId),
    index('idx_extracted_rows_statement_type').on(table.statementType),
  ],
);

// ─── 4. mapped_rows ──────────────────────────────────────

export const mappedRows = pgTable(
  'mapped_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rowId: uuid('row_id')
      .notNull()
      .references(() => extractedRows.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    canonicalField: text('canonical_field'),
    canonicalGroup: text('canonical_group'),
    parentCanonicalField: text('parent_canonical_field'),
    normalizedValues: jsonb('normalized_values'),
    normalizedCurrency: text('normalized_currency'), // ISO 4217
    normalizedUnit: text('normalized_unit'), // always "units" after conversion
    mappingMethod: mappingMethodEnum('mapping_method'),
    mappingConfidence: real('mapping_confidence'),
    validationResults: jsonb('validation_results'), // {"V01": "passed", "V03": "failed"}
    reviewStatus: reviewStatusEnum('review_status').default('needs_review'),
    statementScope: text('statement_scope').default('unknown'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_mapped_rows_document_id').on(table.documentId),
    index('idx_mapped_rows_review_status').on(table.reviewStatus),
  ],
);

// ─── 5. canonical_fields ─────────────────────────────────

export const canonicalFields = pgTable('canonical_fields', {
  canonicalField: text('canonical_field').primaryKey(),
  displayName: text('display_name').notNull(),
  statementType: text('statement_type'), // income_statement | balance_sheet | cash_flow | equity_statement
  fieldGroup: text('field_group'), // profitability | liquidity | leverage | etc
  parentField: text('parent_field'),
  formulaRule: text('formula_rule'), // e.g. "profit_before_tax - income_tax_expense"
  supportedTemplates: text('supported_templates').array(), // ['T1','T3','T5']
});

// ─── 6. mapping_rules ────────────────────────────────────

export const mappingRules = pgTable(
  'mapping_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateType: text('template_type'), // null = applies to all
    normalizedLabel: text('normalized_label').notNull(),
    contextPattern: jsonb('context_pattern'), // optional: {statement_type, section_path}
    canonicalField: text('canonical_field').notNull(),
    confidence: real('confidence').default(0.9),
    source: ruleSourceEnum('source').default('seed'),
    active: boolean('active').default(true),
  },
  (table) => [
    index('idx_mapping_rules_label').on(table.normalizedLabel),
    index('idx_mapping_rules_template').on(table.templateType),
  ],
);

// ─── 7. review_overrides ─────────────────────────────────

export const reviewOverrides = pgTable('review_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  mappedRowId: uuid('mapped_row_id')
    .notNull()
    .references(() => mappedRows.id, { onDelete: 'cascade' }),
  oldCanonicalField: text('old_canonical_field'),
  newCanonicalField: text('new_canonical_field'),
  oldValue: real('old_value'),
  newValue: real('new_value'),
  reviewer: text('reviewer'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── 8. note_entries ─────────────────────────────────────

export const noteEntries = pgTable(
  'note_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    noteNumber: integer('note_number').notNull(),
    noteTitle: text('note_title'),
    pages: integer('pages').array(), // page numbers where this note appears
    rawText: text('raw_text'),
    extractedSubtables: jsonb('extracted_subtables'),
    linkedRowIds: uuid('linked_row_ids').array(), // extracted_row IDs referencing this note
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_note_entries_document_id').on(table.documentId),
  ],
);
