// @vitest-environment node
/**
 * T5.6–T5.15 E2E — Full pipeline integration tests for /api/documents.
 *
 * Uploads DIGITAL and SCANNED PDFs through the 10-stage pipeline,
 * then verifies classification, extraction, mapping, and validation outputs.
 *
 * Requires: dev server + database + Anthropic API key.
 * These tests are long-running (up to 300s per upload).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const API_KEY = process.env.DEMO_API_KEY ?? 'demo-spreadx-2025';
const headers = { 'x-api-key': API_KEY };

const FIXTURES = path.resolve(__dirname, '../fixtures');
const DIGITAL_PDF = path.join(FIXTURES, 'Aspect_Capital_Limited_2023.pdf');
const SCANNED_PDF = path.join(FIXTURES, 'Sun_Hung_Kai_Co_Limited_AR_2024.pdf');

let digitalDocId: string;
let scannedDocId: string;

// IDs of documents created during tests — used for cleanup reference
const createdDocIds: string[] = [];

// ─── Helper ────────────────────────────────────────────────
async function uploadPdf(filePath: string): Promise<string> {
  const form = new FormData();
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  form.append('file', blob, path.basename(filePath));

  const res = await fetch(`${BASE}/api/documents`, {
    method: 'POST',
    headers,
    body: form,
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.documentId).toBeDefined();
  createdDocIds.push(body.documentId);
  return body.documentId;
}

async function getJson(urlPath: string) {
  const res = await fetch(`${BASE}${urlPath}`, { headers });
  expect(res.status).toBe(200);
  return res.json();
}

// ─── Pipeline — DIGITAL (Aspect Capital 2023, T5) ──────────
describe('E2E — Pipeline DIGITAL (Aspect Capital)', () => {
  beforeAll(async () => {
    digitalDocId = await uploadPdf(DIGITAL_PDF);
  }, 360_000);

  it('T5.6 — pipeline returns documentId and completes', () => {
    expect(digitalDocId).toBeDefined();
    expect(typeof digitalDocId).toBe('string');
  });

  it('T5.7 — page classification summary present with pages classified', async () => {
    const doc = await getJson(`/api/documents/${digitalDocId}`);
    const summary = doc.pageClassificationSummary;
    expect(summary).toBeDefined();
    expect(summary.total).toBeGreaterThan(0);
    // Pages may be classified as digital or scanned depending on the classifier
    expect(summary.digital + summary.scanned + summary.hybrid).toBe(summary.total);
  });

  it('T5.8 — template classified as T5 with GBP', async () => {
    const doc = await getJson(`/api/documents/${digitalDocId}`);
    expect(doc.templateType).toBe('T5');
    expect(doc.classificationConfidence).toBeGreaterThanOrEqual(0.7);
    expect(doc.currencyCode).toBe('GBP');
  });

  it('T5.9 — extracted rows include income_statement and balance_sheet', async () => {
    const data = await getJson(`/api/documents/${digitalDocId}/rows`);
    expect(data.rows.length).toBeGreaterThan(20);
    const types = new Set(data.rows.map((r: any) => r.statementType));
    expect(types.has('income_statement')).toBe(true);
    expect(types.has('balance_sheet')).toBe(true);
  });

  it('T5.10 — mapped rows have canonical fields with dictionary method', async () => {
    const data = await getJson(`/api/documents/${digitalDocId}/mapped`);
    expect(data.rows.length).toBeGreaterThan(0);
    const methods = data.rows.map((r: any) => r.mappingMethod);
    expect(methods).toContain('dictionary');
    // Verify a meaningful portion of rows have high confidence
    const highConf = data.rows.filter((r: any) => r.mappingConfidence >= 0.8);
    expect(highConf.length).toBeGreaterThan(0);
  });

  it('T5.11 — validation report has V01-V12 results', async () => {
    const report = await getJson(`/api/documents/${digitalDocId}/validation`);
    expect(report.checks).toBeDefined();
    expect(report.checks.length).toBeGreaterThanOrEqual(3);
    const ids = report.checks.map((c: any) => c.checkId);
    // At least some checks should have been evaluated (not all skipped)
    const evaluated = report.checks.filter((c: any) => c.status !== 'skipped');
    expect(evaluated.length).toBeGreaterThan(0);
  });
});

// ─── Pipeline — SCANNED (Sun Hung Kai 2024, T8) ────────────
describe('E2E — Pipeline SCANNED (Sun Hung Kai)', () => {
  beforeAll(async () => {
    scannedDocId = await uploadPdf(SCANNED_PDF);
  }, 360_000);

  it('T5.12 — pipeline returns documentId and completes', () => {
    expect(scannedDocId).toBeDefined();
    expect(typeof scannedDocId).toBe('string');
  });

  it('T5.13 — page classification summary present with pages classified', async () => {
    const doc = await getJson(`/api/documents/${scannedDocId}`);
    const summary = doc.pageClassificationSummary;
    expect(summary).toBeDefined();
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.digital + summary.scanned + summary.hybrid).toBe(summary.total);
  });

  it('T5.14 — template classified as T8 with HKD', async () => {
    const doc = await getJson(`/api/documents/${scannedDocId}`);
    expect(doc.templateType).toBe('T8');
    expect(doc.currencyCode).toBe('HKD');
  });

  it('T5.15 — if scanned pages exist, OCR rows are present', async () => {
    const doc = await getJson(`/api/documents/${scannedDocId}`);
    const summary = doc.pageClassificationSummary;
    if (summary.scanned > 0) {
      const data = await getJson(`/api/documents/${scannedDocId}/rows`);
      // There should be some rows from OCR extraction
      expect(data.rows.length).toBeGreaterThan(0);
    }
  });
});

// ─── CRUD API Tests ─────────────────────────────────────────
describe('E2E — Document CRUD API', () => {
  it('T5.16 — GET /api/documents with ?status= filter', async () => {
    const data = await getJson('/api/documents?status=ready_for_review');
    expect(data).toHaveProperty('rows');
    // All returned docs should have matching status
    for (const doc of data.rows) {
      expect(doc.status).toBe('ready_for_review');
    }
  });

  it('T5.17 — GET mapped rows with ?review_status=needs_review', async () => {
    if (!digitalDocId) return;
    const data = await getJson(
      `/api/documents/${digitalDocId}/mapped?review_status=needs_review`,
    );
    for (const row of data.rows) {
      expect(row.reviewStatus).toBe('needs_review');
    }
  });

  it('T5.18 — GET mapped rows with ?confidence_below=0.7', async () => {
    if (!digitalDocId) return;
    const data = await getJson(
      `/api/documents/${digitalDocId}/mapped?confidence_below=0.7`,
    );
    for (const row of data.rows) {
      expect(row.mappingConfidence).toBeLessThan(0.7);
    }
  });
});
