import test from 'node:test';
import assert from 'node:assert/strict';
import { Evidence, sourceDiff } from '../evidence.ts';
import { Listener, type Profile } from '../report.ts';
const oldCode = '~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.4)';
const newCode = oldCode.replace('0.4', '0.2');
function setup() {
  const messages: any[] = []; const e = new Evidence('test', (type, from, body) => messages.push({ type, from, ...body }));
  e.sync({ d1: oldCode }, { tempo: 130 }); return { e, messages };
}
function profile(e: Evidence, start: number, level = -10): Profile {
  return { rms: level, crest: 5, centroid: 1200, onsetsPerBeat: 1, bands: [-12, -14, -20, -23, -30], capture: { start_ms: start, end_ms: start + 100, frames: 15, dropped_frames: 0, state_revisions: [e.revision], active_revisions: [e.activeRevision] } };
}

test('revision guards reject stale code and unknown evidence', () => {
  const { e } = setup(); const based_on_revision = e.revision;
  assert.equal(e.check({ based_on_revision }), null);
  assert.match(e.check({})!, /required/);
  assert.match(e.check({ based_on_revision, evidence_ids: ['invented'] })!, /unknown/);
  e.sync({ d1: newCode }, { tempo: 130 });
  assert.match(e.check({ based_on_revision })!, /stale/);
});
test('evaluation and scheduling never imply activation; failures preserve last reported active source', () => {
  const { e, messages } = setup();
  const initial = e.begin('d1', oldCode, 'human'); e.evaluated(initial, true); e.active(initial, 0);
  const id = e.begin('d1', newCode, 'agent', { proposal: 3, request_id: 'r3' });
  e.evaluated(id, true, '', 100);
  assert.equal(e.activeSlots.d1, oldCode);
  assert.equal(messages.filter(x => x.type === 'active').length, 1);
  e.evaluated(id, false, 'parse failed');
  assert.equal(e.active(id, 100), false);
  assert.equal(e.activeSlots.d1, oldCode);
  assert.equal(messages.findLast(x => x.type === 'comparison').status, 'unavailable');
});
test('superseded receipt cannot activate outdated code', () => {
  const { e, messages } = setup();
  const a = e.begin('d1', oldCode, 'human'); const b = e.begin('d1', newCode, 'human');
  assert.equal(e.active(a, 10), false); assert.equal(e.active(b, 20), true);
  assert.equal(e.activeSlots.d1, newCode);
  assert.equal(messages.find(x => x.type === 'superseded').execution_id, a);
});
test('only a whole stable post-activation window forms a linked comparison', () => {
  const { e, messages } = setup();
  const initial = e.begin('d1', oldCode, 'human'); e.active(initial, 0);
  e.observe(profile(e, 1), 'balanced', 'baseline', false);
  const before = e.latest!.id;
  const id = e.begin('d1', newCode, 'agent', { proposal: 8, request_id: 'request-8', based_on_revision: e.revision });
  e.evaluated(id, true, '', 200); e.active(id, 200);
  e.observe(profile(e, 180, -13), 'balanced', 'mixed boundary', true);
  assert.equal(messages.filter(x => x.type === 'comparison' && x.execution_id === id).length, 0);
  const after = e.observe(profile(e, 300, -13), 'balanced', 'after', true);
  const c = messages.find(x => x.type === 'comparison' && x.execution_id === id);
  assert.equal(c.before, before); assert.equal(c.after, after); assert.equal(c.request_id, 'request-8');
  assert.equal(c.differences.envelope_db, -3); assert.equal(c.attribution, 'unverified');
  assert.equal(messages.findLast(x => x.type === 'observation').same_summary, true);
  assert.equal(messages.findLast(x => x.type === 'observation').metrics.envelope_dbfs, -13);
});
test('source diff survives a disk refresh before dispatch', () => {
  const { e, messages } = setup(); e.sync({ d1: newCode }, { tempo: 130 }); e.begin('d1', newCode, 'human');
  assert.equal(messages.find(x => x.type === 'applied').source_diff.before, oldCode);
  assert.deepEqual(sourceDiff(oldCode, newCode).parameters, [{ key: 'amp', before: '0.4', after: '0.2' }]);
});
test('Listener marks mixed revisions and dropped invalid frames, without changing reference calibration', () => {
  const l = new Listener(); l.bar();
  for (let i = 0; i < 15; i++) l.push({ rms: 0.1, peak: 0.2, centroid: 1000, flatness: 0, bands: [0.1, 0.1, 0.1, 0.1, 0.1] }, { at: i, revision: i < 5 ? 'a' : 'b', active_revision: i < 5 ? 1 : 2 });
  l.push({ rms: NaN, peak: 0.2, centroid: 1000, flatness: 0, bands: [] });
  const p = l.take()!;
  assert.ok(Math.abs(p.rms + 20) < 1e-8); assert.deepEqual(p.capture!.state_revisions, ['a', 'b']); assert.equal(p.capture!.dropped_frames, 1);
});

