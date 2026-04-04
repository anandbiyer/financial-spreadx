// lib/pdf/statement-classifier.ts
// Financial SpreadX — Requirement F v1.1
// Statement Type Classifier: corpus-grounded, two-path (digital + scanned)
// Corpus: 19 annual reports · 8 reporting standards · 60+ signal patterns

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CLAUDE_MODEL } from '../claude/config';

export type StatementType =
  | 'balance_sheet'
  | 'income_statement'
  | 'cash_flow'
  | 'equity_statement'
  | 'notes'
  | 'other';

export interface StatementSignal {
  pattern:        RegExp;
  type:           StatementType;
  weight:         number;
  templateHints?: string[];
}

// ── STATEMENT_SIGNALS ───────────────────────────────────────────────────────
// Ordered longest/most-specific first within each type group.
// Replaces SECTION_PATTERNS from page-filter.ts entirely.
// CRITICAL: all patterns use statements? (plural-tolerant) not statement (singular).
export const STATEMENT_SIGNALS: StatementSignal[] = [

  // BALANCE SHEET
  { pattern: /statements?\s+of\s+financial\s+condition/i,                                   type: 'balance_sheet',    weight: 1.0, templateHints: ['T1','T2'] },
  { pattern: /consolidated\s+and\s+company\s+statements?\s+of\s+financial\s+position/i,     type: 'balance_sheet',    weight: 1.0 },
  { pattern: /statements?\s+of\s+financial\s+position/i,                                    type: 'balance_sheet',    weight: 1.0 },
  { pattern: /balance\s+sheet\s+as\s+(at|on)\s+/i,                                          type: 'balance_sheet',    weight: 1.0, templateHints: ['T3','T4','T5'] },
  { pattern: /consolidated\s+balance\s+sheets?/i,                                           type: 'balance_sheet',    weight: 1.0, templateHints: ['T1','T2'] },
  { pattern: /\bbalance\s+sheets?\b/i,                                                      type: 'balance_sheet',    weight: 0.9 },

  // INCOME STATEMENT
  { pattern: /statements?\s+of\s+income\s+and\s+comprehensive\s+income/i,                   type: 'income_statement', weight: 1.0, templateHints: ['T1'] },
  { pattern: /statement\s+of\s+profit\s+or\s+loss\s+and\s+other\s+comprehensive\s+income/i, type: 'income_statement', weight: 1.0, templateHints: ['T8'] },
  { pattern: /group\s+statement\s+of\s+profit\s+or\s+loss/i,                                type: 'income_statement', weight: 1.0, templateHints: ['T7'] },
  { pattern: /statement\s+of\s+profit\s+or\s+loss\b/i,                                      type: 'income_statement', weight: 1.0, templateHints: ['T8'] },
  { pattern: /profit\s+(and|&)\s+loss\s+account\s+and\s+other\s+comprehensive\s+income/i,   type: 'income_statement', weight: 1.0, templateHints: ['T6'] },
  { pattern: /profit\s+(and|&)\s+loss\s+account/i,                                          type: 'income_statement', weight: 1.0, templateHints: ['T4','T5'] },
  { pattern: /statement\s+of\s+profit\s+and\s+loss/i,                                       type: 'income_statement', weight: 1.0, templateHints: ['T3','T4'] },
  { pattern: /comprehensive\s+income\s+statement/i,                                         type: 'income_statement', weight: 1.0, templateHints: ['T8'] },
  { pattern: /statements?\s+of\s+operations/i,                                              type: 'income_statement', weight: 1.0, templateHints: ['T1','T2'] },
  { pattern: /consolidated\s+income\s+statement/i,                                          type: 'income_statement', weight: 1.0, templateHints: ['T5'] },
  { pattern: /statements?\s+of\s+comprehensive\s+income/i,                                  type: 'income_statement', weight: 1.0 },
  // CRITICAL FIX: s? catches "STATEMENTS OF INCOME" (Cash America, all T1 US GAAP)
  { pattern: /statements?\s+of\s+(profit|income|operations|comprehensive\s+income)/i,       type: 'income_statement', weight: 1.0 },
  { pattern: /statement\s+of\s+(comprehensive\s+)?income/i,                                 type: 'income_statement', weight: 0.9 },
  { pattern: /\bincome\s+statements?\b/i,                                                   type: 'income_statement', weight: 0.9 },

  // CASH FLOW STATEMENT
  { pattern: /(group|company)\s+statement\s+of\s+cash\s+flows/i,                            type: 'cash_flow',        weight: 1.0, templateHints: ['T7'] },
  // CRITICAL FIX: s? catches "STATEMENTS OF CASH FLOWS" (Cash America, Freddie, TPG etc.)
  { pattern: /statements?\s+of\s+cash\s+flows?\b/i,                                        type: 'cash_flow',        weight: 1.0 },
  { pattern: /consolidated\s+cash\s+flow\s+statement/i,                                     type: 'cash_flow',        weight: 1.0, templateHints: ['T8'] },
  { pattern: /cash\s+flow\s+statement/i,                                                    type: 'cash_flow',        weight: 1.0, templateHints: ['T4'] },
  // Sub-heading / continuation: "Cash Flows From Operating Activities" etc.
  { pattern: /cash\s+flows?\s+(from|used\s+in)\s+(operating|investing|financing)\s+activities/i, type: 'cash_flow', weight: 0.9 },

  // EQUITY STATEMENT
  { pattern: /reconciliation\s+of\s+members['\u2019]?\s+interests/i,                        type: 'equity_statement', weight: 1.0, templateHints: ['T6'] },
  { pattern: /statements?\s+of\s+changes\s+in\s+members['\u2019]?\s+(equity|capital)/i,     type: 'equity_statement', weight: 1.0, templateHints: ['T6'] },
  { pattern: /statements?\s+of\s+changes\s+in\s+partners['\u2019]?\s+capital/i,             type: 'equity_statement', weight: 1.0, templateHints: ['T2'] },
  { pattern: /statements?\s+of\s+changes\s+in\s+members['\u2019]?\s+capital/i,              type: 'equity_statement', weight: 1.0, templateHints: ['T2'] },
  { pattern: /stockholders['\u2019]?\s+equity\s+and\s+comprehensive\s+loss/i,                type: 'equity_statement', weight: 1.0, templateHints: ['T1'] },
  // CRITICAL FIX: (changes\s+in\s+)? is optional — catches "STATEMENTS OF STOCKHOLDERS EQUITY"
  // (Cash America) where "changes in" is absent from the heading.
  { pattern: /statements?\s+of\s+(changes\s+in\s+)?stockholders['\u2019]?\s+equity/i,       type: 'equity_statement', weight: 1.0, templateHints: ['T1'] },
  { pattern: /consolidated\s+statements?\s+of\s+equity\b/i,                                 type: 'equity_statement', weight: 1.0, templateHints: ['T1'] },
  { pattern: /consolidated\s+and\s+company\s+statements?\s+of\s+changes\s+in\s+equity/i,    type: 'equity_statement', weight: 1.0 },
  { pattern: /changes\s+in\s+(shareholders|stockholders)['\u2019]?\s+equity/i,                type: 'equity_statement', weight: 1.0 },
  { pattern: /statements?\s+of\s+changes\s+in\s+equity/i,                                   type: 'equity_statement', weight: 1.0 },

  // NOTES
  { pattern: /^notes?\s+to\s+the\s+(consolidated\s+)?(financial\s+statements?|accounts)/im, type: 'notes',            weight: 1.0 },
  { pattern: /^note\s+\d+\b/im,                                                             type: 'notes',            weight: 0.9 },
  { pattern: /^\d+\.\s+[A-Z][A-Z\s]{4,}/m,                                                 type: 'notes',            weight: 0.7 },
];

// ── Digital path ─────────────────────────────────────────────────────────────
export interface ClassifiedStatement {
  statementType:  StatementType;
  confidence:     number;
  matchedPattern: string;
}

/**
 * Classify statement type(s) for a digital/hybrid page.
 * Scans first 600 chars (not 400) to catch dual-statement pages.
 * Returns ALL matching types — dual-statement pages return length 2.
 * Ordered by first match in STATEMENT_SIGNALS (specificity order).
 */
export function classifyStatementType(textContent: string): ClassifiedStatement[] {
  const window = textContent.slice(0, 600);
  const results: ClassifiedStatement[] = [];
  const seenTypes = new Set<StatementType>();

  for (const signal of STATEMENT_SIGNALS) {
    const match = signal.pattern.exec(window);
    if (match && !seenTypes.has(signal.type)) {
      results.push({
        statementType:  signal.type,
        confidence:     signal.weight,
        matchedPattern: match[0],
      });
      seenTypes.add(signal.type);
    }
  }

  return results.length > 0
    ? results
    : [{ statementType: 'other', confidence: 1.0, matchedPattern: '' }];
}

// ── Scanned path ─────────────────────────────────────────────────────────────
const scannedSchema = z.object({
  pages: z.array(z.object({
    statement_types:   z.array(z.enum(['balance_sheet','income_statement','cash_flow',
                                       'equity_statement','notes','other'])),
    confidence:        z.number().min(0).max(1),
    visible_years:     z.array(z.number().int()),
    heading_verbatim:  z.string(),
    scope:             z.enum(['consolidated','standalone','group','company','unknown']),
    is_continuation:   z.boolean(),
  }))
});

export type ScannedPageClassification = z.infer<typeof scannedSchema>['pages'][0];

// Lazy-init to avoid "browser-like environment" error in unit test (jsdom) imports
let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Vision-based classification for scanned pages (no extractable text).
 * ONE Claude call per page. max_tokens: 512 — classification only, not extraction.
 * PNG buffers are passed in from rasterizePages() and MUST be reused in Stage 5
 * extraction — do not rasterise twice.
 */
export async function classifyScannedPages(
  imageBuffers: Map<number, Buffer>
): Promise<Map<number, ScannedPageClassification>> {
  const results = new Map<number, ScannedPageClassification>();

  for (const [pageNum, buf] of imageBuffers) {
    const base64 = buf.toString('base64');

    const response = await getClient().messages.create({
      model:      CLAUDE_MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          {
            type: 'text',
            text: `Identify the financial statement type(s) on this page.
Return ONLY valid JSON, no markdown fences:
{
  "pages": [{
    "statement_types": ["balance_sheet"|"income_statement"|"cash_flow"|"equity_statement"|"notes"|"other"],
    "confidence": 0.0-1.0,
    "visible_years": [2024, 2023],
    "heading_verbatim": "exact heading printed on page — empty string if none",
    "scope": "consolidated"|"standalone"|"group"|"company"|"unknown",
    "is_continuation": false
  }]
}
Rules:
- statement_types may have 1-2 values (some pages show two statements side by side).
- heading_verbatim is the literal heading; empty string for continuation pages.
- is_continuation: true when no statement heading is visible (page continues previous statement).
- confidence: 0.95+ clear heading visible; 0.70-0.94 inferred from table structure only.
- If confidence < 0.70, set statement_types: ["other"] and is_continuation: false.`
          }
        ]
      }]
    });

    const raw = response.content.find(b => b.type === 'text')?.text ?? '{"pages":[]}';
    const clean = raw.replace(/```json|```/g, '').trim();

    const fallback: ScannedPageClassification = {
      statement_types: ['other'], confidence: 0,
      visible_years: [], heading_verbatim: '', scope: 'unknown', is_continuation: false,
    };

    try {
      const parsed = scannedSchema.parse(JSON.parse(clean));
      results.set(pageNum, parsed.pages[0] ?? fallback);
    } catch {
      results.set(pageNum, fallback);
    }
  }

  return results;
}
