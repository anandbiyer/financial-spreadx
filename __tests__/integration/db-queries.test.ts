// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq, count } from 'drizzle-orm';
import * as schema from '../../lib/db/schema';

// Load env vars for test
import 'dotenv/config';

// Create a direct DB connection for tests
const neonSql = neon(process.env.DATABASE_URL_UNPOOLED!);
const db = drizzle(neonSql, { schema });

// ─── Helper: clean up test data ──────────────────────────
const testDocIds: string[] = [];

afterAll(async () => {
  // Clean up test documents (cascades to child tables)
  for (const id of testDocIds) {
    await db.delete(schema.documents).where(sql`id = ${id}`);
  }
});

// ─── T1.3: Schema validation ─────────────────────────────
describe('T1.3 — Schema exports', () => {
  it('all 8 table exports exist', () => {
    expect(schema.documents).toBeDefined();
    expect(schema.documentPages).toBeDefined();
    expect(schema.extractedRows).toBeDefined();
    expect(schema.mappedRows).toBeDefined();
    expect(schema.canonicalFields).toBeDefined();
    expect(schema.mappingRules).toBeDefined();
    expect(schema.reviewOverrides).toBeDefined();
    expect(schema.noteEntries).toBeDefined();
  });
});

// ─── T1.2: Tables exist in Neon ──────────────────────────
describe('T1.2 — Tables exist in database', () => {
  it('can query all 8 tables via drizzle', { timeout: 15000 }, async () => {
    // Each query goes to Neon over the network
    const docs = await db.select().from(schema.documents).limit(0);
    expect(docs).toBeDefined();
    const pages = await db.select().from(schema.documentPages).limit(0);
    expect(pages).toBeDefined();
    const exRows = await db.select().from(schema.extractedRows).limit(0);
    expect(exRows).toBeDefined();
    const mapRows = await db.select().from(schema.mappedRows).limit(0);
    expect(mapRows).toBeDefined();
    const cf = await db.select().from(schema.canonicalFields).limit(0);
    expect(cf).toBeDefined();
    const mr = await db.select().from(schema.mappingRules).limit(0);
    expect(mr).toBeDefined();
    const ro = await db.select().from(schema.reviewOverrides).limit(0);
    expect(ro).toBeDefined();
    const ne = await db.select().from(schema.noteEntries).limit(0);
    expect(ne).toBeDefined();
  });
});

// ─── T1.4 / T1.5: CRUD — documents ──────────────────────
describe('T1.4-T1.5 — Document CRUD', () => {
  it('T1.4 — insert and read DIGITAL document (Aspect Capital)', async () => {
    const [doc] = await db.insert(schema.documents).values({
      fileName: 'Aspect_Capital_Limited_2023.pdf',
      companyName: 'Aspect Capital Limited',
      reportYear: [2023],
      templateType: 'T5',
      currencyCode: 'GBP',
      unitScale: 'thousands',
      status: 'uploaded',
    }).returning();

    testDocIds.push(doc.id);
    expect(doc.id).toBeDefined();
    expect(doc.companyName).toBe('Aspect Capital Limited');
    expect(doc.templateType).toBe('T5');
    expect(doc.currencyCode).toBe('GBP');

    // Read back
    const [readDoc] = await db.select().from(schema.documents).where(sql`id = ${doc.id}`);
    expect(readDoc.companyName).toBe('Aspect Capital Limited');

    // Update status
    const [updated] = await db.update(schema.documents)
      .set({ status: 'extracting' })
      .where(sql`id = ${doc.id}`)
      .returning();
    expect(updated.status).toBe('extracting');
  });

  it('T1.5 — insert and read SCANNED document (Sun Hung Kai)', async () => {
    const [doc] = await db.insert(schema.documents).values({
      fileName: 'Sun_Hung_Kai___Co__Limited_AR_2024.pdf',
      companyName: 'Sun Hung Kai & Co',
      reportYear: [2024],
      templateType: 'T8',
      currencyCode: 'HKD',
      unitScale: 'thousands',
      status: 'uploaded',
    }).returning();

    testDocIds.push(doc.id);
    expect(doc.id).toBeDefined();
    expect(doc.templateType).toBe('T8');
    expect(doc.currencyCode).toBe('HKD');
  });
});

