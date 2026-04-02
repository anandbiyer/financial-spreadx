import { describe, it, expect } from 'vitest';
import { lookupCanonicalFieldSync } from '../../lib/mapping/dictionary';

// Sample rules matching the seeded data
const SAMPLE_RULES = [
  { templateType: 'T5' as string | null, normalizedLabel: 'turnover', canonicalField: 'total_revenue', confidence: 0.98 },
  { templateType: 'T8' as string | null, normalizedLabel: 'brokerage handling fee income', canonicalField: 'commission_income', confidence: 0.97 },
  { templateType: 'T3' as string | null, normalizedLabel: 'reserve u/s 45-ic of reserve bank of india act 1934', canonicalField: 'statutory_reserve_rbi', confidence: 1.0 },
  { templateType: null, normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.99 },
  { templateType: null, normalizedLabel: 'total liabilities', canonicalField: 'total_liabilities', confidence: 0.99 },
  { templateType: 'T5' as string | null, normalizedLabel: 'administration expenses', canonicalField: 'admin_expenses', confidence: 0.97 },
];

describe('T3.6-T3.9 — Dictionary (M2)', () => {
  it('T3.6 — "turnover" with T5 → total_revenue, confidence >= 0.95', () => {
    const result = lookupCanonicalFieldSync('turnover', 'T5', SAMPLE_RULES);
    expect(result).not.toBeNull();
    expect(result!.canonicalField).toBe('total_revenue');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('T3.7 — "brokerage handling fee income" with T8 → commission_income', () => {
    const result = lookupCanonicalFieldSync('brokerage handling fee income', 'T8', SAMPLE_RULES);
    expect(result).not.toBeNull();
    expect(result!.canonicalField).toBe('commission_income');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('T3.8 — "reserve u/s 45-ic..." with T3 → statutory_reserve_rbi, confidence 1.0', () => {
    const result = lookupCanonicalFieldSync('reserve u/s 45-ic of reserve bank of india act 1934', 'T3', SAMPLE_RULES);
    expect(result).not.toBeNull();
    expect(result!.canonicalField).toBe('statutory_reserve_rbi');
    expect(result!.confidence).toBe(1.0);
  });

  it('T3.9 — unknown label returns null', () => {
    const result = lookupCanonicalFieldSync('xyz miscellaneous widget', 'T5', SAMPLE_RULES);
    expect(result).toBeNull();
  });

  it('falls back to cross-template rules', () => {
    const result = lookupCanonicalFieldSync('total assets', 'T5', SAMPLE_RULES);
    expect(result).not.toBeNull();
    expect(result!.canonicalField).toBe('total_assets');
  });

  it('template-specific rules take priority over cross-template', () => {
    const rules = [
      { templateType: 'T5' as string | null, normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.99 },
      { templateType: null, normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.85 },
    ];
    const result = lookupCanonicalFieldSync('total assets', 'T5', rules);
    expect(result!.confidence).toBe(0.99); // template-specific, not cross-template
  });
});
