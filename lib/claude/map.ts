/**
 * 4.5 — Claude Mapping Fallback
 *
 * Called when dictionary confidence < 0.7.
 * Uses Claude to suggest a canonical field mapping.
 */

import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { CLAUDE_MODEL } from './config';
import { CANONICAL_FIELDS } from '../mapping/canonical-fields';

const mapResultSchema = z.object({
  canonical_field: z.string().describe('The canonical field name this label maps to'),
  confidence: z.number().describe('Confidence score between 0 and 1'),
  reasoning: z.string().describe('Brief explanation for this mapping (max 200 chars)'),
});

export type ClaudeMapResult = z.infer<typeof mapResultSchema>;

/**
 * Ask Claude to suggest a canonical field for a label that the dictionary
 * couldn't confidently match.
 *
 * @param rawLabel        - Original verbatim label
 * @param normalizedLabel - After M1 normalization
 * @param templateType    - T1-T8
 * @param context         - Statement type and section path
 */
export async function claudeMapLabel(
  rawLabel: string,
  normalizedLabel: string,
  templateType: string,
  context: { statementType: string; sectionPath?: string[] },
): Promise<ClaudeMapResult & { mapping_method: 'claude' }> {
  const validFields = CANONICAL_FIELDS
    .filter((f) => f.supportedTemplates.includes(templateType) || f.supportedTemplates.length === 0)
    .map((f) => `${f.canonicalField}: ${f.displayName} (${f.statementType})`)
    .join('\n');

  const { object } = await generateObject({
    model: anthropic(CLAUDE_MODEL),
    schema: mapResultSchema,
    prompt: `You are a financial data mapping engine. Map this extracted label to the most appropriate canonical field.

Raw label: "${rawLabel}"
Normalized label: "${normalizedLabel}"
Template type: ${templateType}
Statement type: ${context.statementType}
Section path: ${context.sectionPath?.join(' > ') ?? 'unknown'}

Available canonical fields for this template:
${validFields}

Choose the best matching canonical field. If no field is appropriate, use the closest match and set confidence low (< 0.5).`,
  });

  return { ...object, mapping_method: 'claude' as const };
}
