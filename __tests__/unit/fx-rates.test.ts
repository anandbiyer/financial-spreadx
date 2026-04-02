import { describe, it, expect } from 'vitest';
import { getFxRate, convertToUsd, FX_RATES } from '@/lib/export/fx-rates';

describe('getFxRate', () => {
  it('returns 1.0 for USD', () => {
    expect(getFxRate('USD')).toBe(1.0);
  });

  it('returns correct rate for GBP', () => {
    expect(getFxRate('GBP')).toBe(FX_RATES.GBP);
    expect(getFxRate('GBP')).toBeGreaterThan(1);
  });

  it('returns correct rate for INR (< 1)', () => {
    expect(getFxRate('INR')).toBe(FX_RATES.INR);
    expect(getFxRate('INR')).toBeLessThan(1);
  });

  it('is case-insensitive', () => {
    expect(getFxRate('gbp')).toBe(getFxRate('GBP'));
    expect(getFxRate('inr')).toBe(getFxRate('INR'));
  });

  it('falls back to 1.0 for unknown currencies', () => {
    expect(getFxRate('XYZ')).toBe(1.0);
    expect(getFxRate('')).toBe(1.0);
  });
});

describe('convertToUsd', () => {
  it('returns null for null input', () => {
    expect(convertToUsd(null, 'GBP')).toBeNull();
  });

  it('converts GBP to USD correctly', () => {
    const result = convertToUsd(1000, 'GBP');
    expect(result).toBeCloseTo(1000 * FX_RATES.GBP, 5);
  });

  it('returns same value for USD', () => {
    expect(convertToUsd(5000, 'USD')).toBe(5000);
  });

  it('converts INR correctly (large value shrinks)', () => {
    const result = convertToUsd(1_000_000, 'INR');
    expect(result).toBeCloseTo(1_000_000 * FX_RATES.INR, 2);
    expect(result!).toBeLessThan(1_000_000);
  });

  it('falls back to identity for unknown currency', () => {
    expect(convertToUsd(100, 'XYZ')).toBe(100);
  });
});
