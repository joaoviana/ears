// The listening report, written for an agent rather than for a meter.
//
// Three findings from the benchmark shaped this:
//  1. Nine numbers of equal weight make an agent fixate on the loudest one. It chased `air` 11 times in 28 rounds
//     while the buried kick stayed buried. So: rank by how far each metric is from the target, name the worst, and
//     stop there. The rest is available but not shouted.
//  2. The agent could not tell WHICH voice was responsible, because the report was the whole mix. The host already
//     measures every slot; so: name the slots that moved, with the direction.
//  3. Almost every failure was FLAT, never MISS: the agent is timid. So: say what a detectable change is, in the
//     units it will be graded in.
//  4. "Muddy" is a symptom whose cause is two voices in the same band at the same time, which no master-bus
//     number can express. So: name the pairs that are fighting (masking.ts).
import type { Line } from "./report.ts";
/** the least a caller must measure per slot; `SlotWindow` from slotears.ts satisfies it */
export interface SlotLevel { power: number }
import type { Metric } from "./shots.ts";

export interface Attempt { metric: string; slot: string; grade: string }
const dB = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));
const METRIC_OF: Record<string, Metric> = { "sub  <80Hz": "sub", "low  150Hz": "low", "mid  700Hz": "mid", "high 3kHz": "high", "air  >7kHz": "air", centroid: "brightness", "onsets/beat": "density", envelope: "loudness", "peak/env": "punch", width: "width", groove: "groove" };
/** how far off a line is, in units of its own tolerance, so metrics can be compared with each other */
// every tolerance is in the unit the line's own delta is printed in: dB, % of centroid, onsets/beat, ms off the grid
const severity = (l: Line) => (l.delta !== null && !Number.isFinite(l.delta) ? 0 : (l.label === "headroom" ? (l.word === "slamming the limiter" ? 9 : l.word === "limiting" ? 3 : 0) : l.delta === null ? 0 : Math.abs(l.delta) / (l.label === "centroid" ? 25 : l.label === "onsets/beat" ? 0.8 : l.label === "envelope" ? 2.5 : l.label === "groove" ? 4 : 3)));   // clipping outranks everything

/** Which slots moved, and in which direction, against the same window the target was measured in. */
export function slotDrift(now: Record<string, SlotLevel>, target: Record<string, SlotLevel>): { slot: string; db: number }[] {
  const tot = (t: Record<string, SlotLevel>) => Object.values(t).reduce((a, w) => a + w.power, 0);
  const a = dB(tot(target)), b = dB(tot(now));
  return Object.keys(now).filter((k) => target[k]).map((k) => ({ slot: k, db: (dB(now[k].power) - b) - (dB(target[k].power) - a) })).filter((x) => Math.abs(x.db) >= 1.5).sort((x, y) => Math.abs(y.db) - Math.abs(x.db));
}

/**
 * @param lines     the measured report
 * @param refName   what it is being compared to
 * @param drift     per-slot level drift, if the host measured it
 * @param floors    what counts as a detectable change, per metric
 * @param tried     what has already been attempted, newest last
 */
export function brief(lines: Line[], refName: string, drift: { slot: string; db: number }[] = [], floors: Partial<Record<Metric, number>> = {}, tried: Attempt[] = [], masking: string[] = [], layers: string[] = []): string {
  const off = lines.filter((l) => l.word && l.word !== "ok" && severity(l) > 0).sort((a, b) => severity(b) - severity(a));
  const fmt = (l: Line) => (l.label === "headroom" ? `${l.word} (headroom ${l.value})` : `${l.word} (${l.label.split(/\s+/)[0]}, ${(l.delta ?? 0) >= 0 ? "+" : ""}${(l.delta ?? 0).toFixed(1)}${l.label === "centroid" ? "%" : ""} off)`);
  const out: string[] = [`Measured against ${refName}, worst first.`];

  if (!off.length) out.push("", "Nothing is off. The mix matches. Improve it on your own terms, or leave it alone.");
  else {
    out.push("", `THE BIGGEST PROBLEM: ${fmt(off[0])}`);
    if (off.length > 1) out.push(`Then: ${off.slice(1, 4).map(fmt).join(" · ")}${off.length > 4 ? ` · and ${off.length - 4} more` : ""}`);
  }
  if (drift.length) out.push("", "WHICH VOICE MOVED (level against how this base sounded when it started; this is where the damage is)", ...drift.slice(0, 4).map((d) => `  ${d.slot} is ${d.db > 0 ? "+" : ""}${d.db.toFixed(1)} dB ${d.db > 0 ? "louder" : "quieter"} than it should be`));
  if (masking.length) out.push("", "VOICES FIGHTING EACH OTHER (two things in one band at one moment; this is what \"muddy\" and \"boxy\" usually are)", ...masking);
  if (layers.length) out.push("", "WHAT IS LAYERED AND WHAT IS ALONE (same rhythm, different register: a sub under a bass, a rim on a clap)", ...layers);

  // the worst problem the agent can actually be graded on: headroom outranks everything but is not a called metric
  const worst = off.map((l) => METRIC_OF[l.label]).find((m) => m && floors[m] != null);
  if (worst) out.push("", `A change to ${worst} smaller than ${floors[worst]!.toFixed(1)} ${worst === "brightness" ? "Hz" : worst === "density" ? "onsets/beat" : "dB"} cannot be measured and will be graded FLAT. Make a move big enough to see.`);

  if (tried.length) {
    const failed = tried.filter((t) => t.grade === "flat" || t.grade === "miss");
    const stuck = Object.entries(failed.reduce<Record<string, number>>((a, t) => ((a[t.metric] = (a[t.metric] ?? 0) + 1), a), {})).filter(([, n]) => n >= 2);
    if (stuck.length) out.push("", `ALREADY TRIED AND IT DID NOT WORK: ${stuck.map(([m, n]) => `${m} ×${n}`).join(", ")}. Stop pushing on ${stuck[0][0]}; the cause is somewhere else.`);
  }
  out.push("", "Full measurements:", ...lines.map((l) => `  ${l.label.padEnd(12)}${l.value.padStart(9)}  ${l.delta === null ? "" : ((l.delta >= 0 ? "+" : "") + l.delta.toFixed(1) + (l.label === "centroid" ? "%" : "")).padStart(7)}  ${l.word}`));
  return out.join("\n");
}