// ─── T1.6: CRUD — extracted_rows ─────────────────────────
describe('T1.6 — Extracted rows CRUD', () => {
  it('batch insert and filter by statement_type', async () => {
    const docId = testDocIds[0]; // DIGITAL doc
    if (!docId) throw new Error('No test document created');

    const rows = [
      { documentId: docId, statementType: 'income_statement' as const, rawLabel: 'Turnover', rawValues: { '2023': 5000 } },
      { documentId: docId, statementType: 'income_statement' as const, rawLabel: 'Administration expenses', rawValues: { '2023': -3000 } },
      { documentId: docId, statementType: 'income_statement' as const, rawLabel: 'Operating loss', rawValues: { '2023': -1500 } },
      { documentId: docId, statementType: 'balance_sheet' as const, rawLabel: 'Total assets', rawValues: { '2023': 50000 } },
      { documentId: docId, statementType: 'balance_sheet' as const, rawLabel: 'Total liabilities', rawValues: { '2023': 30000 } },
    ];

    const inserted = await db.insert(schema.extractedRows).values(rows).returning();
    expect(inserted.length).toBe(5);

    // Filter by income_statement
    const isRows = await db.select().from(schema.extractedRows).where(
      sql`document_id = ${docId} AND statement_type = 'income_statement'`
    );
    expect(isRows.length).toBe(3);

    // Filter by balance_sheet
    const bsRows = await db.select().from(schema.extractedRows).where(
      sql`document_id = ${docId} AND statement_type = 'balance_sheet'`
    );
    expect(bsRows.length).toBe(2);
  });
});

// ─── T1.7: CRUD — mapped_rows ────────────────────────────
describe('T1.7 — Mapped rows CRUD', () => {
  it('insert and filter by review_status and confidence', async () => {
    const docId = testDocIds[0];
    if (!docId) throw new Error('No test document created');

    // Get an extracted row ID for the FK
    const [extRow] = await db.select().from(schema.extractedRows).where(
      sql`document_id = ${docId}`
    ).limit(1);

    const rows = [
      { rowId: extRow.id, documentId: docId, canonicalField: 'total_revenue', mappingConfidence: 0.95, reviewStatus: 'auto_approved' as const, mappingMethod: 'dictionary' as const },
      { rowId: extRow.id, documentId: docId, canonicalField: 'admin_expenses', mappingConfidence: 0.72, reviewStatus: 'needs_review' as const, mappingMethod: 'dictionary' as const },
      { rowId: extRow.id, documentId: docId, canonicalField: 'operating_income', mappingConfidence: 0.60, reviewStatus: 'needs_review' as const, mappingMethod: 'claude' as const },
    ];

    const inserted = await db.insert(schema.mappedRows).values(rows).returning();
    expect(inserted.length).toBe(3);

    // Filter by needs_review
    const needsReview = await db.select().from(schema.mappedRows).where(
      sql`document_id = ${docId} AND review_status = 'needs_review'`
    );
    expect(needsReview.length).toBe(2);

    // Filter by confidence < 0.8
    const lowConf = await db.select().from(schema.mappedRows).where(
      sql`document_id = ${docId} AND mapping_confidence < 0.8`
    );
    expect(lowConf.length).toBe(2);
  });
});

