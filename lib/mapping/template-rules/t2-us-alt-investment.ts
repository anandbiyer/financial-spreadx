import type { TemplateRuleSet } from './types';

export const T2_US_ALT_INVESTMENT: TemplateRuleSet = {
  templateType: 'T2',
  name: 'US GAAP — Alternative Investment / LP / LLC',
  signals: ["Partners' capital", 'Capital allocation income', 'Fund consolidation', 'Carried interest'],
  rules: [
    { normalizedLabel: 'total revenues', canonicalField: 'total_revenue', confidence: 0.98 },
    { normalizedLabel: 'net revenues', canonicalField: 'total_revenue', confidence: 0.95 },
    { normalizedLabel: 'capital allocation based income', canonicalField: 'capital_allocation_income', confidence: 0.97 },
    { normalizedLabel: 'carried interest', canonicalField: 'carried_interest', confidence: 0.98 },
    { normalizedLabel: 'performance allocation', canonicalField: 'carried_interest', confidence: 0.95 },
    { normalizedLabel: 'management fees', canonicalField: 'fee_income', confidence: 0.95 },
    { normalizedLabel: 'net income loss', canonicalField: 'net_income', confidence: 0.97 },
    { normalizedLabel: 'net income', canonicalField: 'net_income', confidence: 0.99 },
    { normalizedLabel: 'partners capital', canonicalField: 'partners_capital', confidence: 0.99 },
    { normalizedLabel: 'total partners capital', canonicalField: 'total_equity', confidence: 0.97 },
    { normalizedLabel: 'non controlling interests', canonicalField: 'non_controlling_interests', confidence: 0.97 },
    { normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.99 },
    { normalizedLabel: 'total liabilities', canonicalField: 'total_liabilities', confidence: 0.99 },
  ],
};
