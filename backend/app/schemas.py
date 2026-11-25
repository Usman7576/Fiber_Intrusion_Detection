"""Response models (they also drive the Swagger docs at /docs)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_serializer

AlertLevel = Literal["critical", "warning", "info", "normal", "uncertain"]


class ModelVote(BaseModel):
    model: str
    predicted_class: str
    confidence: float
    confidences: dict[str, float]
    latency_ms: float


class Explanation(BaseModel):
    target: str = Field(description="class the explanation is for (the predicted one)")
    time_importance: list[float] = Field(description="Grad-CAM over time, 100 bins, 0..1")
    point_importance: list[float] = Field(description="share of Integrated-Gradients attribution per fiber point")
    map: list[list[float]] = Field(description="12 x 100 Integrated-Gradients magnitude, 0..1")


class Prediction(BaseModel):
    predicted_class: str
    label: int
    confidence: float
    confidences: dict[str, float]
    alert_level: AlertLevel
    is_threat: bool
    latency_ms: float = Field(description="preprocessing + model, milliseconds")
    top_point: int = Field(description="fiber point (1-12) with the strongest vibration")
    point_energy: list[float] = Field(description="relative vibration energy per fiber point, max = 1")
    model: str
    compare: list[ModelVote] | None = None
    explanation: Explanation | None = None


class UploadPrediction(Prediction):
    file: str
    event_id: int
    signal: list[list[float]] = Field(description="12 x 500 display signal for plotting")


class SampleInfo(BaseModel):
    id: int
    file: str
    true_label: str
    recorder: str
    date: str
    session: str


class SampleList(BaseModel):
    total: int
    items: list[SampleInfo]


class SampleSignal(SampleInfo):
    signal: list[list[float]] = Field(description="12 x 500 display signal (per-point mean removed, one global scale)")
    point_energy: list[float]


class SamplePrediction(Prediction):
    sample: SampleInfo
    correct: bool


class EventOut(BaseModel):
    id: int
    ts: datetime
    source: str
    sample_id: int | None
    file: str | None
    pred: str
    confidence: float
    alert_level: str
    true_label: str | None
    top_point: int

    model_config = {"from_attributes": True}

    @field_serializer("ts")
    def _utc(self, ts: datetime) -> str:
        return (ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)).isoformat().replace("+00:00", "Z")


class EventStats(BaseModel):
    since: datetime | None
    total: int
    by_class: dict[str, int]
    by_level: dict[str, int]


class Health(BaseModel):
    status: Literal["ok"]
    version: str
    model: str
    model_params: int
    normalise: str
    svm_loaded: bool
    demo_samples: int
    events_stored: int
    uptime_s: float
