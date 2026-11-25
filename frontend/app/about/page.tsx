import { ArrowRight, Brain, Cable, Radio, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui";
import { CLASS_NAMES, classMeta } from "@/lib/classes";

export const metadata: Metadata = { title: "About" };

const STEPS = [
  {
    icon: Radio,
    title: "1 · Sense",
    text: "A laser sends short light pulses into the fiber. Tiny imperfections scatter some light back (Rayleigh backscatter). Vibration above the cable changes the phase of that light, so the fiber becomes thousands of microphones. This is Φ-OTDR.",
  },
  {
    icon: Brain,
    title: "2 · Classify",
    text: "Each 1-second window holds 10,000 pulses × 12 sensing points. A lightweight 1D CNN (181k parameters, ~1–3 ms on a laptop CPU) reads the 12 points as parallel channels and outputs one of six classes.",
  },
  {
    icon: ShieldAlert,
    title: "3 · Alert",
    text: "Digging raises a critical alert, knocking and shaking a warning, walking and watering are logged as info. Predictions below 60% confidence are shown as uncertain rather than guessed.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">About</h1>
        <p className="text-sm text-muted">
          AI-based intrusion and threat detection for underground optical fiber cables using Φ-OTDR.
        </p>
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {STEPS.map((s, i) => (
          <div key={s.title} className="contents">
            <Card className="p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-lg bg-accent/10 ring-1 ring-accent/30">
                  <s.icon className="size-4 text-accent" />
                </span>
                <h2 className="font-semibold">{s.title}</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.text}</p>
            </Card>
            {i < STEPS.length - 1 && (
              <div className="hidden items-center justify-center text-faint lg:flex" aria-hidden>
                <ArrowRight className="size-5" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="The six classes" icon={<Cable className="size-4" />} />
          <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
            {CLASS_NAMES.map((c) => {
              const m = classMeta(c);
              return (
                <li key={c} className="flex items-start gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-line">
                  <m.icon className="mt-0.5 size-4 shrink-0" style={{ color: m.color }} />
                  <div>
                    <div className="text-sm font-medium" style={{ color: m.color }}>{m.label}</div>
                    <div className="text-xs text-muted">{m.blurb}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="What we found" icon={<Brain className="size-4" />} />
          <ul className="space-y-2.5 px-5 pb-5 text-sm leading-relaxed text-muted">
            <li>
              <span className="text-ink">99.2% test accuracy</span> with 181k parameters, beating the paper&apos;s CNN (94.0%)
              and a properly tuned SVM (98.8%), while being ~8× smaller on disk than the SVM and ~18× faster per window.
            </li>
            <li>
              The official split shares recording sessions between train and test. On <span className="text-ink">unseen days</span>{" "}
              every model drops to 65–80%; z-scoring each fiber point separately made ours the most robust (80.1%).
            </li>
            <li>
              Explanations (Grad-CAM, Integrated Gradients) point at fiber points 5–8, where the vibration is, and a
              deletion test confirms they mark the evidence the model actually uses.
            </li>
          </ul>
        </Card>
      </div>

      <Card className="p-5 text-sm text-muted">
        <p>
          <span className="text-ink">Dataset & base paper:</span> X. Cao et al., “An open dataset of
          φ-OTDR events with two classification models as baselines”, <em>Results in Optics</em>, 2023 (BJTUSensor,
          15,419 samples, 6 classes).
        </p>
        <p className="mt-2">
          NGCN course project, FAST-NUCES Faisalabad. Model training and evaluation code, results and this app:{" "}
          <a className="text-accent hover:underline" href="https://github.com/Usman7576/Fiber_Intrusion_Detection" target="_blank" rel="noreferrer">
            github.com/Usman7576/Fiber_Intrusion_Detection
          </a>
        </p>
      </Card>
    </div>
  );
}
