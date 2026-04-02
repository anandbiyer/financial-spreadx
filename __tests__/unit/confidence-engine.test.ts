import { describe, it, expect } from 'vitest';
import { computeConfidence } from '../../lib/mapping/confidence-engine';

describe('T3.24-T3.26 — Confidence Engine (M6)', () => {
  it('T3.24 — high signals → composite >= 0.95 → auto_approved', () => {
    const result = computeConfidence({
      dictionaryConfidence: 0.98,
      contextConfidence: 0.95,
      formulaPassed: true,
      historicalAgreement: 0.90,
    });
    expect(result.compositeScore).toBeGreaterThanOrEqual(0.95);
    expect(result.reviewStatus).toBe('auto_approved');
  });

  it('T3.25 — low signals → composite < 0.80 → needs_review', () => {
    const result = computeConfidence({
      dictionaryConfidence: 0.70,
      contextConfidence: 0.60,
      formulaPassed: false,
      historicalAgreement: 0.50,
    });
    expect(result.compositeScore).toBeLessThan(0.80);
    expect(result.reviewStatus).toBe('needs_review');
  });

  it('T3.26 — OCR penalty reduces score by 0.05', () => {
    const without = computeConfidence({
      dictionaryConfidence: 0.98,
      contextConfidence: 0.95,
      formulaPassed: true,
      historicalAgreement: 0.90,
    });
    const with_ = computeConfidence({
      dictionaryConfidence: 0.98,
      contextConfidence: 0.95,
      formulaPassed: true,
      historicalAgreement: 0.90,
      ocrMethod: 'claude_vision',
    });
    expect(with_.compositeScore).toBeCloseTo(without.compositeScore - 0.05, 5);
  });

  it('formula=null gives neutral score', () => {
    const result = computeConfidence({
      dictionaryConfidence: 0.90,
      contextConfidence: 0.85,
      formulaPassed: null,
      historicalAgreement: 0.80,
    });
    // Should still produce a reasonable score
    expect(result.compositeScore).toBeGreaterThan(0.5);
    expect(result.compositeScore).toBeLessThanOrEqual(1.0);
  });
});
