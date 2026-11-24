import pytest
import torch

from phiotdr.models import MODELS, build_model, count_params


@pytest.mark.parametrize("name", sorted(MODELS))
def test_model_output_shape_and_size(name):
    model = build_model(name).eval()
    with torch.no_grad():
        out = model(torch.randn(3, 12, 1000))
    assert out.shape == (3, 6)
    assert count_params(model) < 1_000_000


def test_unknown_model():
    with pytest.raises(ValueError):
        build_model("nope")
