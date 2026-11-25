"use client";

/**
 * App-wide live feed. One WebSocket for the whole app, so the status pill, alert banner, toasts and beeps work on
 * every page. Frames are NOT put in React state: components that draw them subscribe with `onFrame` and paint
 * directly (canvas / refs), so 7 frames a second never re-render the React tree.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api, WS_URL } from "@/lib/api";
import { classMeta } from "@/lib/classes";
import { beep, unlockAudio } from "@/lib/sound";
import { StreamClient, type ConnectionState, type StreamMessage } from "@/lib/ws";

export type LivePrediction = Extract<StreamMessage, { type: "prediction" }>;
/** The fields the "Last alert" tile needs; filled from the stream or, after a reload, from the event history. */
export type ThreatRef = { predicted_class: string; ts: string; top_point: number };
type FrameMsg = Extract<StreamMessage, { type: "frame" }>;

interface StreamCtx {
  connection: ConnectionState;
  frameMs: number;
  last: LivePrediction | null;
  recent: LivePrediction[];
  activeAlert: LivePrediction | null;
  /** true for a few seconds when quiet fiber returns after a threat */
  allClear: boolean;
  dismissAlert: () => void;
  today: { events: number; threats: number; lastThreat: ThreatRef | null; latencyMs: number | null };
  paused: boolean;
  setPaused: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  sound: boolean;
  setSound: (s: boolean) => void;
  onFrame: (fn: (m: FrameMsg) => void) => () => void;
}

const Ctx = createContext<StreamCtx | null>(null);

export function useStream() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStream outside StreamProvider");
  return c;
}

const ALERT_MS = 7000;
const ALL_CLEAR_MS = 4000;

function minutesSinceMidnight() {
  const now = new Date();
  return Math.max(1, Math.ceil((now.getTime() - new Date(now).setHours(0, 0, 0, 0)) / 60000));
}

export function StreamProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<StreamClient | null>(null);
  const frameListeners = useRef(new Set<(m: FrameMsg) => void>());
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [frameMs, setFrameMs] = useState(150);
  const [last, setLast] = useState<LivePrediction | null>(null);
  const [recent, setRecent] = useState<LivePrediction[]>([]);
  const [activeAlert, setActiveAlert] = useState<LivePrediction | null>(null);
  const [today, setToday] = useState<StreamCtx["today"]>({ events: 0, threats: 0, lastThreat: null, latencyMs: null });
  const [paused, setPausedState] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [sound, setSoundState] = useState(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [allClear, setAllClear] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threatOpen = useRef(false);            // a threat was raised and quiet fiber has not been seen since

  // today's counters from the event history, then kept up to date from the stream
  useEffect(() => {
    api
      .eventStats(minutesSinceMidnight())
      .then((s) =>
        setToday((t) => ({
          ...t,
          events: s.total,
          threats: (s.by_level.critical ?? 0) + (s.by_level.warning ?? 0),
        })),
      )
      .catch(() => {});
    // last alert survives a page reload: newest critical or warning event in the history
    Promise.all([api.events({ level: "critical", limit: 1 }), api.events({ level: "warning", limit: 1 })])
      .then(([c, w]) => {
        const latest = [...c, ...w].sort((a, b) => b.ts.localeCompare(a.ts))[0];
        if (latest)
          setToday((t) =>
            t.lastThreat ? t : { ...t, lastThreat: { predicted_class: latest.pred, ts: latest.ts, top_point: latest.top_point } },
          );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      setSoundState(localStorage.getItem("fiber.sound") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const client = new StreamClient(WS_URL);
    clientRef.current = client;
    const offState = client.onState(setConnection);
    const off = client.on((msg) => {
      if (msg.type === "frame") {
        frameListeners.current.forEach((fn) => fn(msg));
      } else if (msg.type === "hello") {
        setFrameMs(msg.frame_ms);
        setSpeedState(msg.speed);
      } else if (msg.type === "prediction") {
        setLast(msg);
        setRecent((r) => [msg, ...r].slice(0, 50));
        const isThreat = msg.alert_level === "critical" || msg.alert_level === "warning";
        setToday((t) => ({
          events: t.events + 1,
          threats: t.threats + (isThreat ? 1 : 0),
          lastThreat: isThreat ? msg : t.lastThreat,
          latencyMs: t.latencyMs === null ? msg.latency_ms : t.latencyMs * 0.8 + msg.latency_ms * 0.2,
        }));
        if (msg.alert_level === "normal" && threatOpen.current) {
          threatOpen.current = false;               // quiet fiber is back: replace the alert with "All clear"
          setActiveAlert(null);
          setAllClear(true);
          if (clearTimer.current) clearTimeout(clearTimer.current);
          clearTimer.current = setTimeout(() => setAllClear(false), ALL_CLEAR_MS);
        }
        if (isThreat) {
          const meta = classMeta(msg.predicted_class);
          threatOpen.current = true;
          setAllClear(false);
          setActiveAlert(msg);
          if (alertTimer.current) clearTimeout(alertTimer.current);
          alertTimer.current = setTimeout(() => setActiveAlert(null), ALERT_MS);
          const text = `${meta.label} detected near point ${msg.top_point}`;
          const opts = { description: `${(msg.confidence * 100).toFixed(1)}% confidence`, duration: 5000 };
          if (msg.alert_level === "critical") toast.error(text, opts);
          else toast.warning(text, opts);
          if (soundRef.current) beep(msg.alert_level as "critical" | "warning");
        }
      }
    });
    client.start();
    return () => {
      off();
      offState();
      client.stop();
      if (alertTimer.current) clearTimeout(alertTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const setPaused = useCallback((p: boolean) => {
    setPausedState(p);
    clientRef.current?.send({ cmd: p ? "pause" : "resume" });
  }, []);

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    clientRef.current?.send({ cmd: "speed", value: s });
  }, []);

  const setSound = useCallback((s: boolean) => {
    if (s) unlockAudio();
    setSoundState(s);
    try {
      localStorage.setItem("fiber.sound", s ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const onFrame = useCallback((fn: (m: FrameMsg) => void) => {
    frameListeners.current.add(fn);
    return () => {
      frameListeners.current.delete(fn);
    };
  }, []);

  const dismissAlert = useCallback(() => {
    setActiveAlert(null);
    setAllClear(false);
  }, []);

  const value = useMemo(
    () => ({
      connection, frameMs, last, recent, activeAlert, allClear, dismissAlert, today,
      paused, setPaused, speed, setSpeed, sound, setSound, onFrame,
    }),
    [connection, frameMs, last, recent, activeAlert, allClear, dismissAlert, today, paused, setPaused, speed, setSpeed, sound,
      setSound, onFrame],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
