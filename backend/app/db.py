"""SQLite event history (SQLAlchemy 2.0)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import DateTime, Float, Integer, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class Event(Base):
    """One classified window: from the live stream or from an uploaded file."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)       # naive UTC (SQLite has no time zones)
    source: Mapped[str] = mapped_column(String(16))                 # "stream" | "upload"
    sample_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pred: Mapped[str] = mapped_column(String(32), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    alert_level: Mapped[str] = mapped_column(String(16), index=True)
    true_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    top_point: Mapped[int] = mapped_column(Integer)


def utcnow() -> datetime:
    """Naive UTC timestamp, the form stored in SQLite."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_naive_utc(t: datetime) -> datetime:
    return t.astimezone(timezone.utc).replace(tzinfo=None) if t.tzinfo else t


class EventStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self._session = sessionmaker(self.engine, expire_on_commit=False)

    def add(self, **fields) -> Event:
        ev = Event(ts=utcnow(), **fields)
        with self._session() as s:
            s.add(ev)
            s.commit()
        return ev

    def query(self, cls: str | None = None, level: str | None = None, source: str | None = None,
              since: datetime | None = None, limit: int = 100) -> list[Event]:
        q = select(Event).order_by(Event.id.desc()).limit(limit)
        if cls:
            q = q.where(Event.pred == cls)
        if level:
            q = q.where(Event.alert_level == level)
        if source:
            q = q.where(Event.source == source)
        if since:
            q = q.where(Event.ts >= to_naive_utc(since))
        with self._session() as s:
            return list(s.scalars(q))

    def counts(self, column, since: datetime | None = None) -> dict[str, int]:
        q = select(column, func.count()).group_by(column)
        if since:
            q = q.where(Event.ts >= to_naive_utc(since))
        with self._session() as s:
            return {k: n for k, n in s.execute(q)}

    def total(self) -> int:
        with self._session() as s:
            return s.scalar(select(func.count()).select_from(Event)) or 0

    def close(self) -> None:
        self.engine.dispose()
