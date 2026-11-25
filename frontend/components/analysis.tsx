"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Explanation } from "@/lib/api";
import { cn, INFERNO_LUT, intensity } from "@/lib/utils";
import { Segmented } from "./ui";

type Mode = "signal" | "overlay" | "importance";

/** Static 12 x T heatmap of a signal, optionally masked by the explanation map (12 x 100). */
export function SignalMap({ signal, explanation }: { signal: number[][]; explanation?: Explanation | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>(explanation ? "overlay" : "signal");
  const effective: Mode = explanation ? mode : "signal";
  const T = signal[0]?.length ?? 0;

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !T) return;
    const img = ctx.createImageData(T, signal.length);
    const map = explanation?.map;
    const bins = map?.[0]?.length ?? 1;
    for (let p = 0; p < signal.length; p++) {
      for (let t = 0; t < T; t++) {
        const o = (p * T + t) * 4;
        const m = map ? map[p][Math.min(bins - 1, Math.floor((t * bins) / T))] : 0;
        if (effective === "importance") {
          img.data[o] = 7 + (34 - 7) * m;
          img.data[o + 1] = 11 + (211 - 11) * m;
          img.data[o + 2] = 18 + (238 - 18) * m;
        } else {
          const k = intensity(signal[p][t]) * 3;
          const f = effective === "overlay" ? 0.12 + 0.88 * Math.min(1, m * 1.6) : 1;
          img.data[o] = INFERNO_LUT[k] * f;
          img.data[o + 1] = INFERNO_LUT[k + 1] * f;
          img.data[o + 2] = INFERNO_LUT[k + 2] * f;
        }
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [signal, explanation, effective, T]);

  return (
    <div>
      {explanation && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {effective === "overlay" && "Signal, dimmed where the model paid little attention"}
            {effective === "signal" && "Vibration intensity, 12 fiber points × 1 s"}
            {effective === "importance" && "Integrated-Gradients attribution: where and when the evidence was"}
          </p>
          <Segmented<Mode>
            label="Map view"
            value={mode}
            onChange={setMode}
            options={[
              { value: "signal", label: "Signal" },
              { value: "overlay", label: "Overlay" },
              { value: "importance", label: "Attribution" },
            ]}
          />
        </div>
      )}
      <div className="flex gap-2">
        <div className="num flex flex-col justify-between py-0.5 text-[10px] leading-none text-faint" aria-hidden>
          {signal.map((_, i) => (
            <span key={i}>P{String(i + 1).padStart(2, "0")}</span>
          ))}
        </div>
        <canvas
          ref={ref}
          width={T}
          height={signal.length}
          className="block h-[220px] min-w-0 flex-1 rounded-lg ring-1 ring-line"
          style={{ imageRendering: "pixelated" }}
          role="img"
          aria-label="Signal heatmap"
        />
      </div>
      <div className="mt-1.5 flex justify-between pl-9 text-[10px] text-faint">
        <span>0 s</span>
        <span>time →</span>
        <span>1 s</span>
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: "#0E1420", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "#8B98AD" },
};

export function TimeImportance({ values }: { values: number[] }) {
  const data = values.map((v, i) => ({ t: ((i + 0.5) / values.length).toFixed(2), v }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="cam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22D3EE" stopOpacity={0.55} />
            <stop offset="1" stopColor="#22D3EE" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="t" tick={{ fill: "#5B677B", fontSize: 10 }} tickLine={false} axisLine={false} interval={19} unit=" s" />
        <YAxis domain={[0, 1]} tick={{ fill: "#5B677B", fontSize: 10 }} tickLine={false} axisLine={false} ticks={[0, 0.5, 1]} />
        <Tooltip {...tooltipStyle} formatter={(v) => [Number(v).toFixed(2), "Grad-CAM"]} labelFormatter={(l) => `t = ${l} s`} />
        <Area type="monotone" dataKey="v" stroke="#22D3EE" strokeWidth={1.5} fill="url(#cam)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PointImportance({ values, color = "#F59E0B" }: { values: number[]; color?: string }) {
  const max = Math.max(...values);
  const data = values.map((v, i) => ({ p: `P${i + 1}`, v }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="p" tick={{ fill: "#5B677B", fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={{ fill: "#5B677B", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, "share"]} />
        <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.p} fill={color} fillOpacity={d.v === max ? 1 : 0.45} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Dropzone({ onFile, busy }: { onFile: (f: File) => void; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      disabled={busy}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
        over ? "border-accent bg-accent/10" : "border-line-strong hover:border-accent/50 hover:bg-white/[0.02]",
      )}
    >
      {busy ? <Loader2 className="size-7 animate-spin text-accent" /> : <FileUp className="size-7 text-accent" />}
      <span className="text-sm font-medium">{busy ? "Analyzing…" : "Drop a .mat sample here, or click to choose"}</span>
      <span className="text-xs text-muted">Dataset format: variable “data”, 10,000 × 12, up to 2 MB</span>
      <input
        ref={input}
        type="file"
        accept=".mat"
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}
