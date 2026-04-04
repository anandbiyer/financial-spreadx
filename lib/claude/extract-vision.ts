/**
 * 4.4 — Vision Extractor (OCR)
 *
 * Extracts financial rows from rasterized (scanned) PDF pages
 * using Claude Vision via the Anthropic SDK directly.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { CLAUDE_MODEL } from './config';

const client = new Anthropic();

const extractedRowSchema = z.object({
  rows: z.array(z.object({
    raw_label: z.string(),
    raw_values: z.object({}).catchall(z.number().nullable()),
    section_path: z.array(z.string()),
    indentation_level: z.number(),
    is_subtotal: z.boolean(),
    note_ref: z.string().nullable(),
  })),
});

export type VisionExtractedRow = z.infer<typeof extractedRowSchema>['rows'][number];

/**
 * Extract financial rows from a rasterized PDF page image.
 *
 * @param imageBuffer   - PNG image buffer of the rasterized page
 * @param statementType - income_statement | balance_sheet | cash_flow | equity_statement
 * @param templateType  - T1-T8 template classification
 * @param pageNumber    - Page number for context
 */
export async function extractStatementFromImage(
  imageBuffer: Buffer,
  statementType: string,
  templateType: string,
  pageNumber: number,
): Promise<VisionExtractedRow[]> {
  const base64 = imageBuffer.toString('base64');

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: base64 },
        },
        {
          type: 'text',
          text: `This is page ${pageNumber} of a financial statement (${statementType.replace('_', ' ')}, template: ${templateType}).
Extract all financial line items as structured rows.
Return JSON matching this schema exactly:
{
  "rows": [
    {
      "raw_label": "string (verbatim label from the image)",
      "raw_values": { "2024": number | null, "2023": number | null },
      "section_path": ["string"],
      "indentation_level": 0-4,
      "is_subtotal": boolean,
      "note_ref": "string | null"
    }
  ]
}
Rules:
- raw_label must be the exact text from the image
- Negative values use negative numbers, not parentheses
- Values in parentheses like (1,234) should be -1234
- Return only JSON, no markdown or commentary
- If the page does not contain financial statement data, return {"rows": []}`,
        },
      ],
    }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{"rows":[]}';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    const parsed = extractedRowSchema.parse(JSON.parse(clean));
    return parsed.rows.filter((r) => r.raw_label.trim().length > 0);
  } catch {
    // If parsing fails, return empty array rather than crashing
    return [];
  }
}
