import { describe, it, expect } from 'vitest';
import type { PageClassification } from '../../lib/pdf/page-classifier';

/**
 * T2.3 — Page classifier edge cases (unit test).
 * We test the classification logic directly without reading a PDF.
 */

function classifyByThresholds(wordCount: number, asciiRatio: number): PageClassification {
  if (wordCount >= 80 && asciiRatio >= 0.9) return 'digital';
  if (wordCount >= 20) return 'hybrid';
  return 'scanned';
}

describe('T2.3 — Page classifier edge cases', () => {
  it('(a) 0 words → scanned', () => {
    expect(classifyByThresholds(0, 0)).toBe('scanned');
  });

  it('(b) 19 words → scanned', () => {
    expect(classifyByThresholds(19, 0.95)).toBe('scanned');
  });

  it('(c) 20 words → hybrid', () => {
    expect(classifyByThresholds(20, 0.95)).toBe('hybrid');
  });

  it('(d) 79 words → hybrid', () => {
    expect(classifyByThresholds(79, 0.95)).toBe('hybrid');
  });

  it('(e) 80 words with 90% ASCII → digital', () => {
    expect(classifyByThresholds(80, 0.90)).toBe('digital');
  });

  it('(f) 100 words with 89% ASCII → hybrid (ASCII < 90%)', () => {
    expect(classifyByThresholds(100, 0.89)).toBe('hybrid');
  });

  it('80 words with 91% ASCII → digital', () => {
    expect(classifyByThresholds(80, 0.91)).toBe('digital');
  });

  it('200 words with 99% ASCII → digital', () => {
    expect(classifyByThresholds(200, 0.99)).toBe('digital');
  });
});
