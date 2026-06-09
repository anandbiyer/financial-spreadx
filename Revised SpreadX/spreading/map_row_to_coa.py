"""Claude-based COA mapping for a single row (Section 05 + the 9-step Word spec).

Implements the mapping process from `Prompt for CoA Mapping V1.docx`:
CoA comprehension → statement gating → economic-substance analysis →
4-dimension candidate evaluation → best match → ambiguity penalisation →
rationale → (balance/subtotal checks happen later, across all rows).

Output is validated against a pydantic schema; on parse/validation failure the
call is retried once, then a low-confidence empty result is returned (which
routes the row to the unmapped queue).
"""

from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field, ValidationError

from config import logger
from llm import get_llm_client

# pipeline statement_type → CoA `statement` value. cash_flow and equity_statement
# have no CoA target — the standardised CoA covers Balance Sheet + P&L component
# lines only (no Statement-of-Changes-in-Equity / movement home).
_STMT_TO_COA = {
    "balance_sheet": "Balance Sheet",
    "income_statement": "P&L",
    "equity_statement": None,
    "cash_flow": None,
}


def statement_to_coa_statement(statement_type: str) -> str | None:
    return _STMT_TO_COA.get(statement_type)


class Candidate(BaseModel):
    coa_id: str
    score: float = 0.0
    reason: str = ""


class CoaMappingResult(BaseModel):
    coa_id: str
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = ""
    ambiguities: list[str] = Field(default_factory=list)
    candidates: list[Candidate] = Field(default_factory=list)


# Sourced from Updated_spreading_prompt.docx (2026-06-08). Note R12 introduces a
# deliberate "UNMAPPED" coa_id sentinel — handled explicitly in map_row_to_coa /
# map_rows_batch so it routes to the unmapped queue (not overridden by a candidate).
_SYSTEM_PROMPT = """You are an expert Chartered Accountant, IFRS specialist, Banking Finance SME, \
Financial Spreading Expert, and Chart of Accounts (CoA) Mapping Expert. You map a company's \
financial statement line items into a predefined standardized CoA used by a bank for credit \
evaluation, financial ratio generation, and risk scoring. Accuracy, explainability, consistency, \
and auditability are critical. Treat all companies as generic corporates (industry-agnostic).
Cash Flow Statement items are filtered upstream — never mapped.
---
CORE PRINCIPLES:
- CoA "Definition" is the PRIMARY signal.
- CoA "Spreading Guidance" is the SECONDARY signal.
- CoA "Name" is only a label — never match on name alone.
- Always evaluate economic substance (IFRS/GAAP meaning), not text similarity.
- Preserve accounting integrity and reporting classification.
- UNMAPPED is strongly discouraged — always map to closest CoA where logically possible.
---
Perform these steps for the line item, sequentially:
1. Understand the definition and spreading guidance of every candidate CoA entry.
   The DEFINITION takes precedence over the title.
2. Statement gating:
   - Balance Sheet item → Balance Sheet CoA only
   - P&L item → P&L CoA only
   Cross-statement mapping is a HARD ERROR
3. Analyse the company line item based on:
   - economic substance
   - accounting treatment
   - recognition basis
   - measurement basis
   - IFRS/GAAP meaning
   NOT based on label text alone
4. Compare against ALL candidates using:
   - semantic similarity
   - accounting similarity
   - reporting classification
   - regulatory alignment
5. Select the BEST match where:
   - accounting meaning matches
   - reporting presentation matches
   - classification (BS / P&L) matches
6. Confidence scoring rules:
   - Level 1: Exact match (0.95–1.00)
   - Level 2: Semantic equivalent (0.80–0.95)
   - Level 3: Conceptual mapping (0.60–0.85)
   - Level 4: Aggregated / residual (0.40–0.65)
7. Penalise confidence if:
   - aggregated line items
   - multiple viable CoAs
   - missing disclosures / notes
   - unclear current vs non-current classification
   - industry-specific terminology ambiguity
---
CRITICAL ACCOUNTING RULES:
R1. SECTION INTEGRITY
- BS items → BS codes only
- P&L items → P&L codes only
R2. SPECIFICITY WINS
- Always prefer most specific CoA over aggregated or parent code
R3. CURRENT / NON-CURRENT
- Section header is authoritative
- Never mix classifications
R4. LOANS / BORROWINGS
- Current → short-term debt
- Non-current → long-term debt
R5. RECEIVABLES
- Trade → trade receivable
- Other / accrued income → other receivable
R6. PAYABLES / PROVISIONS
- Trade → trade payable
- Current provisions → operating accruals
- Non-current provisions → long-term liabilities
R7. IFRS 16 LEASE RULE
- Lease liabilities (unspecified) → Operating lease
- Finance lease only if explicitly stated
R8. PP&E RULE
- Single PPE line (no accumulated depreciation) → Net PPE
- Gross + Accum Depreciation → map separately
R9. P&L CLASSIFICATION
- Revenue → revenue
- Selling/Marketing → Selling Expense
- Admin/Office → G&A or Other OpEx
R10. AGGREGATED ITEMS
- Map to best logical CoA
- Reduce confidence
- Explain in rationale
R11. NOTES USAGE
- If note details exist, use them for correct classification
R12. CONTROLLED UNMAPPED RULE
- If and ONLY IF no logical accounting relationship exists with ANY CoA definition,
  return:
  "coa_id": "UNMAPPED"
- This must be extremely rare
- Provide strong justification in rationale
R13. STRUCTURAL INTEGRITY
- Never mix assets vs liabilities vs equity
- Maintain accounting boundaries
R14. SOURCE INTEGRITY
- Mapping must reflect actual financial statement meaning
- Do not distort accounting nature
---
OUTPUT FORMAT (STRICT JSON ONLY):
{
  "coa_id": "BS-001 or PL-001 style id from the candidates OR UNMAPPED",
  "confidence": 0.0,
  "rationale": "Detailed explanation (>=50 characters explaining accounting logic)",
  "ambiguities": ["Explain ambiguity if any"],
  "candidates": [
    {"coa_id": "...", "score": 0.0, "reason": "Why this is plausible or rejected"},
    {"coa_id": "...", "score": 0.0, "reason": "..."},
    {"coa_id": "...", "score": 0.0, "reason": "..."}
  ]
}
---
ADDITIONAL REQUIREMENTS:
- Always return TOP 3 most plausible candidates (best first)
- Confidence must reflect real certainty (no inflation)
- Explicitly explain ambiguity when present
- Use UNMAPPED ONLY as last resort (rare cases only)"""


