"""API tests. Run from backend/:  python -m pytest -q"""

from __future__ import annotations

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.io import savemat

from app.main import create_app
from app.services.inference import alert_level
from app.settings import Settings
from phiotdr.config import CLASS_NAMES


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    db = tmp_path_factory.mktemp("db") / "events.db"
    with TestClient(create_app(Settings(db_path=db, frame_ms=1))) as c:
        yield c


def mat_bytes(arr: np.ndarray, key: str = "data") -> bytes:
    buf = io.BytesIO()
    savemat(buf, {key: arr})
    return buf.getvalue()


def fake_sample(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = rng.normal(30000, 300, size=(10000, 12))
    x[4000:6000, 5:8] += rng.normal(0, 3000, size=(2000, 3))          # a burst on points 6-8
    return x.clip(0, 65535).astype(np.uint16)


def test_health(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["normalise"] == "channel" and h["demo_samples"] > 300 and h["svm_loaded"]


def test_samples_list_filter_and_signal(client):
    r = client.get("/api/samples", params={"cls": "dig", "limit": 5}).json()
    assert r["total"] >= 50 and len(r["items"]) == 5 and all(s["true_label"] == "dig" for s in r["items"])
    s = client.get(f"/api/samples/{r['items'][0]['id']}").json()
    assert np.array(s["signal"]).shape == (12, 500) and len(s["point_energy"]) == 12
    assert client.get("/api/samples", params={"cls": "nope"}).status_code == 400
    assert client.get("/api/samples/99999").status_code == 404


def test_sample_prediction_and_compare(client):
    p = client.get("/api/samples/0/prediction").json()
    assert p["predicted_class"] in CLASS_NAMES and abs(sum(p["confidences"].values()) - 1) < 1e-3
    assert 1 <= p["top_point"] <= 12 and {v["model"] for v in p["compare"]} == {"net1d_dig2_chnorm", "svm_tuned"}


def test_demo_pack_accuracy_matches_model(client):
    """The pack rebuilds the model input exactly: the official-test samples in it are classified as in training."""
    ids = client.get("/api/samples", params={"limit": 500}).json()["items"]
    preds = [client.get(f"/api/samples/{s['id']}/prediction", params={"compare": False}).json() for s in ids[:60]]
    assert np.mean([p["correct"] for p in preds]) > 0.8          # pack is enriched with the model's mistakes


def test_explain_shapes(client):
    e = client.get("/api/explain/3").json()
    assert np.array(e["map"]).shape == (12, 100) and len(e["time_importance"]) == 100
    assert abs(sum(e["point_importance"]) - 1) < 0.02


def test_upload_predict_and_event(client):
    r = client.post("/api/predict", params={"explain": True},
                    files={"file": ("burst.mat", mat_bytes(fake_sample()), "application/octet-stream")})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["file"] == "burst.mat" and np.array(p["signal"]).shape == (12, 500)
    assert p["top_point"] in (6, 7, 8) and p["explanation"]["target"] == p["predicted_class"]
    assert p["alert_level"] == alert_level(p["predicted_class"], p["confidence"], 0.6)
    ev = client.get("/api/events", params={"source": "upload", "limit": 1}).json()[0]
    assert ev["id"] == p["event_id"] and ev["file"] == "burst.mat" and ev["ts"].endswith("Z")


def test_upload_transposed_is_accepted(client):
    r = client.post("/api/predict", files={"file": ("t.mat", mat_bytes(fake_sample(1).T))})
    assert r.status_code == 200


@pytest.mark.parametrize("payload, code", [
    (b"not a mat file", 400),
    (b"", 400),
    (mat_bytes(np.zeros((500, 12))), 400),                         # wrong shape
    (mat_bytes(np.zeros((10000, 12)), key="signal"), 400),         # wrong variable name
    (b"0" * (2 * 1024 * 1024 + 10), 413),                          # too large
])
def test_upload_rejects_bad_files(client, payload, code):
    r = client.post("/api/predict", files={"file": ("bad.mat", payload)})
    assert r.status_code == code and "detail" in r.json()


def test_metrics(client):
    m = client.get("/api/metrics").json()
    assert m["classes"] == CLASS_NAMES and m["deployed"] == "net1d_dig2_chnorm"
    deployed = [x for x in m["models"] if x["deployed"]]
    assert len(deployed) == 1 and deployed[0]["accuracy"] > 0.95
    assert np.array(deployed[0]["confusion_matrix"]).shape == (6, 6)
    assert deployed[0]["unseen_days_accuracy"] is not None


def test_stream_frames_then_prediction(client):
    with client.websocket_connect("/api/stream") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello" and hello["points"] == 12
        ws.send_json({"cmd": "speed", "value": 4})
        frames, pred = 0, None
        for _ in range(200):
            msg = ws.receive_json()
            if msg["type"] == "frame":
                assert np.array(msg["values"]).shape == (12, 50)
                frames += 1
            elif msg["type"] == "prediction":
                pred = msg
                break
        assert pred is not None and frames >= 1 and pred["event_id"] > 0
        assert pred["alert_level"] in {"critical", "warning", "info", "normal", "uncertain"}
    stats = client.get("/api/events/stats").json()
    assert stats["by_class"] and stats["total"] >= 1


@pytest.mark.parametrize("cls, conf, level", [
    ("dig", 0.95, "critical"), ("knock", 0.7, "warning"), ("shake", 0.61, "warning"),
    ("walk", 0.9, "info"), ("water", 0.9, "info"), ("background", 0.99, "normal"), ("dig", 0.55, "uncertain"),
])
def test_alert_levels(cls, conf, level):
    assert alert_level(cls, conf, 0.6) == level
