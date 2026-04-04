// lib/pdf/page-filter.ts (updated for Req F)
// REMOVED: SECTION_PATTERNS — replaced by STATEMENT_SIGNALS in statement-classifier.ts

import type { ClassifiedPage } from './page-classifier';
import type { StatementType } from './statement-classifier';

export type PageSection = StatementType | 'unclassified';

export interface FilterResult {
  selectedPages: Map<PageSection, number[]>;
  notePageMap: Map<number, number[]>;
  filteredPageCount: number;
  totalPageCount: number;
  reductionRatio: number;
}

/**
 * Group pages by their pre-assigned section_type (set in Stage 2b).
 * No regex is run here — filterFinancialPages is now a pure grouping operation.
 * Scanned pages are NOT processed here; they are added to selectedPages in Stage 4b.
 */
export function filterFinancialPages(
  classifiedPages: ClassifiedPage[],
): FilterResult {
  const selected = new Map<PageSection, number[]>();
  const notePageMap = new Map<number, number[]>();

  for (const page of classifiedPages) {
    if (page.classification === 'scanned') continue;
    const sType = page.section_type as StatementType | undefined;
    if (!sType || sType === 'other') continue;

    if (sType === 'notes') {
      const noteMatch =
        page.textContent.match(/^note\s+(\d+)/im) ??
        page.textContent.match(/^(\d+)\.\s+[A-Z]/m);
      if (noteMatch) {
        const num = parseInt(noteMatch[1], 10);
        if (!isNaN(num)) {
          const pages = notePageMap.get(num) ?? [];
          pages.push(page.pageNumber);
          notePageMap.set(num, pages);
        }
      }
      continue;
    }

    const arr = selected.get(sType) ?? [];
    arr.push(page.pageNumber);
    selected.set(sType, arr);
  }

  // Expand each section with boundary-aware continuation (max 8 pages, stops at next heading)
  for (const [section, pages] of selected) {
    const expanded = expandWithContinuationPages(pages, classifiedPages, 8);
    selected.set(section, expanded);
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
  };
}

/**
 * Expand a section's page list with continuation pages.
 * CHANGED from v1.0: maxWindow 5 -> 8. Stops early when a page is already
 * assigned to a DIFFERENT section type (boundary detection).
 */
export function expandWithContinuationPages(
  detectedPages: number[],
  allPages: ClassifiedPage[],
  maxWindow = 8,
): number[] {
  if (detectedPages.length === 0) return [];

  const result = new Set(detectedPages);
  const pageMap = new Map(allPages.map((p) => [p.pageNumber, p]));

  for (const startPage of detectedPages) {
    for (let offset = 1; offset <= maxWindow; offset++) {
      const nextNum = startPage + offset;
      const next = pageMap.get(nextNum);
      if (!next) break;
      if (next.classification === 'scanned') break;
      // BOUNDARY DETECTION: stop if next page has a different, assigned section type
      const nextType = next.section_type as StatementType | undefined;
      if (nextType && nextType !== 'other' && nextType !== 'notes') break;
      result.add(nextNum);
    }
  }

  return [...result].sort((a, b) => a - b);
}