# Batch variant: reuse the full single-item prompt above (all rules R1–R14 +
# confidence bands apply per item) and append a batch I/O contract that OVERRIDES
# its single-object OUTPUT FORMAT with a results array. Built by appending (not
# str.replace on internal text) so it stays correct if the prompt wording changes.
_BATCH_SYSTEM_PROMPT = _SYSTEM_PROMPT + """
---
BATCH MODE — MULTIPLE LINE ITEMS:
You will be given MULTIPLE line items at once, each tagged with a row_index in [brackets]. \
Apply ALL the steps, confidence rules, and accounting rules (R1–R14) above to EACH item \
INDEPENDENTLY. Do not merge, drop, or invent rows.

This OVERRIDES the single-item OUTPUT FORMAT above. Return ONLY valid JSON (no markdown, no \
commentary) matching exactly:
{
  "results": [
    {
      "row_index": 0,
      "coa_id": "BS-001 or PL-001 style id from the candidates OR UNMAPPED",
      "confidence": 0.0,
      "rationale": "Detailed explanation (>=50 characters explaining accounting logic)",
      "ambiguities": ["Explain ambiguity if any"],
      "candidates": [{"coa_id": "...", "score": 0.0, "reason": "..."}]
    }
  ]
}
Return EXACTLY one result object per input row_index, in any order, each with the top-3 most \
plausible candidates (best first). Do not merge, drop, or invent rows."""


