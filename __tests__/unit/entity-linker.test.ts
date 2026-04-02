import { describe, it, expect } from 'vitest';
import { parseNoteNumber } from '../../lib/mapping/entity-linker';

describe('T3.30-T3.33 — Entity Linker (M9)', () => {
  it('T3.30 — parseNoteNumber("Note 12") → 12', () => {
    expect(parseNoteNumber('Note 12')).toBe(12);
  });

  it('T3.31 — parseNoteNumber("(Note 3.1)") → 3', () => {
    expect(parseNoteNumber('(Note 3.1)')).toBe(3);
  });

  it('T3.32 — parseNoteNumber(null) → null', () => {
    expect(parseNoteNumber(null)).toBeNull();
  });

  it('T3.33 — parseNoteNumber("See accompanying notes") → null', () => {
    expect(parseNoteNumber('See accompanying notes')).toBeNull();
  });

  it('parseNoteNumber("Refer Note 5") → 5', () => {
    expect(parseNoteNumber('Refer Note 5')).toBe(5);
  });

  it('parseNoteNumber("Note 21.3") → 21', () => {
    expect(parseNoteNumber('Note 21.3')).toBe(21);
  });
});
