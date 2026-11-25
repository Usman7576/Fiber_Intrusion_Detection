"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, Boxes, Gauge, Grid3x3, ShieldAlert, Trophy, Waypoints } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge, Card, CardHeader, EmptyState, Select, Skeleton, Stat } from "@/components/ui";
import { api, type ModelMetrics } from "@/lib/api";
import { classMeta } from "@/lib/classes";
import { ms, pct } from "@/lib/utils";

const tooltip = {
  contentStyle: { background: "#0E1420", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "#E6EDF7", marginBottom: 4 },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};
const axis = { tick: { fill: "#8B98AD", fontSize: 11 }, tickLine: false, axisLine: false } as const;
const asPct = (v: number) => `${(v * 100).toFixed(1)}%`;
/** Model names break at " · " onto two lines so four labels fit on a phone. */
function TwoLineTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const [a, b] = String(payload?.value ?? "").split(" · ");
  return (
    <text x={x} y={y} textAnchor="middle" fill="#8B98AD" fontSize={10}>
      <tspan x={x} dy={12}>{a}</tspan>
      {b && <tspan x={x} dy={12}>{b}</tspan>}
    </text>
  );
}

const short = (m: ModelMetrics) => m.name.replace(" (per-sample norm)", " · sample norm").replace(" (per-point norm)", " · point norm").replace("Tuned SVM", "Tuned · SVM").replace("Paper CNN", "Paper · CNN");

