/**
 * M6 — Confidence & Review Engine
 *
 * Assigns a composite confidence score (0–1) to each mapped row.
 * Weighted combination of: dictionary match quality, context signal alignment,
 * formula validation pass/fail, and historical agreement rate.
 */

export interface ConfidenceSignals {
  dictionaryConfidence: number;  // 0-1 from M2
  contextConfidence: number;     // 0-1 from M3 (1.0 if no disambiguation needed)
  formulaPassed: boolean | null; // from M5 (null = not checked / skipped)
  historicalAgreement: number;   // 0-1 (default 0.8 for seed rules)
  ocrMethod?: string;            // 'none' | 'claude_vision'
}

export interface ConfidenceResult {
  compositeScore: number;
  reviewStatus: 'auto_approved' | 'needs_review';
}

const WEIGHTS = {
  dictionary: 0.50,
  context: 0.20,
  formula: 0.20,
  historical: 0.10,
};

const OCR_PENALTY = 0.05;
const AUTO_APPROVE_THRESHOLD = 0.92;
const REVIEW_THRESHOLD = 0.80;

/**
 * Compute a composite confidence score for a mapped row.
 */
export function computeConfidence(signals: ConfidenceSignals): ConfidenceResult {
  const formulaScore = signals.formulaPassed === null
    ? 0.80  // neutral if not checked
    : signals.formulaPassed
      ? 1.0
      : 0.30;

  let composite =
    signals.dictionaryConfidence * WEIGHTS.dictionary +
    signals.contextConfidence * WEIGHTS.context +
    formulaScore * WEIGHTS.formula +
    signals.historicalAgreement * WEIGHTS.historical;

  // Apply OCR penalty
  if (signals.ocrMethod === 'claude_vision') {
    composite = Math.max(composite - OCR_PENALTY, 0);
  }

  // Clamp to [0, 1]
  composite = Math.min(Math.max(composite, 0), 1);

  const reviewStatus: ConfidenceResult['reviewStatus'] =
    composite >= AUTO_APPROVE_THRESHOLD ? 'auto_approved' : 'needs_review';

  return { compositeScore: composite, reviewStatus };
}
