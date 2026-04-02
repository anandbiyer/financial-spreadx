/**
 * M2 — Canonical Dictionary
 *
 * Looks up a normalized label in the mapping_rules table.
 * Template-specific rules take priority over cross-template rules.
 */

import { db } from '../db/index';
import { mappingRules } from '../db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';

export interface DictionaryMatch {
  canonicalField: string;
  confidence: number;
  source: 'dictionary';
}

/**
 * Look up a normalized label in the mapping_rules knowledge base.
 *
 * Priority:
 *   1. Template-specific exact match (template_type = T)
 *   2. Cross-template exact match (template_type IS NULL)
 *   3. Partial / substring match (lower confidence)
 *
 * Returns null if no match found.
 */
export async function lookupCanonicalField(
  normalizedLabel: string,
  templateType: string,
): Promise<DictionaryMatch | null> {
  // 1. Template-specific exact match
  const [templateMatch] = await db
    .select()
    .from(mappingRules)
    .where(
      and(
        eq(mappingRules.normalizedLabel, normalizedLabel),
        eq(mappingRules.templateType, templateType),
        eq(mappingRules.active, true),
      ),
    )
    .limit(1);

  if (templateMatch) {
    return {
      canonicalField: templateMatch.canonicalField,
      confidence: templateMatch.confidence ?? 0.9,
      source: 'dictionary',
    };
  }

  // 2. Cross-template exact match (template_type IS NULL)
  const [crossMatch] = await db
    .select()
    .from(mappingRules)
    .where(
      and(
        eq(mappingRules.normalizedLabel, normalizedLabel),
        isNull(mappingRules.templateType),
        eq(mappingRules.active, true),
      ),
    )
    .limit(1);

  if (crossMatch) {
    return {
      canonicalField: crossMatch.canonicalField,
      confidence: crossMatch.confidence ?? 0.85,
      source: 'dictionary',
    };
  }

  // 3. Partial match — check if any rule's label is contained in the input or vice versa
  const [partialMatch] = await db
    .select()
    .from(mappingRules)
    .where(
      and(
        sql`${mappingRules.normalizedLabel} != ${normalizedLabel}`,
        sql`(
          ${normalizedLabel} LIKE '%' || ${mappingRules.normalizedLabel} || '%'
          OR ${mappingRules.normalizedLabel} LIKE '%' || ${normalizedLabel} || '%'
        )`,
        eq(mappingRules.active, true),
        sql`(${mappingRules.templateType} = ${templateType} OR ${mappingRules.templateType} IS NULL)`,
      ),
    )
    .limit(1);

  if (partialMatch) {
    // Partial matches get a confidence penalty
    const baseConf = partialMatch.confidence ?? 0.8;
    return {
      canonicalField: partialMatch.canonicalField,
      confidence: Math.max(baseConf - 0.15, 0.4),
      source: 'dictionary',
    };
  }

  return null;
}

/**
 * Synchronous in-memory lookup for use when DB is not available (e.g., in mapping engine).
 * Uses a pre-loaded rules array.
 */
export function lookupCanonicalFieldSync(
  normalizedLabel: string,
  templateType: string,
  rules: { templateType: string | null; normalizedLabel: string; canonicalField: string; confidence: number }[],
): DictionaryMatch | null {
  // Template-specific exact
  const templateMatch = rules.find(
    (r) => r.normalizedLabel === normalizedLabel && r.templateType === templateType,
  );
  if (templateMatch) {
    return { canonicalField: templateMatch.canonicalField, confidence: templateMatch.confidence, source: 'dictionary' };
  }

  // Cross-template exact
  const crossMatch = rules.find(
    (r) => r.normalizedLabel === normalizedLabel && r.templateType === null,
  );
  if (crossMatch) {
    return { canonicalField: crossMatch.canonicalField, confidence: crossMatch.confidence, source: 'dictionary' };
  }

  // Partial match
  const partialMatch = rules.find(
    (r) =>
      (r.templateType === templateType || r.templateType === null) &&
      r.normalizedLabel !== normalizedLabel &&
      (normalizedLabel.includes(r.normalizedLabel) || r.normalizedLabel.includes(normalizedLabel)),
  );
  if (partialMatch) {
    return {
      canonicalField: partialMatch.canonicalField,
      confidence: Math.max(partialMatch.confidence - 0.15, 0.4),
      source: 'dictionary',
    };
  }

  return null;
}
