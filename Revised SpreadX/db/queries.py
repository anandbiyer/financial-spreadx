"""Query helpers for Stage 11 persistence.

Reads return plain dicts (shaped for the UI and the spec's API routes); writes
take explicit fields. `resolve_unmapped()` performs its three writes in a single
transaction (COA-009 / LRN-003).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select, update

from db.models import (
    AppSettings,
    CoaMapping,
    CoaReference,
    Document,
    ExtractedRow,
    LearnedMapping,
    Note,
    UnmappedItem,
)
from db.session import session_scope


def _uid() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_dict(obj) -> dict:
    """Shallow column->value dict for an ORM instance."""
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ── CoA reference ─────────────────────────────────────────────────────────────

def upsert_coa_reference(entries: list[dict]) -> int:
    """Idempotent insert/update of CoA entries keyed on coa_id. Returns count."""
    with session_scope() as s:
        for e in entries:
            existing = s.get(CoaReference, e["coa_id"])
            if existing:
                for k, v in e.items():
                    setattr(existing, k, v)
            else:
                s.add(CoaReference(**e))
        return len(entries)


def get_all_coa_reference() -> list[dict]:
    with session_scope() as s:
        rows = s.execute(select(CoaReference).order_by(CoaReference.coa_id)).scalars().all()
        return [_as_dict(r) for r in rows]


def get_coa_reference_by_statement(statement: str) -> list[dict]:
    with session_scope() as s:
        rows = s.execute(
            select(CoaReference).where(CoaReference.statement == statement).order_by(CoaReference.coa_id)
        ).scalars().all()
        return [_as_dict(r) for r in rows]


def count_coa_reference() -> int:
    with session_scope() as s:
        return len(s.execute(select(CoaReference.coa_id)).scalars().all())


# ── Documents ─────────────────────────────────────────────────────────────────

def create_document(filename: str, template_type: str, scope: str,
                    doc_id: str | None = None) -> str:
    """Create a Document. Pass ``doc_id`` to use a caller-supplied id (upload flow)."""
    doc_id = doc_id or _uid()
    with session_scope() as s:
        s.add(Document(
            id=doc_id, filename=filename, template_type=template_type,
            scope=scope, spread_status="spreading",
        ))
    return doc_id


def update_document(doc_id: str, **fields) -> None:
    with session_scope() as s:
        doc = s.get(Document, doc_id)
        if doc:
            for k, v in fields.items():
                setattr(doc, k, v)


def get_document(doc_id: str) -> dict | None:
    with session_scope() as s:
        doc = s.get(Document, doc_id)
        return _as_dict(doc) if doc else None


def delete_document(doc_id: str) -> dict:
    """Cascade-delete a document and its rows/notes/mappings/unmapped items (B7).

    Global **learned mappings are preserved** — only their `source_document_id` FK is
    nulled so it doesn't dangle. Returns the (pre-delete) `pdf_path` for file cleanup.
    """
    with session_scope() as s:
        doc = s.get(Document, doc_id)
        if not doc:
            return {"deleted": False, "reason": "not found"}
        pdf_path = doc.pdf_path
        # Keep the learning, drop the (now-dangling) source reference.
        s.execute(
            update(LearnedMapping)
            .where(LearnedMapping.source_document_id == doc_id)
            .values(source_document_id=None)
        )
        for model in (ExtractedRow, Note, CoaMapping, UnmappedItem):
            s.execute(delete(model).where(model.document_id == doc_id))
        s.delete(doc)
        return {"deleted": True, "pdf_path": pdf_path}


# ── App settings (Frontend Phase 6, B8) ──────────────────────────────────────

def get_settings() -> dict:
    """The single settings row, or config-derived defaults if none saved yet."""
    with session_scope() as s:
        row = s.get(AppSettings, "default")
        if row:
            return _as_dict(row)
    import config
    return {
        "id": "default",
        "llm_provider": config.LLM_PROVIDER,
        "llm_model": config.ANTHROPIC_MODEL,
        "confidence_threshold": config.SPREAD_CONFIDENCE_THRESHOLD,
    }


def update_settings(**fields) -> dict:
    with session_scope() as s:
        row = s.get(AppSettings, "default")
        if not row:
            row = AppSettings(id="default")
            s.add(row)
        for k, v in fields.items():
            if hasattr(row, k) and k != "id":
                setattr(row, k, v)
        row.updated_at = _utcnow()
        s.flush()
        return _as_dict(row)


# ── Extracted rows & notes (Frontend Phase 1) ────────────────────────────────

def insert_extracted_rows(doc_id: str, rows: list[dict],
                          row_outcomes: dict[int, dict] | None = None) -> int:
    """Persist a run's extracted rows with their per-row CoA outcome (B1).

    ``rows`` are the orchestrator's row dicts (carry extraction_id, structure, etc.);
    ``row_outcomes`` maps extraction_id -> {coa_id, mapping_status, confidence} from
    the mapper. Rows without an outcome (cash-flow / unknown / skipped) default to
    ``not_spread``.
    """
    row_outcomes = row_outcomes or {}
    with session_scope() as s:
        for r in rows:
            eid = r.get("extraction_id") or 0
            oc = row_outcomes.get(eid, {})
            s.add(ExtractedRow(
                id=_uid(),
                document_id=doc_id,
                extraction_id=eid,
                raw_label=r.get("raw_label", "") or "",
                raw_values=r.get("raw_values") or {},
                section_path=r.get("section_path") or [],
                indentation_level=int(r.get("indentation_level", 0) or 0),
                is_subtotal=bool(r.get("is_subtotal", False)),
                note_ref=r.get("note_ref"),
                statement_type=r.get("statement_type", "") or "",
                statement_scope=r.get("statement_scope", "unknown") or "unknown",
                page=int(r.get("page", 0) or 0),
                column_metadata=r.get("column_metadata"),
                coa_id=oc.get("coa_id"),
                mapping_status=oc.get("mapping_status", "not_spread"),
                confidence=oc.get("confidence"),
            ))
        return len(rows)


def insert_notes(doc_id: str, notes: list) -> int:
    """Persist a run's extracted notes (B2). ``notes`` are NoteExtraction objects."""
    with session_scope() as s:
        for n in notes:
            sub_tables = [t.model_dump() for t in getattr(n, "sub_tables", [])]
            s.add(Note(
                id=_uid(),
                document_id=doc_id,
                note_number=getattr(n, "note_number", 0),
                note_title=getattr(n, "note_title", "") or "",
                summary=getattr(n, "summary", "") or "",
                sub_tables=sub_tables,
            ))
        return len(notes)


