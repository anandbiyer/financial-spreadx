import type { ClassifiedPage } from './page-classifier';

export type PageSection =
  | 'income_statement'
  | 'balance_sheet'
  | 'cash_flow'
  | 'equity_statement'
  | 'notes'
  | 'other'
  | 'unclassified';

export interface FilterResult {
  selectedPages: Map<PageSection, number[]>;
  notePageMap: Map<number, number[]>; // note_number -> page_numbers
  filteredPageCount: number;
  totalPageCount: number;
  reductionRatio: number; // e.g. 0.12 = 12% of pages retained
  allScannedFallback: boolean; // true when all pages are scanned and no text-based sections found
}

/**
 * Heading patterns used to identify financial statement sections.
 * Applied to the first ~400 characters of each page's text.
 */
export const SECTION_PATTERNS: Record<PageSection, RegExp[]> = {
  income_statement: [
    /statement\s+of\s+(profit|income|operations|comprehensive\s+income|activities)/i,
    /consolidated\s+(statement\s+of\s+)?(profit|income|operations)/i,
    /profit\s+(and|&)\s+loss\s+(account|statement)/i,
    /income\s+statement/i,
    /statements?\s+of\s+operations/i,
    /statements?\s+of\s+earnings/i,
    /statements?\s+of\s+revenues?\s+and\s+expenses/i,
  ],
  balance_sheet: [
    /balance\s+sheet/i,
    /statement\s+of\s+financial\s+(position|condition)/i,
    /consolidated\s+balance\s+sheet/i,
    /statements?\s+of\s+(assets|financial\s+condition|net\s+assets)/i,
  ],
  cash_flow: [
    /cash\s+flow\s+statement/i,
    /statement\s+of\s+cash\s+flows/i,
    /consolidated\s+cash\s+flow/i,
    /statements?\s+of\s+cash\s+flows/i,
  ],
  equity_statement: [
    /statement\s+of\s+changes\s+in\s+equity/i,
    /changes\s+in\s+(shareholders|stockholders|members|partners)\W?\s*(equity|capital)/i,
    /equity\s+roll-?forward/i,
    /statements?\s+of\s+(changes\s+in\s+)?(stockholders|shareholders|members|partners)\W?\s*(equity|capital)/i,
  ],
  notes: [
    /^notes?\s+to\s+the\s+(consolidated\s+)?(financial\s+statements?|accounts)/im,
    /^note\s+\d+/im,
    /^\d+\.\s+[A-Z][A-Z\s]+$/m, // Numbered note heading in caps
  ],
  other: [],
  unclassified: [],
};

/**
 * Expand a set of detected section-start pages with a trailing window
 * of continuation pages (to capture multi-page statements).
 */
export function expandWithContinuationPages(
  sectionStartPages: number[],
  allPages: ClassifiedPage[],
  windowSize: number,
): number[] {
  if (sectionStartPages.length === 0) return [];

  const allPageNumbers = new Set(allPages.map((p) => p.pageNumber));
  const expanded = new Set<number>();

  for (const start of sectionStartPages) {
    expanded.add(start);
    for (let offset = 1; offset <= windowSize; offset++) {
      const candidate = start + offset;
      if (allPageNumbers.has(candidate)) {
        expanded.add(candidate);
      }
    }
  }

  return [...expanded].sort((a, b) => a - b);
}

/**
 * Filter financial pages from a classified PDF.
 *
 * Two-stage filtering applied to digital + hybrid pages:
 *   Stage 1 — Heading keyword scan (first 400 chars)
 *   Stage 2 — Boundary detection (5-page trailing continuation window)
 *
 * Also detects note pages and builds notePageMap.
 */
export function filterFinancialPages(
  classifiedPages: ClassifiedPage[],
): FilterResult {
  // Only consider digital and hybrid pages
  const digitalPages = classifiedPages.filter(
    (p) => p.classification !== 'scanned',
  );

  const selected = new Map<PageSection, number[]>();
  const notePageMap = new Map<number, number[]>();

  for (const page of digitalPages) {
    const heading = page.textContent.slice(0, 400);

    // Stage 1: check section heading patterns
    for (const [section, patterns] of Object.entries(SECTION_PATTERNS) as [
      PageSection,
      RegExp[],
    ][]) {
      if (section === 'other' || section === 'unclassified') continue;
      if (patterns.some((p) => p.test(heading))) {
        const arr = selected.get(section) ?? [];
        arr.push(page.pageNumber);
        selected.set(section, arr);
        break; // first match wins
      }
    }

    // Detect note pages
    const noteMatch =
      heading.match(/^note\s+(\d+)/im) ??
      heading.match(/^(\d+)\.\s+[A-Z]/m);
    if (noteMatch) {
      const num = parseInt(noteMatch[1], 10);
      if (!isNaN(num)) {
        const pages = notePageMap.get(num) ?? [];
        pages.push(page.pageNumber);
        notePageMap.set(num, pages);
      }
    }
  }

  // Stage 2: expand each section by trailing window (continuation pages)
  for (const [section, pages] of selected) {
    const expanded = expandWithContinuationPages(pages, digitalPages, 5);
    selected.set(section, expanded);
  }

  // Fallback: if no sections were found and all pages are scanned,
  // mark all scanned pages as candidates for vision-based extraction.
  const allPageNumbers = classifiedPages.map((p) => p.pageNumber);
  const allScanned = classifiedPages.every((p) => p.classification === 'scanned');
  const allScannedFallback = selected.size === 0 && allScanned && classifiedPages.length > 0;

  if (allScannedFallback) {
    // All pages are candidates — the pipeline will determine statement type via OCR
    selected.set('unclassified', allPageNumbers);
  }

  const allSelected = new Set([...selected.values()].flat());
  return {
    selectedPages: selected,
    notePageMap,
    filteredPageCount: allSelected.size,
    totalPageCount: classifiedPages.length,
    reductionRatio:
      classifiedPages.length > 0
        ? allSelected.size / classifiedPages.length
        : 0,
    allScannedFallback,
  };
}
