/**
 * lib/db.ts — read-only SQLite access layer (Design Docs/FrontendDesign.md §9.3).
 *
 * The frontend reads `spreadx.db` directly via better-sqlite3; Python remains the sole
 * writer of pipeline data (decision Q9/Q10). WAL mode lets reads proceed during writes.
 * A cached singleton survives dev hot-reload.
 */
import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH =
  process.env.SPREADX_DB_PATH ?? path.join(process.cwd(), "..", "spreadx.db");

// Cache across hot reloads in dev (module re-evaluation).
declare global {
  // eslint-disable-next-line no-var
  var __spreadxDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!global.__spreadxDb) {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    db.pragma("busy_timeout = 5000");
    global.__spreadxDb = db;
  }
  return global.__spreadxDb;
}

export interface CoaReferenceRow {
  coa_id: string;
  line_item_name: string;
  statement: string;
  broad_category: string;
  sub_category: string;
  definition: string;
  spreading_guidance: string;
  sign_convention: string;
  is_subtotal: number; // SQLite boolean (0/1)
  is_memo_item: number;
}

/** Full Chart of Accounts reference (184 rows), ordered by id. */
export function getCoaReference(): CoaReferenceRow[] {
  return getDb()
    .prepare(
      `SELECT coa_id, line_item_name, statement, broad_category, sub_category,
              definition, spreading_guidance, sign_convention, is_subtotal, is_memo_item
         FROM coa_reference
         ORDER BY coa_id`
    )
    .all() as CoaReferenceRow[];
}

