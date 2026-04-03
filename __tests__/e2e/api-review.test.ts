// @vitest-environment node
/**
 * T5.19–T5.21 E2E — Review override and explain stream tests.
 *
 * Requires: dev server + database with at least one processed document.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const API_KEY = process.env.DEMO_API_KEY ?? 'demo-spreadx-2025';
const headers = { 'x-api-key': API_KEY };

let mappedRowId: string;

async function getJson(urlPath: string) {
  const res = await fetch(`${BASE}${urlPath}`, { headers });
  expect(res.status).toBe(200);
  return res.json();
}

beforeAll(async () => {
  // Find an existing processed document
  const docs = await getJson('/api/documents?status=ready_for_review&limit=1');
  const docId = docs.rows?.[0]?.id;
  if (!docId) return;

  // Get a mapped row that needs review (or any mapped row)
  const mapped = await getJson(`/api/documents/${docId}/mapped`);
  mappedRowId = mapped.rows?.[0]?.id;
}, 30_000);

describe('E2E — Review override', () => {
  it('T5.19 — POST review override saves and updates mapped row', async () => {
    if (!mappedRowId) {
      console.warn('Skipping: no mapped row available');
      return;
    }

    const res = await fetch(`${BASE}/api/review/${mappedRowId}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_canonical_field: 'total_revenue',
        reason: 'E2E test correction',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.override).toBeDefined();
    expect(body.override.mappedRowId).toBe(mappedRowId);
    expect(body.override.newCanonicalField).toBe('total_revenue');
    expect(body.override.reviewer).toBe('analyst');
    expect(body.mappedRow).toBeDefined();
  });

  it('T5.19b — POST review override with missing fields returns 400', async () => {
    if (!mappedRowId) return;

    const res = await fetch(`${BASE}/api/review/${mappedRowId}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('T5.19c — POST review override for non-existent row returns 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE}/api/review/${fakeId}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_canonical_field: 'net_income' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('E2E — Explain stream (SSE)', () => {
  it('T5.21 — GET explain returns text/event-stream', async () => {
    if (!mappedRowId) {
      console.warn('Skipping: no mapped row available');
      return;
    }

    const res = await fetch(`${BASE}/api/review/${mappedRowId}/explain`, {
      headers,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Read at least one chunk from the stream
    const reader = res.body?.getReader();
    if (reader) {
      const { value, done } = await reader.read();
      // Should have some data (even if it's just the first event)
      if (!done && value) {
        const text = new TextDecoder().decode(value);
        expect(text.length).toBeGreaterThan(0);
      }
      reader.cancel();
    }
  }, 60_000);
});
