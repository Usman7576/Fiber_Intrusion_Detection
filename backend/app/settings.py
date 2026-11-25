"""Runtime settings, read from environment variables (all optional).

    FIBER_CORS_ORIGINS        comma-separated origins allowed to call the API (default: local Next.js dev server)
    FIBER_DB_PATH             SQLite file for the event history (default: backend/events.db)
    FIBER_MODEL_RUN           trained run in ml/models/ to serve (default: phiotdr.config.DEPLOYED_RUN)
    FIBER_CONFIDENCE          below this confidence a prediction is reported as "uncertain" (default 0.6)
    FIBER_FRAME_MS            live stream: milliseconds between frames at speed 1 (default 150)
    FIBER_TORCH_THREADS       CPU threads for PyTorch (default 2)
    FIBER_LOAD_SVM            "0" to skip loading the SVM used for model comparison (default "1")
    FIBER_BASELINE_RUN        paper CNN run shown in the model comparison, "" to skip (default paper_cnn_long)

Values in backend/.env (KEY=VALUE lines, see .env.example) are used when the variable is not already set.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from phiotdr.config import DEPLOYED_RUN

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(__file__).resolve().parent / "data"


def load_dotenv(path: Path = BACKEND_DIR / ".env") -> None:
    """Minimal .env reader: KEY=VALUE per line, # comments, optional quotes. Real env vars win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()


def _origins() -> list[str]:
    raw = os.getenv("FIBER_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return [o.strip() for o in raw.split(",") if o.strip()]


@dataclass(frozen=True)
class Settings:
    cors_origins: list[str] = field(default_factory=_origins)
    db_path: Path = field(default_factory=lambda: Path(os.getenv("FIBER_DB_PATH", BACKEND_DIR / "events.db")))
    model_run: str = field(default_factory=lambda: os.getenv("FIBER_MODEL_RUN", DEPLOYED_RUN))
    confidence_threshold: float = field(default_factory=lambda: float(os.getenv("FIBER_CONFIDENCE", "0.6")))
    frame_ms: int = field(default_factory=lambda: int(os.getenv("FIBER_FRAME_MS", "150")))
    frames_per_sample: int = 20
    torch_threads: int = field(default_factory=lambda: int(os.getenv("FIBER_TORCH_THREADS", "2")))
    load_svm: bool = field(default_factory=lambda: os.getenv("FIBER_LOAD_SVM", "1") != "0")
    baseline_run: str = field(default_factory=lambda: os.getenv("FIBER_BASELINE_RUN", "paper_cnn_long"))
    max_upload_bytes: int = 2 * 1024 * 1024
    demo_pack: Path = DATA_DIR / "demo_pack.npz"
    demo_index: Path = DATA_DIR / "demo_index.csv"
