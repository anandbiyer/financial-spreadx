/**
 * M5 — Formula Validator
 *
 * 12 accounting identity checks (V01–V12).
 * Each returns 'passed', 'failed', or 'skipped'.
 */

export type ValidationStatus = 'passed' | 'failed' | 'skipped';

export interface ValidationCheck {
  checkId: string;
  name: string;
  formula: string;
  tolerance: number;
  templateFilter?: string[];  // only run for these templates (undefined = all)
  status: ValidationStatus;
  lhs?: number;
  rhs?: number;
  diffPct?: number;
  reason?: string;
}

export type CanonicalMap = Record<string, number | null>;

function get(map: CanonicalMap, field: string): number | null {
  return map[field] ?? null;
}

function checkIdentity(
  checkId: string,
  name: string,
  formula: string,
  tolerance: number,
  lhs: number | null,
  rhs: number | null,
  templateFilter?: string[],
): ValidationCheck {
  if (lhs === null || rhs === null) {
    return { checkId, name, formula, tolerance, templateFilter, status: 'skipped', reason: 'Missing required fields' };
  }

  const diff = Math.abs(lhs - rhs);
  const base = Math.max(Math.abs(lhs), Math.abs(rhs), 1); // avoid division by zero
  const diffPct = diff / base;

  const status: ValidationStatus = diffPct <= tolerance ? 'passed' : 'failed';
  return { checkId, name, formula, tolerance, templateFilter, status, lhs, rhs, diffPct };
}

/**
 * Run all 12 validation checks against a canonical field map.
 */