def get_extracted_rows(doc_id: str) -> list[dict]:
    with session_scope() as s:
        rows = s.execute(
            select(ExtractedRow)
            .where(ExtractedRow.document_id == doc_id)
            .order_by(ExtractedRow.extraction_id)
        ).scalars().all()
        return [_as_dict(r) for r in rows]


def get_notes(doc_id: str) -> list[dict]:
    with session_scope() as s:
        rows = s.execute(
            select(Note).where(Note.document_id == doc_id).order_by(Note.note_number)
        ).scalars().all()
        return [_as_dict(r) for r in rows]


# ── CoA mappings ──────────────────────────────────────────────────────────────

def insert_coa_mappings(rows: list[dict]) -> list[str]:
    ids: list[str] = []
    with session_scope() as s:
        for r in rows:
            r = {**r}
            r.setdefault("id", _uid())
            ids.append(r["id"])
            s.add(CoaMapping(**r))
    return ids


def get_coa_mappings_by_document(doc_id: str) -> list[dict]:
    with session_scope() as s:
        rows = s.execute(
            select(CoaMapping).where(CoaMapping.document_id == doc_id)
        ).scalars().all()
        return [_as_dict(r) for r in rows]


def override_coa_mapping(coa_mapping_id: str, new_coa_id: str, rationale: str,
                         analyst_id: str = "AS") -> dict:
    """Override an existing mapping (LRN-003): update the mapping, bump the
    originating learned mapping's override count (with demotion), and record a
    new learned mapping for the corrected target. Single transaction."""
    from spreading.learning_store import normalise_label  # local import avoids cycle

    with session_scope() as s:
        m = s.get(CoaMapping, coa_mapping_id)
        if not m:
            raise ValueError(f"coa_mapping {coa_mapping_id} not found")

        # Bump override count on the originating learned mapping, if any.
        if m.learned_mapping_id:
            orig = s.get(LearnedMapping, m.learned_mapping_id)
            if orig:
                orig.times_overridden += 1
                if orig.times_overridden >= 2:  # LRN-004 demotion
                    orig.learned_confidence = 0.70

        doc = s.get(Document, m.document_id)
        # Record the corrected decision as new learning.
        learned = LearnedMapping(
            id=_uid(),
            canonical_field=normalise_label(m.raw_label),
            raw_label_pattern=normalise_label(m.raw_label),
            template_type=doc.template_type if doc else "*",
            statement_type=m.statement_type,
            coa_id=new_coa_id,
            learned_confidence=0.95,
            rationale=rationale,
            source_document=doc.filename if doc else "",
            source_document_id=m.document_id,
            analyst_id=analyst_id,
        )
        s.add(learned)
        s.flush()

        # Apply the override to the mapping itself.
        m.coa_id = new_coa_id
        m.rationale = rationale
        m.mapping_source = "manual"
        m.confidence = 0.95
        m.learned_mapping_id = learned.id

        # Re-point the underlying extracted rows to the corrected CoA.
        ids = list(m.source_extraction_ids or [])
        if ids:
            s.execute(
                update(ExtractedRow)
                .where(ExtractedRow.document_id == m.document_id,
                       ExtractedRow.extraction_id.in_(ids))
                .values(mapping_status="mapped", coa_id=new_coa_id, confidence=0.95)
            )
        return _as_dict(m)


