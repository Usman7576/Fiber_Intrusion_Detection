# Phase 2 — Baseline reproduction

Official split: 12,335 train (1,234 held out as validation) / 3,083 test.
One test file (`test/01_background/220112_cxm_background_01_single_data_2.mat`) is empty in the source zip and is excluded.
All runs on a 4-core laptop CPU, no GPU.

## Results on the official test split

| Run | What it is | Accuracy | Macro-F1 | NAR | FNR | Dig miss rate | Params | Latency / sample |
|---|---|---|---|---|---|---|---|---|
| Paper SVM | Cao et al. 2023 | **82.6%** | — | — | — | — | — | — |
| Paper CNN | Cao et al. 2023 | **94.0%** | — | — | — | — | — | — |
| `svm_paper` | authors' SVM settings (MinMax, C=1, gamma=auto), our fixed features | 88.0% | 0.879 | 0.04% | 6.45% | 23.9% | — | — |
| `svm_tuned` | StandardScaler, C=10, gamma=0.001 (picked on validation) | **98.8%** | 0.988 | 0.04% | 0.12% | 1.0% | 760 k* | 22.7 ms |
| `paper_cnn` | authors' CNN and settings (Adam 1e-4, batch 100, 50 epochs) | 85.9% | 0.855 | 0.85% | 1.92% | 14.5% | 4,721 | 0.40 ms |
| `paper_cnn_long` | same CNN, lr 1e-3 + plateau schedule, early stopping | **93.2%** | 0.930 | 0.52% | 0.92% | 6.4% | 4,721 | 0.29 ms |

\* support-vector coefficients. SVM latency includes extracting the 384 features from the raw 10,000 × 12 sample.

NAR = share of raised alarms that were really background; FNR = share of real events classified as background
(the authors' definitions). Dig miss rate = share of real digging not classified as digging.

## Reproduction verdict

- **CNN reproduced**: 93.2% vs the paper's 94.0%. With the authors' exact settings, 50 epochs at lr 1e-4 is
  under-trained (train and validation both ~86% and still rising); a higher learning rate closes the gap.
  The model sees 1,000 mean-pooled time steps instead of 10,000, with the first layer's kernel and stride
  divided by 10 so every later layer has the original shape.
- **SVM reproduced**: on a random 2,400 / 600 subset the authors' exact pipeline gives the paper's number:

  | SVM pipeline (C=1, gamma=auto, MinMax), subset | Test accuracy |
  |---|---|
  | Authors' code: uint16 wrap-around in the difference features + scaler refit on test | 75.0% |
  | Wrap-around fixed only | 81.0% |
  | **Both fixed** | **82.5%** (paper: 82.6%) |

  On the full data the same settings give 88.0%.

## Findings

1. **The SVM is far stronger than the paper reports.** Tuning C and gamma (C=10, gamma=0.001, standard scaling)
   lifts it from 88.0% to 98.8%. The paper used scikit-learn defaults. This raises the bar for the improved
   model: beating 94.0% is not enough to claim a win over a well-tuned classical model.
2. **Bugs in the authors' SVM code** (`get_das_data.py`, `das_data_svm.py`): the first difference is taken on
   uint16 arrays, so negative steps wrap to ~65,000, and the MinMax scaler is re-fitted on the test set.
3. **Session "fingerprint" exists but is not what the SVM uses.** The 12 per-point raw means alone (no vibration
   information) give 73.9% test accuracy, because each recording session captured one event type at its own
   baseline light level. Removing every level feature (max, min, mean, RMS, ARV) still gives 98.8%, so the SVM
   relies on the vibration. The cross-recorder test in Phase 4 will check how much of the accuracy survives on
   unseen sessions.
4. **Hardest classes**: walk and water for both models; digging is the CNN's weakest threat class (6.4% missed).

Files: `metrics_*.json`, `confusion_*.png`, `history_paper_cnn*.csv`, `svm_grid.json`.
