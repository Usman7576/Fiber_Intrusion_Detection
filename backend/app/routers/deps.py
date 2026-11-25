"""Shared accessors for objects created at startup (stored on app.state)."""

from fastapi import HTTPException, Request

from ..db import EventStore
from ..services.inference import Engine


def engine(request: Request) -> Engine:
    return request.app.state.engine


def store(request: Request) -> EventStore:
    return request.app.state.store


def sample_index(request: Request, sample_id: int) -> int:
    n = len(request.app.state.engine.samples)
    if not 0 <= sample_id < n:
        raise HTTPException(404, f"sample {sample_id} not found (ids 0-{n - 1})")
    return sample_id