# ── Unmapped items ────────────────────────────────────────────────────────────

def insert_unmapped_items(rows: list[dict]) -> list[str]:
    ids: list[str] = []
    with session_scope() as s:
        for r in rows:
            r = {**r}
            r.setdefault("id", _uid())
            ids.append(r["id"])
            s.add(UnmappedItem(**r))
    return ids


def get_pending_unmapped(doc_id: str) -> list[dict]:
    with session_scope() as s:
        rows = s.execute(
            select(UnmappedItem).where(
                UnmappedItem.document_id == doc_id,
                UnmappedItem.status == "pending",
            )
        ).scalars().all()
        return [_as_dict(r) for r in rows]


def get_unmapped_for_display(doc_id: str) -> list[dict]:
    """Pending (analyst-actionable) + not_spread (terminal, informational) items —
    everything the Unmapped Items export sheet should show."""
    with session_scope() as s:
        rows = s.execute(
            select(UnmappedItem).where(
                UnmappedItem.document_id == doc_id,
                UnmappedItem.status.in_(("pending", "not_spread")),
            )
        ).scalars().all()
        return [_as_dict(r) for r in rows]


def skip_unmapped(unmapped_item_id: str) -> None:
    with session_scope() as s:
        item = s.get(UnmappedItem, unmapped_item_id)
        if item:
            item.status = "skipped"


def resolve_unmapped(unmapped_item_id: str, selected_coa_id: str,
                     analyst_rationale: str, analyst_id: str = "AS") -> dict:
    """Resolve one unmapped item atomically (COA-009):
    (a) insert coa_mappings, (b) insert learned_mappings,
    (c) update unmapped_items. If no pending items remain, mark the document
    spread_complete. Returns a summary dict.
    """
    from spreading.learning_store import normalise_label  # local import avoids cycle

    with session_scope() as s:
        item = s.get(UnmappedItem, unmapped_item_id)
        if not item:
            raise ValueError(f"unmapped_item {unmapped_item_id} not found")
        doc = s.get(Document, item.document_id)
        template_type = doc.template_type if doc else "*"
        source_document = doc.filename if doc else ""

        # (b) learned mapping first so we can link it from the coa mapping.
        learned = LearnedMapping(
            id=_uid(),
            canonical_field=item.canonical_field or normalise_label(item.raw_label),
            raw_label_pattern=normalise_label(item.raw_label),
            template_type=template_type,
            statement_type=item.statement_type,
            coa_id=selected_coa_id,
            learned_confidence=0.95,
            rationale=analyst_rationale,
            source_document=source_document,
            source_document_id=item.document_id,
            analyst_id=analyst_id,
        )
        s.add(learned)
        s.flush()

        # (a) coa mapping — carry the source extraction ids so the resolved line
        # keeps its leaf traceability in the spread tree (FrontendDesign §4.6).
        source_ids = list(item.source_extraction_ids or [])
        mapping = CoaMapping(
            id=_uid(),
            document_id=item.document_id,
            coa_id=selected_coa_id,
            raw_label=item.raw_label,
            statement_type=item.statement_type,
            confidence=0.95,
            rationale=analyst_rationale,
            mapping_source="manual",
            learned_mapping_id=learned.id,
            value_spread=item.value_spread,
            sign_applied=False,
            source_extraction_ids=source_ids,
        )
        s.add(mapping)

        # Reflect the per-row outcome on the extracted rows (Workbench view).
        if source_ids:
            s.execute(
                update(ExtractedRow)
                .where(ExtractedRow.document_id == item.document_id,
                       ExtractedRow.extraction_id.in_(source_ids))
                .values(mapping_status="mapped", coa_id=selected_coa_id, confidence=0.95)
            )

        # (c) update unmapped item
        item.status = "resolved"
        item.resolved_coa_id = selected_coa_id
        item.resolved_at = _utcnow()
        item.resolved_by = analyst_id

        # Recompute pending count for the document.
        remaining = s.execute(
            select(UnmappedItem).where(
                UnmappedItem.document_id == item.document_id,
                UnmappedItem.status == "pending",
                UnmappedItem.id != unmapped_item_id,
            )
        ).scalars().all()
        remaining_count = len(remaining)
        if doc:
            doc.unmapped_count = remaining_count
            if remaining_count == 0:
                doc.spread_status = "spread_complete"

        return {
            "coa_mapping_id": mapping.id,
            "learned_mapping_id": learned.id,
            "remaining_unmapped": remaining_count,
        }


