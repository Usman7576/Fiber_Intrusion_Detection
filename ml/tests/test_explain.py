import numpy as np
import torch

from phiotdr.explain import explain
from phiotdr.models import build_model


def test_explain_shapes_and_ranges():
    torch.manual_seed(0)
    model = build_model("net1d").eval()
    x = np.random.default_rng(0).normal(size=(12, 1000)).astype(np.float32)
    out = explain(model, x, ig_steps=4)
    assert abs(sum(out["probabilities"].values()) - 1) < 1e-5
    assert out["target"] == out["predicted"]
    assert len(out["time_importance"]) == 1000 and 0 <= min(out["time_importance"]) and max(out["time_importance"]) <= 1
    assert len(out["point_importance"]) == 12 and abs(sum(out["point_importance"]) - 1) < 1e-2
    assert np.array(out["map"]).shape == (12, 1000)
