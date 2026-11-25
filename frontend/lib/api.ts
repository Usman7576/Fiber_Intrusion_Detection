/** Typed client for the FastAPI backend (see backend/app/schemas.py). */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws") + "/api/stream";

export type Confidences = Record<string, number>;

export interface ModelVote {
  model: string;
  predicted_class: string;
  confidence: number;
  confidences: Confidences;
  latency_ms: number;
}

export interface Explanation {
  target: string;
  time_importance: number[];
  point_importance: number[];
  map: number[][];
}

export interface Prediction {
  predicted_class: string;
  label: number;
  confidence: number;
  confidences: Confidences;
  alert_level: string;
  is_threat: boolean;
  latency_ms: number;
  top_point: number;
  point_energy: number[];
  model: string;
  compare?: ModelVote[] | null;
  explanation?: Explanation | null;
}

export interface UploadPrediction extends Prediction {
  file: string;
  event_id: number;
  signal: number[][];
}

export interface SampleInfo {
  id: number;
  file: string;
  true_label: string;
  recorder: string;
  date: string;
  session: string;
}

export interface SampleSignal extends SampleInfo {
  signal: number[][];
  point_energy: number[];
}

export interface SamplePrediction extends Prediction {
  sample: SampleInfo;
  correct: boolean;
}

export interface EventRow {
  id: number;
  ts: string;
  source: string;
  sample_id: number | null;
  file: string | null;
  pred: string;
  confidence: number;
  alert_level: string;
  true_label: string | null;
  top_point: number;
}

export interface EventStats {
  since: string | null;
  total: number;
  by_class: Record<string, number>;
  by_level: Record<string, number>;
}

export interface Health {
  status: string;
  version: string;
  model: string;
  model_params: number;
  normalise: string;
  svm_loaded: boolean;
  demo_samples: number;
  events_stored: number;
  uptime_s: number;
}

export interface ModelMetrics {
  run: string;
  name: string;
  description: string;
  deployed: boolean;
  accuracy: number;
  macro_f1: number;
  nar: number;
  fnr: number;
  dig_miss_rate: number;
  params: number | null;
  latency_ms: number | null;
  per_class_f1: Record<string, number>;
  confusion_matrix: number[][];
  unseen_sessions_accuracy: number | null;
  unseen_days_accuracy: number | null;
  unseen_days_dig_miss_rate: number | null;
}

export interface Metrics {
  classes: string[];
  deployed: string;
  test_samples: number;
  paper_reported: Record<string, number>;
  models: ModelMetrics[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, init);
  } catch {
    throw new ApiError(0, `Cannot reach the backend at ${API_URL}. Is it running?`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<Health>("/health"),
  samples: (p: { cls?: string; limit?: number; offset?: number } = {}) =>
    request<{ total: number; items: SampleInfo[] }>(`/samples${qs(p)}`),
  sample: (id: number) => request<SampleSignal>(`/samples/${id}`),
  samplePrediction: (id: number) => request<SamplePrediction>(`/samples/${id}/prediction`),
  explain: (id: number) => request<Explanation>(`/explain/${id}`),
  upload: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<UploadPrediction>(`/predict${qs({ compare: true, explain: true })}`, { method: "POST", body });
  },
  metrics: () => request<Metrics>("/metrics"),
  events: (p: { cls?: string; level?: string; source?: string; since?: string; limit?: number } = {}) =>
    request<EventRow[]>(`/events${qs(p)}`),
  eventStats: (minutes?: number) => request<EventStats>(`/events/stats${qs({ minutes })}`),
};

export const MODEL_LABELS: Record<string, string> = {
  net1d_dig2_chnorm: "Net1D (deployed)",
  svm_tuned: "Tuned SVM",
  paper_cnn_long: "Paper CNN",
};
