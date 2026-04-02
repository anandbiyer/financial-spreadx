import { describe, it, expect } from 'vitest';
import { normalizeLabel } from '../../lib/mapping/label-normalizer';

describe('T3.1-T3.5 — Label Normalizer (M1)', () => {
  it('T3.1 — strips leading Roman numerals', () => {
    expect(normalizeLabel('VII. Profit for the year')).toBe('profit for the year');
  });
  it('T3.2 — removes note references', () => {
    expect(normalizeLabel('Interest income (Note 21)')).toBe('interest income');
  });
  it('T3.3 — expands abbreviations', () => {
    expect(normalizeLabel('PBT')).toBe('profit before tax');
  });
  it('T3.4 — normalizes whitespace and strips qualifiers', () => {
    expect(normalizeLabel('  Net\n  Income   (Restated) ')).toBe('net income');
  });
  it('T3.5 — extracts English from multi-line Asian label', () => {
    expect(normalizeLabel('手续费及佣金收入\nCommission and fee income')).toBe('commission and fee income');
  });
  it('strips leading Arabic numerals', () => {
    expect(normalizeLabel('12. Revenue from operations')).toBe('revenue from operations');
  });
  it('handles "Refer Note 5" pattern', () => {
    expect(normalizeLabel('Investments (Refer Note 5)')).toBe('investments');
  });
  it('expands PAT', () => {
    expect(normalizeLabel('PAT')).toBe('profit after tax');
  });
  it('expands EPS', () => {
    expect(normalizeLabel('EPS')).toBe('earnings per share');
  });
  it('preserves already-clean labels', () => {
    expect(normalizeLabel('total assets')).toBe('total assets');
  });
});