export function runAllValidations(
  map: CanonicalMap,
  templateType: string,
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // V01: total_assets = total_liabilities + total_equity
  const v01Rhs = (get(map, 'total_liabilities') ?? 0) + (get(map, 'total_equity') ?? 0);
  checks.push(checkIdentity(
    'V01', 'Balance Sheet Identity',
    'total_assets = total_liabilities + total_equity', 0.001,
    get(map, 'total_assets'),
    get(map, 'total_liabilities') !== null && get(map, 'total_equity') !== null ? v01Rhs : null,
  ));

  // V02: profit_before_tax = total_income - total_expenses
  const v02Rhs = (get(map, 'total_income') ?? 0) - (get(map, 'total_expenses') ?? 0);
  checks.push(checkIdentity(
    'V02', 'PBT = Income - Expenses',
    'profit_before_tax = total_income - total_expenses', 0.005,
    get(map, 'profit_before_tax'),
    get(map, 'total_income') !== null && get(map, 'total_expenses') !== null ? v02Rhs : null,
  ));

  // V03: net_income = profit_before_tax - income_tax_expense
  const v03Rhs = (get(map, 'profit_before_tax') ?? 0) - (get(map, 'income_tax_expense') ?? 0);
  checks.push(checkIdentity(
    'V03', 'Net Income = PBT - Tax',
    'net_income = profit_before_tax - income_tax_expense', 0.001,
    get(map, 'net_income'),
    get(map, 'profit_before_tax') !== null && get(map, 'income_tax_expense') !== null ? v03Rhs : null,
  ));

  // V04: total_comprehensive_income = net_income + other_comprehensive_income
  const v04Rhs = (get(map, 'net_income') ?? 0) + (get(map, 'other_comprehensive_income') ?? 0);
  checks.push(checkIdentity(
    'V04', 'Total Comprehensive Income',
    'total_comprehensive_income = net_income + other_comprehensive_income', 0.001,
    get(map, 'total_comprehensive_income'),
    get(map, 'net_income') !== null && get(map, 'other_comprehensive_income') !== null ? v04Rhs : null,
  ));

  // V05: cash_end = cash_start + net_operating + net_investing + net_financing
  const v05Rhs =
    (get(map, 'cash_start') ?? 0) +
    (get(map, 'cash_from_operations') ?? 0) +
    (get(map, 'cash_from_investing') ?? 0) +
    (get(map, 'cash_from_financing') ?? 0);
  const v05HasFields = ['cash_start', 'cash_from_operations', 'cash_from_investing', 'cash_from_financing']
    .some((f) => get(map, f) !== null);
  checks.push(checkIdentity(
    'V05', 'Cash Reconciliation',
    'cash_end = cash_start + operating + investing + financing', 0.005,
    get(map, 'cash_end'),
    v05HasFields ? v05Rhs : null,
  ));

  // V06: revenue components sum to total_revenue
  const revenueComponents = ['interest_income', 'fee_income', 'commission_income', 'other_operating_income', 'capital_allocation_income', 'carried_interest', 'securities_lending_income'];
  const v06Sum = revenueComponents.reduce((s, f) => s + (get(map, f) ?? 0), 0);
  const v06HasComponents = revenueComponents.some((f) => get(map, f) !== null);
  checks.push(checkIdentity(
    'V06', 'Revenue Components Sum',
    'revenue components sum to total_revenue', 0.005,
    get(map, 'total_revenue'),
    v06HasComponents ? v06Sum : null,
  ));

  // V07: expense components sum to total_expenses
  const expenseComponents = ['cost_of_sales', 'admin_expenses', 'finance_costs', 'impairment_charge', 'employee_benefits_expense', 'depreciation_amortization', 'members_remuneration'];
  const v07Sum = expenseComponents.reduce((s, f) => s + (get(map, f) ?? 0), 0);
  const v07HasComponents = expenseComponents.some((f) => get(map, f) !== null);
  checks.push(checkIdentity(
    'V07', 'Expense Components Sum',
    'expense components sum to total_expenses', 0.005,
    get(map, 'total_expenses'),
    v07HasComponents ? v07Sum : null,
  ));

  // V08: current_assets + non_current_assets = total_assets
  const v08Rhs = (get(map, 'current_assets') ?? 0) + (get(map, 'non_current_assets') ?? 0);
  checks.push(checkIdentity(
    'V08', 'Asset Composition',
    'current_assets + non_current_assets = total_assets', 0.001,
    get(map, 'total_assets'),
    get(map, 'current_assets') !== null && get(map, 'non_current_assets') !== null ? v08Rhs : null,
  ));

  // V09: opening_equity + comprehensive_income + dividends = closing_equity
  const v09Rhs =
    (get(map, 'opening_equity') ?? 0) +
    (get(map, 'total_comprehensive_income') ?? get(map, 'net_income') ?? 0) -
    Math.abs(get(map, 'dividends_paid') ?? 0);
  checks.push(checkIdentity(
    'V09', 'Equity Reconciliation',
    'opening_equity + comprehensive_income - dividends = closing_equity', 0.005,
    get(map, 'closing_equity'),
    get(map, 'opening_equity') !== null ? v09Rhs : null,
  ));

  // V10: EPS = net_income / weighted_avg_shares (T1/T3 only)
  if (['T1', 'T3', 'T4'].includes(templateType)) {
    const netIncome = get(map, 'net_income');
    const shares = get(map, 'weighted_avg_shares');
    const eps = get(map, 'eps_basic');
    let v10Rhs: number | null = null;
    if (netIncome !== null && shares !== null && shares !== 0) {
      v10Rhs = netIncome / shares;
    }
    checks.push(checkIdentity(
      'V10', 'EPS Check',
      'eps_basic = net_income / weighted_avg_shares', 0.01,
      eps, v10Rhs, ['T1', 'T3', 'T4'],
    ));
  } else {
    checks.push({ checkId: 'V10', name: 'EPS Check', formula: 'eps_basic = net_income / weighted_avg_shares', tolerance: 0.01, templateFilter: ['T1', 'T3', 'T4'], status: 'skipped', reason: `Not applicable for template ${templateType}` });
  }

  // V11: members_capital balances reconcile (T6 only)
  if (templateType === 'T6') {
    checks.push(checkIdentity(
      'V11', "Members' Capital Reconciliation",
      'members_capital balances reconcile', 0.001,
      get(map, 'partners_capital'),
      get(map, 'total_equity'), ['T6'],
    ));
  } else {
    checks.push({ checkId: 'V11', name: "Members' Capital Reconciliation", formula: 'members_capital balances reconcile', tolerance: 0.001, templateFilter: ['T6'], status: 'skipped', reason: `Not applicable for template ${templateType}` });
  }

  // V12: YoY comparative match (placeholder — requires prior document)
  checks.push({
    checkId: 'V12', name: 'YoY Comparative Match',
    formula: 'prior year comparative matches prior document', tolerance: 0,
    status: 'skipped', reason: 'Requires prior year document for comparison',
  });

  // V13: All four statement types present (severity: warn)
  const presentTypes = new Set(Object.values(map).map((v: any) => v?.statementType).filter(Boolean));
  const requiredTypes = ['balance_sheet', 'income_statement', 'cash_flow', 'equity_statement'];
  const missingTypes = requiredTypes.filter(t => !presentTypes.has(t));
  checks.push({
    checkId: 'V13',
    name: 'All four statement types present',
    formula: 'BS ∩ IS ∩ CF ∩ EQ = 4',
    tolerance: 0,
    status: missingTypes.length === 0 ? 'passed' : 'failed',
    lhs: requiredTypes.length - missingTypes.length,
    rhs: requiredTypes.length,
    diffPct: missingTypes.length > 0 ? (missingTypes.length / requiredTypes.length) * 100 : 0,
    reason: missingTypes.length > 0 ? `Missing: ${missingTypes.join(', ')}` : undefined,
  });

  return checks;
}
