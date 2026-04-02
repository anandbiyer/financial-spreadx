/**
 * 5.1 — API Authentication Proxy (Next.js 16)
 *
 * Protects /api/* and /(dashboard)/* routes.
 * Accepts the demo API key via:
 *   - x-api-key request header
 *   - demo-api-key cookie
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // NEXT_PUBLIC_ vars are inlined at build time and available in the Edge Runtime.
  // DEMO_API_KEY alone may be undefined if the Edge worker cannot access server-only vars.
  const apiKey = process.env.DEMO_API_KEY ?? process.env.NEXT_PUBLIC_DEMO_API_KEY ?? 'demo-spreadx-2025';

  const headerKey = request.headers.get('x-api-key');
  const cookieKey = request.cookies.get('demo-api-key')?.value;

  if (headerKey === apiKey || cookieKey === apiKey) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export const config = {
  matcher: ['/api/:path*', '/(dashboard)/:path*'],
};