export function countCoaReference(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM coa_reference`)
    .get() as { n: number };
  return row.n;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Parse a SQLite JSON/TEXT column (stored as a string) to a JS value. */
function parseJSON<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normLabel(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Add two nullable numbers; null only when both are null. */
function sumN(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Latest two fiscal-year values from a {year: value} spread, descending by year. */
function fy12(spread: Record<string, number | null> | null): {
  fy1: number | null;
  fy2: number | null;
} {
  if (!spread) return { fy1: null, fy2: null };
  const ranked = Object.entries(spread)
    .map(([k, v]) => ({ v, y: parseInt((k.match(/(?:19|20)\d{2}/) || ["0"])[0], 10) }))
    .sort((a, b) => b.y - a.y);
  return { fy1: ranked[0]?.v ?? null, fy2: ranked[1]?.v ?? null };
}

// ── shared JSON shapes (subset we read) ──────────────────────────────────────

export interface BalanceCheck {
  isBalanced?: boolean;
  difference?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  primary_year?: string;
  imbalanceContributors?: { coa_id: string; line_item_name: string; value: number }[];
}
interface ReconSubtotal {
  raw_label: string;
  pass: boolean | null;
  has_unmapped_component?: boolean;
}
interface ReconResult {
  subtotals?: ReconSubtotal[];
  summary?: {
    total?: number;
    passed?: number;
    failed?: number;
    incomplete?: number;
    with_unmapped_component?: number;
  };
}
interface UsageSnapshot {
  by_stage?: Record<string, { input_tokens?: number; output_tokens?: number; cost_usd?: number }>;
  total?: { input_tokens?: number; output_tokens?: number; cost_usd?: number };
}

// ── Document Library (Screen 1) ──────────────────────────────────────────────

export interface DocumentListItem {
  id: string;
  filename: string;
  company: string;
  fiscalYear: number | null;
  templateType: string;
  scope: string;
  pipelineStatus: string;
  spreadStatus: string;
  uiStatus: "queued" | "processing" | "error" | "complete" | "has_unmapped";
  unmappedCount: number;
  mappedRows: number;
  mappableRows: number;
  flaggedCount: number;
  balanced: boolean | null;
  healthScore: number; // 0..1
  costUsd: number | null;
  createdAt: string;
}

function uiStatusOf(pipeline: string, spread: string): DocumentListItem["uiStatus"] {
  if (pipeline && pipeline !== "done") {
    if (pipeline === "error") return "error";
    if (pipeline === "processing") return "processing";
    return "queued";
  }
  return spread === "spread_complete" ? "complete" : "has_unmapped";
}

/** Latest run per filename, with Library proxies (health, flagged, mapped ratio). */
export function getDocuments(): DocumentListItem[] {
  const rows = getDb()
    .prepare(
      `SELECT d.id, d.filename, d.company, d.fiscal_year, d.template_type, d.scope,
              d.pipeline_status, d.spread_status, d.unmapped_count,
              d.balance_check_result, d.usage_result, d.created_at,
              (SELECT COUNT(*) FROM extracted_rows er
                 WHERE er.document_id = d.id AND er.mapping_status = 'mapped') AS mapped_rows,
              (SELECT COUNT(*) FROM extracted_rows er
                 WHERE er.document_id = d.id
                   AND er.statement_type IN ('balance_sheet','income_statement')) AS mappable_rows,
              (SELECT COUNT(*) FROM coa_mappings cm
                 WHERE cm.document_id = d.id AND cm.confidence < 0.75) AS low_conf
         FROM documents d
         JOIN (SELECT filename, MAX(created_at) AS mx FROM documents GROUP BY filename) t
           ON t.filename = d.filename AND t.mx = d.created_at
        WHERE d.page_summary IS NOT NULL
           OR d.pipeline_status IN ('processing','error')
        ORDER BY d.created_at DESC`
    )
    .all() as Record<string, unknown>[];

  return rows.map((r) => {
    const balance = parseJSON<BalanceCheck>(r.balance_check_result, {});
    const usage = parseJSON<UsageSnapshot>(r.usage_result, {});
    const mapped = Number(r.mapped_rows ?? 0);
    const mappable = Number(r.mappable_rows ?? 0);
    const balanced = balance.isBalanced ?? null;
    const ratio = mappable > 0 ? mapped / mappable : 0;
    const health = (balanced ? 0.5 : 0) + 0.5 * ratio;
    return {
      id: String(r.id),
      filename: String(r.filename),
      company: String(r.company || ""),
      fiscalYear: r.fiscal_year != null ? Number(r.fiscal_year) : null,
      templateType: String(r.template_type || ""),
      scope: String(r.scope || ""),
      pipelineStatus: String(r.pipeline_status || ""),
      spreadStatus: String(r.spread_status || ""),
      uiStatus: uiStatusOf(String(r.pipeline_status || ""), String(r.spread_status || "")),
      unmappedCount: Number(r.unmapped_count ?? 0),
      mappedRows: mapped,
      mappableRows: mappable,
      flaggedCount: Number(r.low_conf ?? 0) + Number(r.unmapped_count ?? 0),
      balanced,
      healthScore: health,
      costUsd: usage.total?.cost_usd ?? null,
      createdAt: String(r.created_at || ""),
    };
  });
}

export interface DocumentHeader extends DocumentListItem {
  balance: BalanceCheck;
  pageSummary: { total?: number; digital?: number; scanned?: number; hybrid?: number } | null;
}

export function getDocument(id: string): DocumentHeader | null {
  const r = getDb()
    .prepare(`SELECT * FROM documents WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  const balance = parseJSON<BalanceCheck>(r.balance_check_result, {});
  const usage = parseJSON<UsageSnapshot>(r.usage_result, {});
  const counts = getDb()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM extracted_rows WHERE document_id=? AND mapping_status='mapped') m,
         (SELECT COUNT(*) FROM extracted_rows WHERE document_id=? AND statement_type IN ('balance_sheet','income_statement')) mm,
         (SELECT COUNT(*) FROM coa_mappings WHERE document_id=? AND confidence<0.75) lc`
    )
    .get(id, id, id) as { m: number; mm: number; lc: number };
  const balanced = balance.isBalanced ?? null;
  const ratio = counts.mm > 0 ? counts.m / counts.mm : 0;
  return {
    id: String(r.id),
    filename: String(r.filename),
    company: String(r.company || ""),
    fiscalYear: r.fiscal_year != null ? Number(r.fiscal_year) : null,
    templateType: String(r.template_type || ""),
    scope: String(r.scope || ""),
    pipelineStatus: String(r.pipeline_status || ""),
    spreadStatus: String(r.spread_status || ""),
    uiStatus: uiStatusOf(String(r.pipeline_status || ""), String(r.spread_status || "")),
    unmappedCount: Number(r.unmapped_count ?? 0),
    mappedRows: counts.m,
    mappableRows: counts.mm,
    flaggedCount: counts.lc + Number(r.unmapped_count ?? 0),
    balanced,
    healthScore: (balanced ? 0.5 : 0) + 0.5 * ratio,
    costUsd: usage.total?.cost_usd ?? null,
    createdAt: String(r.created_at || ""),
    balance,
    pageSummary: parseJSON(r.page_summary, null),
  };
}

// ── Spread Review (Screen 7) — CoA tree with extraction-id leaves ────────────

export interface LeafLine {
  extractionId: number;
  rawLabel: string;
  fy1: number | null;
  fy2: number | null;
  page: number;
  noteRef: string | null;
}
export interface CoaNode {
  mappingId: string;
  coaId: string;
  name: string;
  statement: "balance_sheet" | "income_statement";
  category: string;
  fy1: number | null;
  fy2: number | null;
  confidence: number;
  source: string;
  isSubtotal: boolean;
  aggregatedFrom: number;
  reconcile: { pass: boolean | null; missingLeaf: boolean } | null;
  leaves: LeafLine[];
}
export interface SpreadSection {
  statement: "balance_sheet" | "income_statement";
  category: string;
  nodes: CoaNode[];
}
export interface SpreadTreeResponse {
  documentId: string;
  balance: BalanceCheck;
  reconciliation: ReconResult["summary"] & { perSubtotal?: number };
  sections: SpreadSection[];
}

const STMT_OF: Record<string, "balance_sheet" | "income_statement"> = {
  "Balance Sheet": "balance_sheet",
  "P&L": "income_statement",
};

export function getSpreadTree(id: string): SpreadTreeResponse | null {
  const db = getDb();
  const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!doc) return null;

  const balance = parseJSON<BalanceCheck>(doc.balance_check_result, {});
  const recon = parseJSON<ReconResult>(doc.reconciliation_result, {});
  const reconMap = new Map<string, { pass: boolean | null; missingLeaf: boolean }>();
  for (const st of recon.subtotals ?? []) {
    reconMap.set(normLabel(st.raw_label), {
      pass: st.pass,
      missingLeaf: !!st.has_unmapped_component,
    });
  }

  // All extracted rows for this doc, indexed by extraction_id (leaf source).
  const erRows = db
    .prepare(
      `SELECT extraction_id, raw_label, raw_values, page, note_ref
         FROM extracted_rows WHERE document_id = ?`
    )
    .all(id) as Record<string, unknown>[];
  const byEid = new Map<number, Record<string, unknown>>();
  for (const er of erRows) byEid.set(Number(er.extraction_id), er);

  const mappings = db
    .prepare(
      `SELECT cm.id, cm.coa_id, cm.raw_label, cm.confidence, cm.mapping_source,
              cm.value_spread, cm.aggregated_from, cm.source_extraction_ids,
              r.line_item_name, r.broad_category, r.statement, r.is_subtotal
         FROM coa_mappings cm
         JOIN coa_reference r ON r.coa_id = cm.coa_id
        WHERE cm.document_id = ?
        ORDER BY cm.coa_id`
    )
    .all(id) as Record<string, unknown>[];

  // Group by statement -> category, merging multiple mappings that share a
  // coa_id into one node (e.g. a resolve adds a second mapping for an existing
  // CoA line) so the tree shows one row per CoA with all leaves combined.
  const sections = new Map<string, SpreadSection>();
  const nodeByCoa = new Map<string, CoaNode>();
  for (const m of mappings) {
    const statement = STMT_OF[String(m.statement)] ?? "balance_sheet";
    const category = String(m.broad_category || "Other");
    const spread = parseJSON<Record<string, number | null>>(m.value_spread, {});
    const { fy1, fy2 } = fy12(spread);

    const ids = parseJSON<number[]>(m.source_extraction_ids, []);
    const leaves: LeafLine[] = ids
      .map((eid) => byEid.get(Number(eid)))
      .filter(Boolean)
      .map((er) => {
        const lv = fy12(parseJSON<Record<string, number | null>>(er!.raw_values, {}));
        return {
          extractionId: Number(er!.extraction_id),
          rawLabel: String(er!.raw_label || ""),
          fy1: lv.fy1,
          fy2: lv.fy2,
          page: Number(er!.page ?? 0),
          noteRef: (er!.note_ref as string) ?? null,
        };
      });

    const coaId = String(m.coa_id);
    const existing = nodeByCoa.get(coaId);
    if (existing) {
      existing.fy1 = sumN(existing.fy1, fy1);
      existing.fy2 = sumN(existing.fy2, fy2);
      existing.leaves.push(...leaves);
      existing.aggregatedFrom += Number(m.aggregated_from ?? 1);
      if (String(m.mapping_source) === "manual") existing.source = "manual";
      if (!existing.reconcile)
        existing.reconcile = reconMap.get(normLabel(String(m.raw_label))) ?? null;
      continue;
    }

    const node: CoaNode = {
      mappingId: String(m.id),
      coaId,
      name: String(m.line_item_name || ""),
      statement,
      category,
      fy1,
      fy2,
      confidence: Number(m.confidence ?? 0),
      source: String(m.mapping_source || "claude"),
      isSubtotal: !!m.is_subtotal,
      aggregatedFrom: Number(m.aggregated_from ?? 1),
      reconcile: reconMap.get(normLabel(String(m.raw_label))) ?? null,
      leaves,
    };
    nodeByCoa.set(coaId, node);

    const key = `${statement}::${category}`;
    if (!sections.has(key)) sections.set(key, { statement, category, nodes: [] });
    sections.get(key)!.nodes.push(node);
  }

  // Order: balance_sheet sections first, then income_statement.
  const ordered = [...sections.values()].sort((a, b) =>
    a.statement === b.statement
      ? a.category.localeCompare(b.category)
      : a.statement === "balance_sheet"
        ? -1
        : 1
  );

  return {
    documentId: id,
    balance,
    reconciliation: { ...(recon.summary ?? {}), perSubtotal: reconMap.size },
    sections: ordered,
  };
}

// ── Extracted rows (Workbench / Tree — also used by Spread leaves) ───────────

export interface ExtractedRowItem {
  extractionId: number;
  rawLabel: string;
  rawValues: Record<string, number | null>;
  sectionPath: string[];
  indentationLevel: number;
  isSubtotal: boolean;
  noteRef: string | null;
  statementType: string;
  statementScope: string;
  page: number;
  coaId: string | null;
  mappingStatus: string;
  confidence: number | null;
}

export function getExtractedRows(id: string): ExtractedRowItem[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM extracted_rows WHERE document_id = ? ORDER BY extraction_id`
    )
    .all(id) as Record<string, unknown>[];
  return rows.map((r) => ({
    extractionId: Number(r.extraction_id ?? 0),
    rawLabel: String(r.raw_label || ""),
    rawValues: parseJSON(r.raw_values, {}),
    sectionPath: parseJSON(r.section_path, []),
    indentationLevel: Number(r.indentation_level ?? 0),
    isSubtotal: !!r.is_subtotal,
    noteRef: (r.note_ref as string) ?? null,
    statementType: String(r.statement_type || ""),
    statementScope: String(r.statement_scope || "unknown"),
    page: Number(r.page ?? 0),
    coaId: (r.coa_id as string) ?? null,
    mappingStatus: String(r.mapping_status || "not_spread"),
    confidence: r.confidence != null ? Number(r.confidence) : null,
  }));
}

