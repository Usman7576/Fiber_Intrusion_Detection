from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from phiotdr.data_loader import SampleError

from ..db import EventStore
from ..schemas import UploadPrediction
from ..services.inference import Engine, plot_signal
from .deps import engine, store

router = APIRouter(tags=["predict"])


@router.post("/predict", response_model=UploadPrediction)
async def predict(file: UploadFile = File(..., description="a dataset .mat file: variable `data`, 10000 x 12"),
                  compare: bool = Query(True, description="also run the tuned SVM"),
                  explain: bool = Query(False, description="include Grad-CAM / Integrated-Gradients maps"),
                  eng: Engine = Depends(engine), st: EventStore = Depends(store)):
    """Classify an uploaded phi-OTDR sample and store it in the event history."""
    limit = eng.settings.max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"file larger than {limit // 1024} KB")
    if not data:
        raise HTTPException(400, "empty file")
    try:
        prepared = await run_in_threadpool(eng.prepare_upload, data)
    except SampleError as exc:
        raise HTTPException(400, str(exc)) from exc
    out = await run_in_threadpool(eng.predict_prepared, prepared, compare, explain)
    ev = await run_in_threadpool(st.add, source="upload", file=file.filename, pred=out["predicted_class"],
                                 confidence=out["confidence"], alert_level=out["alert_level"],
                                 top_point=out["top_point"])
    return {**out, "file": file.filename or "upload.mat", "event_id": ev.id, "signal": plot_signal(prepared.display)}