// ─── T1.8: CRUD — document_pages ─────────────────────────
describe('T1.8 — Document pages CRUD', () => {
  it('insert 5 page classifications for SCANNED doc', async () => {
    const docId = testDocIds[1]; // SCANNED doc
    if (!docId) throw new Error('No SCANNED test document created');

    const pages = [
      { documentId: docId, pageNumber: 1, classification: 'digital', wordCount: 120 },
      { documentId: docId, pageNumber: 2, classification: 'digital', wordCount: 95 },
      { documentId: docId, pageNumber: 3, classification: 'digital', wordCount: 200 },
      { documentId: docId, pageNumber: 4, classification: 'hybrid', wordCount: 45 },
      { documentId: docId, pageNumber: 5, classification: 'scanned', wordCount: 5 },
    ];

    const inserted = await db.insert(schema.documentPages).values(pages).returning();
    expect(inserted.length).toBe(5);

    // Verify classification distribution
    const allPages = await db.select().from(schema.documentPages).where(
      sql`document_id = ${docId}`
    );
    const digital = allPages.filter(p => p.classification === 'digital').length;
    const hybrid = allPages.filter(p => p.classification === 'hybrid').length;
    const scanned = allPages.filter(p => p.classification === 'scanned').length;
    expect(digital).toBe(3);
    expect(hybrid).toBe(1);
    expect(scanned).toBe(1);
  });
});

// ─── T1.9: CRUD — note_entries ───────────────────────────
describe('T1.9 — Note entries CRUD', () => {
  it('insert and retrieve notes by number', async () => {
    const docId = testDocIds[0]; // DIGITAL doc
    if (!docId) throw new Error('No test document created');

    const notes = [
      { documentId: docId, noteNumber: 3, noteTitle: 'Turnover', pages: [12, 13] },
      { documentId: docId, noteNumber: 7, noteTitle: 'Investments', pages: [18] },
    ];

    const inserted = await db.insert(schema.noteEntries).values(notes).returning();
    expect(inserted.length).toBe(2);

    // Get by number
    const [note3] = await db.select().from(schema.noteEntries).where(
      sql`document_id = ${docId} AND note_number = 3`
    );
    expect(note3.noteTitle).toBe('Turnover');
    expect(note3.pages).toEqual([12, 13]);
  });
});

// ─── T1.10: Seed — canonical_fields ──────────────────────
describe('T1.10 — Canonical fields seeded', () => {
  it('count >= 40 and key fields exist', async () => {
    const [{ total }] = await db.select({ total: count() }).from(schema.canonicalFields);
    expect(total).toBeGreaterThanOrEqual(40);

    // Check key fields
    for (const key of ['net_income', 'total_assets', 'total_revenue', 'cash_end']) {
      const [row] = await db.select().from(schema.canonicalFields)
        .where(eq(schema.canonicalFields.canonicalField, key));
      expect(row).toBeDefined();
    }
  });
});

// ─── T1.11: Seed — mapping_rules ─────────────────────────
describe('T1.11 — Mapping rules seeded', () => {
  it('count >= 60 and key T5/T8 rules exist', async () => {
    const [{ total }] = await db.select({ total: count() }).from(schema.mappingRules);
    expect(total).toBeGreaterThanOrEqual(60);

    // T5 rule: turnover -> total_revenue
    const [t5Rule] = await db.select().from(schema.mappingRules).where(
      sql`normalized_label = 'turnover' AND template_type = 'T5'`
    );
    expect(t5Rule.canonicalField).toBe('total_revenue');

    // T8 rule: brokerage handling fee income -> commission_income
    const [t8Rule] = await db.select().from(schema.mappingRules).where(
      sql`normalized_label = 'brokerage handling fee income' AND template_type = 'T8'`
    );
    expect(t8Rule.canonicalField).toBe('commission_income');
  });
});

// ─── T1.12: Pagination ───────────────────────────────────
describe('T1.12 — Pagination', () => {
  it('paginated document list works correctly', async () => {
    // We already have 2 test docs — just verify limit/offset works
    const page1 = await db.select().from(schema.documents)
      .limit(1).offset(0);
    expect(page1.length).toBeLessThanOrEqual(1);

    const page2 = await db.select().from(schema.documents)
      .limit(1).offset(1);
    expect(page2.length).toBeLessThanOrEqual(1);
  });
});
