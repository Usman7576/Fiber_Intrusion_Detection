"use client";

import { CheckCircle2, Cpu, XCircle } from "lucide-react";

import type { ModelVote, Prediction } from "@/lib/api";
import { MODEL_LABELS } from "@/lib/api";
import { CLASS_NAMES, classMeta, levelMeta } from "@/lib/classes";
import { ms, pct } from "@/lib/utils";
import { Badge } from "./ui";

export function ConfidenceRing({ value, color, size = 96 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`confidence ${pct(value)}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={7} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 400ms ease, stroke 400ms ease", filter: `drop-shadow(0 0 6px ${color}66)` }}
      />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="num" fill="#E6EDF7" fontSize={size / 5.2} fontWeight={600}>
        {(value * 100).toFixed(value > 0.999 ? 0 : 1)}
      </text>
      <text x="50%" y="68%" textAnchor="middle" fill="#8B98AD" fontSize={size / 9}>
        % conf.
      </text>
    </svg>
  );
}

export function ConfidenceBars({ confidences, highlight }: { confidences: Record<string, number>; highlight?: string }) {
  return (
    <ul className="space-y-2">
      {CLASS_NAMES.map((c) => {
        const meta = classMeta(c);
        const v = confidences[c] ?? 0;
        return (
          <li key={c} className="grid grid-cols-[86px_1fr_52px] items-center gap-2 text-xs">
            <span className={c === highlight ? "font-medium text-ink" : "text-muted"}>{meta.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(v * 100, v > 0 ? 1 : 0)}%`, backgroundColor: meta.color, transition: "width 400ms ease" }}
              />
            </div>
            <span className="num text-right text-muted">{pct(v)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function PredictionSummary({
  p,
  trueLabel,
}: {
  p: Pick<Prediction, "predicted_class" | "confidence" | "alert_level" | "latency_ms" | "top_point">;
  trueLabel?: string | null;
}) {
  const meta = classMeta(p.predicted_class);
  const level = levelMeta(p.alert_level);
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-4">
      <ConfidenceRing value={p.confidence} color={meta.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon className="size-6 shrink-0" style={{ color: meta.color }} />
          <span className="truncate text-2xl font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{meta.blurb}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Badge color={level.color}>
            <level.icon className="size-3" />
            {level.label}
          </Badge>
          <span className="num text-xs text-muted">point {p.top_point}</span>
          <span className="num text-xs text-muted">· {ms(p.latency_ms)}</span>
        </div>
        {trueLabel && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {trueLabel === p.predicted_class ? (
              <CheckCircle2 className="size-3.5 text-safe" />
            ) : (
              <XCircle className="size-3.5 text-critical" />
            )}
            <span className="text-muted">
              ground truth: <span className="text-ink">{classMeta(trueLabel).label}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ModelCompare({ votes }: { votes: ModelVote[] }) {
  return (
    <ul className="divide-y divide-line">
      {votes.map((v) => {
        const meta = classMeta(v.predicted_class);
        return (
          <li key={v.model} className="flex items-center gap-3 py-2.5 text-sm">
            <Cpu className="size-4 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-muted">{MODEL_LABELS[v.model] ?? v.model}</span>
            <Badge color={meta.color}>
              <meta.icon className="size-3" />
              {meta.label}
            </Badge>
            <span className="num w-14 text-right text-xs text-ink">{pct(v.confidence)}</span>
            <span className="num hidden w-16 text-right text-xs text-faint sm:inline">{ms(v.latency_ms)}</span>
          </li>
        );
      })}
    </ul>
  );
}
