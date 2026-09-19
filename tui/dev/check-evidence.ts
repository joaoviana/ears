// Isolated, muted integration check. Does not read/write the performer's set or DJ roster.
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { Engine } from '../engine.ts';
import { Bus } from '../bus.ts';
import { Evidence } from '../evidence.ts';
import { Listener } from '../report.ts';
async function udpPort() { const s = dgram.createSocket('udp4'); s.bind(0, '127.0.0.1'); await once(s, 'listening'); const port = s.address().port; await new Promise<void>(r => s.close(r)); return port; }
process.env.EARS_PORT = String(await udpPort()); process.env.EARS_SC_PORT = String(await udpPort());
const dir = process.env.EARS_TEST_LOG_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ears-engine-evidence-'));
const bus = new Bus().open(0, dir), engine = new Engine(), listener = new Listener();
const evidence = new Evidence(bus.session, (type, from, body) => bus.send(type, from, body));
const timers = new Set<ReturnType<typeof setTimeout>>();
const messages: any[] = [];
bus.on('msg', m => messages.push(m));
bus.send('hello', 'host', { host: 'muted-engine-integration-test', protocol: 0, test: true, log: bus.path });
evidence.sync({ d1: '' }, { tempo: 130 });
engine.on('log', reason => { bus.send('engine_log', 'engine', { reason }); process.stderr.write(reason + '\n'); });
engine.on('ears', f => listener.push(f, { revision: evidence.revision, active_revision: evidence.activeRevision }));
engine.on('onset', () => listener.onset());
engine.on('bar', ({ n }) => { bus.bar = n; listener.bar(); if (n % 2 === 0) { const p = listener.take(); if (p) evidence.observe(p, 'integration measurement', 'Muted engine; measurement is before volume.', false); } });
engine.on('evald', ({ execution_id, ok, msg, scheduled_at_ms }) => evidence.evaluated(execution_id, ok, msg, scheduled_at_ms));
engine.on('active', ({ execution_id, at, basis }) => { const timer = setTimeout(() => { timers.delete(timer); evidence.active(execution_id, at, basis); }, Math.max(0, at - Date.now())); timers.add(timer); });
function waitFor(predicate: (m: any) => boolean, ms = 20000) {
  const found = messages.findLast(predicate); if (found) return Promise.resolve(found);
  return new Promise<any>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); bus.off('msg', onMessage); };
    const onMessage = (m: any) => { if (predicate(m)) { cleanup(); resolve(m); } };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for engine evidence')); }, ms);
    bus.on('msg', onMessage);
  });
}
try {
  const ready = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Engine boot timeout')), 30000); engine.once('ready', () => { clearTimeout(timer); resolve(); }); });
  engine.start(true); await ready;
  const code = '~d.(\\d1, \\instrument, \\kick, \\dur, 1, \\amp, 0.4)';
  const initial = evidence.begin('d1', code, 'test'); engine.eval(code, 'd1', initial);
  await waitFor(m => m.type === 'active' && m.execution_id === initial);
  await waitFor(m => m.type === 'observation' && m.quality.stable_state && m.active_revisions[0] === evidence.activeRevision);
  const context = { request_id: 'test-quieter-kick', proposal: 1, based_on_revision: evidence.revision, evidence_ids: [evidence.latest!.id], expected_change: 'Lower envelope level for an isolated kick' };
  bus.send('proposal', 'test', { ...context, id: 1, slot: 'd1', set: [{ key: 'amp', value: '0.2' }], why: 'Test lower gain', evidence: 'Controlled test intention' });
  bus.send('verdict', 'human', { proposal: 1, request_id: context.request_id, decision: 'take', by: 'human' });
  const id = evidence.begin('d1', code.replace('0.4', '0.2'), 'test', context); engine.eval(evidence.slots.d1, 'd1', id);
  const comparison = await waitFor(m => m.type === 'comparison' && m.execution_id === id);
  assert.equal(comparison.status, 'measured'); assert.equal(comparison.before, context.evidence_ids[0]);
  assert.ok(Number.isFinite(comparison.differences.envelope_db));
  const receipts = messages.filter(m => m.execution_id === id).map(m => m.type);
  assert.deepEqual(receipts.slice(0, 4), ['applied', 'evaluated', 'scheduled', 'active']);
  const stages = messages.filter(m => m.execution_id === id);
  assert.ok(stages.find(m => m.type === 'scheduled').scheduled_at_ms >= stages[0].t - 50, 'schedule must not predate submission');
  assert.ok(stages.find(m => m.type === 'active').active_at_ms >= stages[0].t - 50, 'activation must not predate submission');
  const bad = evidence.begin('d1', 'this is not valid SC (', 'test'); engine.eval(evidence.slots.d1, 'd1', bad);
  await waitFor(m => m.type === 'error' && m.execution_id === bad);
  assert.equal(evidence.activeSlots.d1, code.replace('0.4', '0.2'));
  const hush = evidence.begin('d1', '', 'test'); engine.eval('~hush.(\\d1)', 'd1', hush);
  const stopped = await waitFor(m => m.type === 'active' && m.execution_id === hush); assert.equal(stopped.activation_basis, 'pattern_stopped');
  process.stdout.write(JSON.stringify({ ok: true, log: bus.path, receipts, differences: comparison.differences }) + '\n');
} finally { for (const timer of timers) clearTimeout(timer); evidence.close(); engine.stop(); await bus.close(); }
