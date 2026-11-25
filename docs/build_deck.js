// Regenerate docs/FiberGuard_Viva_Slides.pptx:  npm install pptxgenjs  &&  node docs/build_deck.js
// (apply_theme.js comes from the pptx skill; without it, remove the applyTheme call and the deck keeps Office default theme colors)
// Viva deck: docs/FiberGuard_Viva_Slides.pptx
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require("./apply_theme.js");

const ROOT = "E:/NGN Project";
const OUT = path.join(ROOT, "docs", "FiberGuard_Viva_Slides.pptx");
const img = (rel) => path.join(ROOT, rel);
function pngSize(rel) {
  const b = fs.readFileSync(img(rel));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const THEME = {
  name: "FiberGuard",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "0F172A", lt1: "FFFFFF", dk2: "475569", lt2: "EEF3F8",
    accent1: "0E7490", accent2: "E11D48", accent3: "D97706", accent4: "059669", accent5: "7C3AED", accent6: "0284C7",
    hlink: "0E7490", folHlink: "7C3AED",
  },
};
// hex copies for options that only take hex
const HEX = { ink: "0F172A", muted: "475569", faint: "64748B", card: "EEF3F8", grid: "E2E8F0", teal: "0E7490", rose: "E11D48",
  amber: "D97706", green: "059669", violet: "7C3AED", sky: "0284C7", slate: "94A3B8", dark: "0B1220", cyan: "22D3EE", light: "CBD5E1" };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.author = "Muhammad Usman";
pres.title = "AI-Based Intrusion and Threat Detection for Underground Optical Fiber Cables Using Φ-OTDR";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333;

// ---------------------------------------------------------------- layouts
pres.defineSlideMaster({
  title: "DARK",
  background: { color: HEX.dark },
  objects: [],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: "FFFFFF" },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 34, bold: true,
      color: C.text1, valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "FiberGuard · Φ-OTDR intrusion detection · NGCN project", options: { x: 0.6, y: 7.0, w: 8, h: 0.3, fontSize: 10,
      color: C.text2, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: HEX.muted, align: "right" },
});

