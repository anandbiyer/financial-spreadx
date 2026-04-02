/**
 * 4.2 — Row Extractor
 *
 * Extracts structured financial rows from page text using Claude.
 */

import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { CLAUDE_MODEL } from './config';

// Internal schema — uses array for raw_values so Anthropic structured output works reliably
const apiRowSchema = z.object({
  rows: z.array(z.object({
    raw_label: z.string().describe('Verbatim label from the document'),
    year_values: z.array(z.object({
      year: z.string().describe('4-digit year, e.g. "2019" or "2024"'),
      value: z.number().nullable().describe('Numeric value for this year, null if blank'),
    })).describe('One entry per year column, e.g. [{year:"2019",value:845.96},{year:"2018",value:117.34}]'),
    section_path: z.array(z.string()).describe('Hierarchy path, e.g. ["Revenue", "Interest income"]'),
    indentation_level: z.number().describe('0 = top-level, 1-4 = nested'),
    is_subtotal: z.boolean().describe('True if this row is a subtotal/total row'),
    note_ref: z.string().nullable().describe('Note reference if present, e.g. "Note 12"'),
  })),
});

// Public type — downstream code uses Record for raw_values
export type ExtractedRow = {
  raw_label: string;
  raw_values: Record<string, number | null>;
  section_path: string[];
  indentation_level: number;
  is_subtotal: boolean;
  note_ref: string | null;
};

/**
 * Extract financial rows from a page of text.
 *
 * @param pageText      - Full text content of the page(s)
 * @param statementType - income_statement | balance_sheet | cash_flow | equity_statement
 * @param templateType  - T1-T8 template classification
 */
export async function extractStatement(
  pageText: string,
  statementType: string,
  templateType: string,
): Promise<ExtractedRow[]> {
  const { object } = await generateObject({
    model: anthropic(CLAUDE_MODEL),
    schema: apiRowSchema,
    prompt: `You are a financial data extraction engine. Extract ALL financial line items from this ${statementType.replace('_', ' ')} page.

Template type: ${templateType}
Statement type: ${statementType}

Rules:
1. raw_label must be the EXACT text from the document — do not paraphrase or normalize
2. Extract ALL year columns present. For each row, add one year_values entry per column. Use exactly 4 digits for the year field (e.g. "2019", "2018"). For fiscal years like "2018-19" use the ending year "2019".
3. Negative values should use negative numbers, not parentheses
4. Values in parentheses like (1,234) should be converted to -1234
5. Set is_subtotal=true for total/subtotal rows (e.g., "Total Revenue", "Net Income")
6. Set note_ref to the note reference if present (e.g., "Note 12", "Note 3.1")
7. section_path should reflect the hierarchy (e.g., ["Revenue", "Interest Income"])
8. indentation_level: 0 for main items, 1 for sub-items, 2+ for deeper nesting

Page text:
${pageText.slice(0, 6000)}`,
  });

  return object.rows.map((row) => ({
    raw_label: row.raw_label,
    raw_values: Object.fromEntries(
      row.year_values.map(({ year, value }) => [extractFourDigitYear(year), value])
    ),
    section_path: row.section_path,
    indentation_level: row.indentation_level,
    is_subtotal: row.is_subtotal,
    note_ref: row.note_ref,
  }));
}

function extractFourDigitYear(key: string): string {
  // "2018-19" -> "2019"
  const fiscalMatch = key.match(/(\d{4})-(\d{2})$/);
  if (fiscalMatch) {
    const century = Math.floor(parseInt(fiscalMatch[1]) / 100) * 100;
    return String(century + parseInt(fiscalMatch[2]));
  }
  // Extract last 4-digit year found in the string
  const allYears = key.match(/\d{4}/g);
  if (allYears) return allYears[allYears.length - 1];
  return key;
}
