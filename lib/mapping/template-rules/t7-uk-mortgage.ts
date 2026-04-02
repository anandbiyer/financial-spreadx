import type { TemplateRuleSet } from './types';

export const T7_UK_MORTGAGE: TemplateRuleSet = {
  templateType: 'T7',
  name: 'UK GAAP — Specialist Lender / Mortgage',
  signals: ['Effective interest method', 'Non-recourse notes', 'Securitisation vehicles', 'Portfolio hedges'],
  rules: [
    { normalizedLabel: 'interest receivable', canonicalField: 'interest_income', confidence: 0.97 },
    { normalizedLabel: 'interest receivable and similar income', canonicalField: 'interest_income', confidence: 0.97 },
    { normalizedLabel: 'interest payable', canonicalField: 'finance_costs', confidence: 0.97 },
    { normalizedLabel: 'interest payable and similar charges', canonicalField: 'finance_costs', confidence: 0.97 },
    { normalizedLabel: 'fees and commissions receivable', canonicalField: 'fee_income', confidence: 0.95 },
    { normalizedLabel: 'impairment losses on loans and advances', canonicalField: 'impairment_charge', confidence: 0.97 },
    { normalizedLabel: 'administrative expenses', canonicalField: 'admin_expenses', confidence: 0.97 },
    { normalizedLabel: 'operating profit', canonicalField: 'operating_income', confidence: 0.95 },
    { normalizedLabel: 'profit before tax', canonicalField: 'profit_before_tax', confidence: 0.99 },
    { normalizedLabel: 'tax on profit on ordinary activities', canonicalField: 'income_tax_expense', confidence: 0.95 },
    { normalizedLabel: 'profit for the financial year', canonicalField: 'net_income', confidence: 0.98 },
    { normalizedLabel: 'loss for the financial year', canonicalField: 'net_income', confidence: 0.98 },
    { normalizedLabel: 'loans and advances to customers', canonicalField: 'loans_and_advances', confidence: 0.95 },
    { normalizedLabel: 'debt securities in issue', canonicalField: 'borrowings', confidence: 0.90 },
    { normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.99 },
    { normalizedLabel: 'total liabilities', canonicalField: 'total_liabilities', confidence: 0.99 },
    { normalizedLabel: 'total equity', canonicalField: 'total_equity', confidence: 0.99 },
  ],
};