test('the parts of one move are one change: a two-slot take is still attributable, an unrelated edit is not', () => {
  const sent: { type: string; body: Record<string, unknown> }[] = [];
  const e = new Evidence('s', (type, _from, body) => sent.push({ type, body }));
  e.sync({ d1: 'a', d2: 'b', d3: 'c' });
  e.observe(profile(e, 1), 'balanced', 'baseline', false);
  const x1 = e.begin('d1', 'a2', 'resident', { proposal: 7 }), x2 = e.begin('d2', 'b2', 'resident', { proposal: 7 });
  e.active(x1, 100); e.active(x2, 101);
  e.observe(profile(e, 300, -13), 'balanced', 'after', true);
  const compared = sent.filter((m) => m.type === 'comparison');
  assert.equal(compared.length, 2);
  for (const c of compared) assert.ok(!(c.body.confounds as string[]).some((r) => /other state or activation/.test(r)), (c.body.confounds as string[]).join('; '));
  // a third edit from somebody else lands before the meter reports: that IS another change
  const y = e.begin('d3', 'c2', 'resident', { proposal: 8 }); e.active(y, 400);
  const z = e.begin('d1', 'a3', 'resident', { proposal: 9 }); e.active(z, 401);
  e.observe(profile(e, 600, -14), 'balanced', 'later', true);
  const last = sent.filter((m) => m.type === 'comparison').slice(-2);
  assert.ok(last.every((c) => (c.body.confounds as string[]).some((r) => /other state or activation/.test(r))));
});

test('with a settle time the after-window has to start that long after activation', () => {
  const sent: { type: string; body: Record<string, unknown> }[] = [];
  const e = new Evidence('s', (type, _from, body) => sent.push({ type, body }));
  e.settleMs = 15000;
  e.sync({ d1: 'a' });
  e.observe(profile(e, 1), 'balanced', 'baseline', false);
  const x = e.begin('d1', 'a2', 'resident', { proposal: 3 }); e.active(x, 1000);
  e.observe(profile(e, 5000, -12), 'balanced', 'too soon', true);
  assert.equal(sent.filter((m) => m.type === 'comparison').length, 0, 'a window five seconds after activation is not the after-window');
  e.observe(profile(e, 17000, -12), 'balanced', 'settled', true);
  assert.equal(sent.filter((m) => m.type === 'comparison').length, 1);
});

test('a slot retaken before its check gets an early check from the last clean report', () => {
  const sent: { type: string; body: Record<string, unknown> }[] = [];
  const e = new Evidence('s', (type, _from, body) => sent.push({ type, body }));
  e.settleMs = 15000;   // the normal check would wait for a report that starts 15 s after the change
  e.sync({ d1: 'a' });
  e.observe(profile(e, 1), 'balanced', 'baseline', false);
  const x = e.begin('d1', 'a2', 'resident', { proposal: 3 }); e.active(x, 1000);
  e.begin('d1', 'a3', 'resident', { proposal: 4 });   // retaken with no report after the change at all
  assert.equal(sent.filter((m) => m.type === 'comparison').at(-1)!.body.status, 'unavailable');
  const sent2: { type: string; body: Record<string, unknown> }[] = [];
  const e2 = new Evidence('s2', (type, _from, body) => sent2.push({ type, body }));
  e2.settleMs = 15000; e2.sync({ d1: 'a' }); e2.observe(profile(e2, 1), 'balanced', 'baseline', false);
  const y = e2.begin('d1', 'a2', 'resident', { proposal: 3 }); e2.active(y, 1000);
  e2.observe(profile(e2, 6000, -13), 'balanced', 'after', true);   // a clean report after the change, though sooner than the wait
  assert.deepEqual(e2.pending(), ['d1']);
  e2.begin('d1', 'a3', 'resident', { proposal: 4 });
  const c2 = sent2.filter((m) => m.type === 'comparison').at(-1)!;
  assert.equal(c2.body.status, 'measured');
  assert.ok((c2.body.confounds as string[]).some((r) => /checked early/.test(r)));
  assert.equal(c2.body.proposal, 3);
  assert.deepEqual(e2.pending(), []);
});
