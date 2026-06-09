"""Streamlit presentation for Stage 11 — intentionally minimal and logic-free.

Every function is a thin caller of `spreading.service` / `db.queries`, so this
module is cheap to discard when the app moves to React (the service layer is
reused unchanged). Keep business logic OUT of here.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from db.queries import count_coa_reference, skip_unmapped
from spreading import service

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def ensure_coa_seeded() -> None:
    """Seed the CoA reference on first use (idempotent)."""
    if count_coa_reference() == 0:
        from db.seed_coa import seed_coa_reference

        n = seed_coa_reference()
        st.toast(f"Seeded {n} CoA entries into coa_reference")


def _coa_options(statement: str | None = None):
    rows = service.get_coa_reference(statement)
    labels = [f'{r["coa_id"]} — {r["line_item_name"]}' for r in rows]
    mapping = {lbl: r["coa_id"] for lbl, r in zip(labels, rows)}
    return labels, mapping


def _rows_to_df(rows: list[dict], years: list[str]) -> pd.DataFrame:
    records = []
    for r in rows:
        rec = {
            "CoA ID": r["coa_id"],
            "Line Item": r["line_item_name"],
            "Raw Label": r.get("raw_label", ""),
        }
        for y in years:
            rec[y] = (r.get("value_spread") or {}).get(y)
        rec["Confidence"] = r.get("confidence")
        rec["Source"] = r.get("mapping_source", "")
        records.append(rec)
    return pd.DataFrame(records)


# ── Spreading entry point ─────────────────────────────────────────────────────

def render_spreading_section(result, template: str, filename: str) -> None:
    st.divider()
    st.subheader("Stage 11 — COA Mapping & Spreading")
    st.caption(
        "Maps each extracted row to the standardised Chart of Accounts "
        "(checks the learning store first, then the LLM), runs balance checks, "
        "and queues low-confidence rows for resolution."
    )

    if st.button("Run Spreading on extracted rows", type="primary"):
        if not result.extracted_rows:
            st.warning("No extracted rows to spread.")
        else:
            ensure_coa_seeded()
            from spreading.coa_mapper import run_coa_mapping_stage
            from llm.usage import UsageMeter, reset_active_meter, set_active_meter
            from db.queries import update_document

            scopes = [r.get("statement_scope", "unknown") for r in result.extracted_rows]
            scope = max(set(scopes), key=scopes.count) if scopes else "unknown"
            meter = UsageMeter()
            meter.set_stage("spreading")
            token = set_active_meter(meter)
            with st.spinner("Mapping rows to CoA (learning store first, then LLM)..."):
                spread = run_coa_mapping_stage(
                    result.extracted_rows, template_type=template,
                    scope=scope, filename=filename,
                )
            reset_active_meter(token)
            usage = meter.snapshot()
            if spread.get("document_id") and spread["document_id"] != "ephemeral":
                update_document(spread["document_id"], usage_result=usage)
            st.session_state["spread_doc_id"] = spread["document_id"]
            c = spread["counts"]
            st.success(
                f"Spread complete: {c['mapped']} mapped "
                f"({c['learned']} learned, {c['claude']} via LLM), "
                f"{c['unmapped']} unmapped, {c['equity_unmapped']} equity (not spread), "
                f"{c['skipped_no_coa']} skipped (no CoA target)."
            )
            ut = usage.get("total", {})
            if ut.get("calls"):
                st.caption(
                    f"Spreading LLM usage: {ut['input_tokens']:,} in / "
                    f"{ut['output_tokens']:,} out over {ut['calls']} calls "
                    f"— est. ${ut['cost_usd']:.4f} (list price)."
                )

    doc_id = st.session_state.get("spread_doc_id")
    if doc_id:
        render_spread_review(doc_id, filename)
        render_unmapped_resolver(doc_id)


# ── Spread Review screen ──────────────────────────────────────────────────────

def render_spread_review(doc_id: str, filename: str) -> None:
    st.markdown("#### Spread Review")
    spread = service.get_spread(doc_id)
    bc = spread.get("balance_check") or {}

    if spread["unmapped_count"] > 0:
        st.warning(
            f"{spread['unmapped_count']} item(s) unmapped — spread output is "
            f"incomplete. Resolve them in the Unmapped Resolver below."
        )
    if bc.get("applicable"):
        if bc.get("isBalanced"):
            st.success(
                f"✓ Balanced (year {bc.get('primary_year')}): "
                f"Assets {bc.get('totalAssets', 0):,.0f} = "
                f"Liabilities + Equity {bc.get('totalLiabilitiesAndEquity', 0):,.0f}"
            )
        else:
            st.error(
                f"✗ Imbalanced (year {bc.get('primary_year')}): "
                f"difference {bc.get('difference', 0):,.0f}"
            )

    out = service.get_spread_output(doc_id)
    years = out["years"]
    show_all = st.checkbox("Show all CoA entries (including unmapped blanks)", value=False)

    tab_bs, tab_pl = st.tabs(["Balance Sheet", "P&L"])
    for tab, key in ((tab_bs, "balance_sheet"), (tab_pl, "pl")):
        with tab:
            rows = out[key]
            if not show_all:
                rows = [r for r in rows if r["mapped"]]
            if rows:
                st.dataframe(_rows_to_df(rows, years), use_container_width=True, height=420)
            else:
                st.info("No mapped rows for this statement.")

    st.download_button(
        "Download Spread XLSX",
        data=service.export_spread_xlsx(doc_id),
        file_name=f"{filename.replace('.pdf', '')}_spread.xlsx",
        mime=_XLSX_MIME,
        type="primary",
    )

    with st.expander("Override a mapping"):
        mappings = spread["coa_mappings"]
        if not mappings:
            st.caption("No mappings to override yet.")
        else:
            labels = [
                f'{m["coa_id"]} ← {m["raw_label"][:40]} ({m["mapping_source"]})'
                for m in mappings
            ]
            sel = st.selectbox("Mapping", labels, key="ov_sel")
            m = mappings[labels.index(sel)]
            opts, optmap = _coa_options()
            new = st.selectbox("New CoA entry", opts, key="ov_new")
            rationale = st.text_area("Rationale", value="Manual override.", key="ov_rat")
            if st.button("Apply override"):
                service.override_mapping(m["id"], optmap[new], rationale)
                st.success("Override applied and recorded as learning.")
                st.rerun()


# ── Unmapped Resolver screen ──────────────────────────────────────────────────

def render_unmapped_resolver(doc_id: str) -> None:
    st.markdown("#### Unmapped Resolver")
    pending = service.get_unmapped(doc_id)
    if not pending:
        st.info("No pending unmapped items. ")
        return

    st.caption(f"{len(pending)} item(s) remaining")
    labels = [f'{u["raw_label"][:50]} ({u["statement_type"]})' for u in pending]
    idx = st.selectbox("Pending item", range(len(pending)),
                       format_func=lambda i: labels[i], key="um_sel")
    item = pending[idx]

    st.write(f"**Raw label:** {item['raw_label']}")
    st.write(f"**Statement:** {item['statement_type']}  |  **Values:** {item['value_spread']}")
    if item.get("ambiguity_note"):
        st.caption(f"Why it wasn't auto-mapped: {item['ambiguity_note']}")

    suggestions = item.get("claude_suggestions") or []
    sugg_labels = [
        f'{s["coa_id"]} — {s.get("line_item_name", "")} (score {s.get("score", 0)})'
        for s in suggestions
    ]
    choice: str | None = None
    default_rationale = "Analyst mapping."
    search_label = "Search the full CoA…"

    if sugg_labels:
        pick = st.radio("Suggested CoA entries", sugg_labels + [search_label], key="um_radio")
        if pick != search_label:
            j = sugg_labels.index(pick)
            choice = suggestions[j]["coa_id"]
            default_rationale = suggestions[j].get("reason", "") or default_rationale
            if suggestions[j].get("definition"):
                st.caption(suggestions[j]["definition"][:300])

    if choice is None:
        statement = "Balance Sheet" if item["statement_type"] == "balance_sheet" else "P&L"
        opts, optmap = _coa_options(statement)
        selc = st.selectbox("Select CoA entry", opts, key="um_full")
        choice = optmap[selc]

    rationale = st.text_area("Rationale (stored as learning)", value=default_rationale, key="um_rat")
    col1, col2 = st.columns(2)
    if col1.button("Confirm mapping", type="primary"):
        service.resolve_unmapped(item["id"], choice, rationale)
        st.success("Resolved — mapping + learning recorded.")
        st.rerun()
    if col2.button("Skip for now"):
        skip_unmapped(item["id"])
        st.rerun()


# ── Learning Store (admin) ────────────────────────────────────────────────────

def render_learning_store() -> None:
    with st.sidebar.expander("Learning Store (admin)"):
        learned = service.list_learned_mappings()
        st.caption(f"{len(learned)} learned mapping(s)")
        if learned:
            df = pd.DataFrame([
                {
                    "field": l["canonical_field"],
                    "coa": l["coa_id"],
                    "tmpl": l["template_type"],
                    "applied": l["times_applied"],
                    "overridden": l["times_overridden"],
                    "conf": l["learned_confidence"],
                }
                for l in learned
            ])
            st.dataframe(df, use_container_width=True, height=180)
            labels = [f'{l["canonical_field"]} -> {l["coa_id"]}' for l in learned]
            d = st.selectbox("Delete a learned mapping", labels, key="del_sel")
            if st.button("Delete learned mapping"):
                service.delete_learned_mapping(learned[labels.index(d)]["id"])
                st.rerun()
