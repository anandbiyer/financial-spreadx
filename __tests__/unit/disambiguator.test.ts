import { describe, it, expect } from 'vitest';
import { disambiguate } from '../../lib/mapping/disambiguator';

describe('T3.10-T3.13 — Disambiguator (M3)', () => {
  it('T3.10 — "other income" in income_statement → other_income', () => {
    const result = disambiguate('other income', 'other_income', { statementType: 'income_statement' });
    expect(result).not.toBeNull();
    expect(result!.canonicalField).toBe('other_income');
    expect(result!.flagForReview).toBe(false);
  });

  it('T3.11 — "other income" in balance_sheet → flags for review', () => {
    const result = disambiguate('other income', 'other_income', {
      statementType: 'balance_sheet',
      sectionPath: ['assets'],
    });
    expect(result).not.toBeNull();
    expect(result!.flagForReview).toBe(true);
    expect(result!.confidence).toBeLessThan(0.80);
  });

  it('T3.12 — "interest income" in cash_flow investing → interest_received_investing', () => {
    const result = disambiguate('interest income', 'interest_income', {
      statementType: 'cash_flow',
      sectionPath: ['investing activities'],
    });
    expect(result).not.toBeNull();
    expect(result!.canonicalField).toBe('interest_received_investing');
  });

  it('T3.13 — "interest income" in income_statement → interest_income', () => {
    const result = disambiguate('interest income', 'interest_income', {
      statementType: 'income_statement',
    });
    expect(result).not.toBeNull();
    expect(result!.canonicalField).toBe('interest_income');
  });

  it('returns null for label without disambiguation rules', () => {
    const result = disambiguate('total assets', 'total_assets', { statementType: 'balance_sheet' });
    expect(result).toBeNull();
  });
});
