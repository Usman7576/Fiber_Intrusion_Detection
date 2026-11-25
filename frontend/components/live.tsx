"use client";

import { useEffect, useRef, useState } from "react";

import { classMeta, levelMeta, POINT_SPACING_M } from "@/lib/classes";
import { INFERNO_LUT, intensity, relativeTime, timeOf } from "@/lib/utils";
import { useStream, type LivePrediction } from "./stream-provider";
import { Badge, EmptyState } from "./ui";

const POINTS = 12;
const POOL = 2;               // pool every 2 time steps -> 25 columns per 50-step frame
const COLUMNS = 1000;         // 40 frames = 2 windows (~6 s at 1x) visible

/** Scrolling waterfall: 12 rows (fiber points), newest data on the right. Painted straight into the canvas. */
export function LiveHeatmap() {
  const { onFrame, connection } = useStream();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastSample = useRef<number | null>(null);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#000004";
    ctx.fillRect(0, 0, COLUMNS, POINTS);
    let seen = false;
    return onFrame((msg) => {
      const values = msg.values;
      const steps = values[0]?.length ?? 0;
      const cols = Math.floor(steps / POOL);
      if (!cols) return;
      ctx.drawImage(canvas, -cols, 0);                         // scroll left
      const img = ctx.createImageData(cols, POINTS);
      for (let p = 0; p < POINTS; p++) {
        const row = values[p];
        for (let c = 0; c < cols; c++) {
          let s = 0;
          for (let k = 0; k < POOL; k++) s += Math.abs(row[c * POOL + k]);
          const idx = intensity(s / POOL) * 3;
          const o = (p * cols + c) * 4;
          img.data[o] = INFERNO_LUT[idx];
          img.data[o + 1] = INFERNO_LUT[idx + 1];
          img.data[o + 2] = INFERNO_LUT[idx + 2];
          img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, COLUMNS - cols, 0);
      if (msg.sample_id !== lastSample.current && msg.frame_idx === 0) {
        ctx.fillStyle = "rgba(34, 211, 238, 0.55)";               // thin marker at each new window
        ctx.fillRect(COLUMNS - cols, 0, 1, POINTS);
      }
      lastSample.current = msg.sample_id;
      if (!seen) {
        seen = true;
        setHasData(true);
      }
    });
  }, [onFrame]);

  return (
    <div className="px-5 pb-4">
      <div className="relative flex gap-2">
        <div className="num flex flex-col justify-between py-0.5 text-[10px] leading-none text-faint" aria-hidden>
          {Array.from({ length: POINTS }, (_, i) => (
            <span key={i}>P{String(i + 1).padStart(2, "0")}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg ring-1 ring-line">
          <canvas
            ref={canvasRef}
            width={COLUMNS}
            height={POINTS}
            className="block h-[220px] w-full sm:h-[260px]"
            style={{ imageRendering: "pixelated" }}
            role="img"
            aria-label="Live waterfall of vibration intensity along 12 fiber points"
          />
          {!hasData && (
            <div className="absolute inset-0 grid place-items-center text-xs text-muted">
              {connection === "open" ? "Waiting for the first frames…" : "Connecting to the live feed…"}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 pl-9 text-[10px] text-faint">
        <span>← older (~6 s)</span>
        <div className="flex items-center gap-2">
          <span>quiet</span>
          <span
            className="h-1.5 w-28 rounded-full"
            style={{ background: "linear-gradient(90deg,#000004,#550f6d,#ba3655,#f98c0a,#fcffa4)" }}
          />
          <span>strong vibration</span>
        </div>
        <span>now →</span>
      </div>
    </div>
  );
}

/** Cable route with the 12 sensing points; node size and glow follow the live vibration energy. */
export function FiberRoute() {
  const { onFrame, last } = useStream();
  const energyRef = useRef<number[]>(Array(POINTS).fill(0));
  const [energy, setEnergy] = useState<number[]>(Array(POINTS).fill(0));

  useEffect(() => {
    let dirty = false;
    const off = onFrame((msg) => {
      const e = energyRef.current;
      msg.values.forEach((row, p) => {
        let s = 0;
        for (const v of row) s += v * v;
        e[p] = e[p] * 0.6 + Math.sqrt(s / row.length) * 0.4;   // smoothed RMS per point
      });
      dirty = true;
    });
    const t = setInterval(() => {
      if (dirty) {
        setEnergy([...energyRef.current]);
        dirty = false;
      }
    }, 250);
    return () => {
      off();
      clearInterval(t);
    };
  }, [onFrame]);

  const W = 900;
  const H = 150;
  const x0 = 40;
  const x1 = W - 40;
  const yOf = (x: number) => 78 + 26 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 1.6);
  const pts = Array.from({ length: POINTS }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / (POINTS - 1);
    return { x, y: yOf(x) };
  });
  const path = Array.from({ length: 61 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / 60;
    return `${i ? "L" : "M"}${x.toFixed(1)},${yOf(x).toFixed(1)}`;
  }).join(" ");
  const max = Math.max(...energy);
  const top = energy.indexOf(max);
  const active = max > 1.2;
  const alertColor = last && last.alert_level !== "normal" ? levelMeta(last.alert_level).color : "#22D3EE";

  return (
    <div className="overflow-x-auto px-3 pb-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[560px]" role="img" aria-label="Fiber route with 12 sensing points">
        <defs>
          <linearGradient id="fiber" x1="0" x2="1">
            <stop offset="0" stopColor="#22D3EE" stopOpacity="0.25" />
            <stop offset="0.5" stopColor="#22D3EE" stopOpacity="0.6" />
            <stop offset="1" stopColor="#22D3EE" stopOpacity="0.25" />
          </linearGradient>
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <path d={path} fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth={14} strokeLinecap="round" />
        <path d={path} fill="none" stroke="url(#fiber)" strokeWidth={2.5} strokeLinecap="round" />
        <text x={x0 - 30} y={yOf(x0) + 4} fontSize={11} fill="#5B677B">CO</text>
        {pts.map(({ x, y }, i) => {
          const e = Math.min(1, energy[i] / 3);
          const isTop = active && i === top;
          const color = isTop ? alertColor : `rgb(34 211 238 / ${0.35 + 0.65 * e})`;
          return (
            <g key={i}>
              {isTop && <circle cx={x} cy={y} r={20} fill={alertColor} opacity={0.5} filter="url(#glow)" className="node-glow" />}
              <circle cx={x} cy={y} r={4 + 7 * e} fill="#070B12" stroke={color} strokeWidth={2} style={{ transition: "r 250ms ease" }} />
              <circle cx={x} cy={y} r={2 + 3 * e} fill={color} style={{ transition: "r 250ms ease" }} />
              <text x={x} y={y - 18 - 6 * e} textAnchor="middle" fontSize={11} fill={isTop ? alertColor : "#8B98AD"} className="num">
                P{i + 1}
              </text>
              <text x={x} y={H - 6} textAnchor="middle" fontSize={10} fill="#5B677B" className="num">
                {(i + 1) * POINT_SPACING_M} m
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function RecentDetections({ items }: { items: LivePrediction[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  if (!items.length) return <EmptyState title="No detections yet">They appear here as the live feed is classified.</EmptyState>;
  return (
    <ul className="divide-y divide-line">
      {items.map((p) => {
        const meta = classMeta(p.predicted_class);
        const level = levelMeta(p.alert_level);
        return (
          <li key={p.event_id} className="flex items-center gap-3 px-5 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${meta.color}1a` }}>
              <meta.icon className="size-4" style={{ color: meta.color }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{meta.label}</span>
                {p.alert_level !== "normal" && (
                  <Badge color={level.color} className="px-1.5 py-0 text-[10px]">
                    {level.label}
                  </Badge>
                )}
              </div>
              <div className="num text-[11px] text-faint" title={timeOf(p.ts)}>
                P{p.top_point} · {relativeTime(p.ts, now)}
              </div>
            </div>
            <span className="num text-xs text-muted">{(p.confidence * 100).toFixed(1)}%</span>
          </li>
        );
      })}
    </ul>
  );
}
