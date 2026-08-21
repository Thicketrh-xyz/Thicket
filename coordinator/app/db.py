"""
Persistence for the coordinator. State that used to live in an in-memory dict
now lives in a database, so restarts don't wipe contribution/epoch data and the
service can be hosted for real.

DATABASE_URL selects the backend:
  - unset            -> SQLite file (./thicket.db) for local dev
  - postgres://...   -> Postgres (Railway/production); normalized to postgresql://
"""
from __future__ import annotations

import os

from sqlalchemy import BigInteger, Float, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./thicket.db")
# Railway/Heroku give postgres:// ; SQLAlchemy's plain postgresql:// defaults to
# the psycopg2 driver, but we install psycopg (v3) — so pin the +psycopg dialect.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Node(Base):
    __tablename__ = "nodes"

    address: Mapped[str] = mapped_column(String(42), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(128), default="")
    last_heartbeat: Mapped[float] = mapped_column(Float, default=0.0)       # epoch seconds
    contribution_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    cumulative_reward: Mapped[float] = mapped_column(Float, default=0.0)    # THKT owed all-time
    pending_challenge_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    pending_seed: Mapped[int] = mapped_column(BigInteger, default=0)
    last_challenge_at: Mapped[float] = mapped_column(Float, default=0.0)
    failed_challenges: Mapped[int] = mapped_column(Integer, default=0)


class Job(Base):
    """A paid compute job: buyer pays THKT (which refills the rewards pool), a
    node executes it, the buyer collects the result."""
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    prompt: Mapped[str] = mapped_column(String(2000), default="")
    payer: Mapped[str] = mapped_column(String(42), default="")
    payment_thkt: Mapped[float] = mapped_column(Float, default=0.0)  # THKT (wei overflows int8)
    payment_tx: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|assigned|done
    assigned_node: Mapped[str | None] = mapped_column(String(42), nullable=True)
    result: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=0.0)


def init_db() -> None:
    Base.metadata.create_all(engine)


def session_scope():
    """Context-managed session: commits on success, rolls back on error."""
    return _SessionCtx()


class _SessionCtx:
    def __enter__(self):
        self.db = SessionLocal()
        return self.db

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self.db.commit()
            else:
                self.db.rollback()
        finally:
            self.db.close()
