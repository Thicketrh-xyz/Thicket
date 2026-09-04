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

from sqlalchemy import BigInteger, Float, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./thicket.db")
# Railway/Heroku give postgres:// ; SQLAlchemy's plain postgresql:// defaults to
# the psycopg2 driver, but we install psycopg (v3) — so pin the +psycopg dialect.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
# Pool sizing is load-bearing here, not boilerplate. SQLAlchemy's defaults are
# pool_size=5 / max_overflow=10 — fifteen connections for a network of 200+
# nodes heartbeating continuously plus a portal that polls. When they run out,
# requests block for pool_timeout seconds; those blocked requests then occupy
# Starlette's sync threadpool, and endpoints that touch no database at all
# (/health) stop responding too. That is exactly how this fell over.
#
# The short timeout is deliberate: failing fast frees the worker thread, where
# waiting 30s takes the whole server down with it.
# DB_POOL_SIZE and DB_MAX_OVERFLOW are the budget for the WHOLE service, split
# across uvicorn workers — not per process. Each worker builds its own pool, so
# reading them per process would multiply the real connection count by the
# worker count and Postgres would start refusing connections, which is a worse
# failure than queuing for one.
_WORKERS = max(1, int(os.getenv("UVICORN_WORKERS", "1")))
_POOL = {} if DATABASE_URL.startswith("sqlite") else {
    "pool_size": max(2, int(os.getenv("DB_POOL_SIZE", "20")) // _WORKERS),
    "max_overflow": max(1, int(os.getenv("DB_MAX_OVERFLOW", "10")) // _WORKERS),
    "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "10")),
    "pool_recycle": 1800,
}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True, **_POOL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Node(Base):
    __tablename__ = "nodes"

    address: Mapped[str] = mapped_column(String(42), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(128), default="")
    last_heartbeat: Mapped[float] = mapped_column(Float, default=0.0)       # epoch seconds
    contribution_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    work_thkt: Mapped[float] = mapped_column(Float, default=0.0)            # earned by work, this epoch
    lifetime_minutes: Mapped[float] = mapped_column(Float, default=0.0)     # never reset, for stats
    jobs_done: Mapped[int] = mapped_column(Integer, default=0)              # lifetime, for the dashboard
    cumulative_reward: Mapped[float] = mapped_column(Float, default=0.0)    # THKT owed all-time
    pending_challenge_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    pending_seed: Mapped[int] = mapped_column(BigInteger, default=0)
    last_challenge_at: Mapped[float] = mapped_column(Float, default=0.0)
    failed_challenges: Mapped[int] = mapped_column(Integer, default=0)
    capabilities: Mapped[str] = mapped_column(String(120), default="")  # csv: text,vision


class Counter(Base):
    """Simple named counters (e.g. cumulative tasks executed)."""
    __tablename__ = "counters"
    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[int] = mapped_column(BigInteger, default=0)


class Batch(Base):
    """One payment covering many work items, fanned out across the network."""
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payer: Mapped[str] = mapped_column(String(42), default="")
    kind: Mapped[str] = mapped_column(String(20), default="text")
    instruction: Mapped[str] = mapped_column(Text, default="")   # applied to every item
    total: Mapped[int] = mapped_column(Integer, default=0)
    payment_thkt: Mapped[float] = mapped_column(Float, default=0.0)
    payment_tx: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[float] = mapped_column(Float, default=0.0)


class Job(Base):
    """A paid compute job: buyer pays THKT (which refills the rewards pool), a
    node executes it, the buyer collects the result."""
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), default="text")      # text | vision
    prompt: Mapped[str] = mapped_column(Text, default="")
    image: Mapped[str | None] = mapped_column(Text, nullable=True)      # base64, vision jobs
    payer: Mapped[str] = mapped_column(String(42), default="")
    payment_thkt: Mapped[float] = mapped_column(Float, default=0.0)  # THKT (wei overflows int8)
    payment_tx: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|assigned|done
    assigned_node: Mapped[str | None] = mapped_column(String(42), nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=0.0)
    batch_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    quorum_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    seed: Mapped[int] = mapped_column(BigInteger, default=0)   # shared sampling seed
    # What this job is worth, priced server-side. payment_thkt is what the buyer
    # sent (and is 0 on batch items, where one payment covers the whole batch),
    # so operator rewards are derived from this instead.
    price_thkt: Mapped[float] = mapped_column(Float, default=0.0)


class Delegation(Base):
    """One delegator's stake behind one operator, mirrored from the chain.

    The contract's `delegations` mapping isn't enumerable, so the coordinator
    discovers pairs from Delegated events and then re-reads each balance on
    chain — `amount` here is a cache of that read, refreshed each epoch, never
    the source of truth.

    `cumulative_reward` is this delegator's lifetime earnings from this operator.
    It settles into the same Merkle tree as operator rewards, so a delegator
    claims exactly the way an operator does.
    """
    __tablename__ = "delegations"

    id: Mapped[str] = mapped_column(String(90), primary_key=True)   # delegator:operator
    delegator: Mapped[str] = mapped_column(String(42), index=True)
    operator: Mapped[str] = mapped_column(String(42), index=True)
    amount: Mapped[float] = mapped_column(Float, default=0.0)              # THKT staked
    cumulative_reward: Mapped[float] = mapped_column(Float, default=0.0)   # THKT owed all-time
    updated_at: Mapped[float] = mapped_column(Float, default=0.0)


