"""FastAPI app. Run from the backend/ folder:

    uvicorn app.main:app --reload --port 8000        (Swagger UI: http://localhost:8000/docs)
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .db import EventStore
from .routers import events, explain, health, metrics, predict, samples, stream
from .services.inference import Engine
from .services.streamer import Streamer
from .settings import Settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.started = time.time()
        app.state.engine = Engine(settings)
        app.state.store = EventStore(settings.db_path)
        app.state.streamer = Streamer(app.state.engine, app.state.store, settings.frame_ms, settings.frames_per_sample)
        logging.getLogger(__name__).info("model %s loaded, %d demo samples, events db %s",
                                         settings.model_run, len(app.state.engine.samples), settings.db_path)
        yield
        await app.state.streamer.stop()
        app.state.store.close()

    app = FastAPI(title="Fiber Intrusion Detection API", version=__version__, lifespan=lifespan,
                  description="Classifies phi-OTDR vibration windows from buried optical fiber "
                              "(background, dig, knock, water, shake, walk) and raises alerts.")
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"],
                       allow_headers=["*"])
    for r in (health, predict, samples, explain, metrics, events, stream):
        app.include_router(r.router, prefix="/api")

    @app.get("/", include_in_schema=False)
    def root():
        return {"name": app.title, "docs": "/docs", "health": "/api/health"}

    return app


app = create_app()
