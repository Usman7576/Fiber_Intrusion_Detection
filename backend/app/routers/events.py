from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from ..db import Event, EventStore
from ..schemas import EventOut, EventStats
from .deps import store

router = APIRouter(tags=["events"])


@router.get("/events", response_model=list[EventOut])
def list_events(cls: str | None = None, level: str | None = None, source: str | None = None,
                since: datetime | None = Query(None, description="ISO time, e.g. 2026-11-25T10:00:00Z"),
                limit: int = Query(100, ge=1, le=1000), st: EventStore = Depends(store)):
    """Event history, newest first."""
    return st.query(cls=cls, level=level, source=source, since=since, limit=limit)


@router.get("/events/stats", response_model=EventStats)
def event_stats(minutes: int | None = Query(None, ge=1, description="only the last N minutes"),
                st: EventStore = Depends(store)):
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes) if minutes else None
    by_class = st.counts(Event.pred, since)
    return {"since": since, "total": sum(by_class.values()), "by_class": by_class,
            "by_level": st.counts(Event.alert_level, since)}
