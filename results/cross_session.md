# Phase 4 — Generalisation to unseen recordings, and explainability

## 4.1 How much does the official split flatter the models?

Each dataset file is one window cut from a longer continuous recording ("session",
e.g. `220122_cxm_walk_01_single_data_6.mat` belongs to session `220122_cxm_walk_01`).
**All 3,083 official test samples come from sessions that also appear in training** (423 of 424 test sessions are shared).
The official split is a random split *within* recordings, so a model can lean on each recording's background
noise and light level, the session "fingerprint" found in Phase 2.

Leave-one-recorder-out is not possible here: recorders are confounded with classes
(`results/recorders.csv`: shake is almost only `yu`, background only `cxm` + unlabelled files).
Instead, the official train + test sets were pooled (15,418 samples) and re-split with whole groups held out
(`StratifiedGroupKFold`, seed 0, every class present on both sides of every fold):

- **Unseen sessions**: 5 folds over 441 sessions. Recordings are new, but similar ones from the same days exist in training.
- **Unseen days**: 3 folds over 21 recording dates. Every recording of a day is held out, which is the closest proxy for
  installing the system at a new site.

Same training recipes as Phase 3 but with a fixed number of epochs (25 for Net1D, 60 for the paper CNN, cosine
schedule, final weights). Cross-validation has no validation split, so nothing is tuned on held-out data.
The SVM uses the C/gamma chosen in Phase 2. Script: `ml/scripts/cross_session.py`.

| Model | Official split | Unseen sessions (5-fold) | Unseen days (3-fold) | Dig miss, unseen sessions | Dig miss, unseen days |
|---|---|---|---|---|---|
| Paper CNN (`paper_cnn`) | 93.2% | 91.4% ± 1.4 | 64.7% ± 2.6 | 9.3% | 41.4% |
| Tuned SVM (`svm`) | 98.8% | 98.5% ± 0.5 | 73.8% ± 10.3 | 1.5% | 35.4% |
| Net1D, per-sample z-score (`net1d_dig2`) | 99.0% | 97.8% ± 0.4 | 72.8% ± 10.5 | 2.3% | 24.1% |
| **Net1D, per-point z-score (`net1d_dig2_chnorm`)** | **99.2%** | **99.1% ± 0.3** | **80.1% ± 8.3** | **0.9%** | **23.1%** |

(± = standard deviation over folds; fold-level rows in `cross_*_folds.csv`, pooled confusion matrices in `cross_*_<model>.json`.)

### What this shows

1. **New sessions are fine, new days are not.** Every model keeps most of its accuracy on unseen sessions, but loses
   20–30 points on unseen days. The test numbers in Phases 2–3 (and in the paper) describe recordings made under
   conditions already seen in training. They do not describe a new deployment.
2. **Per-point normalisation is the most robust choice, and it is now the deployed model.** Z-scoring each fiber point
   separately removes the per-point baseline light level, which differs between recordings. That gives +1.3 points on
   unseen sessions and +7.3 points on unseen days over the per-sample version, fewer false alarms (NAR 1.3% vs 4.5% on
   unseen days), and the best digging detection. It beats the tuned SVM by 6.3 points on unseen days. On the official
   split it is equal to the others, so the choice was made on these held-out tests, not on the official test set.
   (`DEPLOYED_RUN` in `ml/phiotdr/config.py`.)
3. **Where it breaks: one recording campaign vs another.** Digging accuracy per held-out day (deployed model):

   | Digging recorded on | 4 Jan | 10 Jan | 13 Jan | 16 Jan | 17 Jan | 21 Jan | 18 Apr | 28 Apr | 17 May |
   |---|---|---|---|---|---|---|---|---|---|
   | Accuracy when that day is unseen | 99% | 96% | 100% | 99% | 98% | 99% | 100% | **33%** | **13%** |

   January digging is recognised on any unseen January day. The two spring digging days (28 Apr and 17 May, 712
   samples) fell in the same fold, leaving only 27 spring digging samples in training. The model then labels most spring
   digging as **walk**. This is the main cause of the high "unseen days" dig miss rate. The same pattern hits shake
   (only 3 recording days exist, so each fold trains on 2) and appears as shake ↔ water confusion. The fix is more
   recording days per class, ideally from the site where the system will run, rather than a different model.
   The app will show low-confidence predictions as "uncertain" for this reason.

## 4.2 Explainability

Module: `ml/phiotdr/explain.py` (shared with the backend). Report script: `ml/scripts/explain_report.py`.
Figures: `results/explain/`.

- **Grad-CAM** (Captum `LayerGradCam` on Net1D's last residual block, upsampled to 1,000 steps): *when* in the
  window the evidence is.
- **Integrated Gradients** (32 steps, zero baseline = the sample mean after z-scoring): a 12 × 1,000 map of *where
  and when*, plus each fiber point's share of the total attribution.
- One correctly classified test sample per class: `net1d_dig2_chnorm_<class>.png` (deployed model) and
  `net1d_dig2_<class>.png`.

**Do the explanations point at real evidence? (deletion test)** For 300 event samples, one window of the time axis
is overwritten with the same window from a real background recording. Either the window Grad-CAM marks as most
important is replaced, or a random window of the same length. If Grad-CAM is faithful, its window should hurt more.
The table shows the mean drop in predicted-class probability, deployed model, 20% of the window replaced:

| | dig | knock | water | shake | walk | all events |
|---|---|---|---|---|---|---|
| Grad-CAM window | 0.036 | 0.355 | 0.495 | 0.493 | 0.189 | 0.339 |
| random window | 0.008 | 0.148 | 0.456 | 0.405 | 0.063 | 0.247 |

Grad-CAM's window hurts more for every class: about 2.4× for knock and 3× for walk (short, localised events), and only
slightly more for water and shake, which last through the whole window. Digging is barely affected either way: its
evidence is spread over the window, so removing 20% of it does not change the decision.
The per-sample-normalised model was far more fragile in the same test (random-window drop 0.48 vs 0.25), another sign it
relied on recording-level appearance. Results: `*_faithfulness.json`, 10/20/30% windows.

Two simpler deletion variants were tried first and rejected. Filling with zeros, and zeroing scattered single steps,
both create artefacts (flat segments, spikes) the model reacts to more than to the content removed. With them,
random deletion looked "more important" than Grad-CAM's, which says nothing about the explanation.

**Which fiber points matter** (`*_point_importance.png`): 52–68% of the attribution falls on points 5–8 (a third of the
fiber) for every class, peaking at point 6 or 7, the same points where the vibration energy is (`explore_point_std.png`). The model looks where the
events are, not at the quiet ends of the fiber.

**SVM feature importance via SHAP** (`shap_*.png`, `shap_summary.json`). `KernelExplainer` on a 384-feature RBF SVM
is too slow on a laptop, so a random forest was trained to imitate the SVM's predictions. It agrees with the SVM
on **98.6%** of test samples. `TreeExplainer` was run on it for 300 test samples. Top features: kurtosis-factor
and kurtosis of the *first difference* at points 6–7 (`p05_*`, `p06_*`, numbered from 0). That means how impulsive the
signal changes are, followed by spectral entropy and peak-to-peak. Importance by point peaks at points 6–7, matching
the CNN. Level features (raw mean, max, min) rank low, consistent with the Phase 2 shortcut check.