class Quorum(Base):
    """One task sent to k nodes so they can be checked against each other."""
    __tablename__ = "quorums"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), default="challenge")  # challenge | job
    ref: Mapped[str] = mapped_column(String(64), default="")            # job id, for job quorums
    seed: Mapped[int] = mapped_column(BigInteger, default=0)            # challenge quorums
    size: Mapped[int] = mapped_column(Integer, default=0)
    required: Mapped[int] = mapped_column(Integer, default=3)           # k
    deadline: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(20), default="open")     # open|settled|inconclusive
    consensus: Mapped[str | None] = mapped_column(Text, nullable=True)  # the winning answer
    created_at: Mapped[float] = mapped_column(Float, default=0.0)
    settled_at: Mapped[float] = mapped_column(Float, default=0.0)


class QuorumResult(Base):
    """One node's slot in a quorum. Written empty when the node is selected, so
    the row doubles as the assignment — a node only gets the task if a slot is
    waiting for it. The id is quorum:address, which makes double-voting
    impossible at the database level."""
    __tablename__ = "quorum_results"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    quorum_id: Mapped[str] = mapped_column(String(64), index=True)
    node_address: Mapped[str] = mapped_column(String(42), index=True)
    output_hash: Mapped[str] = mapped_column(String(80), default="")
    output: Mapped[str | None] = mapped_column(Text, nullable=True)   # job text, for the buyer
    dispatched_at: Mapped[float] = mapped_column(Float, default=0.0)  # last handed to the node
    submitted_at: Mapped[float] = mapped_column(Float, default=0.0)
    verdict: Mapped[str] = mapped_column(String(12), default="pending")  # pending|agreed|disagreed


class RelicHolder(Base):
    """Who owns each Node Relic, mirrored from chain.

    There are only 50, so ownership is read in full on a schedule rather than
    reconstructed from Transfer logs — no cursor to lose, no reorg to reason
    about, and a missed event cannot leave the mirror permanently wrong. The
    delegation mirror learned that the hard way.

    Kept in the database rather than process memory on purpose: the coordinator
    runs several workers and only one of them runs the sync, so a per-process
    cache would leave the others reading stale multipliers. That has already
    happened once with the pool balance.
    """
    __tablename__ = "relic_holders"

    token_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner: Mapped[str] = mapped_column(String(42), default="", index=True)
    multiplier: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[float] = mapped_column(Float, default=0.0)


class PendingSlash(Base):
    """A slash decided by verification, waiting to be sent on chain.

    Slashing used to happen inline inside a heartbeat: three RPC round-trips in
    a request path, holding a pool connection and a worker thread. Worse, it
    raced the epoch publisher for nonces on the same key — both call
    get_transaction_count independently, so a slash landing beside a publish
    could build two transactions with the same nonce and silently lose one.

    Queued here and drained by the scheduler instead. Durable rather than
    in-memory because a dropped row is somebody's money.

    amount is THKT, not wei: 100 THKT is 1e20, which overflows a BIGINT.
    """
    __tablename__ = "pending_slashes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    address: Mapped[str] = mapped_column(String(42), index=True)
    amount_thkt: Mapped[float] = mapped_column(Float, default=0.0)
    reason: Mapped[str] = mapped_column(String(160), default="")
    created_at: Mapped[float] = mapped_column(Float, default=0.0)
    sent_tx: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sent_at: Mapped[float] = mapped_column(Float, default=0.0)


# Columns added after the first deploy. create_all() only creates missing
# *tables*, so add these by hand if an older database is already live.
_ADDED = [
    ("nodes", "capabilities", "VARCHAR(120) DEFAULT ''"),
    ("jobs", "kind", "VARCHAR(20) DEFAULT 'text'"),
    ("jobs", "image", "TEXT"),
    ("jobs", "batch_id", "VARCHAR(64)"),
    ("jobs", "quorum_id", "VARCHAR(64)"),
    ("jobs", "seed", "BIGINT DEFAULT 0"),
    ("jobs", "price_thkt", "DOUBLE PRECISION DEFAULT 0"),
    ("nodes", "work_thkt", "DOUBLE PRECISION DEFAULT 0"),
    ("nodes", "jobs_done", "INTEGER DEFAULT 0"),
    ("nodes", "lifetime_minutes", "DOUBLE PRECISION DEFAULT 0"),
]


