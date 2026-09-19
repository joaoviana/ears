import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineClock } from '../engine.ts';
test('a planned future event does not move the engine clock calibration', () => {
  const clock = new EngineClock();
  assert.equal(clock.map(100, 0.2, 100, 1000000), 1000200);
  assert.equal(clock.map(104, 0.2, 100, 1000000), 1004200);
  assert.equal(clock.map(101, 0.2, 101, 1001000), 1001200);
});
