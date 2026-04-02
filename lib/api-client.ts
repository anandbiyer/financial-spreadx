/**
 * Lightweight fetch wrapper that injects the demo API key on every request.
 * The key is public for this demo build.
 */

const DEMO_KEY =
  process.env.NEXT_PUBLIC_DEMO_API_KEY ?? 'demo-spreadx-2025';

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('x-api-key', DEMO_KEY);
  return fetch(input, { ...init, headers });
}
