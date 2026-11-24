# Phase 3 — Improved lightweight model

Same data and split as Phase 2: 11,101 train / 1,234 validation / 3,083 official test. Input is (12 fiber points × 1,000 time steps):
each sample is z-scored, then mean-pooled ×10 in time. Every run used a 4-core laptop CPU with no GPU.
The epoch with the best validation accuracy was kept, then tested once on the official test split.

Shared recipe: Adam lr 1e-3, weight decay 1e-4, batch 64, cosine schedule, 40 epochs max, early stopping (patience 12),
on-the-fly augmentation (random time shift ±25%, amplitude scale 0.8–1.2, Gaussian noise σ=0.05, fiber-direction flip).

## Candidates

| Model | Idea | Params | Accuracy | Macro-F1 | NAR | FNR | Dig miss | Latency* | Train time |
|---|---|---|---|---|---|---|---|---|---|
| `net1d` | 1D residual CNN, fiber points as channels | 181 k | **99.06%** | **0.990** | 0.08% | 0.08% | 1.20% | 2.6 ms | 18 min |
| `cnn_bilstm` | conv front-end + BiLSTM + attention pooling | 152 k | 98.80% | 0.988 | 0.04% | 0.16% | 1.59% | 1.8 ms | 26 min |
| `spec_cnn` | in-model STFT → 2D CNN on 12-channel spectrogram | 105 k | 98.54% | 0.985 | 0.28% | 0.04% | 2.19% | 4.2 ms | 34 min |

## Ablations on Net1D

| Run | Change | Accuracy | Macro-F1 | NAR | FNR | Dig miss |
|---|---|---|---|---|---|---|
| `net1d` | reference (augment, equal class weights) | 99.06% | 0.990 | 0.08% | 0.08% | 1.20% |
| `net1d_noaug` | no augmentation | 98.96% | 0.989 | 0.12% | 0.04% | 1.39% |
| `net1d_dig2` | augment + 2× loss weight on dig | 99.03% | 0.990 | 0.12% | 0.08% | **0.80%** |

On a 3,083-sample test set, 0.1 percentage points is about 3 samples. The ablation differences are within run-to-run noise.
Augmentation helps a little. The dig weight trades nothing measurable in accuracy for about one-third fewer missed digging events.
Digging is the most dangerous threat to a buried cable, so **`net1d_dig2` is the model deployed in the backend**.

## Comparison with the baselines

| Run | Accuracy | Macro-F1 | Dig miss | Model size on disk | Latency / sample* |
|---|---|---|---|---|---|
| Paper CNN (Cao et al. 2023, reported) | 94.0% | — | — | — | — |
| `paper_cnn_long` (our reproduction) | 93.2% | 0.930 | 6.4% | 22 KB | 0.3 ms |
| `svm_tuned` (our tuned SVM) | 98.8% | 0.988 | 1.0% | 6.2 MB | 22.7 ms (incl. features) |
| **`net1d_dig2` (ours)** | **99.0%** | **0.990** | **0.8%** | **0.73 MB** | **2.6–3.9 ms** |

\* Single-sample CPU latency including preprocessing. It varies by about ±1 ms with machine load, because the ablations ran while other work used the CPU.

Per-class F1, deployed model vs. tuned SVM:

| | background | dig | knock | water | shake | walk |
|---|---|---|---|---|---|---|
| `svm_tuned` | 0.997 | 0.980 | 0.992 | 0.984 | 0.997 | 0.974 |
| `net1d_dig2` | 0.996 | **0.992** | **0.995** | 0.979 | 0.988 | **0.990** |

## Takeaways

1. A small 1D CNN that treats the 12 fiber points as input channels beats the paper's CNN by about 5 points (99.0% vs 94.0%).
   It also edges out a properly tuned SVM, while being about 8× smaller and about 6–9× faster per sample. It needs no
   hand-crafted features.
2. The time-series view (1D conv) works better than the time-frequency view (spectrogram CNN) here. The recurrent
   layer adds cost without adding accuracy.
3. The model makes 30 errors in 3,083 test samples. The largest single source is water predicted as shake (8 samples),
   followed by scattered confusions among water, walk and shake. Digging is missed only 4 times in 502
   (1 → water, 1 → shake, 2 → walk) and is never classified as background. Knock is near-perfect.
4. All these numbers are on the official split, where train and test share recording sessions. Phase 4 tests
   held-out recorders/sessions to see how much of this survives on unseen conditions.

Files: `metrics_net1d*.json`, `metrics_cnn_bilstm.json`, `metrics_spec_cnn.json`, matching `confusion_*.png` and
`history_*.csv`; weights in `ml/models/`.
