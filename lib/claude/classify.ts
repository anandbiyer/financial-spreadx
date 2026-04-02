/**
 * 4.1 — Template Classifier
 *
 * Classifies a financial document into one of 8 template families (T1-T8)
 * using Claude via Vercel AI SDK generateObject().
 */

import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { CLAUDE_MODEL } from './config';

// Schema for generateObject (Anthropic API — no min/max on numbers, no max on arrays/strings)
const apiSchema = z.object({
  template_type: z.enum(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T0_unknown']),
  confidence: z.number().describe('Confidence score between 0 and 1'),
  signals_matched: z.array(z.string()),
  detected_currency: z.string(),
  detected_unit_scale: z.enum(['units', 'thousands', 'lakhs', 'crore', 'millions', 'billions', 'unknown']),
  statement_types_found: z.array(z.enum(['income_statement', 'balance_sheet', 'cash_flow', 'equity_statement'])),
  statement_scopes: z.array(z.enum(['standalone', 'consolidated', 'unknown'])),
});

// Stricter validation schema (used for unit tests and post-API validation)
export const classificationSchema = z.object({
  template_type: z.enum(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T0_unknown']),
  confidence: z.number().min(0).max(1),
  signals_matched: z.array(z.string()).max(10),
  detected_currency: z.string().max(10),
  detected_unit_scale: z.enum(['units', 'thousands', 'lakhs', 'crore', 'millions', 'billions', 'unknown']),
  statement_types_found: z.array(z.enum(['income_statement', 'balance_sheet', 'cash_flow', 'equity_statement'])),
  statement_scopes: z.array(z.enum(['standalone', 'consolidated', 'unknown'])),
});

export type ClassificationResult = z.infer<typeof classificationSchema>;

/**
 * Classify a financial document into a template family.
 *
 * @param sampleLabels - ~20 representative label strings from financial pages
 * @param rawText      - concatenated text from the first few financial pages
 */
export async function classifyDocument(
  sampleLabels: string[],
  rawText: string,
): Promise<ClassificationResult> {
  const { object } = await generateObject({
    model: anthropic(CLAUDE_MODEL),
    schema: apiSchema,
    prompt: `You are a financial document classifier. Analyze the following extracted text and labels from a financial document (annual report or financial statement).

Classify the document into one of these template families:
- T1: US GAAP — Standard Corporate (EPS, weighted avg shares, income from operations)
- T2: US GAAP — Alternative Investment / LP / LLC (partners' capital, carried interest, fund consolidation)
- T3: Ind AS / NBFC India (revenue from operations, reserve u/s 45-IC, INR crore/lakh)
- T4: Old Indian GAAP Pre-Ind AS (sources/application of funds, schedule references, profit & loss a/c)
- T5: UK Companies Act Asset Manager (turnover, administration expenses, Companies Act 2006)
- T6: UK LLP / Partnership (members' remuneration, profit for discretionary division, members' capital)
- T7: UK GAAP Specialist Lender / Mortgage (effective interest method, securitisation, non-recourse notes)
- T8: IFRS Asia Securities / Broker-Dealer (brokerage handling fees, clearing settlement funds, RMB/NTD/HKD)

Use T0_unknown if confidence is below 0.6.

Sample labels extracted from financial pages:
${sampleLabels.slice(0, 30).map((l, i) => `${i + 1}. ${l}`).join('\n')}

Raw text from financial pages (first 3000 chars):
${rawText.slice(0, 3000)}

Return your classification with:
- template_type: the best matching template
- confidence: 0-1 score
- signals_matched: the specific labels/patterns that matched
- detected_currency: ISO currency code (e.g., USD, GBP, INR, HKD, RMB, NTD)
- detected_unit_scale: the unit scale used in the document
- statement_types_found: which financial statements are present
- statement_scopes: whether statements are standalone, consolidated, or unknown`,
  });

  // Fallback to T0_unknown if confidence is below threshold
  if (object.confidence < 0.6) {
    return { ...object, template_type: 'T0_unknown' };
  }

  return object;
}
