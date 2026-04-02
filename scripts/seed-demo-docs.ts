/**
 * scripts/seed-demo-docs.ts
 *
 * Batch-ingest all PDFs from ./demo-docs/ through the processing pipeline.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-docs.ts
 *   BASE_URL=https://your-app.vercel.app npx tsx scripts/seed-demo-docs.ts
 *
 * Options (env vars):
 *   BASE_URL          App base URL (default: http://localhost:3000)
 *   DEMO_API_KEY      API key header value (default: demo-spreadx-2025)
 *   CONCURRENCY       Max parallel uploads (default: 2)
 *   POLL_INTERVAL_MS  Polling interval in ms (default: 5000)
 *   POLL_TIMEOUT_MS   Max wait per doc in ms (default: 600000 = 10 min)
 *   DOCS_DIR          Directory containing PDFs (default: ./demo-docs)
 *   DRY_RUN           If "true", list files but don't upload
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const DEMO_API_KEY = process.env.DEMO_API_KEY ?? process.env.NEXT_PUBLIC_DEMO_API_KEY ?? 'demo-spreadx-2025';
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '2', 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '5000', 10);
const POLL_TIMEOUT_MS = parseInt(process.env.POLL_TIMEOUT_MS ?? '600000', 10);
const DOCS_DIR = process.env.DOCS_DIR ?? path.join(process.cwd(), 'demo-docs');
const DRY_RUN = process.env.DRY_RUN === 'true';

const TERMINAL_STATUSES = new Set(['ready_for_review', 'reviewed', 'exported']);
const ERROR_INDICATORS = ['error', 'failed'];

interface UploadResult {
  file: string;
  documentId?: string;
  finalStatus?: string;
  durationMs: number;
  error?: string;
}

function apiHeaders(): Record<string, string> {
  return { 'x-api-key': DEMO_API_KEY };
}

async function uploadPdf(filePath: string): Promise<string> {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });

  const form = new FormData();
  form.append('file', blob, fileName);

  const res = await fetch(`${BASE_URL}/api/documents`, {
    method: 'POST',
    headers: apiHeaders(),
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Upload failed HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as { documentId?: string };
  if (!data.documentId) throw new Error('No documentId in response');
  return data.documentId;
}

async function pollUntilDone(documentId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${BASE_URL}/api/documents/${documentId}`, {
      headers: apiHeaders(),
    });

    if (!res.ok) continue;

    const doc = await res.json() as { status?: string };
    const status = doc.status ?? '';

    if (TERMINAL_STATUSES.has(status)) return status;
    if (ERROR_INDICATORS.some((e) => status.includes(e))) {
      throw new Error(`Pipeline error — final status: ${status}`);
    }
  }

  throw new Error(`Timed out after ${POLL_TIMEOUT_MS / 1000}s waiting for ${documentId}`);
}

async function processFile(filePath: string): Promise<UploadResult> {
  const file = path.basename(filePath);
  const start = Date.now();

  try {
    console.log(`  ▶ Uploading ${file}…`);
    const documentId = await uploadPdf(filePath);
    console.log(`  ✓ Uploaded  ${file} → ${documentId} — polling…`);

    const finalStatus = await pollUntilDone(documentId);
    const durationMs = Date.now() - start;
    console.log(`  ✓ Done      ${file} [${finalStatus}] in ${(durationMs / 1000).toFixed(1)}s`);

    return { file, documentId, finalStatus, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Failed    ${file}: ${error}`);
    return { file, durationMs, error };
  }
}

/** Run tasks with bounded concurrency */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<UploadResult>,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      results.push(await fn(item));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Financial SpreadX — Demo Document Seeder');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  BASE_URL    : ${BASE_URL}`);
  console.log(`  DOCS_DIR    : ${DOCS_DIR}`);
  console.log(`  CONCURRENCY : ${CONCURRENCY}`);
  console.log(`  DRY_RUN     : ${DRY_RUN}`);
  console.log('───────────────────────────────────────────────────');

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`✗ DOCS_DIR not found: ${DOCS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => path.join(DOCS_DIR, f))
    .sort();

  if (files.length === 0) {
    console.error('✗ No PDF files found in DOCS_DIR');
    process.exit(1);
  }

  console.log(`  Found ${files.length} PDF(s):`);
  files.forEach((f) => console.log(`    · ${path.basename(f)}`));
  console.log('───────────────────────────────────────────────────');

  if (DRY_RUN) {
    console.log('  DRY_RUN=true — exiting without uploading.');
    return;
  }

  const totalStart = Date.now();
  const results = await runWithConcurrency(files, CONCURRENCY, processFile);
  const totalMs = Date.now() - totalStart;

  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  console.log('═══════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('───────────────────────────────────────────────────');
  console.log(`  Total    : ${results.length}`);
  console.log(`  Succeeded: ${succeeded.length}`);
  console.log(`  Failed   : ${failed.length}`);
  console.log(`  Duration : ${(totalMs / 1000).toFixed(1)}s`);

  if (succeeded.length > 0) {
    console.log('\n  Successful documents:');
    succeeded.forEach((r) => {
      console.log(`    ✓ ${r.file.padEnd(55)} [${r.finalStatus}]  ${(r.durationMs / 1000).toFixed(1)}s`);
    });
  }

  if (failed.length > 0) {
    console.log('\n  Failed documents:');
    failed.forEach((r) => {
      console.log(`    ✗ ${r.file.padEnd(55)} ${r.error}`);
    });
  }

  console.log('═══════════════════════════════════════════════════');

  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