// ---------------------------------------------------------------- helpers
function text(slide, t, o) {
  slide.addText(t, { isTextBox: true, margin: 0, fontSize: 16, color: C.text1, valign: "top", ...o });
}
function card(slide, o, name) {
  slide.addShape(pres.ShapeType.roundRect, { x: o.x, y: o.y, w: o.w, h: o.h, fill: { color: o.fill ?? C.background2 },
    line: { color: o.fill ?? C.background2, width: 0 }, rectRadius: 0.12, objectName: name });
}
function badge(slide, x, y, label, color, size = 0.55) {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: size, h: size, fill: { color }, line: { color, width: 0 } });
  text(slide, label, { x, y, w: size, h: size, fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle" });
}
function stat(slide, x, y, w, value, label, color = C.accent1, valueSize = 40) {
  card(slide, { x, y, w, h: 1.55 });
  text(slide, value, { x: x + 0.3, y: y + 0.18, w: w - 0.6, h: 0.75, fontSize: valueSize, bold: true, color, valign: "middle" });
  text(slide, label, { x: x + 0.3, y: y + 0.95, w: w - 0.6, h: 0.5, fontSize: 14, color: C.text2 });
}
function picture(slide, rel, x, y, w, alt) {
  const s = pngSize(rel);
  const h = (w * s.h) / s.w;
  slide.addImage({ path: img(rel), x, y, w, h, altText: alt });
  return h;
}
const chartText = { catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt",
  titleFontFace: "+mn-lt", legendFontFace: "+mn-lt", catAxisLabelColor: HEX.muted, valAxisLabelColor: HEX.faint,
  catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, dataLabelFontSize: 12, dataLabelColor: HEX.ink, titleColor: HEX.ink,
  titleFontSize: 14, valGridLine: { color: HEX.grid, size: 0.5 }, catGridLine: { style: "none" }, valAxisLineShow: false };
const content = (section) => pres.addSlide({ masterName: "CONTENT", sectionTitle: section });

// ---------------------------------------------------------------- 1. title
pres.addSection({ title: "Introduction" });
{
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Introduction" });
  text(s, "NGCN PROJECT  ·  FAST-NUCES FAISALABAD", { x: 0.7, y: 0.9, w: 6.2, h: 0.4, fontSize: 14, bold: true, color: HEX.cyan, charSpacing: 2 });
  text(s, "AI-Based Intrusion and Threat Detection for Underground Optical Fiber Cables Using Φ-OTDR",
    { x: 0.7, y: 1.5, w: 6.3, h: 2.9, fontSize: 34, bold: true, color: C.background1, valign: "top" });
  text(s, "FiberGuard: a lightweight deep-learning detector and live monitoring dashboard",
    { x: 0.7, y: 4.55, w: 6.0, h: 0.8, fontSize: 18, color: HEX.light });
  text(s, "Muhammad Usman  ·  November 2026", { x: 0.7, y: 6.3, w: 6.0, h: 0.4, fontSize: 16, color: C.background1 });
  const h = (5.7 * 900) / 1440;
  s.addImage({ path: img("docs/screenshots/live.png"), x: 7.1, y: (7.5 - h) / 2, w: 5.7, h, altText: "FiberGuard live monitor",
    shadow: { type: "outer", color: "000000", opacity: 0.45, blur: 12, offset: 4, angle: 90 } });
  s.addNotes("Introduce the project in one line: we use machine learning on phi-OTDR fiber signals to detect digging and other activity near a buried cable before it is cut, and we built a working monitoring app around the model.");
}

// ---------------------------------------------------------------- 2. problem
{
  const s = content("Introduction");
  s.addText("Fiber cuts happen before anyone knows", { placeholder: "title" });
  text(s, "Fiber carries 5G backhaul, FTTH and data-centre links, so one cut takes thousands of users offline.",
    { x: 0.6, y: 1.35, w: 12.1, h: 0.5, fontSize: 16, color: C.text2 });
  const items = [
    ["1", HEX.rose, "Digging is the main threat", "Roadworks and construction near buried cables are a common cause of cuts, also in Pakistan."],
    ["2", HEX.amber, "OTDR reacts too late", "A normal OTDR locates the break only after the damage; repair crews then need hours."],
    ["3", HEX.teal, "Goal: warn before the cut", "Detect and classify activity next to the cable in real time, while it is still intact."],
  ];
  items.forEach(([n, col, head, body], i) => {
    const x = 0.6 + i * 4.1;
    card(s, { x, y: 2.3, w: 3.8, h: 3.9 }, `problem-${n}`);
    badge(s, x + 0.35, 2.65, n, col);
    text(s, head, { x: x + 0.35, y: 3.45, w: 3.1, h: 0.95, fontSize: 24, bold: true });
    text(s, body, { x: x + 0.35, y: 4.5, w: 3.1, h: 1.55, fontSize: 18, color: C.text2 });
  });
  s.addNotes("The problem: most fiber outages come from digging near the cable. OTDR only finds the break afterwards. Phi-OTDR lets us listen to the cable continuously, so we can warn while someone is still digging.");
}

// ---------------------------------------------------------------- 3. how phi-OTDR works
{
  const s = content("Introduction");
  s.addText("Φ-OTDR turns the fiber into microphones", { placeholder: "title" });
  text(s, "Short coherent laser pulses scatter back from tiny imperfections in the glass. A vibration near the cable changes the phase of that light at its position, so every point along the fiber senses vibration. Our system turns those signals into alerts:",
    { x: 0.6, y: 1.35, w: 12.1, h: 1.1, fontSize: 18, color: C.text2 });
  picture(s, "results/figures/pipeline.png", 0.9, 2.75, 11.5, "Pipeline from phi-OTDR window to dashboard alert");
  s.addNotes("Explain the physics briefly: Rayleigh backscatter, coherent pulses, interference changes with vibration. Each sample is one second: 10,000 pulses at 12 sensing points. Then walk through the pipeline left to right.");
}

// ---------------------------------------------------------------- 4. dataset
{
  const s = content("Introduction");
  s.addText("Data: 15,418 real recordings in six classes", { placeholder: "title" });
  stat(s, 0.6, 1.45, 3.6, "15,418", "one-second samples (1 empty file removed)");
  stat(s, 0.6, 3.2, 3.6, "12 × 10,000", "sensing points × light pulses each", C.accent1, 34);
  stat(s, 0.6, 4.95, 3.6, "6 classes", "background, dig, knock, water, shake, walk");
  const h = picture(s, "results/explore_waterfalls.png", 4.6, 1.55, 8.1, "One sample per class as a waterfall");
  text(s, "One sample per class (time downwards, 12 fiber points across): events light up a few neighbouring points, background stays flat.",
    { x: 4.6, y: 1.55 + h + 0.15, w: 8.1, h: 0.7, fontSize: 14, color: C.text2 });
  text(s, "Open dataset of Cao et al., Results in Optics, 2023 (BJTUSensor). Official split: 12,335 train / 3,083 test.",
    { x: 4.6, y: 5.75, w: 8.1, h: 0.7, fontSize: 14, color: C.text2 });
  s.addNotes("The dataset is real measurements from the base paper. We verified every file: one test file is empty and was excluded. Recorders are tied to classes, which matters later for the generalisation test.");
}

// ---------------------------------------------------------------- 5. baselines
pres.addSection({ title: "Baselines" });
{
  const s = content("Baselines");
  s.addText("The paper's SVM is far stronger than reported", { placeholder: "title" });
  s.addChart(pres.ChartType.bar, [{ name: "Test accuracy", labels: ["SVM, paper\n(reported)", "SVM, bugs\nfixed", "SVM,\ntuned", "CNN, paper\n(reported)", "CNN, our\nreproduction"],
    values: [82.6, 88.0, 98.8, 94.0, 93.2] }], {
    x: 0.6, y: 1.4, w: 7.4, h: 5.3, barDir: "col", chartColors: [HEX.slate, HEX.slate, HEX.teal, HEX.slate, HEX.violet],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0.0"%"', valAxisMinVal: 70, valAxisMaxVal: 100,
    valAxisLabelFormatCode: '0"%"', showLegend: false, showTitle: true, title: "Official test accuracy", barGapWidthPct: 60, ...chartText,
  });
  card(s, { x: 8.4, y: 1.45, w: 4.3, h: 2.45 }, "bugs");
  text(s, "Bugs in the authors' code", { x: 8.7, y: 1.65, w: 3.8, h: 0.5, fontSize: 18, bold: true });
  text(s, [
    { text: "uint16 wrap-around in the difference features", options: { bullet: true, breakLine: true } },
    { text: "scaler re-fitted on the test set", options: { bullet: true } },
  ], { x: 8.7, y: 2.2, w: 3.8, h: 1.5, fontSize: 16, color: C.text2, paraSpaceAfter: 6 });
  card(s, { x: 8.4, y: 4.15, w: 4.3, h: 2.55 }, "takeaway");
  text(s, "98.8%", { x: 8.7, y: 4.3, w: 3.8, h: 0.8, fontSize: 40, bold: true, color: C.accent1, valign: "middle" });
  text(s, "with C and gamma tuned. Fixing both bugs reproduces the paper's figure (82.5% vs 82.6% on a subset). The bar is much higher than the paper suggests.",
    { x: 8.7, y: 5.1, w: 3.8, h: 1.5, fontSize: 14, color: C.text2 });
  s.addNotes("We reproduced both baselines. The CNN reaches 93.2 versus 94.0 reported. For the SVM we found two bugs; fixing them reproduces 82.5 on a subset, and simply tuning C and gamma gives 98.8 percent. So the honest target to beat is about 99, not 94.");
}

// ---------------------------------------------------------------- 6. Net1D
pres.addSection({ title: "Proposed model" });
{
  const s = content("Proposed model");
  s.addText("Net1D: fiber points as input channels", { placeholder: "title" });
  picture(s, "results/figures/net1d.png", 0.75, 1.3, 11.8, "Net1D architecture");
  stat(s, 0.6, 4.75, 3.8, "181k", "parameters");
  stat(s, 4.75, 4.75, 3.8, "0.73 MB", "on disk (tuned SVM: 6.2 MB)");
  stat(s, 8.9, 4.75, 3.8, "1.3 ms", "per one-second window on a laptop CPU");
  s.addNotes("Net1D is a small 1D residual CNN. The 12 sensing points are channels and convolution runs along time. Training: Adam, cosine schedule, early stopping, augmentation (time shift, scaling, noise, fiber flip), digging weighted twice in the loss, and each fiber point z-scored separately.");
}

// ---------------------------------------------------------------- 7. results
{
  const s = content("Proposed model");
  s.addText("Net1D beats both baselines", { placeholder: "title" });
  const labels = ["Paper CNN\n(reproduced)", "Tuned SVM", "Net1D\n(ours)"];
  const colors = [HEX.slate, HEX.slate, HEX.teal];
  s.addChart(pres.ChartType.bar, [{ name: "Accuracy", labels, values: [93.2, 98.8, 99.2] }], {
    x: 0.6, y: 1.4, w: 5.9, h: 4.6, barDir: "col", chartColors: colors, showValue: true, dataLabelPosition: "outEnd",
    dataLabelFormatCode: '0.0"%"', valAxisMinVal: 90, valAxisMaxVal: 100, valAxisLabelFormatCode: '0"%"', showLegend: false,
    showTitle: true, title: "Test accuracy (higher is better)", barGapWidthPct: 70, ...chartText,
  });
  s.addChart(pres.ChartType.bar, [{ name: "Digging missed", labels, values: [6.4, 1.0, 0.6] }], {
    x: 6.8, y: 1.4, w: 5.9, h: 4.6, barDir: "col", chartColors: [HEX.slate, HEX.slate, HEX.rose], showValue: true,
    dataLabelPosition: "outEnd", dataLabelFormatCode: '0.0"%"', valAxisMinVal: 0, valAxisMaxVal: 8, valAxisLabelFormatCode: '0"%"',
    showLegend: false, showTitle: true, title: "Digging missed (lower is better)", barGapWidthPct: 70, ...chartText,
  });
  text(s, "Official test split, 3,083 samples. Paper's reported CNN: 94.0%. Net1D: 25 errors in total, digging never mistaken for background.",
    { x: 0.6, y: 6.25, w: 12.1, h: 0.5, fontSize: 14, color: C.text2 });
  s.addNotes("On the official split Net1D reaches 99.2 percent and misses 0.6 percent of digging, versus 1.0 for the tuned SVM and 6.4 for the paper CNN. It is 8 times smaller on disk than the SVM and much faster. Differences of 0.1 point equal about 3 test samples, so the next slide is more important.");
}

// ---------------------------------------------------------------- 8. generalisation
pres.addSection({ title: "Generalisation and explainability" });
{
  const s = content("Generalisation and explainability");
  s.addText("New recording days: every model drops", { placeholder: "title" });
  const labels = ["Paper CNN", "Tuned SVM", "Net1D\nper-sample norm", "Net1D\nper-point norm"];
  s.addChart(pres.ChartType.bar, [
    { name: "Official split", labels, values: [93.2, 98.8, 99.0, 99.2] },
    { name: "Unseen sessions", labels, values: [91.4, 98.5, 97.8, 99.1] },
    { name: "Unseen days", labels, values: [64.7, 73.8, 72.8, 80.1] },
  ], {
    x: 0.6, y: 1.4, w: 8.2, h: 5.3, barDir: "col", barGrouping: "clustered", chartColors: [HEX.slate, HEX.sky, HEX.amber],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0', valAxisMinVal: 50, valAxisMaxVal: 100,
    valAxisLabelFormatCode: '0"%"', showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: HEX.muted, showTitle: true,
    title: "Accuracy with whole sessions or days held out", barGapWidthPct: 50, ...chartText, dataLabelFontSize: 10,
  });
  stat(s, 9.2, 1.45, 3.5, "80.1%", "Net1D on unseen days (tuned SVM 73.8%)");
  card(s, { x: 9.2, y: 3.25, w: 3.5, h: 3.45 }, "why");
  text(s, "Why test this?", { x: 9.5, y: 3.45, w: 3.0, h: 0.45, fontSize: 18, bold: true });
  text(s, "In the official split, 423 of 424 test sessions also appear in training. Z-scoring each fiber point removes each recording's baseline light level: +7 points on new days.",
    { x: 9.5, y: 3.95, w: 3.0, h: 2.6, fontSize: 14, color: C.text2 });
  s.addNotes("The official split shares recording sessions between train and test, so we re-split the data holding out whole sessions and whole days. New sessions are fine, new days are hard for every model. Per-point normalisation is the most robust, so it is the deployed model. The choice was made on these held-out tests, not on the test set.");
}

// ---------------------------------------------------------------- 9. where it fails
{
  const s = content("Generalisation and explainability");
  s.addText("Failures come from one recording campaign", { placeholder: "title" });
  const days = ["4 Jan", "10 Jan", "13 Jan", "16 Jan", "17 Jan", "21 Jan", "18 Apr", "28 Apr", "17 May"];
  s.addChart(pres.ChartType.bar, [{ name: "Digging accuracy", labels: days, values: [99, 96, 100, 99, 98, 99, 100, 33, 13] }], {
    x: 0.6, y: 1.4, w: 8.0, h: 5.3, barDir: "col", chartColors: [HEX.teal, HEX.teal, HEX.teal, HEX.teal, HEX.teal, HEX.teal, HEX.teal, HEX.rose, HEX.rose],
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0"%"', valAxisMinVal: 0, valAxisMaxVal: 110,
    valAxisLabelFormatCode: '0"%"', valAxisMajorUnit: 25, showLegend: false, showTitle: true,
    title: "Digging accuracy when that recording day is held out", barGapWidthPct: 40, ...chartText,
  });
  const rows = [
    [HEX.teal, "January digging", "96–100% on any unseen January day."],
    [HEX.rose, "Spring digging", "13–33%, mostly called walking: only 27 spring samples were left for training."],
    [HEX.amber, "The fix is data", "More recording days per class, ideally from the site where the system will run."],
  ];
  rows.forEach(([col, head, body], i) => {
    const y = 1.45 + i * 1.8;
    card(s, { x: 9.0, y, w: 3.7, h: 1.6 }, `fail-${i}`);
    s.addShape(pres.ShapeType.ellipse, { x: 9.25, y: y + 0.25, w: 0.3, h: 0.3, fill: { color: col }, line: { color: col, width: 0 } });
    text(s, head, { x: 9.7, y: y + 0.18, w: 2.8, h: 0.45, fontSize: 17, bold: true });
    text(s, body, { x: 9.25, y: y + 0.68, w: 3.3, h: 0.85, fontSize: 14, color: C.text2 });
  });
  s.addNotes("Looking at digging day by day: January digging is recognised on any unseen day. The failures are the two spring days, which fell into the same fold, so training had almost no spring digging. This is a data coverage limit, and the honest answer for a real deployment is to record on site.");
}

// ---------------------------------------------------------------- 10. explainability
{
  const s = content("Generalisation and explainability");
  s.addText("The model looks where the vibration is", { placeholder: "title" });
  const h = picture(s, "results/explain/net1d_dig2_chnorm_dig.png", 0.6, 1.35, 7.4, "Explanation of a digging sample");
  text(s, "Digging sample: input, Integrated-Gradients map (where and when), Grad-CAM (when), probabilities and share per point.",
    { x: 0.6, y: 1.35 + h + 0.1, w: 7.4, h: 0.6, fontSize: 12, color: C.text2 });
  stat(s, 8.4, 1.45, 4.3, "52–68%", "of the attribution falls on fiber points 5–8, where the events are");
  stat(s, 8.4, 3.2, 4.3, "2.4× / 3×", "bigger confidence drop when Grad-CAM's window is removed (knock / walk)", C.accent2, 36);
  card(s, { x: 8.4, y: 4.95, w: 4.3, h: 1.75 }, "shap");
  text(s, "SHAP on the SVM", { x: 8.7, y: 5.1, w: 3.8, h: 0.4, fontSize: 17, bold: true });
  text(s, "relies on how impulsive the signal changes are (kurtosis) at points 6–7; surrogate fidelity 98.6%.",
    { x: 8.7, y: 5.5, w: 3.8, h: 1.1, fontSize: 14, color: C.text2 });
  s.addNotes("Grad-CAM shows when, Integrated Gradients shows where and when. We checked faithfulness with a deletion test: replacing the window Grad-CAM marks with real background hurts the prediction more than replacing a random window, for every class. SHAP explains the SVM through a surrogate that agrees with it 98.6 percent of the time.");
}

// ---------------------------------------------------------------- 11. system
pres.addSection({ title: "System" });
{
  const s = content("System");
  s.addText("FiberGuard: from model to monitoring app", { placeholder: "title" });
  const comps = [
    ["API", HEX.teal, "FastAPI backend", "REST + WebSocket, uploads, explanations, SQLite event log; same preprocessing code as training."],
    ["UI", HEX.violet, "Next.js dashboard", "Live waterfall, alerts with sound, file analysis, event history with CSV, model comparison."],
    ["1×", HEX.amber, "One-click, no Docker", "run.ps1 starts both servers; ready for Render + Vercel hosting."],
  ];
  comps.forEach(([b, col, head, body], i) => {
    const y = 1.45 + i * 1.8;
    card(s, { x: 0.6, y, w: 6.6, h: 1.6 }, `comp-${i}`);
    badge(s, 0.9, y + 0.5, b, col, 0.62);
    text(s, head, { x: 1.8, y: y + 0.22, w: 5.2, h: 0.45, fontSize: 18, bold: true });
    text(s, body, { x: 1.8, y: y + 0.7, w: 5.2, h: 0.8, fontSize: 14, color: C.text2 });
  });
  text(s, "Alert levels", { x: 7.7, y: 1.45, w: 5.0, h: 0.45, fontSize: 18, bold: true });
  const hdr = (t) => ({ text: t, options: { bold: true, color: HEX.ink, fill: { color: HEX.card } } });
  const lvl = (t, c) => ({ text: t, options: { bold: true, color: c } });
  s.addTable([
    [hdr("Prediction"), hdr("Level")],
    ["Digging", lvl("Critical", HEX.rose)],
    ["Knocking, shaking", lvl("Warning", HEX.amber)],
    ["Walking, watering", lvl("Info", HEX.sky)],
    ["Background", lvl("Normal", HEX.green)],
    ["Confidence below 60%", lvl("Uncertain", HEX.faint)],
  ], { x: 7.7, y: 2.0, w: 5.0, colW: [3.0, 2.0], fontSize: 15, color: HEX.ink, rowH: 0.52,
    border: { type: "solid", pt: 0.75, color: HEX.grid }, margin: [0.06, 0.12, 0.06, 0.12], valign: "middle" });
  s.addNotes("The model is served by FastAPI, which imports the same preprocessing package as training, so there is no train/serve mismatch. The dashboard is Next.js. The app ships 324 test samples, so it runs without the 2 GB dataset. Uncertain predictions are shown honestly rather than guessed.");
}

// ---------------------------------------------------------------- 12. demo
{
  const s = content("System");
  s.addText("Live demo", { placeholder: "title" });
  const w = 6.0;
  const h1 = (w * 900) / 1440;
  s.addImage({ path: img("docs/screenshots/live.png"), x: 0.6, y: 1.5, w, h: h1, altText: "Live Monitor page" });
  text(s, "Live Monitor: waterfall of the 12 points, current detection, alerts", { x: 0.6, y: 1.5 + h1 + 0.15, w, h: 0.5, fontSize: 14, color: C.text2 });
  const h2 = (w * 1126) / 1440;
  const w2 = Math.min(w, (h1 * 1440) / 1126);
  s.addImage({ path: img("docs/screenshots/analyze.png"), x: 6.7 + (w - w2) / 2, y: 1.5, w: w2, h: (w2 * 1126) / 1440, altText: "Analyze page" });
  text(s, "Analyze: upload or pick a sample, explanation and three-model comparison", { x: 6.7, y: 1.5 + h1 + 0.15, w, h: 0.5, fontSize: 14, color: C.text2 });
  text(s, "Run it:  .\\run.ps1 -Prod   →   http://localhost:3000", { x: 0.6, y: 6.25, w: 12.1, h: 0.45, fontSize: 16, bold: true, color: C.accent1 });
  s.addNotes("Switch to the live app here. Show: the waterfall and a digging alert with banner and toast; then Analyze a digging test sample and its explanation; then the Models page. Backup if the laptop fails: these screenshots.");
}

// ---------------------------------------------------------------- 13. testing
{
  const s = content("System");
  s.addText("Tested end to end", { placeholder: "title" });
  const stats = [["17", "ML unit tests"], ["23", "API tests incl. bad files"], ["28 / 28", "end-to-end checks passed"], ["9.2 min", "soak test at 4× speed, flat memory"]];
  stats.forEach(([v, l], i) => stat(s, 0.6 + i * 3.1, 1.5, 2.85, v, l, C.accent1, 36));
  const checks = [
    "Three real recordings of every class: correct class and alert level",
    "Live stream raised a digging alert; events survived a backend restart",
    "Layout checked at 375, 1024 and 1440 px; feed reconnects by itself",
    "Clean install with the hosting commands: ~420 MB memory",
  ];
  card(s, { x: 0.6, y: 3.4, w: 12.1, h: 3.2 }, "checks");
  text(s, checks.map((c, i) => ({ text: c, options: { bullet: true, breakLine: i < checks.length - 1 } })),
    { x: 0.95, y: 3.75, w: 11.4, h: 2.6, fontSize: 22, color: C.text1, paraSpaceAfter: 14 });
  s.addNotes("Testing at three levels: unit tests for the ML code, API tests including broken and oversized files, and an end-to-end script against the running servers. The production dashboard also ran a soak test with flat memory.");
}

// ---------------------------------------------------------------- 14. limitations
pres.addSection({ title: "Conclusion" });
{
  const s = content("Conclusion");
  s.addText("Limitations and next steps", { placeholder: "title" });
  const col = (x, title, color, items) => {
    card(s, { x, y: 1.45, w: 5.9, h: 5.2 });
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.35, y: 1.75, w: 0.32, h: 0.32, fill: { color }, line: { color, width: 0 } });
    text(s, title, { x: x + 0.85, y: 1.65, w: 4.8, h: 0.5, fontSize: 20, bold: true });
    text(s, items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
      { x: x + 0.4, y: 2.4, w: 5.2, h: 4.0, fontSize: 20, color: C.text2, paraSpaceAfter: 14 });
  };
  col(0.6, "Limitations", HEX.rose, [
    "The official split is optimistic; 80% on unseen days is the realistic figure",
    "Few recording days for some classes (shake: 3 days)",
    "Live feed replays recordings; no physical interrogator yet",
    "12 sensing points only; distances are illustrative",
  ]);
  col(6.8, "Next steps", HEX.teal, [
    "Record more days and sites, test on a site never seen",
    "Domain adaptation or per-site calibration",
    "Connect a real interrogator with overlapping windows",
    "Quantise the model for edge devices; learn from operator feedback",
  ]);
  s.addNotes("Be upfront: new recording conditions are the open problem, and the fix is more varied data rather than a bigger model.");
}

