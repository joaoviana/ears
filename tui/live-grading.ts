import { EventEmitter } from "node:events";
import type { Bus } from "./bus.ts";
import type { Evidence, ObservationBody, ComparisonBody } from "./evidence.ts";
import { NoiseFloor, grade, attributable, type Expect, type Metric, type Outcome } from "./shots.ts";
import { SlotEars, slotOwnDifference, PER_SLOT_METRICS, type SlotWindow } from "./slotears.ts";

export interface CalledShot { agent: string; name: string; rgb: number[]; slot: string; expect: Expect; stacked?: boolean }
export interface GradedShot { proposal: number; shot: CalledShot; outcome: Outcome; perSlot: boolean }

/** Holds calibration and pending predictions independently of rendering and React closures. */
export class LiveGrading extends EventEmitter<{ outcome: [result: GradedShot] }> {
  readonly slots = new SlotEars();
  private noise = new NoiseFloor();
  private slotNoise: Record<string, NoiseFloor> = {};
  private windows = new Map<string, { key: string; slots: Record<string, SlotWindow> }>();
  private shots = new Map<number, CalledShot>();

  constructor(private evidence: Evidence, private wire: Pick<Bus, "send">, private slotIds: readonly string[]) {
    super();
    evidence.on("observation", this.observe);
    evidence.on("comparison", this.compare);
  }

  call(proposal: number, shot: CalledShot) { this.shots.set(proposal, shot); }
  floor(metric: Metric, slot?: string) { return (slot ? this.slotNoise[slot] ?? this.noise : this.noise).floor(metric); }

  private observe = (m: ObservationBody) => {
    if (!m.quality.stable_state) return;
    const x = m.metrics, rms = x.envelope_dbfs;
    const key = `${m.state_revision}:${JSON.stringify(m.active_revisions)}`;
    this.noise.push(key, {
      sub: x.bands_dbfs.sub - rms, low: x.bands_dbfs.low - rms, mid: x.bands_dbfs.mid - rms,
      high: x.bands_dbfs.high - rms, air: x.bands_dbfs.air - rms,
      brightness: x.centroid_hz, loudness: rms, density: x.onsets_per_beat,
      punch: x.peak_to_envelope_db, width: x.width_db, groove: x.off_grid_beats * 1000,
    });
    if (!m.window) return;
    const slots = this.slots.all(m.window.start_ms, m.window.end_ms);
    const previous = [...this.windows.values()].at(-1);
    if (previous?.key === key) for (const slot of this.slotIds) {
      const d = slotOwnDifference(previous.slots, slots, slot, { onsets_per_beat: 0, peak_to_envelope_db: 0 });
      // a sparse layer (birds every forty seconds) wobbles by tens of dB between two quiet windows on its own tap; a
      // floor that high would call every change to it "no real change", so per-layer floors stop at four defaults
      if (d) (this.slotNoise[slot] ??= new NoiseFloor(4)).sample({ ...d.relative_bands_db, brightness: d.centroid_hz, loudness: d.envelope_db });
    }
    this.windows.set(m.id, { key, slots });
    if (this.windows.size > 6) this.windows.delete(this.windows.keys().next().value!);
  };

  private compare = (m: ComparisonBody) => {
    if (m.proposal == null) return;
    const shot = this.shots.get(m.proposal);
    if (!shot) return;
    // a move's companion slot reports too; the shot waits for the slot it named
    if (shot.slot && m.slot && m.slot !== shot.slot && m.status === "measured") return;
    this.shots.delete(m.proposal);
    // A syntax/evaluation failure never reached the speakers. Reporting it as an audible UNGRADED outcome made the
    // UI imply that the proposal landed and polluted both DJ scores and ambient learning.
    if (m.status === "unavailable" && m.confounds.some(reason => /evaluation failed/i.test(reason))) return;
    const clean = m.status === "measured" && attributable(m.confounds);
    // Resolve the actual linked observations; unrelated intervening windows must not become the baseline.
    const before = m.before ? this.windows.get(m.before) : undefined;
    const after = m.after ? this.windows.get(m.after) : undefined;
    const delta = clean && m.differences && shot.slot && PER_SLOT_METRICS.has(shot.expect.metric) && before && after
      ? slotOwnDifference(before.slots, after.slots, shot.slot, m.differences) : null;
    const noise = delta ? this.slotNoise[shot.slot] ?? this.noise : this.noise;
    const outcome: Outcome = clean ? grade(shot.expect, delta ?? m.differences ?? null, noise.floor(shot.expect.metric))
      : { grade: "ungraded", delta: null, unit: "", floor: 0, text: m.status === "measured" ? "another change overlapped this one" : m.confounds[0] ?? "no clean before/after window" };
    // the same reason in words an audience can follow, for the sidebar and the log
    const plain = outcome.grade !== "ungraded" ? undefined
      : /overlapped/.test(outcome.text) ? "another change landed at the same time"
      : /superseded/.test(outcome.text) ? "a newer change replaced it before the meter reported"
      : /no stable observation/.test(outcome.text) ? "the sound was still settling when it landed"
      : /mixer transition/.test(outcome.text) ? "a wash was riding the mix" : "the meter had no clean before and after";
    this.wire.send("outcome", "host", {
      stacked: !!shot.stacked, proposal: m.proposal, execution_id: m.execution_id, comparison: m.id,
      agent: shot.agent, slot: shot.slot, expected: shot.expect, grade: outcome.grade, delta: outcome.delta,
      unit: outcome.unit, noise_floor: outcome.floor, floor_calibrated: noise.ready(shot.expect.metric), reason: plain, measured: outcome.text,
      scope: { kind: delta ? "slot" : "master", per_voice: !!delta, estimate: delta ? "the layer's own tap, before and after: what this layer did, not what the mix did" : undefined },
      basis: "live master mix; observational, not causal", confounds: m.confounds,
    });
    this.emit("outcome", { proposal: m.proposal, shot, outcome, perSlot: !!delta });
  };

  close() {
    this.evidence.off("observation", this.observe);
    this.evidence.off("comparison", this.compare);
    this.shots.clear(); this.windows.clear(); this.removeAllListeners();
  }
}
