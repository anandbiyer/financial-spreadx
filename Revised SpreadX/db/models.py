"""SQLAlchemy models for Stage 11 — COA Mapping & Spreading.

Translated from the spec's Drizzle/Postgres schema (Section 08) to SQLAlchemy
2.0 ORM, adapted to the Python port's reality:

- The port produces RAW rows (`raw_label`/`raw_values`), not canonical fields,
  so source-row data is denormalised directly into `coa_mappings` /
  `unmapped_items` and no separate `mapped_rows` table is needed.
- `value_spread` holds the extracted ``{year: value}`` mapping (sign applied),
  not the spec's full multi-currency structure (deferred).
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class CoaReference(Base):
    """Read-only target Chart of Accounts (184 entries). Seeded once."""

    __tablename__ = "coa_reference"

    coa_id: Mapped[str] = mapped_column(String, primary_key=True)          # "BS-001"
    line_item_name: Mapped[str] = mapped_column(String, nullable=False)
    statement: Mapped[str] = mapped_column(String, nullable=False)         # "Balance Sheet" | "P&L"
    broad_category: Mapped[str] = mapped_column(String, nullable=False)
    sub_category: Mapped[str] = mapped_column(String, default="")
    definition: Mapped[str] = mapped_column(Text, default="")
    spreading_guidance: Mapped[str] = mapped_column(Text, default="")
    sign_convention: Mapped[str] = mapped_column(String, default="positive")  # positive|negative|contra
    is_subtotal: Mapped[bool] = mapped_column(Boolean, default=False)
    is_memo_item: Mapped[bool] = mapped_column(Boolean, default=False)


class Document(Base):
    """One processed document. Created when Stage 11 runs."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # uuid hex
    filename: Mapped[str] = mapped_column(String, default="")
    template_type: Mapped[str] = mapped_column(String, default="T0_unknown")
    scope: Mapped[str] = mapped_column(String, default="unknown")
    spread_status: Mapped[str] = mapped_column(String, default="not_started")
    # not_started | spreading | has_unmapped | spread_complete | spread_error
    unmapped_count: Mapped[int] = mapped_column(Integer, default=0)
    balance_check_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Per-subtotal cross-foot report (spreading.subtotal_reconciliation).
    reconciliation_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Per-run LLM token usage + estimated cost (llm.usage.UsageMeter snapshot).
    usage_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class CoaMapping(Base):
    """One mapped row per document — the actual spread output."""

    __tablename__ = "coa_mappings"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # uuid hex
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    coa_id: Mapped[str] = mapped_column(ForeignKey("coa_reference.coa_id"), nullable=False)
    # Denormalised source-row data (no mapped_rows table):
    raw_label: Mapped[str] = mapped_column(Text, default="")
    statement_type: Mapped[str] = mapped_column(String, default="")  # income_statement|balance_sheet|...
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    rationale: Mapped[str] = mapped_column(Text, default="")
    mapping_source: Mapped[str] = mapped_column(String, default="claude")  # claude|learned|manual
    learned_mapping_id: Mapped[str | None] = mapped_column(
        ForeignKey("learned_mappings.id"), nullable=True
    )
    value_spread: Mapped[dict] = mapped_column(JSON, default=dict)  # {year: value} (sign applied)
    sign_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    aggregated_from: Mapped[int] = mapped_column(Integer, default=1)  # SPR-004
    # Extraction IDs of the source rows that fed this CoA line (traceability).
    source_extraction_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_coa_mappings_doc", "document_id"),
        Index("idx_coa_mappings_coa_id", "coa_id"),
    )


class UnmappedItem(Base):
    """Rows below the confidence threshold, pending analyst resolution."""

    __tablename__ = "unmapped_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # uuid hex
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), nullable=False)
    raw_label: Mapped[str] = mapped_column(Text, default="")
    canonical_field: Mapped[str | None] = mapped_column(String, nullable=True)  # normalised label
    statement_type: Mapped[str] = mapped_column(String, default="")
    value_spread: Mapped[dict] = mapped_column(JSON, default=dict)
    claude_suggestions: Mapped[list] = mapped_column(JSON, default=list)  # top-3 [{coa_id,score,reason}]
    ambiguity_note: Mapped[str] = mapped_column(Text, default="")
    source_extraction_ids: Mapped[list] = mapped_column(JSON, default=list)  # source row id(s)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending|resolved|skipped|not_spread
    resolved_coa_id: Mapped[str | None] = mapped_column(String, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_unmapped_doc_status", "document_id", "status"),
    )


class LearnedMapping(Base):
    """Learning store — analyst decisions reused on future runs."""

    __tablename__ = "learned_mappings"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # uuid hex
    # Lookup key (no canonical_field upstream → normalised raw label is the key):
    canonical_field: Mapped[str] = mapped_column(String, nullable=False)
    raw_label_pattern: Mapped[str] = mapped_column(String, nullable=False)
    template_type: Mapped[str] = mapped_column(String, default="*")
    statement_type: Mapped[str] = mapped_column(String, default="")
    # What was learned:
    coa_id: Mapped[str] = mapped_column(ForeignKey("coa_reference.coa_id"), nullable=False)
    learned_confidence: Mapped[float] = mapped_column(Float, default=0.95)
    rationale: Mapped[str] = mapped_column(Text, default="")
    # Attribution:
    source_document: Mapped[str] = mapped_column(String, default="")
    source_document_id: Mapped[str | None] = mapped_column(
        ForeignKey("documents.id"), nullable=True
    )
    analyst_id: Mapped[str] = mapped_column(String, default="AS")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    # Quality tracking:
    times_applied: Mapped[int] = mapped_column(Integer, default=0)
    last_applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    times_overridden: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        Index("idx_learned_field_tmpl", "canonical_field", "template_type"),
    )
