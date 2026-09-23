import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { EarsClient } from 'ears-protocol/client';
import { EARS_MUSIC } from 'ears-protocol/profile';
import { Bus } from '../bus.ts';
import { METRICS } from '../shots.ts';
import { METRIC_TABLE } from '../vocabulary.ts';

test('the protocol\'s own client reads this host\'s room and its proposal reaches the host', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ears-protocol-test-'));
  const bus = new Bus(); bus.open(0, dir);
  const [address] = await once(bus, 'listening');
  bus.send('hello', 'host', { host: 'ears-tui', protocol: 0, profile: 'ears/music' });
  bus.send('state', 'host', { revision: 's1', slots: { d1: '~d.(\\d1, \\instrument, \\kick)' } });
  const client = await new EarsClient('conformance', address.port).connect();
  try {
    assert.equal(client.hello?.host, 'ears-tui');
    assert.equal(client.state?.revision, 's1');
    const inbound = once(bus, 'inbound');
    const request_id = client.propose({ slot: 'd1', set: [{ key: 'amp', value: '0.5' }], why: 'test', evidence: 'test', expect: { metric: 'loudness', dir: 'down' } });
    const [m] = await inbound;
    assert.equal(m.type, 'proposal'); assert.equal(m.request_id, request_id); assert.equal(m.based_on_revision, 's1');
  } finally {
    client.close(); await bus.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every metric the host grades is defined, with the same scope, by the protocol profile', () => {
  const profile = new Map(EARS_MUSIC.observation.metrics.map(m => [m.id, m]));
  for (const id of METRICS) assert.ok(profile.has(id), `${id} missing from ears/music`);
  assert.match(METRIC_TABLE, /moved by: kick amp/);
  assert.match(METRIC_TABLE, /groove .*\n.*whole mix only/);
});
