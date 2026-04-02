/**
 * 4.3 — Note Extractor
 *
 * Extracts structured data from financial statement notes using Claude.
 */

import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { CLAUDE_MODEL } from './config';

const noteSchema = z.object({
  note_number: z.number().int(),
  note_title: z.string(),
  summary: z.string().describe('Brief summary of what this note covers (max 500 chars)'),
  sub_tables: z.array(z.object({
    table_title: z.string().nullable(),
    rows: z.array(z.object({
      label: z.string(),
      values: z.object({}).catchall(z.any()).describe('Year/period to numeric value mapping'),
    })),
  })),
});

export type NoteExtraction = z.infer<typeof noteSchema>;

/**
 * Extract structured data from a financial statement note.
 *
 * @param noteText     - Full text of the note page(s)
 * @param noteNumber   - The note number (e.g., 12)
 * @param templateType - T1-T8 template classification
 */
export async function extractNote(
  noteText: string,
  noteNumber: number,
  templateType: string,
): Promise<NoteExtraction> {
  try {
    const { object } = await generateObject({
      model: anthropic(CLAUDE_MODEL),
      schema: noteSchema,
      prompt: `Extract structured data from this financial statement note (Note ${noteNumber}).
Template: ${templateType}

Rules:
1. note_title should be the heading of the note
2. summary should be a brief (max 500 chars) description of what the note covers
3. If the note contains tables, extract them as sub_tables with their rows
4. Values in parentheses like (1,234) should be converted to -1234
5. For unknown values, use null not strings

Note text:
${noteText.slice(0, 4000)}`,
    });

    return object;
  } catch {
    // Fallback for smaller models that struggle with nested schemas
    return {
      note_number: noteNumber,
      note_title: noteText.split('\n')[0]?.trim() ?? `Note ${noteNumber}`,
      summary: noteText.slice(0, 500),
      sub_tables: [],
    };
  }
}
