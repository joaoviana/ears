// Evidence bookkeeping is independent of the UI and of SuperCollider.
import { parseSlot } from './patch.ts';
import { audioMetrics, metricDelta, type Profile } from './report.ts';

type Emit = (type: string, from: string, body: Record<string, unknown>) => unknown;
export interface Context { request_id?: string; proposal?: number; based_on_revision?: string; evidence_ids?: string[]; expected_change?: string }
interface Observation { id: string; profile: Profile; revision: string; active_revision: number; stable: boolean }
interface Execution extends Context { execution_id: string; slot: string; code: string; author: string; revision: string; before?: Observation; active_at_ms?: number; active_revision?: number; done?: boolean }

export function sourceDiff(before: string, after: string) {
  const a = Object.fromEntries(parseSlot(before).map(p => [p.key, p.value]));
  const b = Object.fromEntries(parseSlot(after).map(p => [p.key, p.value]));
  return { before, after, parameters: [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]).map(key => ({ key, before: a[key] ?? null, after: b[key] ?? null })), semantics: 'source expressions only; patterns have not been expanded' };
}

export class Evidence {
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
  constructor(readonly session: string, private emit: Emit) {}

  sync(slots: Record<string, string>, context: Record<string, unknown> = {}) {
    const normalized = Object.fromEntries(Object.entries(slots).sort().map(([k, v]) => [k, v.trim()]));
    this.submitted ??= { ...normalized };
    if (JSON.stringify(normalized) !== JSON.stringify(this.slots) || JSON.stringify(context) !== JSON.stringify(this.context) || !this.revision) {
      this.slots = normalized; this.context = { ...context }; this.revision = `${this.session}:s${++this.stateN}`; this.state();
    }
    return this.revision;
  }
  private state() { this.emit('state', 'host', { ...this.context, revision: this.revision, slots: { ...this.slots }, active_slots: { ...this.activeSlots }, active_revision: this.activeRevision }); }
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
    const before = this.latest?.stable && this.latest.revision === this.revision && this.latest.active_revision === this.activeRevision ? this.latest : undefined;
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
    if (this.observations.size > 200) this.observations.delete(this.observations.values().next().value!);
    this.emit('observation', 'ears', { id, kind: 'listening-report', state_revision: this.revision, state_revisions: capture?.state_revisions ?? [], active_revisions: capture?.active_revisions ?? [], summary, text, same_summary: sameSummary, metrics: audioMetrics(profile), scope: { kind: 'master', tap: 'post-master/pre-volume', channels: 'stereo downmix to mono', per_voice: false }, window: capture ? { start_ms: capture.start_ms, end_ms: capture.end_ms, time_basis: 'host_receive_time' } : null, quality: { stable_state: stable, frames: capture?.frames ?? 0, dropped_frames: capture?.dropped_frames ?? 0, timing_uncertainty_ms: null }, analyzer: { id: 'sc-envelope-v1', envelope_attack_seconds: 0.01, envelope_release_seconds: 0.25, fft_size: 2048, report_hz: 15, onset_threshold: 0.18 } });
    for (const x of this.executions.values()) {
      if (x.done || x.active_at_ms == null || !capture) continue;
      if (!stable || capture.start_ms < x.active_at_ms) continue;
      if (!x.before) { this.unavailable(x, 'no stable observation immediately before this edit', id); continue; }
      const confounds = ['live master mix, not an isolated voice', 'different musical time; stochastic patterns and effect tails may differ', 'no controlled A/B render or causal attribution', 'mixer transitions and shared effects are not controlled'];
      if (x.active_revision !== this.activeRevision || x.revision !== this.revision) confounds.push('other state or activation changes occurred');
      this.emit('comparison', 'ears', { id: `${this.session}:c${++this.comparisonN}`, ...this.ids(x), before: x.before.id, after: id, mode: 'live_observation', attribution: 'unverified', status: 'measured', differences: metricDelta(x.before.profile, profile), confounds });
      x.done = true;
    }
    return id;
  }
  close() { for (const x of this.executions.values()) if (!x.done) this.unavailable(x, 'session ended before a complete comparison'); }
  private ids(x: Execution) { return { execution_id: x.execution_id, slot: x.slot, proposal: x.proposal, request_id: x.request_id, revision: x.revision, author: x.author, based_on_revision: x.based_on_revision, evidence_ids: x.evidence_ids }; }
  private receipt(type: string, x: Execution, body: Record<string, unknown>) { this.emit(type, 'host', { ...this.ids(x), ...body }); }
  private unavailable(x: Execution, reason: string, after?: string) { x.done = true; this.emit('comparison', 'ears', { id: `${this.session}:c${++this.comparisonN}`, ...this.ids(x), before: x.before?.id, after, mode: 'live_observation', attribution: 'unverified', status: 'unavailable', confounds: [reason] }); }
}