// ── Spread Review — other tabs (Unmapped / Confidence&Source / Learned) ──────

export interface UnmappedItemRow {
  id: string;
  rawLabel: string;
  statementType: string;
  fy1: number | null;
  fy2: number | null;
  status: string;
  topSuggestion: { coaId: string; score: number } | null;
  reason: string;
}

export function getUnmappedItems(id: string): UnmappedItemRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, raw_label, statement_type, value_spread, claude_suggestions,
              ambiguity_note, status
         FROM unmapped_items
        WHERE document_id = ? AND status IN ('pending','not_spread')
        ORDER BY status, raw_label`
    )
    .all(id) as Record<string, unknown>[];
  return rows.map((r) => {
    const { fy1, fy2 } = fy12(parseJSON(r.value_spread, {}));
    const sugg = parseJSON<{ coa_id: string; score: number }[]>(r.claude_suggestions, []);
    return {
      id: String(r.id),
      rawLabel: String(r.raw_label || ""),
      statementType: String(r.statement_type || ""),
      fy1,
      fy2,
      status: String(r.status || "pending"),
      topSuggestion: sugg[0] ? { coaId: sugg[0].coa_id, score: sugg[0].score } : null,
      reason: String(r.ambiguity_note || ""),
    };
  });
}

export interface ConfidenceRow {
  coaId: string;
  name: string;
  rawLabel: string;
  confidence: number;
  source: string;
  statement: string;
  extractionIds: number[];
}

export function getConfidenceRows(id: string): ConfidenceRow[] {
  const rows = getDb()
    .prepare(
      `SELECT cm.coa_id, cm.raw_label, cm.confidence, cm.mapping_source,
              cm.source_extraction_ids, r.line_item_name, r.statement
         FROM coa_mappings cm
         JOIN coa_reference r ON r.coa_id = cm.coa_id
        WHERE cm.document_id = ?
        ORDER BY cm.confidence ASC`
    )
    .all(id) as Record<string, unknown>[];
  return rows.map((r) => ({
    coaId: String(r.coa_id),
    name: String(r.line_item_name || ""),
    rawLabel: String(r.raw_label || ""),
    confidence: Number(r.confidence ?? 0),
    source: String(r.mapping_source || "claude"),
    statement: String(r.statement || ""),
    extractionIds: parseJSON<number[]>(r.source_extraction_ids, []),
  }));
}

export interface LearnedAppliedRow {
  coaId: string;
  rawLabel: string;
  confidence: number;
  sourceDocument: string;
  timesApplied: number;
}

export function getLearnedApplied(id: string): LearnedAppliedRow[] {
  const rows = getDb()
    .prepare(
      `SELECT cm.coa_id, cm.raw_label, lm.learned_confidence, lm.source_document,
              lm.times_applied
         FROM coa_mappings cm
         JOIN learned_mappings lm ON lm.id = cm.learned_mapping_id
        WHERE cm.document_id = ? AND cm.mapping_source = 'learned'
        ORDER BY cm.raw_label`
    )
    .all(id) as Record<string, unknown>[];
  return rows.map((r) => ({
    coaId: String(r.coa_id),
    rawLabel: String(r.raw_label || ""),
    confidence: Number(r.learned_confidence ?? 0),
    sourceDocument: String(r.source_document || ""),
    timesApplied: Number(r.times_applied ?? 0),
  }));
}

// ── Unmapped detail (Resolver / Compare — Phase 3) ───────────────────────────

export interface Suggestion {
  coaId: string;
  coaName: string;
  definition: string;
  score: number;
  reason: string;
}
export interface UnmappedDetail {
  id: string;
  rawLabel: string;
  statementType: string;
  fy1: number | null;
  fy2: number | null;
  reason: string;
  suggestions: Suggestion[];
  sourceExtractionIds: number[];
  page: number;
}

/** Pending unmapped items with AI suggestions enriched by CoA name + definition. */
export function getUnmappedDetail(id: string): UnmappedDetail[] {
  const coa = new Map(
    getCoaReference().map((c) => [c.coa_id, { name: c.line_item_name, def: c.definition }])
  );
  // extraction_id -> page (for PDF page-jump from an unmapped item)
  const pageByEid = new Map<number, number>();
  for (const er of getDb()
    .prepare(`SELECT extraction_id, page FROM extracted_rows WHERE document_id = ?`)
    .all(id) as { extraction_id: number; page: number }[]) {
    pageByEid.set(Number(er.extraction_id), Number(er.page));
  }
  const rows = getDb()
    .prepare(
      `SELECT id, raw_label, statement_type, value_spread, claude_suggestions,
              ambiguity_note, source_extraction_ids
         FROM unmapped_items
        WHERE document_id = ? AND status = 'pending'
        ORDER BY raw_label`
    )
    .all(id) as Record<string, unknown>[];
  return rows.map((r) => {
    const { fy1, fy2 } = fy12(parseJSON(r.value_spread, {}));
    const raw = parseJSON<{ coa_id: string; score: number; reason: string }[]>(
      r.claude_suggestions,
      []
    );
    const suggestions: Suggestion[] = raw.slice(0, 3).map((s) => ({
      coaId: s.coa_id,
      coaName: coa.get(s.coa_id)?.name ?? s.coa_id,
      definition: coa.get(s.coa_id)?.def ?? "",
      score: s.score,
      reason: s.reason,
    }));
    const ids = parseJSON<number[]>(r.source_extraction_ids, []);
    return {
      id: String(r.id),
      rawLabel: String(r.raw_label || ""),
      statementType: String(r.statement_type || ""),
      fy1,
      fy2,
      reason: String(r.ambiguity_note || ""),
      suggestions,
      sourceExtractionIds: ids,
      page: ids.length ? (pageByEid.get(Number(ids[0])) ?? 0) : 0,
    };
  });
}

// ── Notes / Workbench / PDF (Phase 4) ────────────────────────────────────────

export interface NoteItem {
  noteNumber: number;
  noteTitle: string;
  summary: string;
  subTables: { table_title: string | null; rows: { label: string; values: Record<string, unknown> }[] }[];
}

export function getNotes(id: string): NoteItem[] {
  const rows = getDb()
    .prepare(`SELECT note_number, note_title, summary, sub_tables FROM notes WHERE document_id = ? ORDER BY note_number`)
    .all(id) as Record<string, unknown>[];
  return rows.map((r) => ({
    noteNumber: Number(r.note_number ?? 0),
    noteTitle: String(r.note_title || ""),
    summary: String(r.summary || ""),
    subTables: parseJSON(r.sub_tables, []),
  }));
}

export interface WorkbenchRow extends ExtractedRowItem {
  mappingId: string | null;
  coaName: string | null;
}

/** Extracted rows enriched with the CoA mapping id (for inline override) + name. */
export function getWorkbenchRows(id: string): WorkbenchRow[] {
  const coaName = new Map(getCoaReference().map((c) => [c.coa_id, c.line_item_name]));
  // extraction_id -> mapping id (the coa_mapping whose source ids contain it)
  const mappingByEid = new Map<number, string>();
  for (const m of getDb()
    .prepare(`SELECT id, source_extraction_ids FROM coa_mappings WHERE document_id = ?`)
    .all(id) as { id: string; source_extraction_ids: unknown }[]) {
    for (const eid of parseJSON<number[]>(m.source_extraction_ids, [])) {
      mappingByEid.set(Number(eid), String(m.id));
    }
  }
  return getExtractedRows(id).map((r) => ({
    ...r,
    mappingId: mappingByEid.get(r.extractionId) ?? null,
    coaName: r.coaId ? (coaName.get(r.coaId) ?? r.coaId) : null,
  }));
}

export interface CoaOption {
  coaId: string;
  name: string;
  statement: string;
}

export function getCoaOptions(): CoaOption[] {
  return getCoaReference().map((c) => ({
    coaId: c.coa_id,
    name: c.line_item_name,
    statement: c.statement,
  }));
}

/** Absolute path to the retained source PDF (Phase 4 viewer), if any. */
export function getDocumentPdfPath(id: string): string | null {
  const r = getDb()
    .prepare(`SELECT pdf_path FROM documents WHERE id = ?`)
    .get(id) as { pdf_path?: string } | undefined;
  return r?.pdf_path ?? null;
}

// ── Pipeline status (Upload polling — Phase 5) ───────────────────────────────

export interface PipelineStatus {
  documentId: string;
  status: string; // queued | processing | done | error
  stage: string | null;
  error: string | null;
  summary: {
    company: string;
    totalRows: number;
    mappedRows: number;
    unmappedCount: number;
    costUsd: number | null;
    balanced: boolean | null;
  } | null;
}

export function getPipelineStatus(id: string): PipelineStatus | null {
  const r = getDb()
    .prepare(
      `SELECT id, company, pipeline_status, pipeline_stage, error_message,
              unmapped_count, balance_check_result, usage_result
         FROM documents WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  const status = String(r.pipeline_status || "");
  let summary: PipelineStatus["summary"] = null;
  if (status === "done") {
    const counts = getDb()
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM extracted_rows WHERE document_id=?) total,
           (SELECT COUNT(*) FROM extracted_rows WHERE document_id=? AND mapping_status='mapped') mapped`
      )
      .get(id, id) as { total: number; mapped: number };
    const balance = parseJSON<BalanceCheck>(r.balance_check_result, {});
    const usage = parseJSON<UsageSnapshot>(r.usage_result, {});
    summary = {
      company: String(r.company || ""),
      totalRows: counts.total,
      mappedRows: counts.mapped,
      unmappedCount: Number(r.unmapped_count ?? 0),
      costUsd: usage.total?.cost_usd ?? null,
      balanced: balance.isBalanced ?? null,
    };
  }
  return {
    documentId: id,
    status,
    stage: (r.pipeline_stage as string) ?? null,
    error: (r.error_message as string) ?? null,
    summary,
  };
}

// ── Validation (2 checks — Phase 5) ──────────────────────────────────────────

export interface ValidationResult {
  balance: BalanceCheck;
  reconciliation: {
    total: number;
    passed: number;
    failed: number;
    incomplete: number;
    withUnmapped: number;
    subtotals: { rawLabel: string; pass: boolean | null; missingLeaf: boolean }[];
  };
}

export function getValidation(id: string): ValidationResult | null {
  const r = getDb()
    .prepare(`SELECT balance_check_result, reconciliation_result FROM documents WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  const balance = parseJSON<BalanceCheck>(r.balance_check_result, {});
  const recon = parseJSON<ReconResult>(r.reconciliation_result, {});
  const s = recon.summary ?? {};
  return {
    balance,
    reconciliation: {
      total: s.total ?? 0,
      passed: s.passed ?? 0,
      failed: s.failed ?? 0,
      incomplete: s.incomplete ?? 0,
      withUnmapped: s.with_unmapped_component ?? 0,
      subtotals: (recon.subtotals ?? []).map((st) => ({
        rawLabel: st.raw_label,
        pass: st.pass,
        missingLeaf: !!st.has_unmapped_component,
      })),
    },
  };
}

