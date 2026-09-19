// Turns the ears stream into the thing the agent (and the room) reads: a few numbers against a
// reference, with one plain word per line. This text is the agent's entire sense of hearing.
import type { Ears } from "./engine.ts";

export const BANDS = ["sub", "low", "mid", "high", "air"] as const;
export interface Profile { rms: number; crest: number; centroid: number; onsetsPerBeat: number; bands: number[] }
export interface Line { label: string; value: string; delta: number | null; word: string }

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-6));

export class Listener {
  private frames: Ears[] = [];
  private onsets = 0;
  private beats = 0;
  push(e: Ears) { this.frames.push(e); if (this.frames.length > 600) this.frames.shift(); }
  onset() { this.onsets++; }
  bar() { this.beats += 4; }

  /** Summarise everything heard since the last call. */
  take(): Profile | null {
    const f = this.frames;
    if (f.length < 10 || this.beats === 0) return null;
    const mean = (g: (e: Ears) => number) => f.reduce((s, e) => s + g(e), 0) / f.length;
    const rms = mean((e) => e.rms);
    const p: Profile = {
      rms: db(rms),
      crest: db(Math.max(...f.map((e) => e.peak)) / Math.max(rms, 1e-6)),
      centroid: mean((e) => e.centroid),
      onsetsPerBeat: this.onsets / this.beats,
      bands: BANDS.map((_, i) => db(mean((e) => e.bands[i]))),
    };
    this.frames = []; this.onsets = 0; this.beats = 0;
    return p;
  }
}

export function compare(now: Profile, ref: Profile | null): Line[] {
  const lines: Line[] = [];
  const word = (d: number, lo: string, hi: string, tol = 3) => (d < -tol ? lo : d > tol ? hi : "ok");
  const names: [string, string, string][] = [["sub  <80Hz", "thin", "boomy"], ["low  150Hz", "hollow", "muddy"], ["mid  700Hz", "scooped", "boxy"], ["high 3kHz", "dull", "harsh"], ["air  >7kHz", "closed", "fizzy"]];
  names.forEach(([label, lo, hi], i) => {
    // band balance is judged relative to overall level, so turning the whole mix up isn't "boomy"
    const rel = now.bands[i] - now.rms;
    const d = ref ? rel - (ref.bands[i] - ref.rms) : null;
    lines.push({ label, value: `${rel >= 0 ? "+" : ""}${rel.toFixed(1)} dB`, delta: d, word: d === null ? "" : word(d, lo, hi) });
  });
  const c = ref ? (now.centroid / ref.centroid - 1) * 100 : null;
  lines.push({ label: "centroid", value: `${(now.centroid / 1000).toFixed(1)} kHz`, delta: c, word: c === null ? "" : c > 25 ? "bright" : c < -25 ? "dark" : "ok" });
  const o = ref ? now.onsetsPerBeat - ref.onsetsPerBeat : null;
  lines.push({ label: "onsets/beat", value: now.onsetsPerBeat.toFixed(1), delta: o, word: o === null ? "" : o < -0.8 ? "sparse" : o > 0.8 ? "busy" : "ok" });
  const l = ref ? now.rms - ref.rms : null;
  lines.push({ label: "loudness", value: `${now.rms.toFixed(1)} dB`, delta: l, word: l === null ? "" : word(l, "quiet", "hot", 2.5) });
  lines.push({ label: "crest", value: `${now.crest.toFixed(1)} dB`, delta: ref ? now.crest - ref.crest : null, word: ref ? word(now.crest - ref.crest, "squashed", "spiky", 3) : "" });
  return lines;
}

export const asText = (lines: Line[], refName: string) =>
  [`vs reference "${refName}"`, ...lines.map((l) => `${l.label.padEnd(12)} ${l.value.padStart(9)}  ${l.delta === null ? "" : (l.delta >= 0 ? "+" : "") + l.delta.toFixed(1) + (l.label === "centroid" ? "%" : "")}  ${l.word}`)].join("\n");
