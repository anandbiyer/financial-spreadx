import { describe, it, expect } from 'vitest';
import { runAllValidations } from '../../lib/mapping/formula-validator';

describe('T3.16-T3.23 — Formula Validator (M5)', () => {
  it('T3.16 — V01 exact match passes', () => {
    const map = { total_assets: 1000, total_liabilities: 600, total_equity: 400 };
    const checks = runAllValidations(map, 'T5');
    const v01 = checks.find(c => c.checkId === 'V01')!;
    expect(v01.status).toBe('passed');
  });

  it('T3.17 — V01 within 0.1% tolerance passes', () => {
    const map = { total_assets: 1000, total_liabilities: 600, total_equity: 401 }; // 1001 vs 1000 = 0.1%
    const checks = runAllValidations(map, 'T5');
    const v01 = checks.find(c => c.checkId === 'V01')!;
    expect(v01.status).toBe('passed');
  });

  it('T3.18 — V01 exceeding tolerance fails', () => {
    const map = { total_assets: 1000, total_liabilities: 600, total_equity: 410 }; // 1010 vs 1000 = 1%
    const checks = runAllValidations(map, 'T5');
    const v01 = checks.find(c => c.checkId === 'V01')!;
    expect(v01.status).toBe('failed');
  });

  it('T3.19 — V03 net_income = PBT - tax passes', () => {
    const map = { profit_before_tax: 100, income_tax_expense: 25, net_income: 75 };
    const checks = runAllValidations(map, 'T5');
    const v03 = checks.find(c => c.checkId === 'V03')!;
    expect(v03.status).toBe('passed');
  });

  it('T3.20 — V05 cash reconciliation passes', () => {
    const map = {
      cash_start: 50, cash_from_operations: 30,
      cash_from_investing: -10, cash_from_financing: -5, cash_end: 65,
    };
    const checks = runAllValidations(map, 'T5');
    const v05 = checks.find(c => c.checkId === 'V05')!;
    expect(v05.status).toBe('passed');
  });

  it('T3.21 — V10 skipped for T5 (no EPS)', () => {
    const checks = runAllValidations({}, 'T5');
    const v10 = checks.find(c => c.checkId === 'V10')!;
    expect(v10.status).toBe('skipped');
  });

  it('T3.22 — V11 skipped for T5 (not T6)', () => {
    const checks = runAllValidations({}, 'T5');
    const v11 = checks.find(c => c.checkId === 'V11')!;
    expect(v11.status).toBe('skipped');
  });

  it('T3.23 — all 12 validations run with T5 canonical map', () => {
    const map = {
      total_assets: 50000, total_liabilities: 30000, total_equity: 20000,
      total_income: 5000, total_expenses: 3500,
      profit_before_tax: 1500, income_tax_expense: 300, net_income: 1200,
    };
    const checks = runAllValidations(map, 'T5');
    expect(checks.length).toBe(12);

    const v01 = checks.find(c => c.checkId === 'V01')!;
    expect(v01.status).not.toBe('skipped');

    const v02 = checks.find(c => c.checkId === 'V02')!;
    expect(v02.status).not.toBe('skipped');

    const v03 = checks.find(c => c.checkId === 'V03')!;
    expect(v03.status).not.toBe('skipped');

    const v10 = checks.find(c => c.checkId === 'V10')!;
    expect(v10.status).toBe('skipped');

    const v11 = checks.find(c => c.checkId === 'V11')!;
    expect(v11.status).toBe('skipped');
  });

  it('V12 always skipped (requires prior document)', () => {
    const checks = runAllValidations({}, 'T1');
    const v12 = checks.find(c => c.checkId === 'V12')!;
    expect(v12.status).toBe('skipped');
  });
});
