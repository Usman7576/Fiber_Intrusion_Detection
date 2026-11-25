"use client";

import { Activity, AlarmClock, Gauge, Pause, Play, Route, ShieldAlert, Volume2, VolumeX, Waves } from "lucide-react";

import { FiberRoute, LiveHeatmap, RecentDetections } from "@/components/live";
import { ConfidenceBars, PredictionSummary } from "@/components/prediction";
import { useStream } from "@/components/stream-provider";
import { Button, Card, CardHeader, EmptyState, Segmented, Stat } from "@/components/ui";
import { classMeta } from "@/lib/classes";
import { ms, relativeTime } from "@/lib/utils";

export default function LiveMonitor() {
  const s = useStream();
  const lastThreat = s.today.lastThreat;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Live Monitor</h1>
          <p className="text-sm text-muted">Real-time classification of vibrations along the buried fiber route.</p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-muted">
          <span className={`size-2 rounded-full ${s.connection === "open" && !s.paused ? "live-dot bg-critical" : "bg-faint"}`} />
          {s.connection !== "open" ? "OFFLINE" : s.paused ? "PAUSED" : "LIVE"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Events today" value={s.today.events.toLocaleString()} icon={<Activity className="size-4" />} hint="classified windows" />
        <Stat
          label="Threats today"
          value={s.today.threats.toLocaleString()}
          icon={<ShieldAlert className="size-4" />}
          tone={s.today.threats ? "#F43F5E" : undefined}
          hint="digging, knocking, shaking"
        />
        <Stat
          label="Last alert"
          value={lastThreat ? classMeta(lastThreat.predicted_class).label : "None"}
          icon={<AlarmClock className="size-4" />}
          tone={lastThreat ? classMeta(lastThreat.predicted_class).color : undefined}
          hint={lastThreat ? `${relativeTime(lastThreat.ts)} · point ${lastThreat.top_point}` : "this session"}
        />
        <Stat
          label="Model latency"
          value={ms(s.today.latencyMs)}
          icon={<Gauge className="size-4" />}
          hint="per 1 s window, CPU"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Waterfall"
            subtitle="Vibration intensity at each sensing point over time"
            icon={<Waves className="size-4" />}
            right={
              <>
                <Button onClick={() => s.setPaused(!s.paused)} aria-pressed={s.paused}>
                  {s.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                  {s.paused ? "Resume" : "Pause"}
                </Button>
                <Segmented
                  label="Playback speed"
                  value={s.speed}
                  onChange={s.setSpeed}
                  options={[1, 2, 4].map((v) => ({ value: v, label: `${v}×` }))}
                />
                <Button onClick={() => s.setSound(!s.sound)} aria-pressed={s.sound} active={s.sound} title="Alert sound">
                  {s.sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                  <span className="hidden sm:inline">Sound</span>
                </Button>
              </>
            }
          />
          <LiveHeatmap />
        </Card>

        <Card>
          <CardHeader title="Current detection" subtitle="Net1D on the last 1 s window" icon={<Activity className="size-4" />} />
          <div className="space-y-5 px-5 pb-5">
            {s.last ? (
              <>
                <PredictionSummary p={s.last} trueLabel={s.last.true_label} />
                <ConfidenceBars confidences={s.last.confidences} highlight={s.last.predicted_class} />
              </>
            ) : (
              <EmptyState title="Waiting for the first window">A prediction is made every ~3 s.</EmptyState>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Fiber route"
            subtitle="12 sensing points along the cable; the glowing node is the most active one"
            icon={<Route className="size-4" />}
          />
          <FiberRoute />
        </Card>
        <Card>
          <CardHeader title="Recent detections" subtitle="Last 8 classified windows" icon={<AlarmClock className="size-4" />} />
          <div className="max-h-[300px] overflow-y-auto pb-2">
            <RecentDetections items={s.recent.slice(0, 8)} />
          </div>
        </Card>
      </div>
    </div>
  );
}
