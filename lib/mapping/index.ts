/**
 * Mapping Engine Orchestrator
 *
 * Runs M1 → M2 → M3 → M4 → M5 → M6 → M7 in sequence.
 * M8 (column classifier) is handled in the pipeline before this.
 * M9 (entity linker) is handled in the pipeline after this.
 */

import { normalizeLabel } from './label-normalizer';
import { lookupCanonicalFieldSync, type DictionaryMatch } from './dictionary';
import { disambiguate, type DisambiguationContext } from './disambiguator';
import { buildStatementTree, inferMissingSubtotals } from './hierarchy-engine';
import { runAllValidations, type CanonicalMap, type ValidationCheck } from './formula-validator';
import { computeConfidence, type ConfidenceSignals } from './confidence-engine';
import { detectScope } from './scope-detector';

// Template rule imports
import { T1_US_GAAP } from './template-rules/t1-us-gaap';
import { T2_US_ALT_INVESTMENT } from './template-rules/t2-us-alt-investment';
import { T3_IND_AS_NBFC } from './template-rules/t3-ind-as-nbfc';
import { T4_OLD_INDIAN_GAAP } from './template-rules/t4-old-indian-gaap';
import { T5_UK_COMPANIES_ACT } from './template-rules/t5-uk-companies-act';
import { T6_UK_LLP } from './template-rules/t6-uk-llp';
import { T7_UK_MORTGAGE } from './template-rules/t7-uk-mortgage';
import { T8_IFRS_ASIA } from './template-rules/t8-ifrs-asia';
import type { TemplateRuleSet } from './template-rules/types';

const TEMPLATE_RULE_MAP: Record<string, TemplateRuleSet> = {
  T1: T1_US_GAAP,
  T2: T2_US_ALT_INVESTMENT,
  T3: T3_IND_AS_NBFC,
  T4: T4_OLD_INDIAN_GAAP,
  T5: T5_UK_COMPANIES_ACT,
  T6: T6_UK_LLP,
  T7: T7_UK_MORTGAGE,
  T8: T8_IFRS_ASIA,
};

export function getTemplateRules(templateType: string): TemplateRuleSet | null {
  return TEMPLATE_RULE_MAP[templateType] ?? null;
}

export interface ExtractedRowInput {
  id?: string;
  rawLabel: string;
  rawValues: Record<string, number | null>;
  statementType: string;
  sectionPath?: string[];
  indentationLevel: number;
  isSubtotal: boolean;
  noteRef?: string | null;
  statementScope?: string;
  ocrMethod?: string;
}

export interface MappedRowOutput {
  rowId?: string;
  rawLabel: string;
  canonicalField: string | null;
  canonicalGroup: string | null;
  parentCanonicalField: string | null;
  normalizedValues: Record<string, number | null>;
  mappingMethod: 'dictionary' | 'claude' | 'override';
  mappingConfidence: number;
  validationResults: Record<string, string>;
  reviewStatus: 'auto_approved' | 'needs_review';
  statementScope: string;
}

/**
 * Run the full mapping engine on a set of extracted rows.
 *
 * Pipeline: M1 normalize → M2 dictionary → M3 disambiguate → M4 hierarchy →
 *           M5 validate → M6 confidence → M7 scope
 */
