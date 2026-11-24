"""Tests for the loader and preprocessing, using small synthetic .mat files (no real data needed)."""

import io

import numpy as np
import pytest
from scipy.io import savemat

from phiotdr.config import CLASS_FOLDERS, NUM_POINTS, RAW_TIME
from phiotdr.data_loader import SampleError, load_index, load_mat, parse_filename
from phiotdr.preprocess import augment, crop_resize, downsample, preprocess


def _fake_sample(rng, event=False):
    x = rng.normal(8200, 60, size=(RAW_TIME, NUM_POINTS))
    if event:
        x[:, 4:9] += rng.normal(0, 180, size=(RAW_TIME, 5))
    return x.astype(np.uint16)


@pytest.fixture
def fake_raw(tmp_path):
    rng = np.random.default_rng(0)
    for split in ("train", "test"):
        lines = []
        for label, folder in enumerate(CLASS_FOLDERS):
            (tmp_path / split / folder).mkdir(parents=True)
            name = f"220112_cxm_{folder[3:]}_01_single_data_{label}.mat"
            savemat(tmp_path / split / folder / name, {"data": _fake_sample(rng, event=label > 0)})
            lines.append(f"/{folder}/{name} {label}")
        (tmp_path / split / "label.txt").write_text("\n".join(lines) + "\n")
    return tmp_path


def test_parse_filename():
    assert parse_filename("220113_jzy_water_02_single_data_11.mat") == {"date": "220113", "recorder": "jzy"}
    assert parse_filename("weird.mat")["recorder"] == "unknown"
    assert parse_filename("220517_digging_fast1_single_data_3.mat") == {"date": "220517", "recorder": "unknown"}
    assert parse_filename("220509_bkg_04_walk30s_single_data_1.mat")["recorder"] == "unknown"


def test_load_index(fake_raw):
    idx = load_index(fake_raw)
    assert len(idx) == 12
    assert set(idx["split"]) == {"train", "test"}
    assert list(idx.query("split == 'train'")["class_name"]) == ["background", "dig", "knock", "water", "shake", "walk"]
    assert (idx["recorder"] == "cxm").all()


def test_load_mat_from_path_and_bytes(fake_raw):
    idx = load_index(fake_raw)
    arr = load_mat(idx.loc[0, "path"])
    assert arr.shape == (RAW_TIME, NUM_POINTS) and arr.dtype == np.uint16
    with open(idx.loc[0, "path"], "rb") as fh:
        assert load_mat(io.BytesIO(fh.read())).shape == (RAW_TIME, NUM_POINTS)


def test_load_mat_rejects_bad_input(tmp_path):
    p = tmp_path / "bad.mat"
    savemat(p, {"data": np.zeros((100, 12))})
    with pytest.raises(SampleError, match="shape"):
        load_mat(p)
    savemat(p, {"other": np.zeros((RAW_TIME, NUM_POINTS))})
    with pytest.raises(SampleError, match="not found"):
        load_mat(p)
    with pytest.raises(SampleError):
        load_mat(io.BytesIO(b"not a mat file"))


def test_preprocess_shape_and_stats():
    raw = _fake_sample(np.random.default_rng(1))
    x = preprocess(raw)
    assert x.shape == (NUM_POINTS, 1000) and x.dtype == np.float32
    assert abs(float(downsample(raw.astype(np.float32))[0, 0]) - raw[:10, 0].mean()) < 1e-3


def test_augment_keeps_shape():
    x = preprocess(_fake_sample(np.random.default_rng(2)))
    y = augment(x, np.random.default_rng(3))
    assert y.shape == x.shape and y.dtype == np.float32 and not np.allclose(x, y)


def test_crop_resize_keeps_shape_and_stretches():
    x = np.tile(np.arange(1000, dtype=np.float32), (12, 1))
    rng = np.random.default_rng(0)
    for _ in range(5):
        y = crop_resize(x, rng)
        assert y.shape == x.shape and y.dtype == np.float32
        assert np.all(np.diff(y[0]) >= 0)            # order preserved
        assert y[0, -1] - y[0, 0] <= 999 + 1e-3      # a window, so the range can only shrink
    y = augment(preprocess(_fake_sample(np.random.default_rng(4))), np.random.default_rng(5), crop=True)
    assert y.shape == (12, 1000)


def test_session_id():
    from phiotdr.data_loader import session_id
    assert session_id("220122_cxm_walk_01_single_data_6.mat") == "220122_cxm_walk_01"
    assert session_id("/05_shake/220517_shake_slow3_single_data_12.mat") == "220517_shake_slow3"
