"""Additive migration for Frontend Phase 1 (B11).

Idempotent. Backs up the SQLite DB to ``<db>.bak`` first, then:
  - ADD COLUMNs to ``documents`` (company, fiscal_year, pdf_path, pipeline_status,
    pipeline_stage, error_message, page_summary) — skipped if already present;
  - CREATE TABLEs ``extracted_rows`` and ``notes`` via SQLAlchemy ``create_all``.

Run from the repo root:  ``.venv\\Scripts\\python.exe -m scripts.migrate_phase1``

Matches the established one-off ALTER pattern (reconciliation_result / usage_result),
which `create_all` cannot do for *existing* tables. New DBs get everything from the
models directly.
"""

from __future__ import annotations

import os
import shutil
import sqlite3

# New documents columns (SQLite affinity; SQLAlchemy JSON serialises to/from TEXT).
_NEW_DOC_COLUMNS: list[tuple[str, str]] = [
    ("company", "TEXT DEFAULT ''"),
    ("fiscal_year", "INTEGER"),
    ("pdf_path", "TEXT"),
    ("pipeline_status", "TEXT DEFAULT 'queued'"),
    ("pipeline_stage", "TEXT"),
    ("error_message", "TEXT"),
    ("page_summary", "TEXT"),
]


def _sqlite_path() -> str | None:
    """Resolve the SQLite file from SPREADX_DB_URL (default spreadx.db)."""
    url = os.getenv("SPREADX_DB_URL", "sqlite:///spreadx.db")
    if not url.startswith("sqlite"):
        return None  # non-SQLite backend: rely on create_all + manual DDL
    # sqlite:///relative.db  or  sqlite:////abs.db
    path = url.split("sqlite:///", 1)[-1]
    return path or "spreadx.db"


def migrate() -> None:
    db_path = _sqlite_path()

    if db_path and os.path.exists(db_path):
        backup = db_path + ".bak"
        shutil.copy2(db_path, backup)
        print(f"backed up {db_path} -> {backup}")

        con = sqlite3.connect(db_path)
        try:
            existing = {row[1] for row in con.execute("PRAGMA table_info(documents)")}
            for name, decl in _NEW_DOC_COLUMNS:
                if name in existing:
                    print(f"  documents.{name} already present — skip")
                    continue
                con.execute(f"ALTER TABLE documents ADD COLUMN {name} {decl}")
                print(f"  + documents.{name}")
            con.commit()
        finally:
            con.close()
    else:
        print("no existing SQLite file — new tables/columns come from the models")

    # Create extracted_rows + notes (and any other missing tables) idempotently.
    from db.session import init_db

    init_db()
    print("ensured tables exist (extracted_rows, notes)")
    print("migration complete.")


if __name__ == "__main__":
    migrate()