# ── Learned mappings ──────────────────────────────────────────────────────────

def insert_learned_mapping(**fields) -> str:
    lid = fields.pop("id", None) or _uid()
    with session_scope() as s:
        s.add(LearnedMapping(id=lid, **fields))
    return lid


def get_learned_mapping(learned_id: str) -> dict | None:
    with session_scope() as s:
        lm = s.get(LearnedMapping, learned_id)
        return _as_dict(lm) if lm else None


def list_learned_mappings(template_type: str | None = None,
                          statement_type: str | None = None) -> list[dict]:
    with session_scope() as s:
        stmt = select(LearnedMapping).order_by(LearnedMapping.created_at.desc())
        if template_type:
            stmt = stmt.where(LearnedMapping.template_type == template_type)
        if statement_type:
            stmt = stmt.where(LearnedMapping.statement_type == statement_type)
        return [_as_dict(r) for r in s.execute(stmt).scalars().all()]


def delete_learned_mapping(learned_id: str) -> bool:
    with session_scope() as s:
        lm = s.get(LearnedMapping, learned_id)
        if not lm:
            return False
        s.delete(lm)
        return True


def mark_learned_applied(learned_id: str) -> None:
    """Increment times_applied, stamp last_applied_at, and apply LRN-005
    promotion (>=5 clean applies -> 0.99)."""
    with session_scope() as s:
        lm = s.get(LearnedMapping, learned_id)
        if not lm:
            return
        lm.times_applied += 1
        lm.last_applied_at = _utcnow()
        if lm.times_applied >= 5 and lm.times_overridden == 0:
            lm.learned_confidence = 0.99


def find_learned_candidates(canonical_field: str, statement_type: str,
                            template_type: str) -> dict:
    """Low-level fetch used by the 3-priority lookup in learning_store.

    Returns the best row (as dict) for each priority tier, or None per tier.
    Demoted mappings (times_overridden >= 2) are excluded (LRN-004).
    """
    with session_scope() as s:
        def _first(stmt):
            row = s.execute(stmt).scalars().first()
            return _as_dict(row) if row else None

        base = select(LearnedMapping).where(
            LearnedMapping.times_overridden < 2  # LRN-004: demoted no longer suppress Claude
        ).order_by(LearnedMapping.created_at.desc())

        exact = _first(base.where(
            LearnedMapping.canonical_field == canonical_field,
            LearnedMapping.statement_type == statement_type,
            LearnedMapping.template_type == template_type,
        ))
        any_template = _first(base.where(
            LearnedMapping.canonical_field == canonical_field,
            LearnedMapping.statement_type == statement_type,
            LearnedMapping.template_type == "*",
        ))
        fuzzy = _first(base.where(
            LearnedMapping.statement_type == statement_type,
            LearnedMapping.raw_label_pattern.like(f"%{canonical_field}%"),
        ))
        return {"exact": exact, "any_template": any_template, "fuzzy": fuzzy}