function ConfusionMatrix({ m, classes }: { m: ModelMetrics; classes: string[] }) {
  const rowSums = m.confusion_matrix.map((r) => r.reduce((a, b) => a + b, 0));
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="px-2 text-left text-[10px] font-normal text-faint">true ↓ / predicted →</th>
            {classes.map((c) => (
              <th key={c} className="px-1 pb-1 font-medium" style={{ color: classMeta(c).color }}>
                {classMeta(c).label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.confusion_matrix.map((row, i) => (
            <tr key={i}>
              <th className="pr-2 text-right font-medium whitespace-nowrap" style={{ color: classMeta(classes[i]).color }}>
                {classMeta(classes[i]).label}
              </th>
              {row.map((n, j) => {
                const share = rowSums[i] ? n / rowSums[i] : 0;
                const diag = i === j;
                const bg = diag ? `rgba(34,211,238,${0.12 + 0.6 * share})` : n ? `rgba(244,63,94,${0.15 + Math.min(0.6, share * 6)})` : "rgba(255,255,255,0.03)";
                return (
                  <td
                    key={j}
                    className="num h-11 w-16 rounded-md text-center"
                    style={{ backgroundColor: bg, color: n ? "#E6EDF7" : "#7D8AA0" }}
                    title={`true ${classes[i]}, predicted ${classes[j]}: ${n} (${(share * 100).toFixed(1)}% of row)`}
                  >
                    {n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-center text-[11px] text-faint">
        Cyan = correct, rose = mistakes; hover a cell for its share of the row. {m.confusion_matrix.flat().reduce((a, b) => a + b, 0).toLocaleString()} official test samples.
      </p>
    </div>
  );
}

export default function ModelsPage() {
  const q = useQuery({ queryKey: ["metrics"], queryFn: api.metrics });
  const [cm, setCm] = useState<string>("");

  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-80" />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <Card>
        <EmptyState title="Could not load metrics">{(q.error as Error)?.message}</EmptyState>
      </Card>
    );

  const { models, classes, paper_reported } = q.data;
  const deployed = models.find((m) => m.deployed) ?? models[models.length - 1];
  const svm = models.find((m) => m.run === "svm_tuned");
  const selected = models.find((m) => m.run === cm) ?? deployed;

  const accData = models.map((m) => ({ name: short(m), Accuracy: m.accuracy, "Macro-F1": m.macro_f1 }));
  const genData = models.map((m) => ({
    name: short(m),
    "Official split": m.accuracy,
    "Unseen sessions": m.unseen_sessions_accuracy,
    "Unseen days": m.unseen_days_accuracy,
  }));
  const errData = models.map((m) => ({
    name: short(m),
    "False alarms (NAR)": m.nar,
    "Missed events (FNR)": m.fnr,
    "Digging missed": m.dig_miss_rate,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Models</h1>
        <p className="text-sm text-muted">
          The deployed lightweight 1D CNN against the paper&apos;s baselines, on the official test split and on recordings the models never saw.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Deployed accuracy" value={pct(deployed.accuracy, 2)} tone="#22D3EE" icon={<Trophy className="size-4" />} hint={`paper CNN reported ${pct(paper_reported.cnn)}`} />
        <Stat label="On unseen days" value={pct(deployed.unseen_days_accuracy)} icon={<Waypoints className="size-4" />} hint={svm ? `tuned SVM ${pct(svm.unseen_days_accuracy)}` : undefined} />
        <Stat label="Parameters" value={deployed.params ? `${Math.round(deployed.params / 1000)}k` : "—"} icon={<Boxes className="size-4" />} hint="0.7 MB on disk" />
        <Stat label="CPU latency" value={ms(deployed.latency_ms)} icon={<Gauge className="size-4" />} hint={svm ? `SVM ${ms(svm.latency_ms)} incl. features` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Official test split" subtitle={`Accuracy and macro-F1 · dashed lines: paper's reported SVM ${pct(paper_reported.svm)} and CNN ${pct(paper_reported.cnn)}`} icon={<Award className="size-4" />} />
          <div className="h-72 px-2 pb-4">
            <ResponsiveContainer>
              <BarChart data={accData} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" {...axis} interval={0} height={36} tick={<TwoLineTick />} />
                <YAxis {...axis} domain={[0.8, 1]} tickFormatter={asPct} />
                <Tooltip {...tooltip} formatter={(v) => asPct(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8B98AD" }} />
                <ReferenceLine y={paper_reported.cnn} stroke="#8B98AD" strokeDasharray="4 4" />
                <ReferenceLine y={paper_reported.svm} stroke="#7D8AA0" strokeDasharray="4 4" />
                <Bar dataKey="Accuracy" fill="#22D3EE" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Macro-F1" fill="#A78BFA" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Does it generalise?" subtitle="Same models, tested on recording sessions and whole days left out of training" icon={<Waypoints className="size-4" />} />
          <div className="h-72 px-2 pb-4">
            <ResponsiveContainer>
              <BarChart data={genData} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" {...axis} interval={0} height={36} tick={<TwoLineTick />} />
                <YAxis {...axis} domain={[0.5, 1]} tickFormatter={asPct} />
                <Tooltip {...tooltip} formatter={(v) => asPct(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8B98AD" }} />
                <Bar dataKey="Official split" fill="#22D3EE" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Unseen sessions" fill="#38BDF8" fillOpacity={0.7} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Unseen days" fill="#F59E0B" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Error rates" subtitle="Lower is better · digging is the threat that matters most for a buried cable" icon={<ShieldAlert className="size-4" />} />
          <div className="h-72 px-2 pb-4">
            <ResponsiveContainer>
              <BarChart data={errData} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" {...axis} interval={0} height={36} tick={<TwoLineTick />} />
                <YAxis {...axis} tickFormatter={asPct} />
                <Tooltip {...tooltip} formatter={(v) => `${(Number(v) * 100).toFixed(2)}%`} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8B98AD" }} />
                <Bar dataKey="False alarms (NAR)" fill="#94A3B8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Missed events (FNR)" fill="#F59E0B" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Digging missed" fill="#F43F5E" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="At a glance" subtitle="Size, speed, overall F1 and accuracy on unseen recording days" icon={<Boxes className="size-4" />} />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-faint">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Model</th>
                  <th className="py-2 pl-3 text-right font-medium">Params</th>
                  <th className="py-2 pl-3 text-right font-medium">Latency</th>
                  <th className="py-2 pl-3 text-right font-medium">Macro-F1</th>
                  <th className="py-2 pl-3 text-right font-medium" title="accuracy with whole recording days held out">Unseen days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {models.map((m) => (
                  <tr key={m.run}>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        {m.deployed && <Badge color="#22D3EE">deployed</Badge>}
                      </div>
                      <div className="max-w-[200px] text-[11px] text-faint">{m.description}</div>
                    </td>
                    <td className="num py-2.5 pl-3 text-right whitespace-nowrap text-muted">{m.params ? `${(m.params / 1000).toFixed(m.params < 10000 ? 1 : 0)}k` : "—"}</td>
                    <td className="num py-2.5 pl-3 text-right whitespace-nowrap text-muted">{ms(m.latency_ms)}</td>
                    <td className="num py-2.5 pl-3 text-right">{m.macro_f1.toFixed(3)}</td>
                    <td className="num py-2.5 pl-3 text-right">{pct(m.unseen_days_accuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Confusion matrix"
          subtitle="Official test split"
          icon={<Grid3x3 className="size-4" />}
          right={
            <Select aria-label="Model" value={selected.run} onChange={(e) => setCm(e.target.value)}>
              {models.map((m) => (
                <option key={m.run} value={m.run}>
                  {m.name}
                  {m.deployed ? " (deployed)" : ""}
                </option>
              ))}
            </Select>
          }
        />
        <div className="px-5 pb-5">
          <ConfusionMatrix m={selected} classes={classes} />
        </div>
      </Card>
    </div>
  );
}
