from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from ..schemas import Explanation
from ..services.inference import Engine
from .deps import engine, sample_index

router = APIRouter(tags=["explain"])


@router.get("/explain/{sample_id}", response_model=Explanation)
async def explain_sample(sample_id: int = Depends(sample_index), eng: Engine = Depends(engine)):
    """Why the model predicted what it did: Grad-CAM over time + Integrated-Gradients map (cached per sample)."""
    p = eng.samples.prepared(sample_id)
    return await run_in_threadpool(eng.explanation, p.model_input, sample_id)