# Run once, immediately after the named column is added, to seed it from data
# that already exists. Skipped entirely on a fresh database.
#
# lifetime_minutes: /stats used to back-compute total minutes as
# total_earned / REWARD_PER_MINUTE, which was correct only while rewards were
# purely time-based. Now that work rewards land in the same total, minutes need
# their own counter — and the historical value is recoverable exactly, because
# up to this migration every THKT ever settled came from time online.
_BACKFILL = {
    ("nodes", "lifetime_minutes"):
        "UPDATE nodes SET lifetime_minutes = cumulative_reward / {rate}",
}


# Columns whose type outgrew the original definition (VARCHAR -> TEXT).
_WIDENED = [("jobs", "prompt"), ("jobs", "result")]

# Indexes the ORM does not declare, added by hand because create_all() will not
# touch a table that already exists.
#
# quorum_results grows without bound — one row per node per task, already past
# half a million — and the node page groups it by node_address filtered on
# verdict, while epoch settlement joins it filtered on verdict. Neither had an
# index on verdict, so both were full scans of the whole table, several times a
# minute, each holding a pool connection while it ran. That is how the
# coordinator kept running out of connections.
_INDEXES = [
    ("ix_quorum_results_verdict_node", "quorum_results", "(verdict, node_address)"),
    ("ix_quorum_results_verdict_quorum", "quorum_results", "(verdict, quorum_id)"),
    # The expensive one. due_quorums() runs on EVERY heartbeat — 44 times a
    # second at current network size — and filters quorums on status + deadline,
    # neither of which was indexed. That is a sequential scan of 177,000 rows per
    # beat, and the table grows ~38,000 rows a day. Measured on production-shaped
    # data: 14.8ms per beat without this index, 0.64ms with it.
    ("ix_quorums_status_deadline", "quorums", "(status, deadline)"),
    # Every heartbeat requeues work orphaned by nodes that took a job and never
    # came back — a scan of the whole jobs table, tens of times a second.
    ("ix_jobs_status_created", "jobs", "(status, created_at)"),
    # /jobs?payer=... is ~15% of requests and filtered on an unindexed column.
    ("ix_jobs_payer", "jobs", "(payer)"),
    # eligible_nodes() picks quorum candidates by last_heartbeat on every
    # challenge dispatch; nothing indexed it.
    ("ix_nodes_last_heartbeat", "nodes", "(last_heartbeat)"),
]


# Schema setup runs in every worker at startup, and concurrent DDL genuinely
# races: CREATE TABLE IF NOT EXISTS still collides in the Postgres catalog
# (duplicate key on pg_type), and four workers doing it at once crashed startup
# outright. A blocking advisory lock serialises it — the first worker builds the
# schema, the rest wait and then find there is nothing to do. Blocking, not
# try-lock: a worker that skipped this could start serving before the tables
# exist.
_SCHEMA_LOCK_KEY = 0x7C1CE7          # arbitrary, just has to be agreed on


def init_db() -> None:
    if engine.dialect.name != "postgresql":
        _init_schema()
        return
    with engine.connect() as guard:
        guard.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _SCHEMA_LOCK_KEY})
        try:
            _init_schema()
        finally:
            guard.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _SCHEMA_LOCK_KEY})


def _init_schema() -> None:
    Base.metadata.create_all(engine)
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl in _ADDED:
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                seed = _BACKFILL.get((table, column))
                if seed:
                    rate = float(os.getenv("REWARD_PER_MINUTE", "1.0")) or 1.0
                    conn.execute(text(seed.format(rate=rate)))

    # Widening runs outside the transaction and only when the column is not
    # already TEXT. It used to run on every boot: ALTER TABLE takes an ACCESS
    # EXCLUSIVE lock, so re-issuing a no-op migration on every deploy is a
    # deadlock waiting for live traffic — the same way index creation just took
    # production down.
    if engine.dialect.name == "postgresql":
        for table, column in _WIDENED:
            if not insp.has_table(table):
                continue
            current = {c["name"]: c for c in insp.get_columns(table)}
            col = current.get(column)
            if col is not None and str(col["type"]).upper().startswith("TEXT"):
                continue                        # already widened; nothing to do
            try:
                with engine.begin() as conn:
                    conn.execute(text("SET LOCAL lock_timeout = '3s'"))
                    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TEXT"))
            except Exception as exc:  # noqa: BLE001 — never block startup
                print(f"[db] widen {table}.{column} skipped ({type(exc).__name__}); retrying next boot")

    # Index creation is deliberately outside the transaction above, one
    # statement at a time, and never fatal. CREATE INDEX takes a SHARE lock on
    # the table; during a rolling deploy the outgoing container is still writing
    # to it, and the two deadlock. That took production down — the app refused
    # to boot because it could not create an index that already existed.
    #
    # A missing index is slow, not wrong, and the next boot retries it. A short
    # lock_timeout means we give up quickly rather than stalling startup behind
    # live traffic.
    for name, table, cols in _INDEXES:
        if not insp.has_table(table):
            continue
        try:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text("SET LOCAL lock_timeout = '3s'"))
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {cols}"))
        except Exception as exc:  # noqa: BLE001 — never block startup on an index
            print(f"[db] index {name} not created ({type(exc).__name__}); retrying next boot")


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
