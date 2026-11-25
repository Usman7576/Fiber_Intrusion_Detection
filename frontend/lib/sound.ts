/** Short alert beeps generated with WebAudio (no audio files). */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(c: AudioContext, freq: number, start: number, dur: number, gain = 0.12) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** critical: three urgent high beeps; warning: two medium beeps. */
export function beep(level: "critical" | "warning") {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  if (level === "critical") [0, 0.16, 0.32].forEach((d) => tone(c, 880, t + d, 0.12));
  else [0, 0.22].forEach((d) => tone(c, 620, t + d, 0.15, 0.09));
}

/** Call from a user gesture (e.g. enabling sound) so browsers allow audio later. */
export function unlockAudio() {
  audio();
}
