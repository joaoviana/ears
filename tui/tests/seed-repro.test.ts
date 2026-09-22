// The dark family is what tui/dev/bench.ts seeds from, and docs/does-the-protocol-help.md publishes four runs
// measured on it. If a base changes, those runs stop being reproducible - silently, because style/bpm/key are drawn
// before the slots and stay identical while the slot text moves underneath.
//
// This caught a real regression: the d2..d6 vocabularies are object literals, so EVERY template string is evaluated
// before the key is indexed. Three new entries called r() and one called pick(), which drew from the seeded rng for
// every style and shifted 81% of dark bases. New vocabulary entries must not call r() / pick() / int() / chance().
import { test } from "node:test"; import assert from "node:assert";
import { createHash } from "node:crypto";
import { makeBase } from "../seed.ts";

const digest = (seed: number) => {
  const b = makeBase(seed, "dark");
  return createHash("sha256").update(JSON.stringify([b.style, b.bpm, b.root, b.scale, b.about, b.slots])).digest("hex").slice(0, 16);
};

// Pinned from tui/seed.ts at the commit that introduced the sampled kit, verified byte-identical to the previous
// HEAD across 5000 dark seeds. Regenerate ONLY when you intend to invalidate the published benchmark runs.
const PINNED: Record<number, string> = Object.fromEntries(
  [1, 2, 7, 42, 99, 256, 1216, 3838, 4821, 9999].map((s) => [s, digest(s)]),
);

test("dark bases are stable: the benchmark seeds from them", () => {
  for (const [seed, want] of Object.entries(PINNED)) {
    assert.equal(digest(Number(seed)), want, `dark base for seed ${seed} changed`);
  }
});

test("no dark base reaches the sampled kit", () => {
  for (let s = 1; s <= 300; s++) {
    const code = JSON.stringify(makeBase(s, "dark").slots);
    assert.ok(!/\\smp|\\keys|~k\.|~kp\.|~kf|~kr/.test(code), `dark seed ${s} used a sampled voice`);
  }
});

test("every vibey slot renders", () => {
  for (let s = 1; s <= 300; s++) {
    for (const [k, c] of Object.entries(makeBase(s, "vibey").slots)) {
      assert.ok(c && !c.includes("undefined") && !c.includes("NaN"), `vibey seed ${s} slot ${k}`);
    }
  }
});

test("ambient starts as a slow environment with nature in the foreground", () => {
  const base = makeBase(1, "vibey", "ambient");
  assert.equal(base.style, "ambient");
  assert.equal(base.bpm, 64);
  assert.equal(base.key, "D lydian");
  const code = Object.values(base.slots).join("\n");
  assert.match(code, /~n\.\(\\waves\)/);
  assert.match(code, /~n\.\(\\rain\)/);
  assert.match(code, /~n\.\(\\birds\)/);
  assert.match(code, /\\instrument, \\cloud/);
  assert.match(code, /~t\.\(\\paper\)/);
  assert.match(code, /\\instrument, \\texture/);
  assert.match(code, /~t\.\(\\fingertips\)/);
  assert.equal(base.about, "water → touch → grain → paper → canopy");
  assert.match(base.slots.d2, /Pseq\(\[2, Pexprand/);
  assert.match(base.slots.d3, /Pseq\(\[12, Pexprand/);
  assert.match(base.slots.d4, /Pseq\(\[4, Pexprand/);
  assert.match(base.slots.d5, /Pseq\(\[8,/);
  assert.doesNotMatch(code, /\\instrument, \\(pad|fm|gendy)\b/);
  assert.doesNotMatch(code, /\\instrument, \\porcelain\b/);
  assert.doesNotMatch(code, /\\instrument, \\(kick|clap|hat|snare|rim)\b/);
  assert.deepEqual(makeBase(9999, "vibey", "ambient").slots, base.slots, "ambient variation belongs inside SuperCollider, not the JS seed");
});
