import { describe, it, expect } from 'vitest';
import { T1_US_GAAP } from '../../lib/mapping/template-rules/t1-us-gaap';
import { T2_US_ALT_INVESTMENT } from '../../lib/mapping/template-rules/t2-us-alt-investment';
import { T3_IND_AS_NBFC } from '../../lib/mapping/template-rules/t3-ind-as-nbfc';
import { T4_OLD_INDIAN_GAAP } from '../../lib/mapping/template-rules/t4-old-indian-gaap';
import { T5_UK_COMPANIES_ACT } from '../../lib/mapping/template-rules/t5-uk-companies-act';
import { T6_UK_LLP } from '../../lib/mapping/template-rules/t6-uk-llp';
import { T7_UK_MORTGAGE } from '../../lib/mapping/template-rules/t7-uk-mortgage';
import { T8_IFRS_ASIA } from '../../lib/mapping/template-rules/t8-ifrs-asia';

const ALL_RULESETS = [T1_US_GAAP, T2_US_ALT_INVESTMENT, T3_IND_AS_NBFC, T4_OLD_INDIAN_GAAP, T5_UK_COMPANIES_ACT, T6_UK_LLP, T7_UK_MORTGAGE, T8_IFRS_ASIA];

describe('T3.34 — T5 rules verify key mappings', () => {
  const find = (label: string) => T5_UK_COMPANIES_ACT.rules.find(r => r.normalizedLabel === label);

  it('turnover → total_revenue', () => {
    const rule = find('turnover');
    expect(rule).toBeDefined();
    expect(rule!.canonicalField).toBe('total_revenue');
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.90);
  });
  it('administration expenses → admin_expenses', () => {
    const rule = find('administration expenses');
    expect(rule).toBeDefined();
    expect(rule!.canonicalField).toBe('admin_expenses');
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.90);
  });
  it('operating loss → operating_income', () => {
    const rule = find('operating loss');
    expect(rule).toBeDefined();
    expect(rule!.canonicalField).toBe('operating_income');
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.90);
  });
});

describe('T3.35 — T8 rules verify key mappings', () => {
  const find = (label: string) => T8_IFRS_ASIA.rules.find(r => r.normalizedLabel === label);

  it('brokerage handling fees → commission_income', () => {
    const rule = find('brokerage handling fees');
    expect(rule).toBeDefined();
    expect(rule!.canonicalField).toBe('commission_income');
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.90);
  });
  it('securities lending income → securities_lending_income', () => {
    const rule = find('securities lending income');
    expect(rule).toBeDefined();
    expect(rule!.canonicalField).toBe('securities_lending_income');
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.90);
  });
  it('clearing settlement funds → clearing_funds', () => {
    const rule = find('clearing settlement funds');
    expect(rule).toBeDefined();
    expect(rule!.canonicalField).toBe('clearing_funds');
    expect(rule!.confidence).toBeGreaterThanOrEqual(0.90);
  });
});

describe('T3.36 — all 8 rule files load with non-empty arrays', () => {
  for (const rs of ALL_RULESETS) {
    it(`${rs.templateType} (${rs.name}) has rules`, () => {
      expect(rs.rules.length).toBeGreaterThan(0);
      expect(rs.templateType).toMatch(/^T[1-8]$/);
      expect(rs.signals.length).toBeGreaterThan(0);
    });
  }
});
