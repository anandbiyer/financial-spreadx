import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { mappingRules } from '../lib/db/schema';

/**
 * 80+ mapping rules covering label variants across all 8 template families.
 * Each rule maps a normalized label to a canonical field.
 */
const RULES: {
  templateType: string | null;
  normalizedLabel: string;
  canonicalField: string;
  confidence: number;
}[] = [
  // ── T1: US GAAP — Standard Corporate ─────────────────────
  { templateType: 'T1', normalizedLabel: 'net revenues', canonicalField: 'total_revenue', confidence: 0.95 },
  { templateType: 'T1', normalizedLabel: 'total revenues', canonicalField: 'total_revenue', confidence: 0.98 },
  { templateType: 'T1', normalizedLabel: 'interest income', canonicalField: 'interest_income', confidence: 0.97 },
  { templateType: 'T1', normalizedLabel: 'interest expense', canonicalField: 'finance_costs', confidence: 0.97 },
  { templateType: 'T1', normalizedLabel: 'income from continuing operations', canonicalField: 'operating_income', confidence: 0.95 },
  { templateType: 'T1', normalizedLabel: 'income before income taxes', canonicalField: 'profit_before_tax', confidence: 0.98 },
  { templateType: 'T1', normalizedLabel: 'provision for income taxes', canonicalField: 'income_tax_expense', confidence: 0.97 },
  { templateType: 'T1', normalizedLabel: 'net income', canonicalField: 'net_income', confidence: 0.99 },
  { templateType: 'T1', normalizedLabel: 'earnings per share basic', canonicalField: 'eps_basic', confidence: 0.98 },
  { templateType: 'T1', normalizedLabel: 'earnings per share diluted', canonicalField: 'eps_diluted', confidence: 0.98 },
  { templateType: 'T1', normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.99 },
  { templateType: 'T1', normalizedLabel: 'total liabilities', canonicalField: 'total_liabilities', confidence: 0.99 },
  { templateType: 'T1', normalizedLabel: 'total stockholders equity', canonicalField: 'total_equity', confidence: 0.98 },
  { templateType: 'T1', normalizedLabel: 'total shareholders equity', canonicalField: 'total_equity', confidence: 0.98 },

  // ── T2: US GAAP — Alternative Investment / LP / LLC ──────
  { templateType: 'T2', normalizedLabel: 'partners capital', canonicalField: 'partners_capital', confidence: 0.99 },
  { templateType: 'T2', normalizedLabel: 'capital allocation based income', canonicalField: 'capital_allocation_income', confidence: 0.97 },
  { templateType: 'T2', normalizedLabel: 'carried interest', canonicalField: 'carried_interest', confidence: 0.98 },
  { templateType: 'T2', normalizedLabel: 'performance allocation', canonicalField: 'carried_interest', confidence: 0.95 },
  { templateType: 'T2', normalizedLabel: 'net income loss', canonicalField: 'net_income', confidence: 0.97 },
  { templateType: 'T2', normalizedLabel: 'total revenues', canonicalField: 'total_revenue', confidence: 0.98 },
  { templateType: 'T2', normalizedLabel: 'non controlling interests', canonicalField: 'non_controlling_interests', confidence: 0.97 },

  // ── T3: Ind AS / NBFC (India) — expanded ─────────────────
  { templateType: 'T3', normalizedLabel: 'revenue from operations', canonicalField: 'total_revenue', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'interest income', canonicalField: 'interest_income', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'interest earned', canonicalField: 'interest_income', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'net interest income', canonicalField: 'net_interest_income', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'fee and commission income', canonicalField: 'fee_income', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'fees and commission income', canonicalField: 'fee_income', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'net gain on fair value changes', canonicalField: 'other_operating_income', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'other operating income', canonicalField: 'other_operating_income', confidence: 0.93 },
  { templateType: 'T3', normalizedLabel: 'other income', canonicalField: 'other_income', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'total income', canonicalField: 'total_income', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'finance costs', canonicalField: 'finance_costs', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'interest expense', canonicalField: 'finance_costs', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'interest expended', canonicalField: 'finance_costs', confidence: 0.96 },
  { templateType: 'T3', normalizedLabel: 'impairment on financial instruments', canonicalField: 'impairment_charge', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'impairment loss on financial assets', canonicalField: 'impairment_charge', confidence: 0.96 },
  { templateType: 'T3', normalizedLabel: 'provisions and write-offs', canonicalField: 'impairment_charge', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'employee benefits expenses', canonicalField: 'employee_benefits_expense', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'employee benefit expenses', canonicalField: 'employee_benefits_expense', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'employee benefits expense', canonicalField: 'employee_benefits_expense', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'depreciation and amortisation', canonicalField: 'depreciation_amortization', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'other expenses', canonicalField: 'other_expenses', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'total expenses', canonicalField: 'total_expenses', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'profit before tax', canonicalField: 'profit_before_tax', confidence: 0.99 },
  { templateType: 'T3', normalizedLabel: 'tax expense', canonicalField: 'income_tax_expense', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'income tax expense', canonicalField: 'income_tax_expense', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'current tax', canonicalField: 'income_tax_expense', confidence: 0.93 },
  { templateType: 'T3', normalizedLabel: 'deferred tax', canonicalField: 'deferred_tax', confidence: 0.93 },
  { templateType: 'T3', normalizedLabel: 'profit for the year', canonicalField: 'net_income', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'profit for the period', canonicalField: 'net_income', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'other comprehensive income', canonicalField: 'other_comprehensive_income', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'actuarial loss on defined benefit plan (gratuity) net of income tax', canonicalField: 'actuarial_gains_losses', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'remeasurements of the defined benefit plans', canonicalField: 'actuarial_gains_losses', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'total comprehensive income for the year', canonicalField: 'total_comprehensive_income', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'earnings per share basic', canonicalField: 'eps_basic', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'earnings per share diluted', canonicalField: 'eps_diluted', confidence: 0.97 },
  // Balance Sheet — Assets
  { templateType: 'T3', normalizedLabel: 'cash and cash equivalents', canonicalField: 'cash_and_equivalents', confidence: 0.99 },
  { templateType: 'T3', normalizedLabel: 'bank balance other than above', canonicalField: 'bank_balances', confidence: 0.93 },
  { templateType: 'T3', normalizedLabel: 'derivative financial instruments', canonicalField: 'derivative_assets', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'trade receivables', canonicalField: 'trade_receivables', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'loans', canonicalField: 'loans_and_advances', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'loans and advances', canonicalField: 'loans_and_advances', confidence: 0.96 },
  { templateType: 'T3', normalizedLabel: 'investments', canonicalField: 'investments', confidence: 0.93 },
  { templateType: 'T3', normalizedLabel: 'other financial assets', canonicalField: 'other_financial_assets', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'deferred tax assets (net)', canonicalField: 'deferred_tax_assets', confidence: 0.95 },
  { templateType: 'T3', normalizedLabel: 'property plant and equipment', canonicalField: 'property_plant_equipment', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'intangible assets', canonicalField: 'intangible_assets', confidence: 0.96 },
  { templateType: 'T3', normalizedLabel: 'other non-financial assets', canonicalField: 'other_non_financial_assets', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.99 },
  // Balance Sheet — Liabilities
  { templateType: 'T3', normalizedLabel: 'debt securities', canonicalField: 'debt_securities', confidence: 0.96 },
  { templateType: 'T3', normalizedLabel: 'borrowings', canonicalField: 'borrowings', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'subordinated liabilities', canonicalField: 'subordinated_debt', confidence: 0.95 },
  { templateType: 'T3', normalizedLabel: 'other financial liabilities', canonicalField: 'other_financial_liabilities', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'current tax liabilities (net)', canonicalField: 'current_tax_liabilities', confidence: 0.94 },
  { templateType: 'T3', normalizedLabel: 'provisions', canonicalField: 'provisions', confidence: 0.93 },
  { templateType: 'T3', normalizedLabel: 'other non-financial liabilities', canonicalField: 'other_non_financial_liabilities', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'total liabilities', canonicalField: 'total_liabilities', confidence: 0.99 },
  // Balance Sheet — Equity
  { templateType: 'T3', normalizedLabel: 'share capital', canonicalField: 'share_capital', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'other equity', canonicalField: 'retained_earnings_and_reserves', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'securities premium', canonicalField: 'share_premium', confidence: 0.96 },
  { templateType: 'T3', normalizedLabel: 'securities premium account', canonicalField: 'share_premium', confidence: 0.96 },
  { templateType: 'T3', normalizedLabel: 'retained earnings', canonicalField: 'retained_earnings', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'reserve u/s 45-ic of reserve bank of india act 1934', canonicalField: 'statutory_reserve_rbi', confidence: 1.0 },
  { templateType: 'T3', normalizedLabel: 'debenture redemption reserve', canonicalField: 'statutory_reserve_rbi', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'general reserve', canonicalField: 'general_reserve', confidence: 0.95 },
  { templateType: 'T3', normalizedLabel: 'total equity', canonicalField: 'total_equity', confidence: 0.99 },
  // Cash Flow
  { templateType: 'T3', normalizedLabel: 'net cash from operating activities', canonicalField: 'net_cash_operating', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'net cash from investing activities', canonicalField: 'net_cash_investing', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'net cash from financing activities', canonicalField: 'net_cash_financing', confidence: 0.98 },
  { templateType: 'T3', normalizedLabel: 'cash and cash equivalents at the end of the year', canonicalField: 'cash_end', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'cash and cash equivalents at the beginning of the year', canonicalField: 'cash_start', confidence: 0.97 },
  { templateType: 'T3', normalizedLabel: 'operating profit before working capital changes', canonicalField: 'cash_from_operations', confidence: 0.88 },
  { templateType: 'T3', normalizedLabel: 'interest paid', canonicalField: 'finance_costs', confidence: 0.95 },
  { templateType: 'T3', normalizedLabel: 'interest received', canonicalField: 'interest_income', confidence: 0.93 },
  { templateType: 'T3', normalizedLabel: 'purchase of property, plant and equipment', canonicalField: 'capital_expenditure', confidence: 0.95 },
  { templateType: 'T3', normalizedLabel: 'proceeds from sale of property, plant and equipment', canonicalField: 'proceeds_from_asset_disposal', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'direct taxes refund/(paid)', canonicalField: 'income_tax_expense', confidence: 0.87 },
  { templateType: 'T3', normalizedLabel: 'payment for issue costs', canonicalField: 'finance_costs', confidence: 0.85 },
  { templateType: 'T3', normalizedLabel: 'payment for share issue costs', canonicalField: 'finance_costs', confidence: 0.85 },
  { templateType: 'T3', normalizedLabel: 'change in other bank balance not available for immediate use', canonicalField: 'bank_balances', confidence: 0.85 },
  // Income Statement — loss/gain variants
  { templateType: 'T3', normalizedLabel: 'net loss on fair value changes', canonicalField: 'other_operating_income', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'net loss on derecognition of financial instruments under amortised cost category', canonicalField: 'other_operating_income', confidence: 0.88 },
  { templateType: 'T3', normalizedLabel: 'fair value changes on loan assets', canonicalField: 'other_operating_income', confidence: 0.88 },
  { templateType: 'T3', normalizedLabel: 'net loss on sale of property, plant and equipment', canonicalField: 'other_expenses', confidence: 0.87 },
  { templateType: 'T3', normalizedLabel: '(gain)/loss on derivatives at fair value through profit or loss', canonicalField: 'other_operating_income', confidence: 0.85 },
  { templateType: 'T3', normalizedLabel: 'rental income', canonicalField: 'other_income', confidence: 0.92 },
  { templateType: 'T3', normalizedLabel: 'goodwill', canonicalField: 'intangible_assets', confidence: 0.88 },
  // Balance Sheet — additional
  { templateType: 'T3', normalizedLabel: 'trade and other payables', canonicalField: 'trade_payables', confidence: 0.90 },
  // Equity Statement — additional
  { templateType: 'T3', normalizedLabel: 'issue of equity shares', canonicalField: 'share_capital', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'capital redemption reserve', canonicalField: 'capital_reserve', confidence: 0.90 },
  { templateType: 'T3', normalizedLabel: 'share issue expenses', canonicalField: 'share_premium', confidence: 0.85 },
  { templateType: 'T3', normalizedLabel: 'tax on interim dividend', canonicalField: 'dividends_paid', confidence: 0.85 },
  { templateType: 'T3', normalizedLabel: 'transfer to reserve u/s 36(1)(viii) of income tax act', canonicalField: 'general_reserve', confidence: 0.85 },
  { templateType: 'T3', normalizedLabel: 'reserve u/s 36(1)(viii) of income tax act, 1961', canonicalField: 'general_reserve', confidence: 0.87 },
  { templateType: 'T3', normalizedLabel: 'issued, subscribed and fully paid up equity shares outstanding at april 1, 2017', canonicalField: 'opening_equity', confidence: 0.88 },
  { templateType: 'T3', normalizedLabel: 'issued, subscribed and fully paid up equity shares outstanding at april 1, 2018', canonicalField: 'opening_equity', confidence: 0.88 },
  { templateType: 'T3', normalizedLabel: 'issued, subscribed and fully paid up equity shares outstanding at april 1, 2019', canonicalField: 'opening_equity', confidence: 0.88 },
  { templateType: 'T3', normalizedLabel: 'issued, subscribed and fully paid up equity shares outstanding at the end of the year march 31, 2018', canonicalField: 'closing_equity', confidence: 0.88 },
  { templateType: 'T3', normalizedLabel: 'issued, subscribed and fully paid up equity shares outstanding at the end of the year march 31, 2019', canonicalField: 'closing_equity', confidence: 0.88 },
  { templateType: 'T3', normalizedLabel: 'issued, subscribed and fully paid up equity shares outstanding at the end of the year march 31, 2020', canonicalField: 'closing_equity', confidence: 0.88 },

  // ── T4: Old Indian GAAP (Pre-Ind AS) ─────────────────────
  { templateType: 'T4', normalizedLabel: 'sources of funds', canonicalField: 'total_liabilities', confidence: 0.90 },
  { templateType: 'T4', normalizedLabel: 'application of funds', canonicalField: 'total_assets', confidence: 0.90 },
  { templateType: 'T4', normalizedLabel: 'profit and loss account', canonicalField: 'net_income', confidence: 0.95 },
  { templateType: 'T4', normalizedLabel: 'sales and operating income', canonicalField: 'total_revenue', confidence: 0.95 },
  { templateType: 'T4', normalizedLabel: 'profit before taxation', canonicalField: 'profit_before_tax', confidence: 0.98 },
  { templateType: 'T4', normalizedLabel: 'provision for taxation', canonicalField: 'income_tax_expense', confidence: 0.97 },

  // ── T5: UK Companies Act (Asset Manager) ─────────────────
  { templateType: 'T5', normalizedLabel: 'turnover', canonicalField: 'total_revenue', confidence: 0.98 },
  { templateType: 'T5', normalizedLabel: 'administrative expenses', canonicalField: 'admin_expenses', confidence: 0.97 },
  { templateType: 'T5', normalizedLabel: 'administration expenses', canonicalField: 'admin_expenses', confidence: 0.97 },
  { templateType: 'T5', normalizedLabel: 'operating loss', canonicalField: 'operating_income', confidence: 0.95 },
  { templateType: 'T5', normalizedLabel: 'operating profit', canonicalField: 'operating_income', confidence: 0.95 },
  { templateType: 'T5', normalizedLabel: 'loss before taxation', canonicalField: 'profit_before_tax', confidence: 0.97 },
  { templateType: 'T5', normalizedLabel: 'profit before taxation', canonicalField: 'profit_before_tax', confidence: 0.97 },
  { templateType: 'T5', normalizedLabel: 'taxation', canonicalField: 'income_tax_expense', confidence: 0.95 },
  { templateType: 'T5', normalizedLabel: 'tax on profit', canonicalField: 'income_tax_expense', confidence: 0.95 },
  { templateType: 'T5', normalizedLabel: 'loss for the financial year', canonicalField: 'net_income', confidence: 0.98 },
  { templateType: 'T5', normalizedLabel: 'profit for the financial year', canonicalField: 'net_income', confidence: 0.98 },
  { templateType: 'T5', normalizedLabel: 'net loss for the year', canonicalField: 'net_income', confidence: 0.97 },
  { templateType: 'T5', normalizedLabel: 'net profit for the year', canonicalField: 'net_income', confidence: 0.97 },
  { templateType: 'T5', normalizedLabel: 'cost of sales', canonicalField: 'cost_of_sales', confidence: 0.97 },
  { templateType: 'T5', normalizedLabel: 'gross profit', canonicalField: 'gross_profit', confidence: 0.98 },

  // ── T6: UK LLP / Partnership ─────────────────────────────
  { templateType: 'T6', normalizedLabel: 'members remuneration', canonicalField: 'members_remuneration', confidence: 0.99 },
  { templateType: 'T6', normalizedLabel: 'profit for discretionary division among members', canonicalField: 'net_income', confidence: 0.98 },
  { templateType: 'T6', normalizedLabel: 'loss for the financial year available for discretionary distribution', canonicalField: 'net_income', confidence: 0.99 },
  { templateType: 'T6', normalizedLabel: 'members capital', canonicalField: 'partners_capital', confidence: 0.99 },
  { templateType: 'T6', normalizedLabel: 'average profit per member', canonicalField: 'eps_basic', confidence: 0.85 },
  { templateType: 'T6', normalizedLabel: 'average loss per member', canonicalField: 'eps_basic', confidence: 0.85 },
  { templateType: 'T6', normalizedLabel: 'turnover', canonicalField: 'total_revenue', confidence: 0.97 },
  { templateType: 'T6', normalizedLabel: 'administrative expenses', canonicalField: 'admin_expenses', confidence: 0.97 },

  // ── T7: UK GAAP — Specialist Lender / Mortgage ───────────
  { templateType: 'T7', normalizedLabel: 'interest receivable', canonicalField: 'interest_income', confidence: 0.97 },
  { templateType: 'T7', normalizedLabel: 'interest receivable and similar income', canonicalField: 'interest_income', confidence: 0.97 },
  { templateType: 'T7', normalizedLabel: 'interest payable', canonicalField: 'finance_costs', confidence: 0.97 },
  { templateType: 'T7', normalizedLabel: 'interest payable and similar charges', canonicalField: 'finance_costs', confidence: 0.97 },
  { templateType: 'T7', normalizedLabel: 'impairment losses on loans and advances', canonicalField: 'impairment_charge', confidence: 0.97 },
  { templateType: 'T7', normalizedLabel: 'profit before tax', canonicalField: 'profit_before_tax', confidence: 0.99 },
  { templateType: 'T7', normalizedLabel: 'profit for the financial year', canonicalField: 'net_income', confidence: 0.98 },

  // ── T8: IFRS Asia — Securities / Broker-Dealer ───────────
  { templateType: 'T8', normalizedLabel: 'commission and fee income', canonicalField: 'commission_income', confidence: 0.98 },
  { templateType: 'T8', normalizedLabel: 'brokerage handling fee income', canonicalField: 'commission_income', confidence: 0.97 },
  { templateType: 'T8', normalizedLabel: 'brokerage handling fees', canonicalField: 'commission_income', confidence: 0.97 },
  { templateType: 'T8', normalizedLabel: 'securities lending income', canonicalField: 'securities_lending_income', confidence: 0.97 },
  { templateType: 'T8', normalizedLabel: 'interest income', canonicalField: 'interest_income', confidence: 0.97 },
  { templateType: 'T8', normalizedLabel: 'clearing settlement funds', canonicalField: 'clearing_funds', confidence: 0.98 },
  { templateType: 'T8', normalizedLabel: 'customer margin accounts', canonicalField: 'clearing_funds', confidence: 0.90 },
  { templateType: 'T8', normalizedLabel: 'total operating revenue', canonicalField: 'total_revenue', confidence: 0.98 },
  { templateType: 'T8', normalizedLabel: 'profit before income tax', canonicalField: 'profit_before_tax', confidence: 0.98 },
  { templateType: 'T8', normalizedLabel: 'profit for the year', canonicalField: 'net_income', confidence: 0.98 },

  // ── Cross-template (null = applies to all) ───────────────
  { templateType: null, normalizedLabel: 'total assets', canonicalField: 'total_assets', confidence: 0.99 },
  { templateType: null, normalizedLabel: 'total liabilities', canonicalField: 'total_liabilities', confidence: 0.99 },
  { templateType: null, normalizedLabel: 'total equity', canonicalField: 'total_equity', confidence: 0.99 },
  { templateType: null, normalizedLabel: 'cash and cash equivalents', canonicalField: 'cash_and_equivalents', confidence: 0.99 },
  { templateType: null, normalizedLabel: 'cash and bank balances', canonicalField: 'cash_and_equivalents', confidence: 0.97 },
  { templateType: null, normalizedLabel: 'property plant and equipment', canonicalField: 'property_plant_equipment', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'trade receivables', canonicalField: 'trade_receivables', confidence: 0.97 },
  { templateType: null, normalizedLabel: 'trade and other receivables', canonicalField: 'trade_receivables', confidence: 0.97 },
  { templateType: null, normalizedLabel: 'borrowings', canonicalField: 'borrowings', confidence: 0.97 },
  { templateType: null, normalizedLabel: 'share capital', canonicalField: 'share_capital', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'retained earnings', canonicalField: 'retained_earnings', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'depreciation and amortisation', canonicalField: 'depreciation_amortization', confidence: 0.97 },
  { templateType: null, normalizedLabel: 'depreciation and amortization', canonicalField: 'depreciation_amortization', confidence: 0.97 },
  { templateType: null, normalizedLabel: 'net cash from operating activities', canonicalField: 'cash_from_operations', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'net cash used in operating activities', canonicalField: 'cash_from_operations', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'net cash from investing activities', canonicalField: 'cash_from_investing', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'net cash used in investing activities', canonicalField: 'cash_from_investing', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'net cash from financing activities', canonicalField: 'cash_from_financing', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'net cash used in financing activities', canonicalField: 'cash_from_financing', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'cash at beginning of year', canonicalField: 'cash_start', confidence: 0.97 },
  { templateType: null, normalizedLabel: 'cash at end of year', canonicalField: 'cash_end', confidence: 0.97 },
  { templateType: null, normalizedLabel: 'cash and cash equivalents at beginning of year', canonicalField: 'cash_start', confidence: 0.98 },
  { templateType: null, normalizedLabel: 'cash and cash equivalents at end of year', canonicalField: 'cash_end', confidence: 0.98 },
];

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED!);
  const db = drizzle(sql);

  console.log(`Seeding ${RULES.length} mapping rules...`);

  // Clear existing seed rules
  await db.delete(mappingRules);

  for (const rule of RULES) {
    await db.insert(mappingRules).values({
      templateType: rule.templateType,
      normalizedLabel: rule.normalizedLabel,
      canonicalField: rule.canonicalField,
      confidence: rule.confidence,
      source: 'seed',
      active: true,
    });
  }

  console.log(`Done. ${RULES.length} mapping rules seeded.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
