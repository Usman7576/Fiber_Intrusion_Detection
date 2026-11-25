import time

from fastapi import APIRouter, Depends, Request

from .. import __version__
from ..db import EventStore
from ..schemas import Health
from ..services.inference import Engine
from .deps import engine, store

router = APIRouter(tags=["system"])


@router.get("/health", response_model=Health)
def health(request: Request, eng: Engine = Depends(engine), st: EventStore = Depends(store)):
    return {"status": "ok", "version": __version__, "model": eng.run, "model_params": eng.params,
            "normalise": eng.normalise, "svm_loaded": eng.svm is not None, "demo_samples": len(eng.samples),
            "events_stored": st.total(), "uptime_s": round(time.time() - request.app.state.started, 1)}
