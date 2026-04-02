import type { TemplateRuleSet } from './types';

export const T4_OLD_INDIAN_GAAP: TemplateRuleSet = {
  templateType: 'T4',
  name: 'Old Indian GAAP (Pre-Ind AS)',
  signals: ['Sources of funds', 'Application of funds', 'Schedule references', 'Profit & Loss A/c'],
  rules: [
    { normalizedLabel: 'sales and operating income', canonicalField: 'total_revenue', confidence: 0.95 },
    { normalizedLabel: 'sales', canonicalField: 'total_revenue', confidence: 0.90 },
    { normalizedLabel: 'other income', canonicalField: 'other_income', confidence: 0.90 },
    { normalizedLabel: 'total income', canonicalField: 'total_income', confidence: 0.95 },
    { normalizedLabel: 'manufacturing expenses', canonicalField: 'cost_of_sales', confidence: 0.90 },
    { normalizedLabel: 'cost of goods sold', canonicalField: 'cost_of_sales', confidence: 0.95 },
    { normalizedLabel: 'profit before taxation', canonicalField: 'profit_before_tax', confidence: 0.98 },
    { normalizedLabel: 'provision for taxation', canonicalField: 'income_tax_expense', confidence: 0.97 },
    { normalizedLabel: 'profit after tax', canonicalField: 'net_income', confidence: 0.98 },
    { normalizedLabel: 'profit and loss account', canonicalField: 'net_income', confidence: 0.95 },
    { normalizedLabel: 'sources of funds', canonicalField: 'total_liabilities', confidence: 0.90 },
    { normalizedLabel: 'application of funds', canonicalField: 'total_assets', confidence: 0.90 },
    { normalizedLabel: 'share capital', canonicalField: 'share_capital', confidence: 0.98 },
    { normalizedLabel: 'reserves and surplus', canonicalField: 'retained_earnings', confidence: 0.95 },
    { normalizedLabel: 'secured loans', canonicalField: 'borrowings', confidence: 0.90 },
    { normalizedLabel: 'unsecured loans', canonicalField: 'borrowings', confidence: 0.90 },
    { normalizedLabel: 'fixed assets', canonicalField: 'property_plant_equipment', confidence: 0.92 },
  ],
};
