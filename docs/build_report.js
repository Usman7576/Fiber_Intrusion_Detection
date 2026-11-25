// Regenerate docs/FiberGuard_Project_Report.docx:  npm install docx  &&  node docs/build_report.js
// Builds docs/FiberGuard_Project_Report.docx from the project's results and figures.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, PageBreak, Footer, Header, PageNumber, TableOfContents, LevelFormat, BorderStyle, TabStopType,
} = require("docx");

const ROOT = "E:/NGN Project";
const OUT = path.join(ROOT, "docs", "FiberGuard_Project_Report.docx");
const FONT = "Calibri";
const CONTENT_W = 9026; // A4 with 1" margins, in DXA
const ACCENT = "0E7490";

// ---------------------------------------------------------------- helpers
function runs(text, base = {}) {
  // **bold** and _italic_ markup inside one paragraph
  const out = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ ...base, text: t.slice(2, -2), bold: true }));
    else out.push(new TextRun({ ...base, text: t.slice(1, -1), italics: true }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}
const P = (text, opts = {}) => new Paragraph({ children: runs(text, opts.run), spacing: { after: 120, line: 276 }, alignment: opts.align ?? AlignmentType.JUSTIFIED, ...opts.para });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true });
const H1first = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const bullet = (text) => new Paragraph({ children: runs(text), numbering: { reference: "bullets", level: 0 }, spacing: { after: 60, line: 276 } });
const numbered = (text) => new Paragraph({ children: runs(text), numbering: { reference: "numbers", level: 0 }, spacing: { after: 60, line: 276 } });

