/**
 * M3 — Context-Aware Disambiguator
 *
 * For labels that appear in multiple statements with different meanings.
 * Uses statement_type, section_path, and template_type as context signals.
 */

export interface DisambiguationContext {
  statementType: string;       // income_statement | balance_sheet | cash_flow | equity_statement
  sectionPath?: string[];      // e.g. ["revenue", "interest income"]
  templateType?: string;       // T1-T8
}

export interface DisambiguationResult {
  canonicalField: string;
  confidence: number;
  flagForReview: boolean;
  reason?: string;
}

interface DisambiguationRule {
  label: string;
  conditions: (ctx: DisambiguationContext) => boolean;
  result: DisambiguationResult;
}

const DISAMBIGUATION_RULES: DisambiguationRule[] = [
  // "other income" in income statement → other_income
  {
    label: 'other income',
    conditions: (ctx) => ctx.statementType === 'income_statement',
    result: { canonicalField: 'other_income', confidence: 0.92, flagForReview: false },
  },
  // "other income" in balance sheet → ambiguous, flag for review
  {
    label: 'other income',
    conditions: (ctx) => ctx.statementType === 'balance_sheet',
    result: {
      canonicalField: 'other_income',
      confidence: 0.50,
      flagForReview: true,
      reason: '"Other income" in balance sheet context is ambiguous — may be a subtotal or misclassified row',
    },
  },

  // "interest income" in cash flow investing section → interest_received_investing
  {
    label: 'interest income',
    conditions: (ctx) =>
      ctx.statementType === 'cash_flow' &&
      (ctx.sectionPath?.some((s) => s.toLowerCase().includes('investing')) ?? false),
    result: { canonicalField: 'interest_received_investing', confidence: 0.90, flagForReview: false },
  },
  // "interest income" in cash flow (not investing) → still interest_income but lower confidence
  {
    label: 'interest income',
    conditions: (ctx) => ctx.statementType === 'cash_flow',
    result: { canonicalField: 'interest_income', confidence: 0.75, flagForReview: true, reason: '"Interest income" in cash flow without investing section context' },
  },
  // "interest income" in income statement → interest_income
  {
    label: 'interest income',
    conditions: (ctx) => ctx.statementType === 'income_statement',
    result: { canonicalField: 'interest_income', confidence: 0.95, flagForReview: false },
  },

  // "depreciation" in cash flow → add-back adjustment, not an expense
  {
    label: 'depreciation and amortisation',
    conditions: (ctx) => ctx.statementType === 'cash_flow',
    result: { canonicalField: 'depreciation_amortization', confidence: 0.85, flagForReview: false, reason: 'Depreciation in cash flow is an add-back adjustment' },
  },
  {
    label: 'depreciation and amortization',
    conditions: (ctx) => ctx.statementType === 'cash_flow',
    result: { canonicalField: 'depreciation_amortization', confidence: 0.85, flagForReview: false },
  },

  // "tax" / "income tax" in cash flow → tax paid, not tax expense
  {
    label: 'income tax expense',
    conditions: (ctx) => ctx.statementType === 'cash_flow',
    result: { canonicalField: 'income_tax_expense', confidence: 0.80, flagForReview: true, reason: 'Tax in cash flow is typically tax paid, not expense' },
  },

  // "total equity" in equity statement → closing_equity
  {
    label: 'total equity',
    conditions: (ctx) => ctx.statementType === 'equity_statement',
    result: { canonicalField: 'closing_equity', confidence: 0.88, flagForReview: false },
  },
];

/**
 * Attempt to disambiguate a label based on its context.
 *
 * Returns a result if a disambiguation rule matches, or null if no rule applies
 * (i.e., the original dictionary match should be used as-is).
 */
export function disambiguate(
  normalizedLabel: string,
  currentCanonicalField: string,
  context: DisambiguationContext,
): DisambiguationResult | null {
  // Find the first matching rule for this label
  for (const rule of DISAMBIGUATION_RULES) {
    if (rule.label === normalizedLabel && rule.conditions(context)) {
      return rule.result;
    }
  }
  return null;
}
