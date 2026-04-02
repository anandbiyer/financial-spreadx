export type ColumnType = 'actual' | 'budget' | 'forecast' | 'restated' | 'unknown';

export interface ColumnMetadata {
  label: string;   // raw column header, e.g. "2023" or "Year ended Mar 31, 2022"
  year: number;    // parsed year integer (0 if not found)
  type: ColumnType;
}

const COLUMN_TYPE_PATTERNS: Record<Exclude<ColumnType, 'actual' | 'unknown'>, RegExp[]> = {
  restated: [/(restated|re-stated|revised|as\s+restated)/i],
  budget:   [/(budget|budgeted)/i],
  forecast: [/(forecast|projected|estimate)/i],
};

/**
 * Classify raw column header strings into typed metadata.
 *
 * Rules:
 *   - If header matches restated/budget/forecast pattern → that type
 *   - Otherwise → 'actual' (the default)
 *   - Year is extracted from the first 4-digit number matching 19xx or 20xx
 */
export function classifyColumnHeaders(
  rawHeaders: string[],
): ColumnMetadata[] {
  return rawHeaders.map((header) => {
    const yearMatch = header.match(/20\d{2}|19\d{2}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;

    let type: ColumnType = 'actual';
    for (const [t, patterns] of Object.entries(COLUMN_TYPE_PATTERNS)) {
      if (patterns.some((p) => p.test(header))) {
        type = t as ColumnType;
        break;
      }
    }

    return { label: header, year, type };
  });
}
