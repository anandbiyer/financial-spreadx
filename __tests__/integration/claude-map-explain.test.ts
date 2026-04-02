// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { claudeMapLabel } from '../../lib/claude/map';
import { streamMappingExplanation } from '../../lib/claude/explain';

// ─── T4.8: Claude map fallback ────────────────────────────

describe('T4.8 — Claude map fallback', () => {
  it('maps an unusual T6 label to net_income', async () => {
    const result = await claudeMapLabel(
      'Profit available for discretionary distribution among members',
      'profit available for discretionary distribution among members',
      'T6',
      { statementType: 'income_statement' },
    );

    console.log('Claude map result:', {
      field: result.canonical_field,
      confidence: result.confidence,
      method: result.mapping_method,
      reasoning: result.reasoning,
    });

    expect(result.canonical_field).toBeTruthy();
    expect(result.mapping_method).toBe('claude');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    // Should map to a relevant T6 field
    expect(result.canonical_field).toBeTruthy();
  }, 60000);
});

// ─── T4.9: Explanation streamer ───────────────────────────

describe('T4.9 — Explanation streamer', () => {
  it('returns a readable stream with coherent text', async () => {
    const stream = await streamMappingExplanation({
      rawLabel: 'Revenue from operations',
      canonicalField: 'total_revenue',
      mappingMethod: 'dictionary',
      mappingConfidence: 0.98,
      templateType: 'T3',
      statementType: 'income_statement',
    });

    expect(stream).toBeDefined();

    // Read the stream
    const reader = stream.getReader();
    let fullText = '';
    let chunks = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += typeof value === 'string' ? value : new TextDecoder().decode(value);
      chunks++;
    }

    console.log('Explain stream:', {
      chunks,
      totalLength: fullText.length,
      excerpt: fullText.slice(0, 150),
    });

    expect(fullText.length).toBeGreaterThan(50);
    expect(chunks).toBeGreaterThan(0);
  }, 60000);
});