export function runMappingEngine(
  rows: ExtractedRowInput[],
  templateType: string,
  documentId: string,
  dbRules?: { templateType: string | null; normalizedLabel: string; canonicalField: string; confidence: number }[],
): {
  mappedRows: MappedRowOutput[];
  validationChecks: ValidationCheck[];
  unmatchedIndices: number[];
} {
  // Load template-specific rules for sync lookup
  const templateRuleSet = getTemplateRules(templateType);
  const templateRules = templateRuleSet?.rules ?? [];

  // Convert template rules to the format expected by lookupCanonicalFieldSync
  const allRules = [
    ...templateRules.map((r) => ({
      templateType: templateType as string | null,
      normalizedLabel: r.normalizedLabel,
      canonicalField: r.canonicalField,
      confidence: r.confidence,
    })),
    ...(dbRules ?? []),
  ];

  // ── M1 + M2 + M3: Normalize, lookup, disambiguate ──────
  const mappedRows: MappedRowOutput[] = rows.map((row) => {
    // M1: Normalize
    const normalized = normalizeLabel(row.rawLabel);

    // M2: Dictionary lookup
    const match = lookupCanonicalFieldSync(normalized, templateType, allRules);

    let canonicalField = match?.canonicalField ?? null;
    let confidence = match?.confidence ?? 0;
    let mappingMethod: MappedRowOutput['mappingMethod'] = match ? 'dictionary' : 'claude';

    // M3: Disambiguate if we got a match
    if (canonicalField) {
      const ctx: DisambiguationContext = {
        statementType: row.statementType,
        sectionPath: row.sectionPath,
        templateType,
      };
      const disambResult = disambiguate(normalized, canonicalField, ctx);
      if (disambResult) {
        canonicalField = disambResult.canonicalField;
        confidence = Math.min(confidence, disambResult.confidence);
      }
    }

    // M7: Scope detection (per-row, from label context)
    const scope = row.statementScope ?? 'unknown';

    return {
      rowId: row.id,
      rawLabel: row.rawLabel,
      canonicalField,
      canonicalGroup: null,   // filled by hierarchy engine if needed
      parentCanonicalField: null,
      normalizedValues: row.rawValues,
      mappingMethod,
      mappingConfidence: confidence,
      validationResults: {},
      reviewStatus: 'needs_review' as const,
      statementScope: scope,
    };
  });

  // ── M4: Build hierarchy tree per statement type ─────────
  const statementTypes = [...new Set(rows.map((r) => r.statementType))];
  for (const stType of statementTypes) {
    const stRows = mappedRows.filter((_, i) => rows[i].statementType === stType);
    const primaryYear = getPrimaryYear(rows);

    const treeInput = stRows.map((mr, i) => {
      const origRow = rows[mappedRows.indexOf(mr)];
      return {
        canonicalField: mr.canonicalField ?? mr.rawLabel,
        rawLabel: mr.rawLabel,
        value: primaryYear ? (mr.normalizedValues[primaryYear] ?? null) : null,
        indentationLevel: origRow?.indentationLevel ?? 0,
        isSubtotal: origRow?.isSubtotal ?? false,
        parentCanonicalField: mr.parentCanonicalField,
      };
    });

    const tree = buildStatementTree(treeInput);
    inferMissingSubtotals(tree, ['total_revenue', 'total_expenses', 'total_income']);
  }

  // ── M5: Formula validation ──────────────────────────────
  const primaryYear = getPrimaryYear(rows);
  const canonicalMap: CanonicalMap = {};
  for (const mr of mappedRows) {
    if (mr.canonicalField && primaryYear) {
      canonicalMap[mr.canonicalField] = mr.normalizedValues[primaryYear] ?? null;
    }
  }
  const validationChecks = runAllValidations(canonicalMap, templateType);

  // Build per-row validation results
  const validationMap: Record<string, string> = {};
  for (const check of validationChecks) {
    validationMap[check.checkId] = check.status;
  }

  // ── M6: Confidence scoring ──────────────────────────────
  for (let i = 0; i < mappedRows.length; i++) {
    const mr = mappedRows[i];
    const origRow = rows[i];

    // Determine if any validation check failed for this row's canonical field
    const formulaPassed = mr.canonicalField
      ? !validationChecks.some(
          (c) => c.status === 'failed' && c.formula.includes(mr.canonicalField!),
        )
      : null;

    const signals: ConfidenceSignals = {
      dictionaryConfidence: mr.mappingConfidence,
      contextConfidence: mr.canonicalField ? 0.90 : 0.50,
      formulaPassed,
      historicalAgreement: 0.80, // default for seed rules
      ocrMethod: origRow.ocrMethod,
    };

    const { compositeScore, reviewStatus } = computeConfidence(signals);
    mr.mappingConfidence = compositeScore;
    mr.reviewStatus = reviewStatus;
    mr.validationResults = validationMap;
  }

  // Collect indices of rows that had no dictionary match (mappingMethod='claude', confidence=0)
  const unmatchedIndices = mappedRows
    .map((mr, i) => (mr.mappingMethod === 'claude' && mr.mappingConfidence <= 0.35 ? i : -1))
    .filter((i) => i !== -1);

  return { mappedRows, validationChecks, unmatchedIndices };
}

/**
 * Get the primary (most recent) year from the rows' raw_values keys.
 */
function getPrimaryYear(rows: ExtractedRowInput[]): string | null {
  const years = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.rawValues)) {
      if (/^\d{4}$/.test(key)) years.add(key);
    }
  }
  if (years.size === 0) return null;
  return [...years].sort().reverse()[0];
}
