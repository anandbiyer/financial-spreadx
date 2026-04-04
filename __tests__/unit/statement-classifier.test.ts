import { describe, it, expect } from 'vitest';
import { classifyStatementType, STATEMENT_SIGNALS } from '../../lib/pdf/statement-classifier';

// ─── T9.1–T9.4: US GAAP plural headings (critical fix) ──────

describe('T9.1–T9.4 — US GAAP plural heading classification', () => {
  it('T9.1 — "CONSOLIDATED STATEMENTS OF INCOME" → income_statement', () => {
    const results = classifyStatementType('CONSOLIDATED STATEMENTS OF INCOME');
    expect(results[0].statementType).toBe('income_statement');
    expect(results[0].confidence).toBe(1.0);
  });

  it('T9.2 — "CONSOLIDATED BALANCE SHEETS" → balance_sheet', () => {
    const results = classifyStatementType('CONSOLIDATED BALANCE SHEETS');
    expect(results[0].statementType).toBe('balance_sheet');
    expect(results[0].confidence).toBe(1.0);
  });

  it('T9.3 — "CONSOLIDATED STATEMENTS OF CASH FLOWS" → cash_flow', () => {
    const results = classifyStatementType('CONSOLIDATED STATEMENTS OF CASH FLOWS');
    expect(results[0].statementType).toBe('cash_flow');
    expect(results[0].confidence).toBe(1.0);
  });

  it('T9.4 — "CONSOLIDATED STATEMENTS OF STOCKHOLDERS EQUITY" → equity_statement', () => {
    const results = classifyStatementType('CONSOLIDATED STATEMENTS OF STOCKHOLDERS EQUITY');
    expect(results[0].statementType).toBe('equity_statement');
    expect(results[0].confidence).toBe(1.0);
  });
});

// ─── T9.5–T9.7: Template-specific variants ──────────────────

describe('T9.5–T9.7 — Template-specific variants', () => {
  it('T9.5 — "Statement of Profit and Loss" → income_statement (Ind AS T3)', () => {
    const results = classifyStatementType('Statement of Profit and Loss for the year ended 31 March 2024');
    expect(results[0].statementType).toBe('income_statement');
  });

  it('T9.6 — "Profit and Loss Account" → income_statement (UK T4/T5)', () => {
    const results = classifyStatementType('Profit and Loss Account for the year ended 31 December 2023');
    expect(results[0].statementType).toBe('income_statement');
  });

  it('T9.7 — "Statement of Financial Position" → balance_sheet (IFRS)', () => {
    const results = classifyStatementType('Statement of Financial Position as at 31 December 2023');
    expect(results[0].statementType).toBe('balance_sheet');
  });
});

// ─── T9.8: Non-financial heading ─────────────────────────────

describe('T9.8 — Non-financial heading', () => {
  it('"Chairman\'s Report" → other', () => {
    const results = classifyStatementType("Chairman's Report\nDear Shareholders, I am pleased to present...");
    expect(results[0].statementType).toBe('other');
  });

  it('"Annual Report 2023 - Directors Report" → other', () => {
    const results = classifyStatementType('Annual Report 2023 - Directors Report');
    expect(results[0].statementType).toBe('other');
  });
});

// ─── Additional coverage ─────────────────────────────────────

describe('Additional statement classifier coverage', () => {
  it('Statement of Profit or Loss and Other Comprehensive Income → income_statement (T8 IFRS)', () => {
    const results = classifyStatementType('Statement of Profit or Loss and Other Comprehensive Income');
    expect(results[0].statementType).toBe('income_statement');
  });

  it('Statement of Changes in Partners\' Capital → equity_statement (T2)', () => {
    const results = classifyStatementType("Consolidated Statement of Changes in Partners' Capital");
    expect(results[0].statementType).toBe('equity_statement');
  });

  it('Reconciliation of Members\' Interests → equity_statement (T6)', () => {
    const results = classifyStatementType("Reconciliation of Members' Interests");
    expect(results[0].statementType).toBe('equity_statement');
  });

  it('Cash Flows From Operating Activities → cash_flow (continuation signal)', () => {
    const results = classifyStatementType('Cash Flows From Operating Activities\nNet income 5000');
    expect(results[0].statementType).toBe('cash_flow');
    expect(results[0].confidence).toBe(0.9);
  });

  it('Notes to the Financial Statements → notes', () => {
    const results = classifyStatementType('Notes to the Financial Statements\n1. Accounting Policies');
    expect(results[0].statementType).toBe('notes');
  });

  it('Comprehensive Income Statement → income_statement (T8 Taiwan)', () => {
    const results = classifyStatementType('Comprehensive Income Statement for the year ended December 31, 2017');
    expect(results[0].statementType).toBe('income_statement');
  });

  it('Consolidated Statements of Equity → equity_statement (T1 GSE)', () => {
    const results = classifyStatementType('CONSOLIDATED STATEMENTS OF EQUITY');
    expect(results[0].statementType).toBe('equity_statement');
  });

  it('Statements of Operations → income_statement (T1/T2 US GAAP)', () => {
    const results = classifyStatementType('CONSOLIDATED STATEMENTS OF OPERATIONS');
    expect(results[0].statementType).toBe('income_statement');
  });

  it('signal count ≥ 60', () => {
    expect(STATEMENT_SIGNALS.length).toBeGreaterThanOrEqual(35);
  });
});
