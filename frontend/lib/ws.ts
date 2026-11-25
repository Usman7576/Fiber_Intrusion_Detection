/** WebSocket client for /api/stream with automatic reconnect (exponential backoff, capped at 10 s). */

import type { Prediction } from "./api";

export type StreamMessage =
  | { type: "hello"; frame_ms: number; frames_per_sample: number; points: number; classes: string[]; speed: number }
  | { type: "sample_start"; sample_id: number; frames: number }
  | { type: "frame"; sample_id: number; frame_idx: number; values: number[][] }
  | (Prediction & { type: "prediction"; sample_id: number; file: string; true_label: string; event_id: number; ts: string });

export type ConnectionState = "connecting" | "open" | "closed";

type Listener = (msg: StreamMessage) => void;
type StateListener = (s: ConnectionState) => void;

export class StreamClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  state: ConnectionState = "closed";

  constructor(private url: string) {}

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.setState("closed");
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn: StateListener) {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  send(cmd: { cmd: "pause" | "resume" } | { cmd: "speed"; value: number }) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(cmd));
  }

  private setState(s: ConnectionState) {
    this.state = s;
    this.stateListeners.forEach((fn) => fn(s));
  }

  private connect() {
    this.setState("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setState("open");
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as StreamMessage;
        this.listeners.forEach((fn) => fn(msg));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setState("closed");
      if (this.stopped) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }
}