// ── Usage (LLM Cost — minimal aggregate for Phase 2) ─────────────────────────

export interface UsageAggregate {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  perDoc: { id: string; company: string; costUsd: number }[];
}

export interface UsageDocRow {
  id: string;
  company: string;
  docType: "scanned" | "digital";
  extractionCost: number;
  spreadingCost: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
}
export interface UsageDetail {
  kpis: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    avgPerReport: number;
    docCount: number;
  };
  perDoc: UsageDocRow[];
  byStage: { extraction: number; spreading: number };
  byType: { scanned: { avg: number; n: number }; digital: { avg: number; n: number } };
}

/** Per-document + aggregate LLM usage for the Cost screen (Phase 6). */
export function getUsageDetail(): UsageDetail {
  const perDoc: UsageDocRow[] = [];
  for (const d of getDocuments()) {
    const r = getDb()
      .prepare(`SELECT usage_result, page_summary FROM documents WHERE id = ?`)
      .get(d.id) as { usage_result?: unknown; page_summary?: unknown } | undefined;
    const u = parseJSON<UsageSnapshot>(r?.usage_result, {});
    const ps = parseJSON<{ digital?: number; scanned?: number }>(r?.page_summary, {});
    const ext = u.by_stage?.extraction;
    const spr = u.by_stage?.spreading;
    perDoc.push({
      id: d.id,
      company: d.company || d.filename,
      docType: (ps.scanned ?? 0) > (ps.digital ?? 0) ? "scanned" : "digital",
      extractionCost: ext?.cost_usd ?? 0,
      spreadingCost: spr?.cost_usd ?? 0,
      totalCost: u.total?.cost_usd ?? 0,
      inputTokens: u.total?.input_tokens ?? 0,
      outputTokens: u.total?.output_tokens ?? 0,
    });
  }

  const totalCost = perDoc.reduce((s, d) => s + d.totalCost, 0);
  const scanned = perDoc.filter((d) => d.docType === "scanned");
  const digital = perDoc.filter((d) => d.docType === "digital");
  const avg = (rows: UsageDocRow[]) =>
    rows.length ? rows.reduce((s, d) => s + d.totalCost, 0) / rows.length : 0;

  return {
    kpis: {
      totalInputTokens: perDoc.reduce((s, d) => s + d.inputTokens, 0),
      totalOutputTokens: perDoc.reduce((s, d) => s + d.outputTokens, 0),
      totalCost,
      avgPerReport: perDoc.length ? totalCost / perDoc.length : 0,
      docCount: perDoc.length,
    },
    perDoc,
    byStage: {
      extraction: perDoc.reduce((s, d) => s + d.extractionCost, 0),
      spreading: perDoc.reduce((s, d) => s + d.spreadingCost, 0),
    },
    byType: {
      scanned: { avg: avg(scanned), n: scanned.length },
      digital: { avg: avg(digital), n: digital.length },
    },
  };
}

export function getUsageAll(): UsageAggregate {
  const docs = getDocuments();
  let inTok = 0;
  let outTok = 0;
  let cost = 0;
  const perDoc: UsageAggregate["perDoc"] = [];
  for (const d of docs) {
    const r = getDb()
      .prepare(`SELECT usage_result FROM documents WHERE id = ?`)
      .get(d.id) as { usage_result?: unknown } | undefined;
    const u = parseJSON<UsageSnapshot>(r?.usage_result, {});
    inTok += u.total?.input_tokens ?? 0;
    outTok += u.total?.output_tokens ?? 0;
    cost += u.total?.cost_usd ?? 0;
    perDoc.push({ id: d.id, company: d.company, costUsd: u.total?.cost_usd ?? 0 });
  }
  return {
    totalInputTokens: inTok,
    totalOutputTokens: outTok,
    totalCostUsd: cost,
    perDoc,
  };
}
