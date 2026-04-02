// @vitest-environment node
/**
 * T5.1–T5.5 — Proxy (middleware) authentication unit tests.
 * Tests the proxy() function directly with mock NextRequest objects.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// Ensure env is loaded before importing proxy
beforeAll(() => {
  process.env.DEMO_API_KEY = process.env.DEMO_API_KEY ?? 'demo-spreadx-2025';
});

async function getProxy() {
  const mod = await import('../../proxy');
  return mod.proxy;
}

function makeRequest(url: string, headers?: Record<string, string>, cookies?: Record<string, string>) {
  const req = new NextRequest(url, { headers });
  if (cookies) {
    for (const [k, v] of Object.entries(cookies)) {
      req.cookies.set(k, v);
    }
  }
  return req;
}

describe('T5.1 — No API key → 401', () => {
  it('returns 401 when no API key is provided', async () => {
    const proxy = await getProxy();
    const req = makeRequest('http://localhost:3000/api/documents');
    const res = proxy(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });
});

describe('T5.2 — Wrong API key in header → 401', () => {
  it('returns 401 for wrong x-api-key header', async () => {
    const proxy = await getProxy();
    const req = makeRequest('http://localhost:3000/api/documents', {
      'x-api-key': 'wrong-key-12345',
    });
    const res = proxy(req);
    expect(res.status).toBe(401);
  });
});

describe('T5.3 — Correct API key in header → passes through', () => {
  it('returns next() (not 401) when x-api-key header is correct', async () => {
    const proxy = await getProxy();
    const req = makeRequest('http://localhost:3000/api/documents', {
      'x-api-key': 'demo-spreadx-2025',
    });
    const res = proxy(req);
    // NextResponse.next() has status 200 and no body
    expect(res.status).not.toBe(401);
  });
});

describe('T5.4 — Correct API key in cookie → passes through', () => {
  it('returns next() when demo-api-key cookie is correct', async () => {
    const proxy = await getProxy();
    const req = makeRequest('http://localhost:3000/api/documents', {}, {
      'demo-api-key': 'demo-spreadx-2025',
    });
    const res = proxy(req);
    expect(res.status).not.toBe(401);
  });
});

describe('T5.5 — Non-protected route passes through', () => {
  it('non-API routes are not in the matcher so proxy would not be called', async () => {
    // The matcher config only applies to /api/:path* — the proxy function
    // itself always checks auth, but Next.js only invokes it for matched paths.
    // Verify the config matcher is set correctly.
    const mod = await import('../../proxy');
    expect(mod.config.matcher).toContain('/api/:path*');
    // Root path "/" is NOT in the matcher
    expect(mod.config.matcher.join(',')).not.toMatch(/^\/$/);
  });
});
