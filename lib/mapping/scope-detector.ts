/**
 * M7 — Scope Detector
 *
 * Detects whether a financial statement is standalone (parent entity only)
 * or consolidated (parent + subsidiaries).
 */

export type StatementScope = 'standalone' | 'consolidated' | 'unknown';

const CONSOLIDATED_PATTERNS = [
  /\bconsolidated\b/i,
  /\bgroup\b/i,
];

const STANDALONE_PATTERNS = [
  /\bstandalone\b/i,
  /\bcompany\b(?!\s+act)/i,  // "Company" but not "Companies Act"
  /\bparent\s+entity\b/i,
];

/**
 * Detect the scope of a financial statement from its heading/page text.
 */
export function detectScope(pageText: string): StatementScope {
  // Check first 500 characters (heading area)
  const heading = pageText.slice(0, 500);

  if (CONSOLIDATED_PATTERNS.some((p) => p.test(heading))) {
    return 'consolidated';
  }

  if (STANDALONE_PATTERNS.some((p) => p.test(heading))) {
    return 'standalone';
  }

  return 'unknown';
}
