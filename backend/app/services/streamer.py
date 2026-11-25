"""Simulated live fiber feed for the dashboard (WebSocket /api/stream).

One shared simulator plays demo samples as if they were arriving from the interrogator: each 12 x 1000 window is cut
into frames of 12 x 50 and sent every `frame_ms` milliseconds; after the last frame the window is classified, the event
is stored and a prediction message is broadcast. It only runs while at least one client is connected, so the event
history is not filled while nobody is watching. Mostly quiet fiber (background) with an event now and then.

Messages (server -> client):
    {"type": "hello", "frame_ms", "frames_per_sample", "points", "classes", "speed"}
    {"type": "sample_start", "sample_id", "frames"}
    {"type": "frame", "sample_id", "frame_idx", "values": [[12 x 50]]}
    {"type": "prediction", "sample_id", "file", "true_label", "event_id", "ts", ...Prediction fields}
Client -> server:
    {"cmd": "pause"} / {"cmd": "resume"}   this client only
    {"cmd": "speed", "value": 0.5..4}      shared playback speed
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

import numpy as np

from phiotdr.config import CLASS_NAMES, NUM_POINTS

from ..db import EventStore
from .inference import Engine

log = logging.getLogger(__name__)
# Share of windows that are quiet fiber. A window lasts frames_per_sample * frame_ms = 3 s; the rest is split evenly
# over the 5 event classes, 3 of which are threats -> a threat every 3 / (0.25 * 3/5) = 20 s on average (plan: 20-30 s).
BACKGROUND_SHARE = 0.75


class Subscriber:
    def __init__(self) -> None:
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=200)
        self.paused = False

    def offer(self, msg: dict) -> None:
        if self.paused and msg["type"] != "prediction":
            return                                          # paused clients still hear about alerts
        if self.queue.full():                               # slow client: drop the oldest frame rather than block
            with contextlib.suppress(asyncio.QueueEmpty):
                self.queue.get_nowait()
        self.queue.put_nowait(msg)


class Streamer:
    def __init__(self, engine: Engine, store: EventStore, frame_ms: int, frames_per_sample: int, seed: int = 0):
        self.engine, self.store = engine, store
        self.frame_ms, self.frames = frame_ms, frames_per_sample
        self.speed = 1.0
        self.subscribers: set[Subscriber] = set()
        self._task: asyncio.Task | None = None
        self._rng = np.random.default_rng(seed)
        labels = engine.samples.index["class_name"].to_numpy()
        self._bg = np.flatnonzero(labels == "background")
        self._events = np.flatnonzero(labels != "background")

    def hello(self) -> dict:
        return {"type": "hello", "frame_ms": self.frame_ms, "frames_per_sample": self.frames, "points": NUM_POINTS,
                "classes": CLASS_NAMES, "speed": self.speed}

    def subscribe(self) -> Subscriber:
        sub = Subscriber()
        self.subscribers.add(sub)
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        self.subscribers.discard(sub)

    def set_speed(self, value: float) -> None:
        self.speed = float(min(4.0, max(0.5, value)))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    def _broadcast(self, msg: dict) -> None:
        for sub in list(self.subscribers):
            sub.offer(msg)

    def _next_sample(self) -> int:
        pool = self._bg if self._rng.random() < BACKGROUND_SHARE else self._events
        return int(self._rng.choice(pool))

    async def _run(self) -> None:
        try:
            while self.subscribers:
                sid = self._next_sample()
                prepared = self.engine.samples.prepared(sid)
                values = prepared.display
                step = values.shape[1] // self.frames
                self._broadcast({"type": "sample_start", "sample_id": sid, "frames": self.frames})
                for f in range(self.frames):
                    if not self.subscribers:
                        return
                    chunk = values[:, f * step:(f + 1) * step].round(3).tolist()
                    self._broadcast({"type": "frame", "sample_id": sid, "frame_idx": f, "values": chunk})
                    await asyncio.sleep(self.frame_ms / 1000 / self.speed)
                pred = await asyncio.to_thread(self.engine.predict_prepared, prepared)
                info = self.engine.samples.info(sid)
                ev = await asyncio.to_thread(
                    self.store.add, source="stream", sample_id=sid, file=info["file"], pred=pred["predicted_class"],
                    confidence=pred["confidence"], alert_level=pred["alert_level"], true_label=info["true_label"],
                    top_point=pred["top_point"])
                self._broadcast({"type": "prediction", "sample_id": sid, "file": info["file"],
                                 "true_label": info["true_label"], "event_id": ev.id,
                                 "ts": ev.ts.isoformat() + "Z", **pred})
        except asyncio.CancelledError:
            raise
        except Exception:                                     # keep the server alive; clients see the stream stop
            log.exception("stream simulator crashed")
