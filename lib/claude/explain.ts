/**
 * 4.6 — Mapping Explanation Streamer
 *
 * Streams a human-readable explanation of why a row was mapped to a
 * canonical field. Used by the Review Workbench Explain button via SSE.
 */

import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { CLAUDE_MODEL } from './config';

export interface ExplainParams {
  rawLabel: string;
  canonicalField: string;
  mappingMethod: string;
  mappingConfidence: number;
  templateType: string;
  statementType: string;
  validationResults?: Record<string, string>;
}

/**
 * Stream a plain-English explanation of a mapped row.
 * Returns a ReadableStream of text chunks (UTF-8 encoded).
 */
export async function streamMappingExplanation(params: ExplainParams): Promise<ReadableStream> {
  const {
    rawLabel,
    canonicalField,
    mappingMethod,
    mappingConfidence,
    templateType,
    statementType,
    validationResults,
  } = params;

  const validationSummary =
    validationResults && Object.keys(validationResults).length > 0
      ? Object.entries(validationResults)
          .map(([check, result]) => `${check}: ${result}`)
          .join('; ')
      : 'none run';

  const result = streamText({
    model: anthropic(CLAUDE_MODEL),
    prompt: `You are a financial data analyst explaining a mapping decision to a reviewer.

A row extracted from a financial statement has been mapped as follows:

- Raw label (as it appears in the document): "${rawLabel}"
- Canonical field assigned: "${canonicalField}"
- Template family: ${templateType}
- Statement type: ${statementType}
- Mapping method: ${mappingMethod}
- Mapping confidence: ${(mappingConfidence * 100).toFixed(0)}%
- Validation checks: ${validationSummary}

In 2-4 sentences, explain:
1. Why this raw label maps to this canonical field
2. Any nuance or ambiguity in the mapping (if confidence is below 90%)
3. What the reviewer should check if they want to override it

Be concise and factual. Do not use bullet points.`,
  });

  return result.textStream;
}
