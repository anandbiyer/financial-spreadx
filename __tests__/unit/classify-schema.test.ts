import { describe, it, expect } from 'vitest';
import { classificationSchema } from '../../lib/claude/classify';

describe('T4.3 — Classification Zod schema validation', () => {
  const validData = {
    template_type: 'T3',
    confidence: 0.85,
    signals_matched: ['Revenue from operations', 'Finance costs'],
    detected_currency: 'INR',
    detected_unit_scale: 'crore',
    statement_types_found: ['income_statement', 'balance_sheet'],
    statement_scopes: ['standalone'],
  };

  it('accepts valid classification data', () => {
    const result = classificationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('(a) rejects missing template_type', () => {
    const { template_type, ...rest } = validData;
    const result = classificationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('(b) rejects confidence > 1', () => {
    const result = classificationSchema.safeParse({ ...validData, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it('(c) rejects confidence < 0', () => {
    const result = classificationSchema.safeParse({ ...validData, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('(d) rejects invalid template_type T99', () => {
    const result = classificationSchema.safeParse({ ...validData, template_type: 'T99' });
    expect(result.success).toBe(false);
  });

  it('accepts T0_unknown template type', () => {
    const result = classificationSchema.safeParse({ ...validData, template_type: 'T0_unknown' });
    expect(result.success).toBe(true);
  });

  it('accepts all 8 valid template types', () => {
    for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T0_unknown']) {
      const result = classificationSchema.safeParse({ ...validData, template_type: t });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid unit_scale', () => {
    const result = classificationSchema.safeParse({ ...validData, detected_unit_scale: 'gazillions' });
    expect(result.success).toBe(false);
  });
});