def _build_user_prompt(row: dict, candidates: list[dict], template_type: str,
                       coa_statement: str) -> str:
    cand_lines = []
    for c in candidates:
        cand_lines.append(
            f"{c['coa_id']}: {c['line_item_name']}\n"
            f"  Definition: {c.get('definition', '')}\n"
            f"  Spreading guidance: {c.get('spreading_guidance', '')}"
        )
    candidates_block = "\n".join(cand_lines)
    return (
        f"Map the following financial line item to the standardised {coa_statement} CoA.\n\n"
        f"COMPANY LINE ITEM:\n"
        f"- Raw label: \"{row.get('raw_label', '')}\"\n"
        f"- Statement type: {row.get('statement_type', '')}\n"
        f"- Statement scope: {row.get('statement_scope', 'unknown')}\n"
        f"- Template type: {template_type}\n"
        f"- Section path: {row.get('section_path', [])}\n"
        f"- Is subtotal: {row.get('is_subtotal', False)}\n"
        f"- Values: {json.dumps(row.get('raw_values', {}))}\n\n"
        f"TARGET COA ENTRIES ({len(candidates)} candidates, {coa_statement} only):\n"
        f"{candidates_block}\n\n"
        f"MAPPING RULES:\n"
        f"1. This is a {row.get('statement_type', '')} item — map to {coa_statement} CoA entries only.\n"
        f"2. Focus on economic substance, not label similarity.\n"
        f"3. Penalise confidence if multiple CoA entries are plausible.\n"
        f"4. If the item is aggregated (covers multiple CoA entries), map to the most appropriate parent.\n"
        f"5. Provide the top-3 candidates with individual scores.\n\n"
        f"Return: best coa_id, confidence (0-1), detailed rationale, ambiguities list, top-3 candidates."
    )


def _candidates_block(candidates: list[dict]) -> str:
    return "\n".join(
        f"{c['coa_id']}: {c['line_item_name']}\n"
        f"  Definition: {c.get('definition', '')}\n"
        f"  Spreading guidance: {c.get('spreading_guidance', '')}"
        for c in candidates
    )


def _build_batch_user_prompt(rows: list[dict], candidates: list[dict],
                             template_type: str, coa_statement: str) -> str:
    row_lines = []
    for idx, row in enumerate(rows):
        row_lines.append(
            f"[{idx}] raw_label: \"{row.get('raw_label', '')}\" | "
            f"section_path: {row.get('section_path', [])} | "
            f"is_subtotal: {row.get('is_subtotal', False)} | "
            f"values: {json.dumps(row.get('raw_values', {}))}"
        )
    return (
        f"Map EACH of the following {len(rows)} {coa_statement} line items to the "
        f"standardised {coa_statement} CoA. Every item is a {coa_statement} item — "
        f"map to {coa_statement} CoA entries only. Template type: {template_type}.\n\n"
        f"COMPANY LINE ITEMS (each prefixed by its row_index in [brackets]):\n"
        f"{chr(10).join(row_lines)}\n\n"
        f"TARGET COA ENTRIES ({len(candidates)} candidates, {coa_statement} only):\n"
        f"{_candidates_block(candidates)}\n\n"
        f"For EACH line item independently: focus on economic substance not label "
        f"similarity; penalise confidence if multiple CoA entries are plausible; if an "
        f"item is aggregated (covers multiple CoA entries) map to the most appropriate "
        f"parent; provide the top-3 candidates.\n\n"
        f"Return ONE result object per row_index 0..{len(rows) - 1}."
    )


class _BatchItem(BaseModel):
    row_index: int
    coa_id: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = ""
    ambiguities: list[str] = Field(default_factory=list)
    candidates: list[Candidate] = Field(default_factory=list)


