// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyDocument } from '../../lib/claude/classify';
import { classifyPdfPages } from '../../lib/pdf/page-classifier';

const FIXTURES = path.resolve(__dirname, '../fixtures');

describe('T4.1 — Classify DIGITAL (LT Finance 2019, T3)', () => {
  let sampleLabels: string[];
  let rawText: string;

  beforeAll(async () => {
    const buf = fs.readFileSync(path.join(FIXTURES, 'LT_Finance_Limited_2019.pdf'));
    const pages = await classifyPdfPages(buf);
    // Collect text from all digital pages
    rawText = pages
      .filter((p) => p.classification === 'digital')
      .map((p) => p.textContent)
      .join('\n\n');
    // Extract label-like strings (lines with numbers)
    sampleLabels = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 5 && l.length < 100)
      .slice(0, 20);
  }, 30000);

  it('classifies as T3 with INR currency', async () => {
    const result = await classifyDocument(sampleLabels, rawText);

    console.log('DIGITAL classification:', {
      template: result.template_type,
      confidence: result.confidence,
      currency: result.detected_currency,
      signals: result.signals_matched.slice(0, 5),
    });

    expect(result.template_type).toBe('T3');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.detected_currency).toMatch(/INR/i);
    expect(result.statement_types_found.length).toBeGreaterThanOrEqual(1);
  }, 60000);
});

describe('T4.2 — Classify SCANNED (Sun Hung Kai — no text)', () => {
  it('handles empty text without throwing', async () => {
    // Sun Hung Kai has no extractable text — classifier should not throw
    const result = await classifyDocument([], '');

    console.log('SCANNED classification:', {
      template: result.template_type,
      confidence: result.confidence,
    });

    // The function should return a valid result without crashing.
    // With no input text, smaller models may still produce a guess —
    // the important test is that it doesn't throw.
    expect(result.template_type).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  }, 60000);
});
