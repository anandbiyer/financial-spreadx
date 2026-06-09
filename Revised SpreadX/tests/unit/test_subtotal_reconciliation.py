"""Unit tests for spreading.subtotal_reconciliation — the document-structure
cross-foot of extracted subtotals against their component leaves. Pure synthetic
dicts, no DB/LLM (mirrors test_balance_checks.py style).
"""

from __future__ import annotations

from spreading.subtotal_reconciliation import reconcile_subtotals

_COA = {
    "BS-001": {"coa_id": "BS-001", "line_item_name": "Cash"},
    "BS-004": {"coa_id": "BS-004", "line_item_name": "Receivables"},
    "BS-037": {"coa_id": "BS-037", "line_item_name": "Accumulated Depreciation"},
}


def _row(label, val, level, sub=False, st="balance_sheet", year="2024"):
    return {"raw_label": label, "raw_values": {year: val}, "statement_type": st,
            "indentation_level": level, "is_subtotal": sub, "section_path": []}


def _mapped(coa_id="BS-001", value_spread=None):
    return {"status": "mapped", "coa_id": coa_id, "confidence": 0.9,
            "source": "claude", "value_spread": value_spread or {}, "sign_applied": False}


def _only(report):
    assert len(report["subtotals"]) == 1
    return report["subtotals"][0]


def test_simple_foot_passes():
    rows = [_row("Cash", 60, 1), _row("Receivables", 40, 1),
            _row("Total current assets", 100, 0, sub=True)]
    out = {("cash", "balance_sheet"): _mapped("BS-001"),
           ("receivables", "balance_sheet"): _mapped("BS-004")}
    r = _only(reconcile_subtotals(rows, out, _COA))
    assert r["pass"] is True
    assert r["n_components"] == 2
    assert r["computed"]["2024"] == 100
    assert r["has_unmapped_component"] is False
    assert r["grouping_confidence"] == "high"  # mixed indentation


def test_failing_foot_detected():
    rows = [_row("Cash", 60, 1), _row("Receivables", 30, 1),
            _row("Total current assets", 100, 0, sub=True)]  # 90 != 100
    out = {("cash", "balance_sheet"): _mapped(), ("receivables", "balance_sheet"): _mapped()}
    r = _only(reconcile_subtotals(rows, out, _COA))
    assert r["pass"] is False
    assert r["difference"]["2024"] == -10


def test_nested_stack_no_double_count():
    # Total inventory (deeper subtotal) rolls into Total current assets (outer);
    # its leaves must NOT be re-counted at the outer level.
    rows = [
        _row("Raw materials", 30, 2), _row("WIP", 20, 2),
        _row("Total inventory", 50, 1, sub=True),
        _row("Cash", 70, 1),
        _row("Total current assets", 120, 0, sub=True),
    ]
    out = {k: _mapped() for k in [("raw materials", "balance_sheet"),
                                  ("wip", "balance_sheet"), ("cash", "balance_sheet")]}
    rep = reconcile_subtotals(rows, out, _COA)["subtotals"]
    inv = next(s for s in rep if s["raw_label"] == "Total inventory")
    tca = next(s for s in rep if s["raw_label"] == "Total current assets")
    assert inv["computed"]["2024"] == 50 and inv["pass"] is True
    assert tca["computed"]["2024"] == 120 and tca["pass"] is True  # 70 + 50, not 170


def test_raw_sign_footing_with_negative_creditors():
    # UK net-assets: creditors printed negative reduce the subtotal.
    rows = [_row("Current assets", 100, 1), _row("Creditors within one year", -30, 1),
            _row("Net current assets", 70, 0, sub=True)]
    out = {("current assets", "balance_sheet"): _mapped(),
           ("creditors within one year", "balance_sheet"): _mapped()}
    r = _only(reconcile_subtotals(rows, out, _COA))
    assert r["computed"]["2024"] == 70
    assert r["pass"] is True


def test_unmapped_component_flagged():
    rows = [_row("Cash", 60, 1), _row("Mystery line", 40, 1),
            _row("Total current assets", 100, 0, sub=True)]
    out = {("cash", "balance_sheet"): _mapped()}  # "Mystery line" absent/unmapped
    r = _only(reconcile_subtotals(rows, out, _COA))
    assert r["has_unmapped_component"] is True
    statuses = {c["raw_label"]: c["status"] for c in r["components"]}
    assert statuses["Mystery line"] in ("unmapped", "absent")
    assert statuses["Cash"] == "mapped"


