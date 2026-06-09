"""Database engine + session management.

Default backend is a local SQLite file (`spreadx.db`). Override with the
SPREADX_DB_URL env var (e.g. a Postgres URL) without any code change.

The engine is built lazily on first use (reading SPREADX_DB_URL at that point),
so tests can repoint it via the env var + reset_engine().
"""

from __future__ import annotations

import os
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from db.models import Base

_engine = None
_SessionFactory = None
_initialised = False


def _build() -> None:
    global _engine, _SessionFactory
    url = os.getenv("SPREADX_DB_URL", "sqlite:///spreadx.db")
    # check_same_thread=False lets Streamlit worker threads share the SQLite
    # connection pool safely for this single-user app.
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    _engine = create_engine(url, connect_args=connect_args, future=True)
    _SessionFactory = sessionmaker(bind=_engine, expire_on_commit=False, future=True)


def get_engine():
    if _engine is None:
        _build()
    return _engine


def reset_engine() -> None:
    """Dispose and clear the cached engine (used by tests to repoint the DB)."""
    global _engine, _SessionFactory, _initialised
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionFactory = None
    _initialised = False


def init_db() -> None:
    """Create all tables if they do not exist (idempotent)."""
    global _initialised
    Base.metadata.create_all(get_engine())
    _initialised = True


@contextmanager
def session_scope() -> Session:
    """Transactional scope: commits on success, rolls back on error."""
    if not _initialised:
        init_db()
    session = _SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
