// Evidence bookkeeping is independent of the UI and of SuperCollider.
import { EventEmitter } from 'node:events';
import type { Differences } from './shots.ts';
import { parseSlot } from './patch.ts';
import { audioMetrics, metricDelta, type Profile } from './report.ts';

type Emit = (type: string, from: string, body: Record<string, unknown>) => unknown;
export interface Context { request_id?: string; proposal?: number; based_on_revision?: string; evidence_ids?: string[]; expected_change?: string }
export type ObservationBody = {
  id: string; state_revision: string; active_revisions: number[];
  metrics: ReturnType<typeof audioMetrics>; quality: { stable_state: boolean };
  window: { start_ms: number; end_ms: number } | null;
};
export type ComparisonBody = {
  id: string; execution_id: string; proposal?: number; before?: string; after?: string;
  status: 'measured' | 'unavailable'; differences?: Differences; confounds: string[];
} & Record<string, unknown>;

interface Observation { id: string; profile: Profile; revision: string; active_revision: number; stable: boolean }
interface Execution extends Context { execution_id: string; slot: string; code: string; author: string; revision: string; before?: Observation; active_at_ms?: number; active_revision?: number; done?: boolean }

export function sourceDiff(before: string, after: string) {
  const a = Object.fromEntries(parseSlot(before).map(p => [p.key, p.value]));
  const b = Object.fromEntries(parseSlot(after).map(p => [p.key, p.value]));
  return { before, after, parameters: [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]).map(key => ({ key, before: a[key] ?? null, after: b[key] ?? null })), semantics: 'source expressions only; patterns have not been expanded' };
}

export class Evidence extends EventEmitter<{ observation: [body: ObservationBody]; comparison: [body: ComparisonBody] }> {
  revision = '';
  activeRevision = 0;
  slots: Record<string, string> = {};
  activeSlots: Record<string, string> = {};
  latest?: Observation;
  private context: Record<string, unknown> = {};
  private submitted: Record<string, string> | null = null;
  private stateN = 0;
  private executionN = 0;
  private observationN = 0;
  private comparisonN = 0;
  private executions = new Map<string, Execution>();
  private newest = new Map<string, string>();
  private observations = new Set<string>();
  constructor(readonly session: string, private publish: Emit) { super(); }

