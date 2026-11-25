"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, BarChart3, BookOpen, FileSearch, ListChecks, Radio, ShieldCheck, Wifi, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { classMeta, levelMeta } from "@/lib/classes";
import { cn } from "@/lib/utils";
import { useStream } from "./stream-provider";

const NAV = [
  { href: "/", label: "Live Monitor", short: "Live", icon: Activity },
  { href: "/analyze", label: "Analyze", short: "Analyze", icon: FileSearch },
  { href: "/events", label: "Events", short: "Events", icon: ListChecks },
  { href: "/models", label: "Models", short: "Models", icon: BarChart3 },
  { href: "/about", label: "About", short: "About", icon: BookOpen },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid size-8 place-items-center rounded-lg bg-accent/10 ring-1 ring-accent/30">
        <Radio className="size-4 text-accent" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-wide">FiberGuard</div>
        <div className="hidden text-[10px] uppercase tracking-[0.18em] text-faint sm:block">Φ-OTDR monitor</div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-bg/80 px-3 py-5 backdrop-blur md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-accent/10 text-accent" : "text-muted hover:bg-white/5 hover:text-ink",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3 text-[11px] leading-relaxed text-faint">
          NGCN project · FAST-NUCES
          <br />
          Dataset: Cao et al. 2023
        </div>
      </aside>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/95 backdrop-blur md:hidden"
      >
        {NAV.map(({ href, short, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px]",
                active ? "text-accent" : "text-muted",
              )}
            >
              <Icon className="size-[18px]" />
              {short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="num hidden text-xs text-muted sm:inline" suppressHydrationWarning>
      {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
    </span>
  );
}

function StatusPill() {
  const { last, connection, activeAlert } = useStream();
  let color = "#10B981";
  let text = "System nominal";
  if (connection !== "open") {
    color = "#94A3B8";
    text = connection === "connecting" ? "Connecting…" : "Feed offline";
  } else if (activeAlert) {
    color = levelMeta(activeAlert.alert_level).color;
    text = `THREAT: ${classMeta(activeAlert.predicted_class).label}`;
  } else if (last?.alert_level === "info") {
    text = `Activity: ${classMeta(last.predicted_class).label}`;
    color = "#38BDF8";
  }
  return (
    <span
      role="status"
      className="inline-flex max-w-[180px] items-center gap-2 truncate rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap sm:max-w-none"
      style={{ backgroundColor: `${color}1a`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      <span className="live-dot size-2 rounded-full" style={{ backgroundColor: color }} />
      {text}
    </span>
  );
}

export function TopBar() {
  const { connection } = useStream();
  const online = connection === "open";
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/75 px-4 backdrop-blur md:px-6">
      <div className="md:hidden">
        <Logo />
      </div>
      <div className="hidden md:block">
        <StatusPill />
      </div>
      <div className="flex items-center gap-4">
        <div className="md:hidden">
          <StatusPill />
        </div>
        <Clock />
        <span
          className={cn("hidden items-center gap-1.5 text-xs sm:inline-flex", online ? "text-safe" : "text-muted")}
          title={online ? "Connected to backend" : "Backend not reachable, retrying"}
        >
          {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {online ? "Backend" : "Offline"}
        </span>
      </div>
    </header>
  );
}

export function AlertBanner() {
  const { activeAlert, allClear, dismissAlert } = useStream();
  const meta = activeAlert ? classMeta(activeAlert.predicted_class) : null;
  const level = activeAlert ? levelMeta(activeAlert.alert_level) : null;
  return (
    <AnimatePresence>
      {activeAlert && meta && level && (
        <motion.div
          // one fixed key: a new alert updates the banner in place. A key per event would mount a new banner each
          // time and leave the old ones in their exit animation, which never finishes in a background tab
          // (no animation frames), so banners would pile up in the DOM.
          key="threat-banner"
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          role="alert"
          className="relative mx-4 mt-3 overflow-hidden rounded-xl md:mx-6"
          style={{
            background: `linear-gradient(90deg, ${level.color}2e, ${level.color}12)`,
            boxShadow: `inset 0 0 0 1px ${level.color}66, 0 0 28px -6px ${level.color}88`,
          }}
        >
          <div className="flex items-center gap-3 px-4 py-2.5">
            <level.icon className="size-5 shrink-0" style={{ color: level.color }} />
            <meta.icon className="size-5 shrink-0" style={{ color: level.color }} />
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold" style={{ color: level.color }}>
                {level.label}: {meta.label} detected
              </span>
              <span className="text-muted">
                {" "}
                · fiber point {activeAlert.top_point} · {(activeAlert.confidence * 100).toFixed(1)}% confidence
              </span>
            </div>
            <button onClick={dismissAlert} className="rounded p-1 text-muted hover:text-ink" aria-label="Dismiss alert">
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
      {!activeAlert && allClear && (
        <motion.div
          key="all-clear"
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          role="status"
          className="mx-4 mt-3 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm md:mx-6"
          style={{ background: "linear-gradient(90deg, #10B98126, #10B9810d)", boxShadow: "inset 0 0 0 1px #10B98159" }}
        >
          <ShieldCheck className="size-5 shrink-0 text-safe" />
          <span className="font-semibold text-safe">All clear</span>
          <span className="text-muted">· the fiber is quiet again</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
