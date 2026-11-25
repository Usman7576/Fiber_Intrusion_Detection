"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, ListChecks, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge, Button, Card, CardHeader, EmptyState, Select, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { CLASS_NAMES, classMeta, LEVELS, levelMeta, type AlertLevel } from "@/lib/classes";
import { cn, dateTimeOf, toCsv } from "@/lib/utils";

const RANGES = [
  { value: "15", label: "Last 15 min" },
  { value: "60", label: "Last hour" },
  { value: "1440", label: "Last 24 h" },
  { value: "", label: "All time" },
];

export default function EventsPage() {
  const [cls, setCls] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [range, setRange] = useState<string>("60");

  const events = useQuery({
    queryKey: ["events", cls, level, source, range],
    queryFn: () =>
      api.events({
        cls: cls || undefined,
        level: level || undefined,
        source: source || undefined,
        // window is recomputed on every (auto-)refetch, so "last 15 min" stays current
        since: range ? new Date(Date.now() - Number(range) * 60_000).toISOString() : undefined,
        limit: 1000,
      }),
    refetchInterval: 5000,
    staleTime: 0,
  });
  const rows = useMemo(() => events.data ?? [], [events.data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => (c[r.pred] = (c[r.pred] ?? 0) + 1));
    return c;
  }, [rows]);

  const exportCsv = () => {
    const csv = toCsv(rows.map((r) => ({ ...r })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fiber-events-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted">Every classified window from the live feed and from uploads.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => events.refetch()} disabled={events.isFetching}>
            <RefreshCw className={cn("size-3.5", events.isFetching && "animate-spin")} /> Refresh
          </Button>
          <Button variant="primary" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
          <button
            onClick={() => setCls("")}
            aria-pressed={!cls}
            className={cn(
              "rounded-full px-3 py-1 text-xs transition-colors",
              !cls ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "text-muted ring-1 ring-line-strong hover:text-ink",
            )}
          >
            All classes
          </button>
          {CLASS_NAMES.map((c) => {
            const meta = classMeta(c);
            const on = cls === c;
            return (
              <button
                key={c}
                onClick={() => setCls(on ? "" : c)}
                aria-pressed={on}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 transition-colors"
                style={
                  on
                    ? { backgroundColor: `${meta.color}26`, color: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}66` }
                    : { color: "#8B98AD", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }
                }
              >
                <meta.icon className="size-3" />
                {meta.label}
                {!cls && counts[c] ? <span className="num text-faint">{counts[c]}</span> : null}
              </button>
            );
          })}
          <div className="ml-auto flex flex-wrap gap-2">
            <Select aria-label="Alert level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All levels</option>
              {(Object.keys(LEVELS) as AlertLevel[]).map((l) => (
                <option key={l} value={l}>{LEVELS[l].label}</option>
              ))}
            </Select>
            <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              <option value="stream">Live feed</option>
              <option value="upload">Uploads</option>
            </Select>
            <Select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <CardHeader
          title={`${rows.length.toLocaleString()} event${rows.length === 1 ? "" : "s"}`}
          subtitle="Newest first · refreshes every 5 s · showing up to 1,000"
          icon={<ListChecks className="size-4" />}
        />

        {events.isLoading ? (
          <div className="space-y-2 px-5 pb-5">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : events.isError ? (
          <EmptyState title="Could not load events">{(events.error as Error).message}</EmptyState>
        ) : !rows.length ? (
          <EmptyState title="No events match">Open the Live Monitor to generate some, or widen the filters.</EmptyState>
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 bg-panel text-left text-xs text-faint">
                <tr className="border-b border-line">
                  <th className="px-5 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Detection</th>
                  <th className="px-3 py-2.5 text-right font-medium">Confidence</th>
                  <th className="px-3 py-2.5 font-medium">Alert</th>
                  <th className="px-3 py-2.5 font-medium">Point</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-5 py-2.5 font-medium">Ground truth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const meta = classMeta(r.pred);
                  const lv = levelMeta(r.alert_level);
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.02]">
                      <td className="num px-5 py-2.5 whitespace-nowrap text-muted">{dateTimeOf(r.ts)}</td>
                      <td className="px-3 py-2.5">
                        <Badge color={meta.color}>
                          <meta.icon className="size-3" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="num px-3 py-2.5 text-right">{(r.confidence * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: lv.color }}>
                          <lv.icon className="size-3.5" />
                          {lv.label}
                        </span>
                      </td>
                      <td className="num px-3 py-2.5 text-muted">P{r.top_point}</td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {r.source === "stream" ? "Live feed" : <span title={r.file ?? ""}>Upload</span>}
                      </td>
                      <td className="px-5 py-2.5 text-xs">
                        {r.true_label ? (
                          <span className={r.true_label === r.pred ? "text-safe" : "text-critical"}>
                            {classMeta(r.true_label).label}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
