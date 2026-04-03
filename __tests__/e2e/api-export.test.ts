// @vitest-environment node
/**
 * E2E — Export API tests (XLSX, JSON, raw-json).
 *
 * Validates that export endpoints return correct content types and valid data
 * for a processed document.
 *
 * Requires: dev server + database with at least one processed document.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const API_KEY = process.env.DEMO_API_KEY ?? 'demo-spreadx-2025';
const headers = { 'x-api-key': API_KEY };

let docId: string;

async function getJson(urlPath: string) {
  const res = await fetch(`${BASE}${urlPath}`, { headers });
  expect(res.status).toBe(200);
  return res.json();
}

beforeAll(async () => {
  // Find an existing processed document
  const docs = await getJson('/api/documents?status=ready_for_review&limit=1');
  docId = docs.rows?.[0]?.id;
  if (!docId) {
    // Try any document
    const allDocs = await getJson('/api/documents?limit=1');
    docId = allDocs.rows?.[0]?.id;
  }
}, 15_000);

describe('E2E — Export XLSX', () => {
  it('returns XLSX binary with correct content-type', async () => {
    if (!docId) {
      console.warn('Skipping: no document available');
      return;
    }

    const res = await fetch(`${BASE}/api/export/${docId}/xlsx`, { headers });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);

    // XLSX files start with PK (ZIP signature)
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
  }, 60_000);

  it('rejects invalid tier parameter', async () => {
    if (!docId) return;

    const res = await fetch(`${BASE}/api/export/${docId}/xlsx?tier=invalid`, {
      headers,
    });
    expect(res.status).toBe(400);
  });
});

describe('E2E — Export JSON', () => {
  it('returns valid JSON with document metadata', async () => {
    if (!docId) {
      console.warn('Skipping: no document available');
      return;
    }

    const res = await fetch(`${BASE}/api/export/${docId}/json`, { headers });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body.meta).toBeDefined();
    expect(body.meta.documentId).toBe(docId);
    expect(body.statements).toBeDefined();
  }, 60_000);

  it('JSON export includes FX conversion data', async () => {
    if (!docId) return;

    const res = await fetch(`${BASE}/api/export/${docId}/json`, { headers });
    const body = await res.json();

    // Document should have currency info
    expect(body.meta.currency).toBeDefined();
    expect(body.meta.fxRateToUsd).toBeGreaterThan(0);
  }, 60_000);
});

describe('E2E — Export raw-json', () => {
  it('returns valid raw JSON export', async () => {
    if (!docId) {
      console.warn('Skipping: no document available');
      return;
    }

    const res = await fetch(`${BASE}/api/export/${docId}/raw-json`, {
      headers,
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toBeDefined();
  }, 60_000);
});

describe('E2E — Export error handling', () => {
  it('returns 404 for non-existent document', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE}/api/export/${fakeId}/xlsx`, { headers });
    expect(res.status).toBe(404);
  });

  it('returns error for unsupported format', async () => {
    if (!docId) return;
    const res = await fetch(`${BASE}/api/export/${docId}/csv`, { headers });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
