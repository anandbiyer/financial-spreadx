// @vitest-environment node
/**
 * T5.1–T5.5 E2E — Middleware authentication via live HTTP requests.
 *
 * These tests hit the running dev server to verify the proxy gate works
 * end-to-end (header auth, cookie auth, rejection).
 *
 * Requires: dev server running on APP_URL (default http://localhost:3000).
 */

import { describe, it, expect } from 'vitest';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const API_KEY = process.env.DEMO_API_KEY ?? 'demo-spreadx-2025';

describe('E2E — Middleware authentication', () => {
  it('T5.1 — rejects request with no API key', async () => {
    const res = await fetch(`${BASE}/api/documents`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('T5.2 — rejects request with wrong API key in header', async () => {
    const res = await fetch(`${BASE}/api/documents`, {
      headers: { 'x-api-key': 'wrong-key-12345' },
    });
    expect(res.status).toBe(401);
  });

  it('T5.3 — accepts request with correct API key in x-api-key header', async () => {
    const res = await fetch(`${BASE}/api/documents`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('rows');
  });

  it('T5.4 — accepts request with correct API key in cookie', async () => {
    const res = await fetch(`${BASE}/api/documents`, {
      headers: { cookie: `demo-api-key=${API_KEY}` },
    });
    expect(res.status).toBe(200);
  });

  it('T5.5 — non-API route is not blocked (root page)', async () => {
    const res = await fetch(BASE);
    // Root should not return 401 — either 200 or 3xx redirect
    expect(res.status).not.toBe(401);
  });
});
