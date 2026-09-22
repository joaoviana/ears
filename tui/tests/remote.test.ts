import test from "node:test";
import assert from "node:assert/strict";
import { Evidence } from "../evidence.ts";
import { RemoteProposals, type Inbound } from "../remote.ts";

function room() {
  const evidence = new Evidence("test", () => {});
  evidence.sync({ d2: '~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, 0.2)' });
  const remote = new RemoteProposals(evidence, ["d2"]);
  const message: Inbound = { v: 0, type: "proposal", from: "DJ Guest", request_id: "r1", based_on_revision: evidence.revision,
    slot: "d2", set: [{ key: "hp", value: "9000" }], why: "open hats", evidence: "closed air", expect: { metric: "air", dir: "up" } };
  return { remote, evidence, message };
}

test("wire proposals are checked, compiled and carry all move parts without applying them", () => {
  const { remote, evidence, message } = room(), before = { ...evidence.slots };
  const result = remote.receive(message);
  assert.equal(result.kind, "proposal");
  if (result.kind !== "proposal") return;
  assert.equal(result.agent, "dj-guest");
  assert.equal(result.suggestion.parts[0].code, result.suggestion.code);
  assert.match(result.suggestion.code, /9000/);
  assert.deepEqual(evidence.slots, before);
  assert.equal(remote.receive(message).kind, "rejected");
});

test("malformed structured predictions cannot bypass the host vocabulary", () => {
  for (const expect of [{}, [], { metric: "taste", dir: "up" }, { metric: "air", dir: "louder" }, { metric: "air", dir: ["up"] }]) {
    const { remote, message } = room();
    const result = remote.receive({ ...message, expect });
    assert.equal(result.kind, "rejected", JSON.stringify(expect));
  }
});

test("stale revisions, malformed edits and invalid notes are refused; legacy predictions still work", () => {
  for (const patch of [{ based_on_revision: "old" }, { set: [{ key: "amp", value: 2 }] }, { replace: "false" }, { remove: [2] }, { slot: "../outside" }]) {
    const { remote, message } = room();
    assert.equal(remote.receive({ ...message, ...patch }).kind, "rejected");
  }
  const { remote, message } = room();
  assert.equal(remote.receive({ ...message, expect: undefined, expected_change: "air up" }).kind, "proposal");
  assert.equal(remote.receive({ v: 0, type: "note", text: {} }).kind, "rejected");
});
