import test from "node:test";
import assert from "node:assert/strict";
import { reveals, ribbon, tally, caption, STAGES } from "../guide.ts";
import type { Msg } from "../bus.ts";

const at = (t: number, type: string, body: Record<string, unknown> = {}): Msg => ({ v: 0, t, bar: 0, type, from: "host", ...body });

test("the show layout reveals each part only when the protocol has produced it", () => {
  const wire: Msg[] = [at(1, "hello"), at(2, "state"), at(3, "proposal", { id: 1, slot: "d4", from: "resident" })];
  assert.deepEqual([...reveals(wire)], []);
  wire.push(at(4, "observation"));
  assert.ok(reveals(wire).has("room"));
  wire.push(at(5, "verdict", { proposal: 1, decision: "take", by: "human" }));
  assert.ok(reveals(wire).has("wire"));
  assert.ok(!reveals(wire).has("graded"));
  wire.push(at(9, "outcome", { agent: "resident", grade: "hit", expected: { metric: "low", dir: "up" } }));
  wire.push(at(10, "unlock", { agent: "resident", skill: "fracture" }));
  wire.push(at(11, "grant", { agent: "resident", level: "auto" }));
  wire.push(at(12, "enter", { agent: "guest", remote: true }));
  assert.deepEqual([...reveals(wire)].sort(), ["graded", "guests", "powers", "room", "takeover", "wire"]);
});

test("the ribbon lights the loop stage by stage for the idea in flight, and a skip stops it", () => {
  const wire: Msg[] = [at(1, "state"), at(2, "observation"), at(3, "proposal", { id: 7, slot: "d6" })];
  let r = ribbon(wire, 5000);
  assert.equal(r.current, "propose");
  assert.equal(r.proposal?.id, 7);
  wire.push(at(4, "verdict", { proposal: 7, decision: "take" }), at(5, "applied", { slot: "d6", proposal: 7 }), at(6, "evaluated", { proposal: 7 }), at(7, "active", { proposal: 7 }));
  r = ribbon(wire, 5000);
  assert.equal(r.current, "active");
  assert.ok(["state", "observe", "propose", "verdict", "applied", "evaluated", "active"].every((s) => r.lit.has(s as never)));
  assert.ok(!r.lit.has("measured"));
  // a comparison of some other execution (the base's own slot, no proposal) is not this idea's check
  wire.push(at(8, "comparison", { slot: "d1" }));
  assert.equal(ribbon(wire, 5000).current, "active");
  wire.push(at(8, "comparison", { proposal: 7 }), at(9, "outcome", { grade: "hit", proposal: 7 }));
  assert.equal(ribbon(wire, 5000).current, "graded");
  // a fresh stage is one whose message landed under a second ago
  assert.equal(ribbon(wire, 9 + 400).fresh, "graded");
  // a verdict younger than eight seconds keeps its idea on the ribbon even when the next round has landed
  wire.push(at(20000, "proposal", { id: 8, slot: "d2" }));
  assert.equal(ribbon(wire, 9 + 5000).current, "graded", "the judged idea holds the strip for eight seconds");
  assert.equal(ribbon(wire, 50000).current, "propose");
  wire.push(at(21000, "verdict", { proposal: 8, decision: "skip", by: "human" }));
  const skipped = ribbon(wire, 50000);
  assert.equal(skipped.current, "verdict");
  assert.ok(skipped.skipped);
  assert.ok(!skipped.lit.has("applied"));
  // a round of three: taking #10 retires #11 and #12 with skips a moment later; the idea in flight is #10, taken
  wire.push(at(30000, "proposal", { id: 10, slot: "d4" }), at(31000, "proposal", { id: 11, slot: "d2" }), at(32000, "proposal", { id: 12, slot: "d6" }));
  assert.equal(ribbon(wire, 50000).proposal?.id, 12);
  wire.push(at(40000, "verdict", { proposal: 10, decision: "take", by: "human" }), at(40010, "verdict", { proposal: 11, decision: "skip", by: "human" }), at(40011, "verdict", { proposal: 12, decision: "skip", by: "human" }), at(42000, "applied", { proposal: 10 }));
  const round = ribbon(wire, 50000);
  assert.equal(round.proposal?.id, 10);
  assert.equal(round.current, "applied");
  assert.ok(!round.skipped);
  assert.equal(STAGES[STAGES.length - 1], "graded");
});

test("the tally counts what the wire can back up", () => {
  const wire: Msg[] = [
    at(1, "proposal", { id: 1 }), at(2, "proposal", { id: 2 }), at(3, "rejected", { reason: "bad" }),
    at(4, "verdict", { decision: "take" }), at(8000, "verdict", { decision: "skip" }),
    at(6, "applied"), at(7, "evaluated"), at(8, "active"), at(9, "comparison"),
    at(10, "outcome", { grade: "hit" }), at(11, "outcome", { grade: "ungraded" }), at(12, "outcome", { grade: "miss" }),
    at(13, "enter", { agent: "g1", remote: true }), at(14, "enter", { agent: "g1", remote: true }), at(15, "enter", { agent: "local" }),
    // taking #1 retires the round's other ideas a moment later: those skips are the take, not two decisions
    at(20000, "verdict", { proposal: 1, decision: "take" }), at(20010, "verdict", { proposal: 2, decision: "skip" }), at(20011, "verdict", { proposal: 3, decision: "skip" }),
  ];
  assert.deepEqual(tally(wire), { proposals: 2, refused: 1, taken: 2, skipped: 1, hit: 1, graded: 2, guests: 1, receipts: 4 });
  assert.match(caption(wire, 20500)!.text, /you took it/);
});

test("the guide explains the newest message, points at its pane, and goes quiet after a while", () => {
  const wire: Msg[] = [at(1000, "proposal", { id: 1, expect: { metric: "low", dir: "up" } })];
  let c = caption(wire, 2000);
  assert.equal(c?.at, "offers");
  assert.ok(c!.text.includes("low") && c!.text.includes("up"), "the caption names the called shot");
  wire.push(at(3000, "verdict", { decision: "take", by: "human" }));
  c = caption(wire, 3500);
  assert.equal(c?.at, "wire");
  
  wire.push(at(4000, "outcome", { agent: "resident", grade: "miss", expected: { metric: "air", dir: "down" } }));
  assert.ok(["resident", "air", "down", "✗"].every((w) => caption(wire, 4500)!.text.includes(w)), "the result caption names who, what and whether it came true");
  wire.push(at(5000, "grant", { agent: "resident", level: "auto" }));
  assert.equal(caption(wire, 5500)!.at, "booth");
  wire.push(at(6000, "enter", { agent: "guest", remote: true }));
  assert.equal(caption(wire, 6500)!.at, "booth");
  // a listener walking in starts a round at once; the arrival holds the line against the ideas that follow it
  wire.push(at(8000, "enter", { agent: "canopy-listener", name: "Canopy Listener" }), at(8800, "proposal", { id: 9 }));
  assert.ok(caption(wire, 9000)!.text.includes("Canopy Listener"), "the arrival holds the line");
  wire.push(at(8000 + 13000, "proposal", { id: 10 }));
  assert.equal(caption(wire, 21500)!.at, "offers");
  // eighteen seconds later there is nothing new to point at
  assert.equal(caption(wire, 21000 + 40000), null);
  // a state snapshot is not an event worth a sentence
  wire.push(at(40000, "state"));
  assert.equal(caption(wire, 40100), null);
});