def map_rows_batch(
    rows: list[dict],
    candidates: list[dict],
    template_type: str,
    coa_statement: str,
    max_tokens: int | None = None,
) -> list[CoaMappingResult]:
    """Map several same-statement rows in ONE LLM call (amortises the large
    candidate block across rows). Returns a list of CoaMappingResult aligned to
    `rows` by position.

    Robustness: rows the model omits or returns invalid are filled in via a
    per-row `map_row_to_coa` fallback; if the whole batch fails to parse after a
    retry, every row falls back to per-row mapping. So batching never reduces
    coverage — only call count on the happy path.
    """
    if not rows:
        return []
    if max_tokens is None:
        # ~ one rationale + 3 candidates per row, plus headroom; capped at the
        # provider ceiling. Single-row callers should keep using map_row_to_coa.
        max_tokens = min(8192, 700 * len(rows) + 512)

    prompt = _build_batch_user_prompt(rows, candidates, template_type, coa_statement)
    valid_ids = {c["coa_id"] for c in candidates}

    def _coerce(bi: _BatchItem) -> CoaMappingResult:
        coa_id = bi.coa_id
        if coa_id == "UNMAPPED":
            coa_id = ""  # deliberate UNMAPPED (R12) → unmapped queue, no override
        elif coa_id and coa_id not in valid_ids:
            top = next((c for c in bi.candidates if c.coa_id in valid_ids), None)
            coa_id = top.coa_id if top else ""
        return CoaMappingResult(
            coa_id=coa_id,
            confidence=bi.confidence if coa_id else 0.0,
            rationale=bi.rationale,
            ambiguities=bi.ambiguities,
            candidates=bi.candidates,
        )

    last_err: Exception | None = None
    for attempt in (1, 2):
        try:
            raw = get_llm_client().complete(
                system=_BATCH_SYSTEM_PROMPT, prompt=prompt, max_tokens=max_tokens,
            )
            parsed = _extract_json(raw)
            items = parsed["results"] if isinstance(parsed, dict) else parsed
            by_index: dict[int, CoaMappingResult] = {}
            for it in items:
                bi = _BatchItem(**it)
                by_index[bi.row_index] = _coerce(bi)

            out: list[CoaMappingResult] = []
            missing = 0
            for idx, row in enumerate(rows):
                res = by_index.get(idx)
                if res is None:
                    missing += 1
                    res = map_row_to_coa(row, candidates, template_type, coa_statement)
                out.append(res)
            if missing:
                logger.warning(f"[coa-map-batch] {missing}/{len(rows)} rows missing "
                               f"from batch response; filled via per-row fallback")
            return out
        except (json.JSONDecodeError, ValidationError, ValueError, KeyError, TypeError) as e:
            last_err = e
            logger.warning(f"[coa-map-batch] attempt {attempt} failed "
                           f"({len(rows)} rows, {coa_statement}): {e}")

    logger.error(f"[coa-map-batch] batch of {len(rows)} unparseable; "
                 f"falling back to per-row mapping: {last_err}")
    return [map_row_to_coa(row, candidates, template_type, coa_statement) for row in rows]


def _extract_json(raw: str) -> dict:
    clean = re.sub(r"```json|```", "", raw).strip()
    start, end = clean.find("{"), clean.rfind("}")
    if start != -1 and end != -1:
        clean = clean[start:end + 1]
    return json.loads(clean)


def map_row_to_coa(
    row: dict,
    candidates: list[dict],
    template_type: str,
    coa_statement: str,
    max_tokens: int = 2048,
) -> CoaMappingResult:
    """Map one row to a CoA entry via the active LLM provider.

    `candidates` must already be filtered to the row's statement (gating).
    Returns a validated CoaMappingResult; a failure yields confidence 0.0.
    """
    prompt = _build_user_prompt(row, candidates, template_type, coa_statement)
    valid_ids = {c["coa_id"] for c in candidates}

    last_err: Exception | None = None
    for attempt in (1, 2):
        try:
            raw = get_llm_client().complete(
                system=_SYSTEM_PROMPT, prompt=prompt, max_tokens=max_tokens,
            )
            parsed = _extract_json(raw)
            result = CoaMappingResult(**parsed)
            # Deliberate UNMAPPED (R12): route to the unmapped queue rather than
            # overriding with a candidate; confidence 0.0 makes the routing explicit.
            if result.coa_id == "UNMAPPED":
                result.coa_id = ""
                result.confidence = 0.0
                return result
            # Guard against hallucinated ids outside the candidate set.
            if result.coa_id not in valid_ids:
                # Fall back to the top candidate the model returned, if valid.
                top = next((c for c in result.candidates if c.coa_id in valid_ids), None)
                if top:
                    result.coa_id = top.coa_id
                else:
                    raise ValueError(f"coa_id {result.coa_id!r} not in candidate set")
            return result
        except (json.JSONDecodeError, ValidationError, ValueError, KeyError) as e:
            last_err = e
            logger.warning(f"[coa-map] attempt {attempt} failed for "
                           f"{row.get('raw_label', '')!r}: {e}")

    logger.error(f"[coa-map] giving up on {row.get('raw_label', '')!r}: {last_err}")
    return CoaMappingResult(coa_id="", confidence=0.0,
                            rationale="Automatic mapping failed to produce valid output.",
                            ambiguities=["mapping_failed"], candidates=[])
