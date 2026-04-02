import type { TemplateRuleSet } from './types';

export const T6_UK_LLP: TemplateRuleSet = {
  templateType: 'T6',
  name: 'UK LLP / Partnership',
  signals: ["Members' remuneration", 'Profit for discretionary division', "Members' capital", 'Average loss per member'],
  rules: [
    { normalizedLabel: 'turnover', canonicalField: 'total_revenue', confidence: 0.97 },
    { normalizedLabel: 'revenue', canonicalField: 'total_revenue', confidence: 0.95 },
    { normalizedLabel: 'administrative expenses', canonicalField: 'admin_expenses', confidence: 0.97 },
    { normalizedLabel: 'administration expenses', canonicalField: 'admin_expenses', confidence: 0.97 },
    { normalizedLabel: 'members remuneration', canonicalField: 'members_remuneration', confidence: 0.99 },
    { normalizedLabel: 'members remuneration charged as an expense', canonicalField: 'members_remuneration', confidence: 0.98 },
    { normalizedLabel: 'profit for discretionary division among members', canonicalField: 'net_income', confidence: 0.98 },
    { normalizedLabel: 'loss for the financial year available for discretionary distribution', canonicalField: 'net_income', confidence: 0.99 },
    { normalizedLabel: 'profit available for discretionary distribution among members', canonicalField: 'net_income', confidence: 0.98 },
    { normalizedLabel: 'members capital', canonicalField: 'partners_capital', confidence: 0.99 },
    { normalizedLabel: 'total members interests', canonicalField: 'total_equity', confidence: 0.97 },
    { normalizedLabel: 'average profit per member', canonicalField: 'eps_basic', confidence: 0.85 },
    { normalizedLabel: 'average loss per member', canonicalField: 'eps_basic', confidence: 0.85 },
    { normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.99 },
    { normalizedLabel: 'total liabilities', canonicalField: 'total_liabilities', confidence: 0.99 },
    { normalizedLabel: 'net assets', canonicalField: 'total_equity', confidence: 0.93 },
  ],
};