let figNo = 0, tabNo = 0;
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function figure(rel, caption, widthPx = 600) {
  const file = path.join(ROOT, rel);
  const { w, h } = pngSize(file);
  const height = Math.round((widthPx * h) / w);
  figNo += 1;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: widthPx, height },
        altText: { title: `Figure ${figNo}`, description: caption, name: `figure${figNo}` } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Figure ${figNo}. `, bold: true, size: 19, color: "444444" }), ...runs(caption, { size: 19, color: "444444" })] }),
  ];
}
const border = { style: BorderStyle.SINGLE, size: 4, color: "C9D3DD" };
const borders = { top: border, bottom: border, left: border, right: border };
function table(caption, headers, rows, widths, opts = {}) {
  tabNo += 1;
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = CONTENT_W / total;
  const cw = widths.map((w) => Math.floor(w * scale));
  cw[cw.length - 1] += CONTENT_W - cw.reduce((a, b) => a + b, 0);
  const cell = (text, i, header, highlight) => new TableCell({
    width: { size: cw[i], type: WidthType.DXA }, borders,
    shading: header ? { fill: "E6F4F7", type: ShadingType.CLEAR, color: "auto" } : highlight ? { fill: "FFF7E6", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: i === 0 || opts.leftAll ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: runs(String(text), { size: 19, bold: header || undefined }) })],
  });
  return [
    new Paragraph({ spacing: { before: 160, after: 80 }, keepNext: true,
      children: [new TextRun({ text: `Table ${tabNo}. `, bold: true, size: 19, color: "444444" }), ...runs(caption, { size: 19, color: "444444" })] }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cw,
      rows: [
        new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false, opts.highlightRow !== undefined && rows.indexOf(r) === opts.highlightRow)) })),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

// ---------------------------------------------------------------- content
const titlePage = [
  new Paragraph({ spacing: { before: 1800, after: 200 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "PROJECT REPORT", bold: true, size: 26, color: ACCENT, characterSpacing: 60 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 },
    children: [new TextRun({ text: "AI-Based Intrusion and Threat Detection for Underground Optical Fiber Cables Using Φ-OTDR", bold: true, size: 44 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 },
    children: [new TextRun({ text: "FiberGuard: a lightweight deep-learning detector and live monitoring dashboard", italics: true, size: 26, color: "555555" })] }),
  ...[
    ["Course", "Next Generation Communication Networks (NGCN)"],
    ["Institution", "FAST-NUCES, Faisalabad Campus"],
    ["Submitted by", "Muhammad Usman"],
    ["Roll number", "[add roll number]"],
    ["Submitted to", "[add instructor name]"],
    ["Date", "November 2026"],
    ["Source code", "github.com/Usman7576/Fiber_Intrusion_Detection"],
  ].map(([k, v]) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: `${k}:  `, bold: true, size: 24 }), new TextRun({ text: v, size: 24 })] })),
  new Paragraph({ children: [new PageBreak()] }),
];

const toc = [
  new Paragraph({ children: [new TextRun({ text: "Contents", bold: true, size: 32, font: FONT })], spacing: { after: 200 } }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "If the contents list is empty, right-click it in Word and choose Update Field.", italics: true, size: 18, color: "888888" })] }),
];

const abstract = [
  H1first("Abstract"),
  P("Digging and construction near buried fiber cables are a leading cause of network outages. A conventional OTDR only locates a break after the cable is damaged. Phase-sensitive OTDR (Φ-OTDR) turns the fiber itself into a chain of vibration sensors, so activity near the cable can be detected while it is still intact. This project builds a complete detection system on the open Φ-OTDR dataset of Cao et al. (2023): 15,418 one-second recordings of 10,000 light pulses at 12 sensing points, in six classes (background, digging, knocking, watering, shaking, walking)."),
  P("Both baselines of the base paper were reproduced (SVM and 2D CNN). The paper's SVM turned out to be far stronger than reported: with tuned hyper-parameters it reaches **98.8%** test accuracy instead of 82.6%, and two bugs were found in the original code. A lightweight 1D convolutional network, **Net1D** (181k parameters), was designed that treats the 12 sensing points as input channels. With each point normalised separately and digging weighted twice in the loss, it reaches **99.2%** accuracy and misses only **0.6%** of digging events, against 94.0% for the paper's CNN. It also runs in about 1–3 ms per window on a laptop CPU."),
  P("The official test split shares recording sessions with training, so generalisation was also measured with whole sessions and whole recording days held out. The proposed model is the most robust (99.1% on unseen sessions, **80.1%** on unseen days, versus 73.8% for the tuned SVM). The tests show that new recording conditions remain the main open problem. Predictions are explained with Grad-CAM and Integrated Gradients, verified with a deletion test, and the SVM is explained with SHAP. The model is served by a FastAPI backend and a Next.js dashboard with a live waterfall view, alerts, file analysis, event history and model comparison, all tested end to end and runnable without Docker."),
];

const intro = [
  H1("1. Introduction"),
  H2("1.1 Problem"),
  P("Optical fiber carries 5G backhaul, FTTH and data-centre traffic, so one cut can take thousands of users offline. In Pakistan, roadworks and construction digging are a common cause of such cuts. A standard OTDR measures the reflection of a light pulse and can locate a break, but only after the damage is done; repair crews then spend hours restoring service. Operators need to know that someone is digging near the cable **while it is still intact**."),
  H2("1.2 Φ-OTDR sensing"),
  P("Φ-OTDR (phase-sensitive optical time-domain reflectometry) sends short, highly coherent laser pulses into the fiber. Microscopic irregularities in the glass scatter a little light back (Rayleigh backscattering). Because the laser is coherent, the backscattered light from neighbouring scatterers interferes. A vibration near the fiber slightly stretches it, changes the optical phase and therefore the interference pattern at that position. By timing the returning light, the system measures vibration at many positions along the cable at once. In effect, the fiber becomes a distributed array of microphones. The task of this project is to turn those signals into decisions: is this window quiet fiber, a person walking, or someone digging?"),
  H2("1.3 Objectives"),
  numbered("Reproduce the two baselines of the base paper (Cao et al., 2023): an SVM on hand-crafted features (82.6%) and a 2D CNN (94.0%)."),
  numbered("Design a lighter model that beats both, with special attention to missed digging events."),
  numbered("Test how well the models generalise to recordings they have never seen, and explain their predictions."),
  numbered("Build a working monitoring application: an API and a dashboard with live alerts, runnable natively on Windows without Docker."),
  H2("1.4 Contributions"),
  bullet("A faithful reproduction of both baselines, including two bugs in the original SVM code and a tuned SVM at 98.8%."),
  bullet("**Net1D**, a 181k-parameter 1D residual CNN reaching 99.2% test accuracy with 0.6% of digging missed, 8× smaller on disk than the tuned SVM."),
  bullet("A generalisation study with held-out sessions and days, showing that the official split is optimistic and that per-point normalisation is the most robust choice."),
  bullet("Explanations (Grad-CAM, Integrated Gradients, SHAP) with a deletion test that checks they point at real evidence."),
  bullet("FiberGuard, a full-stack application (FastAPI + Next.js) with a live waterfall, alerts, file analysis, event history and model comparison, with unit, API and end-to-end tests."),
];

const dataset = [
  H1("2. Dataset"),
  P("The BJTUSensor Φ-OTDR dataset accompanies the base paper. Each sample is a MATLAB file holding a 10,000 × 12 matrix of unsigned 16-bit values: 10,000 consecutive light pulses (one second) at 12 sensing points along the fiber. The official split provides train and test folders with label files. All 15,419 listed files were read and checked: one test background file is empty (0 bytes) in the published archive and was excluded, leaving **15,418** usable samples."),
  ...table("Samples per class and split (after removing the one empty file).",
    ["Split", "Background", "Digging", "Knocking", "Watering", "Shaking", "Walking", "Total"],
    [["Train", "2,357", "2,010", "2,024", "1,802", "2,182", "1,960", "12,335"],
     ["Test", "588", "502", "506", "451", "546", "490", "3,083"],
     ["Total", "2,945", "2,512", "2,530", "2,253", "2,728", "2,450", "15,418"]],
    [1300, 1100, 1000, 1000, 1000, 1000, 1000, 1000]),
  P("File names encode the recording date, the person who recorded it and a run number (for example 220122_cxm_walk_01_single_data_6.mat). Each **session** (one continuous recording) was cut into many one-second samples. Nine recorders and 21 recording days appear, but they are strongly tied to classes: for example, shaking was recorded almost only by one person, and background mainly by another. A leave-one-recorder-out test is therefore impossible; Section 3.5 uses sessions and days instead."),
  ...figure("results/explore_waterfalls.png", "One sample per class as a waterfall (time downwards, 12 fiber points across). Events concentrate on a few neighbouring points; background is flat."),
  ...figure("results/explore_spectra.png", "Average power spectrum per class. Background is about 100 times weaker and shows a few narrow interference lines; shaking and watering carry the most high-frequency power.", 520),
];

const method = [
  H1("3. Methodology"),
  H2("3.1 Preprocessing"),
  P("Every sample goes through the same code at training time and in the application (a shared Python package, phiotdr). The raw values are converted to floating point and z-scored, either with one mean and standard deviation per sample or **separately for each fiber point**. They are then mean-pooled by a factor of 10 in time, giving a 12 × 1,000 array. The processed data are cached as float16 so training never re-reads the 15,000 files. A stratified 10% of the training set (fixed seed) is held out for validation; the official test set is used once per model."),
  H2("3.2 Baselines from the base paper"),
  P("**SVM.** Following the authors' code, 16 statistics (maximum, minimum, peak-to-peak, mean, spectral energy, variance, standard deviation, RMS, mean absolute value, waveform, pulse, crest and margin factors, kurtosis, kurtosis factor and spectral entropy) are computed for each of the 12 points on the raw signal and on its first difference: 384 features. The paper's setting (min-max scaling, RBF kernel, C = 1, gamma = auto) is reproduced, and a tuned version (standard scaling, C and gamma chosen on the validation set) is added."),
  P("**2D CNN.** The authors' network (two convolution and pooling stages, 4,721 parameters) is reproduced exactly. Because our input has 1,000 instead of 10,000 time steps, the first layer's time kernel and stride were divided by 10, which leaves every later layer with the original shape. It was trained once with the authors' settings (Adam, learning rate 10⁻⁴, 50 epochs) and once with a higher learning rate, a plateau schedule and early stopping."),
  H2("3.3 Proposed model: Net1D"),
  P("Net1D treats the 12 sensing points as the input channels of a one-dimensional CNN that convolves along time (Figure 3). A strided stem convolution halves the time axis; four residual blocks (two convolutions with batch normalisation and GELU, plus a shortcut) each halve it again while widening to 96 channels; global mean and max pooling over time feed a dropout layer and a linear classifier. The model has 181,254 parameters."),
  ...figure("results/figures/net1d.png", "Net1D architecture with the output shape after each stage."),
  P("Training: Adam (learning rate 10⁻³, weight decay 10⁻⁴), batch 64, cosine learning-rate schedule, at most 40 epochs with early stopping (patience 12) on validation accuracy. Training data are augmented on the fly with a random circular time shift of up to 25%, amplitude scaling between 0.8 and 1.2, Gaussian noise (σ = 0.05) and a random reversal of the fiber direction. Because a missed digging event is the costliest error, the digging class is weighted twice in the loss in the final model. Two alternative designs were trained with the same recipe: a CNN-BiLSTM with attention pooling (152k parameters) and a spectrogram CNN that computes a short-time Fourier transform inside the model (105k parameters)."),
  H2("3.4 Metrics"),
  P("Besides accuracy and macro-averaged F1, the two alarm metrics of the base paper are reported, with background as the only no-alarm class:"),
  bullet("**NAR** (nuisance alarm rate): the share of raised alarms whose true class is background."),
  bullet("**FNR** (false negative rate): the share of real events classified as background."),
  bullet("**Digging miss rate**: the share of real digging not classified as digging, the threat that matters most for a buried cable."),
  P("Latency is the time to classify one window on a 4-core laptop CPU (median of repeated runs). For the neural networks it covers the model on the preprocessed input; for the SVM it includes extracting the 384 features from the raw sample."),
  H2("3.5 Generalisation protocol"),
  P("The official split was found to share recording sessions between train and test: every one of the 3,083 test samples comes from a session that also has samples in training (423 of 424 test sessions). A model can therefore profit from session-specific background noise and light level. To measure performance on genuinely new recordings, the full dataset was pooled and re-split with whole groups held out, using stratified group k-fold so that every class appears on both sides of every fold. Two protocols were used: **unseen sessions** (5 folds over 441 sessions) and **unseen days** (3 folds over 21 recording dates, the closest proxy for a new installation). No hyper-parameter was tuned on these folds: networks train for a fixed number of epochs and keep their final weights."),
  H2("3.6 Explainability"),
  P("Two complementary methods explain Net1D (Captum library): **Grad-CAM** on the last residual block shows _when_ in the window the evidence lies; **Integrated Gradients** gives a 12 × 1,000 map of _where and when_, from which each point's share of the attribution is computed. A **deletion test** checks that the explanations are faithful: the window that Grad-CAM marks as most important is replaced by the same window from a real background recording, and the drop in confidence is compared with replacing a random window of the same length. The SVM is explained with **SHAP**: because exact kernel SHAP on a 384-feature RBF SVM is too slow on a laptop, a random forest is trained to imitate the SVM and explained with TreeExplainer; its agreement with the SVM (fidelity) is reported."),
];

const results = [
  H1("4. Results"),
  H2("4.1 Reproducing the baselines"),
  ...table("Baselines on the official test split (3,083 samples).",
    ["Model", "Accuracy", "Macro-F1", "NAR", "FNR", "Digging missed", "Params", "Latency"],
    [["Paper SVM (reported)", "82.6%", "–", "–", "–", "–", "–", "–"],
     ["Paper CNN (reported)", "94.0%", "–", "–", "–", "–", "–", "–"],
     ["SVM, paper settings", "88.0%", "0.879", "0.04%", "6.45%", "23.9%", "–", "–"],
     ["SVM, tuned (C = 10, γ = 0.001)", "**98.8%**", "0.987", "0.04%", "0.12%", "1.0%", "760k*", "22.7 ms"],
     ["2D CNN, authors' settings", "85.9%", "0.855", "0.85%", "1.92%", "14.5%", "4,721", "0.40 ms"],
     ["2D CNN, lr 10⁻³ + early stopping", "93.2%", "0.930", "0.52%", "0.92%", "6.4%", "4,721", "0.29 ms"]],
    [2700, 1000, 900, 800, 800, 1100, 900, 900]),
  P("* Support-vector coefficients. The CNN reproduction reaches 93.2% against the paper's 94.0%; with the authors' exact settings it is under-trained (train and validation accuracy both still rising at epoch 50). The SVM reproduction surfaced two bugs in the original code: the first difference is computed on unsigned 16-bit arrays, so every negative step wraps around to about 65,000, and the scaler is re-fitted on the test set. On a random 2,400 / 600 subset with the paper's settings, the authors' code gives 75.0%; fixing the wrap-around gives 81.0%; fixing both gives **82.5%, matching the paper's 82.6%**. On the full data the corrected pipeline gives 88.0%, and simply tuning C and gamma lifts it to 98.8%. The bar for an improved model is therefore much higher than the paper suggests."),
  P("A shortcut check showed that the 12 raw per-point means alone (no vibration information) already give 73.9% accuracy, because each session has its own baseline light level. Removing every level feature from the SVM still gives 98.8%, so the SVM does rely on vibration, but the session fingerprint is real; it motivates the generalisation study in Section 4.4."),
  H2("4.2 Improved model"),
  ...table("Candidate architectures, same training recipe (official test split).",
    ["Model", "Idea", "Params", "Accuracy", "Macro-F1", "Digging missed", "Latency"],
    [["Net1D", "1D residual CNN, points as channels", "181k", "**99.06%**", "0.990", "1.20%", "2.6 ms"],
     ["CNN-BiLSTM", "conv front-end + BiLSTM + attention", "152k", "98.80%", "0.988", "1.59%", "1.8 ms"],
     ["Spectrogram CNN", "in-model STFT + 2D CNN", "105k", "98.54%", "0.985", "2.19%", "4.2 ms"]],
    [1500, 3000, 800, 1000, 900, 1100, 900]),
  ...table("Ablations on Net1D. Validation accuracy decided between variants; the test set was used once per run.",
    ["Variant", "Validation", "Test accuracy", "Macro-F1", "NAR", "FNR", "Digging missed"],
    [["Reference (augmentation, equal weights)", "99.51%", "99.06%", "0.990", "0.08%", "0.08%", "1.20%"],
     ["No augmentation", "99.19%", "98.96%", "0.989", "0.12%", "0.04%", "1.39%"],
     ["Digging weighted 2×", "99.43%", "99.03%", "0.990", "0.12%", "0.08%", "0.80%"],
     ["+ random crop and stretch", "99.03%", "97.99%", "0.979", "0.16%", "0.20%", "1.39%"],
     ["Digging 2× + per-point normalisation (deployed)", "99.43%", "**99.19%**", "**0.992**", "**0.04%**", "0.08%", "**0.60%**"]],
    [3300, 1000, 1100, 900, 800, 800, 1100], { highlightRow: 4 }),
  P("On a 3,083-sample test set, 0.1 percentage points is about three samples, so the differences between the top variants are small. Augmentation helps slightly; weighting digging cuts missed digging by a third at no cost in accuracy; cropping and stretching hurts, because stretching a signal shifts its frequency content, which is exactly what separates the classes. Per-point normalisation ties with per-sample normalisation on validation. The choice between them was therefore made on the held-out sessions and days (Section 4.4), not on the test set."),
  ...table("Final comparison (official test split).",
    ["Model", "Accuracy", "Macro-F1", "Digging missed", "Size on disk", "Latency"],
    [["Paper CNN (our reproduction)", "93.2%", "0.930", "6.4%", "22 KB", "0.3 ms"],
     ["Tuned SVM", "98.8%", "0.987", "1.0%", "6.2 MB", "22.7 ms (with features)"],
     ["**Net1D (deployed)**", "**99.2%**", "**0.992**", "**0.6%**", "**0.73 MB**", "**1.3 ms**"]],
    [2800, 1100, 1100, 1300, 1300, 1800], { highlightRow: 2 }),
  ...figure("results/summary_tradeoff.png", "Accuracy against single-sample CPU latency for every run (log scale; bubble size = parameters). Dashed lines: accuracies reported in the base paper.", 520),
  ...figure("results/confusion_net1d_dig2_chnorm.png", "Confusion matrix of the deployed model on the official test split. 25 of 3,083 samples are misclassified; digging is never classified as background.", 420),
  H2("4.3 Error analysis"),
  P("The deployed model makes 25 errors on 3,083 test windows. Watering accounts for 10 of them (3 taken for digging, 3 for shaking, 2 for background, 2 for walking), knocking for 5 (2 taken for digging), shaking for 5 (4 taken for watering), digging for 3 (all taken for walking), and background and walking for one each. Digging is never classified as background, and only one background window raised an alarm (NAR 0.04%), which is what matters for an alarm system."),
  H2("4.4 Generalisation to unseen recordings"),
  ...table("Accuracy when whole recording sessions or whole recording days are held out (mean ± standard deviation over folds).",
    ["Model", "Official split", "Unseen sessions", "Unseen days", "Digging missed, unseen days", "NAR, unseen days"],
    [["Paper CNN", "93.2%", "91.4% ± 1.4", "64.7% ± 2.6", "41.4%", "4.3%"],
     ["Tuned SVM", "98.8%", "98.5% ± 0.5", "73.8% ± 10.3", "35.4%", "0.5%"],
     ["Net1D, per-sample norm", "99.0%", "97.8% ± 0.4", "72.8% ± 10.5", "24.1%", "4.5%"],
     ["**Net1D, per-point norm (deployed)**", "**99.2%**", "**99.1% ± 0.3**", "**80.1% ± 8.3**", "**23.1%**", "1.3%"]],
    [2700, 1100, 1300, 1300, 1500, 1100], { highlightRow: 3 }),
  P("Every model keeps most of its accuracy on new sessions, but loses 20–30 points on new days: the official-split numbers, including the paper's, describe recordings made under conditions already seen in training. Normalising each fiber point separately removes each recording's per-point baseline light level and is clearly the most robust choice (+7.3 points on unseen days over per-sample normalisation, +6.3 over the tuned SVM), so it became the deployed model."),
  ...table("Digging accuracy of the deployed model for each recording day, when that day is held out.",
    ["Day", "4 Jan", "10 Jan", "13 Jan", "16 Jan", "17 Jan", "21 Jan", "18 Apr", "28 Apr", "17 May"],
    [["Accuracy", "99%", "96%", "100%", "99%", "98%", "99%", "100%", "**33%**", "**13%**"]],
    [1200, 800, 800, 800, 800, 800, 800, 800, 800, 800]),
  P("January digging is recognised on any unseen January day. The failures come from the two spring digging days (712 samples), which fell in the same fold, leaving only 27 spring digging samples for training; the model then labels most spring digging as walking. The same pattern affects shaking, recorded on only three days. The limitation is data coverage, not model capacity: more recording days per class, ideally from the target site, are the fix."),
  H2("4.5 Explanations"),
  ...figure("results/explain/net1d_dig2_chnorm_dig.png", "Explanation of a correctly classified digging sample: input waterfall, Integrated-Gradients attribution (where and when), Grad-CAM over time (when), class probabilities and each point's share of the attribution.", 560),
  P("For every class, 52–68% of the attribution falls on fiber points 5–8, peaking at point 6 or 7. These are the same points where the vibration energy is concentrated, so the model looks where the events are, not at the quiet ends of the fiber."),
  ...table("Deletion test on 300 event samples: mean drop in the predicted class's probability when 20% of the window is replaced with real background.",
    ["Replaced window", "Digging", "Knocking", "Watering", "Shaking", "Walking", "All events"],
    [["Grad-CAM's most important", "0.036", "0.355", "0.495", "0.493", "0.189", "0.339"],
     ["Random", "0.008", "0.148", "0.456", "0.405", "0.063", "0.247"]],
    [2600, 1000, 1000, 1000, 1000, 1000, 1100]),
  P("Removing the window Grad-CAM highlights hurts more than removing a random one for every class: about 2.4× for knocking and 3× for walking (short, localised events) and slightly for watering and shaking, which last through the whole window. Digging barely changes either way because its evidence is spread over the window. Two simpler variants (filling with zeros, deleting scattered single steps) were rejected: they create artefacts that the model reacts to more than to the content removed."),
  ...figure("results/explain/shap_by_feature_type.png", "SVM feature importance by feature type (mean |SHAP| summed over the 12 points), from a random-forest surrogate that agrees with the SVM on 98.6% of test samples.", 460),
  P("The SVM relies mostly on how impulsive the signal's changes are: kurtosis and kurtosis factor of the first difference, followed by spectral entropy, at points 6 and 7. Level features (raw mean, maximum, minimum) rank low, consistent with the shortcut check in Section 4.1, and the important points match those used by Net1D."),
];

const system = [
  H1("5. System implementation"),
  P("The trained model is deployed in FiberGuard, a two-part web application that runs natively on Windows (no Docker). Figure 8 shows the path from a vibration window to an operator alert."),
  ...figure("results/figures/pipeline.png", "System pipeline."),
  H2("5.1 Backend (FastAPI)"),
  P("The backend imports the same phiotdr package used for training, so preprocessing is identical in both places. At start-up it loads the deployed Net1D, the tuned SVM and the paper CNN (for comparison), a pack of 324 official test samples (a stratified subset plus every sample the model gets wrong) and an SQLite event store. The sample pack stores a display signal plus a per-point factor that rebuilds each model's exact input, so the 2 GB dataset is not needed at run time; all 324 samples reproduce their training-time predictions exactly."),
  ...table("Main API endpoints (interactive documentation at /docs).",
    ["Endpoint", "Purpose"],
    [["POST /api/predict", "Upload a .mat recording (max 2 MB): class, confidences, alert level, strongest point, signal, comparison with the SVM and paper CNN, optional explanation; stored as an event"],
     ["GET /api/samples, /api/samples/{id}", "Browse the bundled test samples and their signals"],
     ["GET /api/samples/{id}/prediction", "Classify a bundled sample with all three models"],
     ["GET /api/explain/{id}", "Grad-CAM over time and a 12 × 100 Integrated-Gradients map (cached)"],
     ["GET /api/metrics", "Model comparison on the official split, unseen sessions and unseen days"],
     ["GET /api/events, /api/events/stats", "Event history with filters, counts by class and alert level"],
     ["WS /api/stream", "Simulated live feed: a frame every 150 ms, a classified window every ~3 s"],
     ["GET /api/health", "Model, sample count and stored events"]],
    [3000, 6000], { leftAll: true }),
  ...table("Alert levels.",
    ["Prediction", "Alert level", "Reason"],
    [["Digging", "Critical", "Direct threat of a cable cut"],
     ["Knocking, shaking", "Warning", "Physical contact with the ground or cable"],
     ["Walking, watering", "Info", "Activity above the route, logged"],
     ["Background", "Normal", "Quiet fiber"],
     ["Any class, confidence < 60%", "Uncertain", "Shown honestly instead of guessed"]],
    [2800, 1600, 4600], { leftAll: true }),
  P("The live stream replays bundled recordings as if they came from the interrogator, mostly quiet fiber with an event now and then (on average one threat every ~20 seconds). One shared simulator serves all viewers and runs only while someone is watching, so no duplicate events are stored."),
  H2("5.2 Dashboard (Next.js)"),
  P("The frontend (Next.js, TypeScript, Tailwind CSS, Recharts) uses a dark control-room design. The **Live Monitor** shows a scrolling waterfall of the 12 points drawn directly on a canvas, the current detection with confidence, a cable route whose most active point glows, recent detections, and pause, speed and sound controls. Threats raise a banner, a notification and an optional beep on every page, followed by an \"All clear\" banner when the fiber is quiet again. **Analyze** classifies an uploaded file or a chosen test sample and shows the explanation maps and the three-model comparison; **Events** lists the history with filters and CSV export; **Models** presents the comparison and generalisation results; **About** explains the method."),
  ...figure("docs/screenshots/live.png", "Live Monitor: waterfall, current detection, key figures and recent detections."),
  ...figure("docs/screenshots/analyze.png", "Analyze page: prediction for a digging test sample with the Integrated-Gradients overlay, Grad-CAM curve, per-point importance and model comparison."),
  H2("5.3 Testing"),
  bullet("**Unit tests (17):** data loading, preprocessing, metrics, models and explanations."),
  bullet("**API tests (23):** every endpoint, a real dataset recording, rejection of broken, empty, wrongly shaped and oversized files, the WebSocket stream and the alert rules."),
  bullet("**End-to-end checklist (28/28 passed)** against the running servers: three real recordings of every class each produced the correct class and alert, the live stream raised a digging alert, events persisted across a backend restart and every page loaded."),
  bullet("**Soak test:** the production dashboard ran 9.2 minutes at 4× speed (the frame load of about 37 minutes) with flat memory (8–11 MB) and a constant element count; the feed reconnected by itself after the backend was restarted."),
  bullet("**Layout:** checked at 375, 1024 and 1440 px wide with no horizontal scrolling."),
  H2("5.4 Running and deployment"),
  P("A single PowerShell script (run.ps1) checks the environment, starts both servers and opens the browser. Optional hosting is prepared for Render's native Python runtime (backend) and Vercel (frontend). A clean install with Render's exact commands was verified locally; it used about 420 MB of memory, which fits the free plan's 512 MB but with little headroom."),
];

const discussion = [
  H1("6. Discussion and limitations"),
  bullet("**The official split is optimistic.** Train and test share recording sessions. Accuracy on unseen days (80.1% for the best model) is the more realistic estimate for a new installation, and it varies by fold (± 8 points)."),
  bullet("**Data coverage.** Some classes were recorded on very few days (shaking on three) and the dataset comes from two recording campaigns that look different. Recorders are tied to classes, so recorder effects cannot be separated from class effects."),
  bullet("**Simulated live feed.** The dashboard replays recorded windows; it has not been connected to a physical Φ-OTDR interrogator. A real deployment would classify overlapping windows continuously and would need to calibrate sensing points to physical distance (the 10 m spacing in the dashboard is illustrative)."),
  bullet("**Twelve sensing points.** Each sample covers 12 points, so localisation is limited to which of these points vibrates most."),
  bullet("**Small differences on the official split.** Differences of 0.1 percentage points equal about three test samples and should not be over-interpreted; the held-out experiments are more informative."),
];

const conclusion = [
  H1("7. Conclusion and future work"),
  P("This project reproduced both baselines of the base paper, found that a properly tuned SVM is far stronger than reported, and designed Net1D, a 181k-parameter 1D CNN that reaches 99.2% accuracy with 0.6% of digging missed while running in about a millisecond on a laptop CPU. A generalisation study with held-out sessions and days showed that the official split overstates real-world performance. It also showed that normalising each fiber point separately makes the model clearly more robust (80.1% on unseen days against 73.8% for the SVM). Explanations confirm that the model looks at the fiber points where the vibration is. The model is delivered as a tested, runnable monitoring application with live alerts."),
  P("Future work:"),
  bullet("Collect more recording days and sites per class, especially for digging and shaking, and evaluate on a site never used in training."),
  bullet("Domain adaptation or per-site calibration to reduce the drop on new recording conditions."),
  bullet("Connect the backend to a real interrogator with continuous, overlapping windows and event tracking over time."),
  bullet("Calibrate sensing points to physical distance for precise localisation; compress the model (quantisation, ONNX) for edge devices."),
  bullet("Use operator feedback on alerts (confirmed or false) to keep improving the model."),
];

const refs = [
  H1("References"),
  ...[
    "X. Cao et al., \"An open dataset of φ-OTDR events with two classification models as baselines,\" Results in Optics, 2023. Dataset and code: github.com/BJTUSensor/Phi-OTDR_dataset_and_codes.",
    "R. R. Selvaraju, M. Cogswell, A. Das, R. Vedantam, D. Parikh and D. Batra, \"Grad-CAM: Visual explanations from deep networks via gradient-based localization,\" ICCV, 2017.",
    "M. Sundararajan, A. Taly and Q. Yan, \"Axiomatic attribution for deep networks,\" ICML, 2017.",
    "S. M. Lundberg and S.-I. Lee, \"A unified approach to interpreting model predictions,\" NeurIPS, 2017.",
    "N. Kokhlikyan et al., \"Captum: A unified and generic model interpretability library for PyTorch,\" arXiv:2009.07896, 2020.",
    "A. Paszke et al., \"PyTorch: An imperative style, high-performance deep learning library,\" NeurIPS, 2019.",
    "F. Pedregosa et al., \"Scikit-learn: Machine learning in Python,\" JMLR, vol. 12, pp. 2825–2830, 2011.",
  ].map((t, i) => new Paragraph({ spacing: { after: 100 }, indent: { left: 440, hanging: 440 },
    children: [new TextRun({ text: `[${i + 1}]\t`, size: 21 }), new TextRun({ text: t, size: 21 })],
    tabStops: [{ type: TabStopType.LEFT, position: 440 }] })),
];

const appendix = [
  H1("Appendix A. How to run"),
  P("Requirements: Windows, Python 3.12 (via uv), Node.js 18+. The dataset is only needed to retrain; the application ships the trained model and test samples."),
  ...[
    "uv venv .venv --python 3.12",
    "uv pip install torch --index-url https://download.pytorch.org/whl/cpu",
    "uv pip install -r requirements.txt",
    "uv pip install -e ml",
    ".\\run.ps1 -Prod",
  ].map((c) => new Paragraph({ spacing: { after: 40 }, indent: { left: 360 }, children: [new TextRun({ text: c, font: "Consolas", size: 19 })] })),
  P("The dashboard opens at http://localhost:3000 and the API documentation at http://localhost:8000/docs. The README in the repository lists the commands that retrain every model and regenerate every figure and table in this report."),
];

// ---------------------------------------------------------------- document
const doc = new Document({
  creator: "Muhammad Usman",
  title: "AI-Based Intrusion and Threat Detection for Underground Optical Fiber Cables Using Φ-OTDR",
  description: "NGCN project report",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 34, bold: true, color: "0B3B4A" }, paragraph: { spacing: { before: 120, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 27, bold: true, color: ACCENT }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 23, bold: true }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 330 } } } }] },
    ],
  },
  sections: [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: titlePage.concat(toc) },
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, pageNumbers: { start: 1 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "FiberGuard · Φ-OTDR intrusion detection", size: 16, color: "888888" })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "666666" })] })] }) },
      children: [...abstract, ...intro, ...dataset, ...method, ...results, ...system, ...discussion, ...conclusion, ...refs, ...appendix],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log("wrote", OUT, Math.round(buf.length / 1024), "KB;", figNo, "figures,", tabNo, "tables");
});
