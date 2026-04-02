import { describe, it, expect } from 'vitest';
import { detectScope } from '../../lib/mapping/scope-detector';

describe('T3.27-T3.29 — Scope Detector (M7)', () => {
  it('T3.27 — "Consolidated Statement of Profit and Loss" → consolidated', () => {
    expect(detectScope('Consolidated Statement of Profit and Loss')).toBe('consolidated');
  });

  it('T3.28 — "Standalone Balance Sheet" → standalone', () => {
    expect(detectScope('Standalone Balance Sheet')).toBe('standalone');
  });

  it('T3.29 — "Statement of Financial Position" → unknown', () => {
    expect(detectScope('Statement of Financial Position')).toBe('unknown');
  });

  it('"Group Balance Sheet" → consolidated', () => {
    expect(detectScope('Group Balance Sheet as at 31 December 2024')).toBe('consolidated');
  });

  it('"Company Balance Sheet" → standalone', () => {
    expect(detectScope('Company Balance Sheet as at 31 March 2023')).toBe('standalone');
  });

  it('"Companies Act 2006" does NOT trigger standalone', () => {
    // "Company" in "Companies Act" should not match
    expect(detectScope('Prepared in accordance with the Companies Act 2006')).toBe('unknown');
  });
});
