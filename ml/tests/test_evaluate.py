import numpy as np

from phiotdr.evaluate import compute_metrics


def test_perfect_predictions():
    y = np.repeat(np.arange(6), 10)
    m = compute_metrics(y, y)
    assert m["accuracy"] == 1.0 and m["nar"] == 0.0 and m["fnr"] == 0.0 and m["dig_miss_rate"] == 0.0


def test_nar_fnr_match_authors_definitions():
    # 10 background: 2 predicted as dig (nuisance alarms)
    # 10 dig: 1 predicted as background (missed), 1 predicted as knock (wrong class, still an alarm)
    y_true = np.array([0] * 10 + [1] * 10)
    y_pred = np.array([0] * 8 + [1] * 2 + [0] + [2] + [1] * 8)
    m = compute_metrics(y_true, y_pred)
    assert np.isclose(m["nar"], 2 / 11)          # 11 predicted events, 2 of them background
    assert np.isclose(m["fnr"], 1 / 10)          # 10 true events, 1 predicted background
    assert np.isclose(m["dig_miss_rate"], 2 / 10)
    assert np.isclose(m["accuracy"], 16 / 20)
