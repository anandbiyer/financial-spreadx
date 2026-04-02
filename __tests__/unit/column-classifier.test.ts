import { describe, it, expect } from 'vitest';
import { classifyColumnHeaders } from '../../lib/pdf/column-classifier';

describe('T2.8 — Column classifier', () => {
  it('classifies actual, restated, budget, forecast headers', () => {
    const headers = [
      '2024',
      '2023',
      '2022 (Restated)',
      'Budget 2025',
      'Forecast 2026',
    ];

    const result = classifyColumnHeaders(headers);

    expect(result).toEqual([
      { label: '2024', year: 2024, type: 'actual' },
      { label: '2023', year: 2023, type: 'actual' },
      { label: '2022 (Restated)', year: 2022, type: 'restated' },
      { label: 'Budget 2025', year: 2025, type: 'budget' },
      { label: 'Forecast 2026', year: 2026, type: 'forecast' },
    ]);
  });

  it('handles "Year ended Mar 31, 2022" format', () => {
    const result = classifyColumnHeaders(['Year ended Mar 31, 2022']);
    expect(result[0].year).toBe(2022);
    expect(result[0].type).toBe('actual');
  });

  it('handles "As Restated 2021" format', () => {
    const result = classifyColumnHeaders(['As Restated 2021']);
    expect(result[0].year).toBe(2021);
    expect(result[0].type).toBe('restated');
  });

  it('handles "Re-stated" variant', () => {
    const result = classifyColumnHeaders(['2020 Re-stated']);
    expect(result[0].year).toBe(2020);
    expect(result[0].type).toBe('restated');
  });

  it('handles "Projected 2025" as forecast', () => {
    const result = classifyColumnHeaders(['Projected 2025']);
    expect(result[0].year).toBe(2025);
    expect(result[0].type).toBe('forecast');
  });

  it('returns year=0 for header without a year', () => {
    const result = classifyColumnHeaders(['Current Period']);
    expect(result[0].year).toBe(0);
    expect(result[0].type).toBe('actual');
  });

  it('handles empty array', () => {
    expect(classifyColumnHeaders([])).toEqual([]);
  });
});