  sync(slots: Record<string, string>, context: Record<string, unknown> = {}) {
    const normalized = Object.fromEntries(Object.entries(slots).sort().map(([k, v]) => [k, v.trim()]));
    this.submitted ??= { ...normalized };
    if (JSON.stringify(normalized) !== JSON.stringify(this.slots) || JSON.stringify(context) !== JSON.stringify(this.context) || !this.revision) {
      this.slots = normalized; this.context = { ...context }; this.revision = `${this.session}:s${++this.stateN}`; this.state();
    }
    return this.revision;
  }
  private state() { this.publish('state', 'host', { ...this.context, revision: this.revision, slots: { ...this.slots }, active_slots: { ...this.activeSlots }, active_revision: this.activeRevision }); }
  check(context: Context): string | null {
    if (!context.based_on_revision) return 'based_on_revision is required; read_room before proposing';
    if (context.based_on_revision !== this.revision) return 'stale revision; read_room and reconsider the change';
    if (context.evidence_ids?.some(id => !this.observations.has(id))) return 'unknown or expired observation ID';
    return null;
  }
  current(id: string) { const x = this.executions.get(id); return !!x && !x.done && this.newest.get(x.slot) === id; }
  begin(slot: string, code: string, author: string, context: Context = {}) {
    const old = this.executions.get(this.newest.get(slot) ?? '');
    if (old && !old.done) { this.receipt('superseded', old, { reason: 'A newer edit replaced this slot' }); this.unavailable(old, 'superseded before a complete comparison'); }
    const beforeCode = this.submitted?.[slot] ?? '';
    this.submitted![slot] = code;
    // 27 of 33 comparisons died here. It demanded that the IMMEDIATELY preceding observation be stable and match
    // both the source revision and the active one; at one edit every 4.3s against a 4.0s window the room is never
    // that still, so 39 edits produced 6 measurements. Two changes: activation drift is the engine catching up with
    // an edit already made, which `stable` covers for the window itself, so it no longer disqualifies a baseline;
    // and if the newest observation is unusable we look back a little for one that is, rather than giving up.
    // Requiring the baseline's revision to equal the current one can never hold: writeSlot fires the file watcher,
    // which calls refreshState -> sync, so the revision has ALREADY advanced past every observation by the time
    // begin() runs. That single line was 27 of 33 failed comparisons, and it is redundant anyway -- `stable` already
    // guarantees the window held one revision throughout. Take the newest stable window and say so if state moved.
    const before = [...this.recent].reverse().find((o) => o.stable);
    this.sync({ ...this.slots, [slot]: code }, this.context);
    const execution_id = `${this.session}:e${++this.executionN}`;
    const x: Execution = { ...context, execution_id, slot, code, author, revision: this.revision, before };
    this.executions.set(execution_id, x); this.newest.set(slot, execution_id);
    this.receipt('applied', x, { source_diff: sourceDiff(beforeCode, code), expected_change: context.expected_change });
    // Completed executions need not stay resident: the append-only log retains them.
    if (this.executions.size > 200) for (const [id, e] of this.executions) { if (e.done) this.executions.delete(id); if (this.executions.size <= 200) break; }
    return execution_id;
  }
  evaluated(id: string, ok: boolean, reason?: string, scheduledAt?: number) {
    const x = this.executions.get(id); if (!x || !this.current(id)) return;
    if (!ok) { this.receipt('error', x, { reason, active_state_verified: false }); this.unavailable(x, 'evaluation failed; inspect engine state'); return; }
    this.receipt('evaluated', x, { ok: true, audible_verified: false });
    if (scheduledAt != null) this.receipt('scheduled', x, { scheduled_at_ms: scheduledAt, timing_basis: 'engine clock estimate', timing_uncertainty_ms: null, audible_verified: false });
  }
  active(id: string, at: number, basis = 'pattern_event') {
    const x = this.executions.get(id); if (!x || !this.current(id) || x.active_at_ms != null) return false;
    x.active_at_ms = at; x.active_revision = ++this.activeRevision;
    this.activeSlots[x.slot] = x.code; this.state();
    this.receipt('active', x, { active_at_ms: at, activation_basis: basis, timing_uncertainty_ms: null, audible_verified: false });
    return true;
  }
  observe(profile: Profile, summary: string, text: string, sameSummary: boolean) {
    const capture = profile.capture;
    const stable = !!capture && capture.state_revisions.length === 1 && capture.state_revisions[0] === this.revision && capture.active_revisions.length === 1 && capture.active_revisions[0] === this.activeRevision && capture.dropped_frames === 0;
    const id = `${this.session}:o${++this.observationN}`;
    const observation: Observation = { id, profile, revision: this.revision, active_revision: this.activeRevision, stable };
    this.latest = observation; this.observations.add(id);
    this.recent.push(observation); if (this.recent.length > 6) this.recent.shift();   // a short memory, so a baseline survives one busy window
    if (this.observations.size > 200) this.observations.delete(this.observations.values().next().value!);
    const body = { id, kind: 'listening-report', state_revision: this.revision, state_revisions: capture?.state_revisions ?? [], active_revisions: capture?.active_revisions ?? [], summary, text, same_summary: sameSummary, metrics: audioMetrics(profile), scope: { kind: 'master', tap: 'post-master/pre-volume', channels: 'stereo downmix to mono', per_voice: false }, window: capture ? { start_ms: capture.start_ms, end_ms: capture.end_ms, time_basis: 'host_receive_time' } : null, quality: { stable_state: stable, frames: capture?.frames ?? 0, dropped_frames: capture?.dropped_frames ?? 0, timing_uncertainty_ms: null }, analyzer: { id: 'sc-envelope-v1', envelope_attack_seconds: 0.01, envelope_release_seconds: 0.25, fft_size: 2048, report_hz: 15, onset_threshold: 0.18 } };
    this.publish('observation', 'ears', body);
    this.emit('observation', body);
    for (const x of this.executions.values()) {
      if (x.done || x.active_at_ms == null || !capture) continue;
      if (!stable || capture.start_ms < x.active_at_ms) continue;
      if (!x.before) { this.unavailable(x, 'no stable observation immediately before this edit', id); continue; }
      // the first four are standing properties of live observation. Only an EVENT makes a comparison unattributable,
      // so those must not read like one: a grader that treats a disclaimer as a confound grades nothing, ever.
      const confounds = ['live master mix, not an isolated voice', 'different musical time; stochastic patterns and effect tails may differ', 'no controlled A/B render or causal attribution', 'shared effects and master processing are not isolated'];
      if (x.active_revision !== this.activeRevision || x.revision !== this.revision) confounds.push('other state or activation changes occurred');
      if (this.rodeDuring(x.active_at_ms, capture.end_ms)) confounds.push('a mixer transition was riding during this window');
      if (x.before && x.before.revision !== x.revision) confounds.push('the source moved between the baseline window and this edit');
      this.comparison({ id: `${this.session}:c${++this.comparisonN}`, ...this.ids(x), before: x.before.id, after: id, mode: 'live_observation', attribution: 'unverified', status: 'measured', differences: metricDelta(x.before.profile, profile), confounds });
      x.done = true;
    }
    return id;
  }
  /** The host says when a build or wash is riding the mixer: everything is being filtered, so nothing is attributable. */
  riding(from: number, to: number) { this.rides.push({ from, to }); if (this.rides.length > 24) this.rides.shift(); }
  private recent: Observation[] = [];
  private rides: { from: number; to: number }[] = [];
  private rodeDuring(from: number, to: number) { return this.rides.some((r) => r.from <= to && r.to >= from); }
  close() { for (const x of this.executions.values()) if (!x.done) this.unavailable(x, 'session ended before a complete comparison'); }
  private ids(x: Execution) { return { execution_id: x.execution_id, slot: x.slot, proposal: x.proposal, request_id: x.request_id, revision: x.revision, author: x.author, based_on_revision: x.based_on_revision, evidence_ids: x.evidence_ids }; }
  private receipt(type: string, x: Execution, body: Record<string, unknown>) { this.publish(type, 'host', { ...this.ids(x), ...body }); }
  private comparison(body: ComparisonBody) { this.publish('comparison', 'ears', body); this.emit('comparison', body); }
  private unavailable(x: Execution, reason: string, after?: string) { x.done = true; this.comparison({ id: `${this.session}:c${++this.comparisonN}`, ...this.ids(x), before: x.before?.id, after, mode: 'live_observation', attribution: 'unverified', status: 'unavailable', confounds: [reason] }); }
}