// ---------------------------------------------------------------- 15. closing
{
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: "Conclusion" });
  text(s, "Thank you", { x: 0.7, y: 1.1, w: 12, h: 1.1, fontSize: 54, bold: true, color: C.background1 });
  text(s, "Questions?", { x: 0.7, y: 2.2, w: 12, h: 0.7, fontSize: 28, color: HEX.cyan });
  const nums = [["99.2%", "test accuracy"], ["0.6%", "digging missed"], ["80.1%", "on unseen days"], ["181k", "parameters"]];
  nums.forEach(([v, l], i) => {
    const x = 0.7 + i * 3.05;
    s.addShape(pres.ShapeType.roundRect, { x, y: 3.55, w: 2.8, h: 1.7, fill: { color: "131C2E" }, line: { color: "1E293B", width: 1 }, rectRadius: 0.12 });
    text(s, v, { x: x + 0.3, y: 3.75, w: 2.3, h: 0.8, fontSize: 38, bold: true, color: HEX.cyan, valign: "middle" });
    text(s, l, { x: x + 0.3, y: 4.6, w: 2.3, h: 0.45, fontSize: 15, color: HEX.light });
  });
  text(s, "github.com/Usman7576/Fiber_Intrusion_Detection", { x: 0.7, y: 6.1, w: 12, h: 0.45, fontSize: 18, color: C.background1 });
  s.addNotes("Close with the key numbers and invite questions. Likely questions: why 1D convolution (points as channels, time is the informative axis); why trust the explanations (deletion test); why the official accuracy is not the whole story (shared sessions).");
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT, Math.round(fs.statSync(OUT).size / 1024), "KB");
})();
