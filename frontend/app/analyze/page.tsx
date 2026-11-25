"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Clock3, FlaskConical, MapPin, Microscope, Scale, Shuffle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Dropzone, PointImportance, SignalMap, TimeImportance } from "@/components/analysis";
import { ConfidenceBars, ModelCompare, PredictionSummary } from "@/components/prediction";
import { Button, Card, CardHeader, EmptyState, Select, Skeleton } from "@/components/ui";
import { api, type Explanation, type Prediction } from "@/lib/api";
import { CLASS_NAMES, classMeta } from "@/lib/classes";

type Result = {
  title: string;
  prediction: Prediction;
  signal: number[][];
  explanation?: Explanation | null;
  trueLabel?: string | null;
};

function SamplePicker({ onPick, busy }: { onPick: (id: number) => void; busy: boolean }) {
  const [cls, setCls] = useState("dig");
  const [id, setId] = useState<number | null>(null);
  const samples = useQuery({ queryKey: ["samples", cls], queryFn: () => api.samples({ cls, limit: 500 }) });
  const items = samples.data?.items ?? [];
  const selected = id ?? items[0]?.id ?? null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
        <Select aria-label="Class" value={cls} onChange={(e) => { setCls(e.target.value); setId(null); }}>
          {CLASS_NAMES.map((c) => (
            <option key={c} value={c}>{classMeta(c).label}</option>
          ))}
        </Select>
        <Select className="w-full min-w-0" aria-label="Sample" value={selected ?? ""} onChange={(e) => setId(Number(e.target.value))} disabled={!items.length}>
          {items.map((s) => (
            <option key={s.id} value={s.id}>#{s.id} · {s.file.replace(".mat", "")}</option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={selected === null || busy} onClick={() => selected !== null && onPick(selected)}>
          <Microscope className="size-3.5" /> Analyze sample
        </Button>
        <Button
          disabled={!items.length || busy}
          onClick={() => {
            const r = items[Math.floor(Math.random() * items.length)];
            setId(r.id);
            onPick(r.id);
          }}
        >
          <Shuffle className="size-3.5" /> Random
        </Button>
      </div>
      <p className="text-xs text-faint">
        {samples.data ? `${samples.data.total} ${classMeta(cls).label.toLowerCase()} samples` : "Loading samples…"} from
        the official test split, including every one the model gets wrong.
      </p>
    </div>
  );
}

export default function AnalyzePage() {
  const [result, setResult] = useState<Result | null>(null);

  const upload = useMutation({
    mutationFn: api.upload,
    onSuccess: (p) => setResult({ title: p.file, prediction: p, signal: p.signal, explanation: p.explanation }),
    onError: (e: Error) => toast.error("Could not analyze file", { description: e.message }),
  });

  const sample = useMutation({
    mutationFn: async (id: number) => {
      const [s, p, e] = await Promise.all([api.sample(id), api.samplePrediction(id), api.explain(id)]);
      return { s, p, e };
    },
    onSuccess: ({ s, p, e }) =>
      setResult({ title: s.file, prediction: p, signal: s.signal, explanation: e, trueLabel: s.true_label }),
    onError: (e: Error) => toast.error("Could not load sample", { description: e.message }),
  });

  const busy = upload.isPending || sample.isPending;
  const r = result;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analyze</h1>
        <p className="text-sm text-muted">Classify one recording and see what the model looked at.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upload a recording" subtitle="Stored in the event history" icon={<FlaskConical className="size-4" />} />
          <div className="px-5 pb-5">
            <Dropzone onFile={(f) => upload.mutate(f)} busy={upload.isPending} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Or pick a test sample" subtitle="With ground truth, to check the model" icon={<Microscope className="size-4" />} />
          <div className="px-5 pb-5">
            <SamplePicker onPick={(id) => sample.mutate(id)} busy={busy} />
          </div>
        </Card>
      </div>

      {busy && !r && (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-[220px] w-full" />
        </Card>
      )}

      {!busy && !r && (
        <Card>
          <EmptyState icon={<Brain className="size-8" />} title="Nothing analyzed yet">
            Upload a .mat file or pick a sample. You will get the prediction, every class&apos;s confidence, a comparison
            with the SVM and the paper&apos;s CNN, and an explanation of which fiber points and moments drove the decision.
          </EmptyState>
        </Card>
      )}

      {r && (
        <div className={busy ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Prediction" subtitle={r.title} icon={<Brain className="size-4" />} />
              <div className="space-y-5 px-5 pb-5">
                <PredictionSummary p={r.prediction} trueLabel={r.trueLabel} />
                <ConfidenceBars confidences={r.prediction.confidences} highlight={r.prediction.predicted_class} />
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader
                title="Signal and explanation"
                subtitle="Where (fiber point) and when (time) the evidence for the predicted class is"
                icon={<MapPin className="size-4" />}
              />
              <div className="px-5 pb-5">
                <SignalMap key={r.title} signal={r.signal} explanation={r.explanation} />
              </div>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {r.explanation && (
              <>
                <Card>
                  <CardHeader title="When" subtitle="Grad-CAM over the 1 s window" icon={<Clock3 className="size-4" />} />
                  <div className="px-3 pb-4">
                    <TimeImportance values={r.explanation.time_importance} />
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Where" subtitle="Share of attribution per fiber point" icon={<MapPin className="size-4" />} />
                  <div className="px-3 pb-4">
                    <PointImportance values={r.explanation.point_importance} color={classMeta(r.prediction.predicted_class).color} />
                  </div>
                </Card>
              </>
            )}
            {r.prediction.compare && (
              <Card className={r.explanation ? "" : "xl:col-span-3"}>
                <CardHeader title="Model comparison" subtitle="Same recording, three models" icon={<Scale className="size-4" />} />
                <div className="px-5 pb-3">
                  <ModelCompare votes={r.prediction.compare} />
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
