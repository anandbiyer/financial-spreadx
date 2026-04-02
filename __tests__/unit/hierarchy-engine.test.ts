import { describe, it, expect } from 'vitest';
import { buildStatementTree, inferMissingSubtotals } from '../../lib/mapping/hierarchy-engine';

describe('T3.14-T3.15 — Hierarchy Engine (M4)', () => {
  it('T3.14 — builds tree from T5 IS rows with subtotal validation', () => {
    const rows = [
      { canonicalField: 'total_revenue', rawLabel: 'Turnover', value: 5000, indentationLevel: 0, isSubtotal: false },
      { canonicalField: 'cost_of_sales', rawLabel: 'Cost of sales', value: -3000, indentationLevel: 1, isSubtotal: false },
      { canonicalField: 'gross_profit', rawLabel: 'Gross profit', value: 2000, indentationLevel: 0, isSubtotal: true },
    ];

    const tree = buildStatementTree(rows);
    const grossProfit = tree.rows.find(r => r.canonicalField === 'gross_profit');

    expect(grossProfit).toBeDefined();
    expect(grossProfit!.isSubtotal).toBe(true);
    expect(grossProfit!.children!.length).toBe(2);
    expect(grossProfit!.sumValid).toBe(true); // 5000 + (-3000) = 2000 ✓
  });

  it('T3.15 — infers missing total_revenue subtotal', () => {
    const rows = [
      { canonicalField: 'fee_income', rawLabel: 'Fee income', value: 100, indentationLevel: 1, isSubtotal: false, parentCanonicalField: 'total_revenue' },
      { canonicalField: 'interest_income', rawLabel: 'Interest income', value: 200, indentationLevel: 1, isSubtotal: false, parentCanonicalField: 'total_revenue' },
    ];

    const tree = buildStatementTree(rows);
    const result = inferMissingSubtotals(tree, ['total_revenue']);

    expect(result.missingSubtotals.length).toBe(1);
    expect(result.missingSubtotals[0].canonicalField).toBe('total_revenue');
    expect(result.missingSubtotals[0].inferredValue).toBe(300);
  });

  it('does not infer subtotal when only 1 child exists', () => {
    const rows = [
      { canonicalField: 'fee_income', rawLabel: 'Fee income', value: 100, indentationLevel: 1, isSubtotal: false, parentCanonicalField: 'total_revenue' },
    ];

    const tree = buildStatementTree(rows);
    const result = inferMissingSubtotals(tree, ['total_revenue']);
    expect(result.missingSubtotals.length).toBe(0);
  });

  it('detects invalid subtotal sum', () => {
    const rows = [
      { canonicalField: 'a', rawLabel: 'A', value: 100, indentationLevel: 1, isSubtotal: false },
      { canonicalField: 'b', rawLabel: 'B', value: 200, indentationLevel: 1, isSubtotal: false },
      { canonicalField: 'total', rawLabel: 'Total', value: 500, indentationLevel: 0, isSubtotal: true }, // 500 != 300
    ];

    const tree = buildStatementTree(rows);
    const total = tree.rows.find(r => r.canonicalField === 'total');
    expect(total!.sumValid).toBe(false);
  });
});