def test_sign_flip_flagged():
    # raw +50, but mapped value_spread is -50 (contra applied) -> flip.
    rows = [_row("Accumulated depreciation", 50, 1),
            _row("Net block", 50, 0, sub=True)]
    out = {("accumulated depreciation", "balance_sheet"):
           _mapped("BS-037", {"2024": -50})}
    r = _only(reconcile_subtotals(rows, out, _COA))
    comp = r["components"][0]
    assert comp["sign_flipped"] is True


def test_flat_layout_flags_low_confidence():
    rows = [_row("A", 10, 0), _row("B", 20, 0), _row("Total", 30, 0, sub=True)]
    out = {("a", "balance_sheet"): _mapped(), ("b", "balance_sheet"): _mapped()}
    r = _only(reconcile_subtotals(rows, out, _COA))
    assert r["grouping_confidence"] == "low"
    assert r["pass"] is True  # heuristic still foots sequential leaves


def test_llm_grouper_overrides_on_flat_layout():
    rows = [_row("A", 10, 0), _row("B", 20, 0), _row("Noise", 999, 0),
            _row("Total", 30, 0, sub=True)]
    out = {k: _mapped() for k in [("a", "balance_sheet"), ("b", "balance_sheet"),
                                  ("noise", "balance_sheet")]}
    # LLM says only rows 0 and 1 feed the subtotal at index 3 (exclude "Noise").
    r = _only(reconcile_subtotals(rows, out, _COA, llm_grouper=lambda srows: {3: [0, 1]}))
    assert r["grouping_confidence"] == "llm"
    assert r["computed"]["2024"] == 30
    assert r["pass"] is True


def test_tolerance_near_zero_floor():
    # subtotal of 0 with components 0.4 and -0.4 -> diff 0, passes via floor.
    rows = [_row("A", 0.4, 1), _row("B", -0.4, 1), _row("Net", 0, 0, sub=True)]
    out = {("a", "balance_sheet"): _mapped(), ("b", "balance_sheet"): _mapped()}
    r = _only(reconcile_subtotals(rows, out, _COA))
    assert r["pass"] is True


def test_uk_net_assets_chain_foots_via_absorption():
    # The exact failure mode found on Aspect: a stack of same-level subtotals
    # where each rolls up the previous sibling. Foot-driven absorption must close
    # the chain WITHOUT making independent siblings (Fixed vs Current) absorb each
    # other.
    rows = [
        _row("Tangible assets", 200, 1),
        _row("Fixed assets", 200, 0, sub=True),          # idx1
        _row("Debtors", 150, 1), _row("Cash", 50, 1),
        _row("Current assets", 200, 0, sub=True),        # idx4
        _row("Creditors < 1yr", -30, 1),
        _row("Net current assets", 170, 0, sub=True),    # idx6 = Current - 30
        _row("Total assets less current liabilities", 370, 0, sub=True),  # idx7 = Fixed + NCA
        _row("Creditors > 1yr", -70, 1),
        _row("Net assets", 300, 0, sub=True),            # idx9 = TALCL - 70
    ]
    out = {(_row(lbl, 0, 0)["raw_label"].lower(), "balance_sheet"): _mapped()
           for lbl in ["Tangible assets", "Debtors", "Cash", "Creditors < 1yr", "Creditors > 1yr"]}
    rep = {s["raw_label"]: s for s in reconcile_subtotals(rows, out, _COA)["subtotals"]}
    # every subtotal in the chain foots
    for lbl in ["Fixed assets", "Current assets", "Net current assets",
                "Total assets less current liabilities", "Net assets"]:
        assert rep[lbl]["pass"] is True, lbl
    # independent leaf-footed siblings used plain leaves; chained ones absorbed
    assert rep["Current assets"]["grouping_method"] == "leaves"
    assert rep["Net current assets"]["grouping_method"] == "absorbed"
    assert rep["Total assets less current liabilities"]["grouping_method"] == "absorbed"
    # no double-count: Total assets less CL == Fixed + Net current assets, not more
    assert rep["Total assets less current liabilities"]["computed"]["2024"] == 370


def test_cash_flow_excluded():
    rows = [_row("Op cash", 10, 1, st="cash_flow"),
            _row("Total cash flow", 10, 0, sub=True, st="cash_flow")]
    rep = reconcile_subtotals(rows, {}, _COA)
    assert rep["subtotals"] == []


def test_equity_statement_excluded():
    rows = [_row("Dividends paid", 10, 1, st="equity_statement"),
            _row("Closing equity", 10, 0, sub=True, st="equity_statement")]
    rep = reconcile_subtotals(rows, {}, _COA)
    assert rep["subtotals"] == []
