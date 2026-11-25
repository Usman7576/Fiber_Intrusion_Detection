from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from phiotdr.config import CLASS_NAMES

from ..schemas import SampleList, SamplePrediction, SampleSignal
from ..services.inference import Engine, plot_signal, point_energy
from .deps import engine, sample_index

router = APIRouter(tags=["samples"])


@router.get("/samples", response_model=SampleList)
def list_samples(cls: str | None = Query(None, description="filter by true class"),
                 limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                 eng: Engine = Depends(engine)):
    """Demo samples from the official test split (a stratified subset plus every sample the model gets wrong)."""
    idx = eng.samples.index
    if cls:
        if cls not in CLASS_NAMES:
            raise HTTPException(400, f"unknown class {cls!r}; choose from {CLASS_NAMES}")
        idx = idx[idx["class_name"] == cls]
    page = idx.iloc[offset:offset + limit]
    return {"total": len(idx), "items": [eng.samples.info(int(i)) for i in page["id"]]}


@router.get("/samples/{sample_id}", response_model=SampleSignal)
def get_sample(sample_id: int = Depends(sample_index), eng: Engine = Depends(engine)):
    p = eng.samples.prepared(sample_id)
    return {**eng.samples.info(sample_id), "signal": plot_signal(p.display),
            "point_energy": point_energy(p.point_std).round(3).tolist()}


@router.get("/samples/{sample_id}/prediction", response_model=SamplePrediction)
async def predict_sample(sample_id: int = Depends(sample_index), compare: bool = True, eng: Engine = Depends(engine)):
    """Classify a demo sample (not stored as an event)."""
    out = await run_in_threadpool(eng.predict_prepared, eng.samples.prepared(sample_id), compare)
    info = eng.samples.info(sample_id)
    return {**out, "sample": info, "correct": out["predicted_class"] == info["true_label"]}
