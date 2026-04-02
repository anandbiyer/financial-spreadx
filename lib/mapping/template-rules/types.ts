/**
 * Shared types for template rule files.
 */

export interface TemplateRule {
  normalizedLabel: string;
  canonicalField: string;
  confidence: number;
  contextHint?: {
    statementType?: string;
    sectionPath?: string[];
  };
}

export interface TemplateRuleSet {
  templateType: string;
  name: string;
  signals: string[];          // discriminating signals for classifier
  rules: TemplateRule[];
}
