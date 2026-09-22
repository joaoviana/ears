import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { Session } from "../session.ts";

test("a real TCP guest is validated before admission; source stays untouched and shutdown flushes once", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ears-session-"));
  const code = '~d.(\\d2, \\instrument, \\hat, \\dur, 1/4, \\amp, 0.2)';
  fs.writeFileSync(path.join(dir, "d2.scd"), code);
  const session = new Session(dir, true);
  let socket: net.Socket | undefined;
  t.after(async () => { socket?.destroy(); await session.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const listening = once(session.bus, "listening");
  session.open({ tempo: 126 }, 0, path.join(dir, "logs"));
  const [address] = await listening;
  socket = net.connect(address.port, "127.0.0.1");
  await once(socket, "connect");
  socket.resume();
  const message = { v: 0, type: "proposal", from: "guest", request_id: "r1", based_on_revision: session.evidence.revision,
    slot: "d2", set: [{ key: "hp", value: "9000" }], why: "open hats", evidence: "closed air", expect: { metric: "unknown", dir: "up" } };
  const rejected = new Promise<void>(resolve => session.bus.on("msg", m => { if (m.type === "rejected") resolve(); }));
  socket.write(JSON.stringify(message) + "\n"); await rejected;
  assert.equal(session.bus.recent.at(-1)?.type, "rejected");
  const admission = once(session, "remote");
  socket.write(JSON.stringify({ ...message, request_id: "r2", expect: { metric: "air", dir: "up" } }) + "\n");
  const [result] = await admission;
  assert.equal(result.kind, "proposal");
  assert.equal(session.read("d2"), code);
  assert.throws(() => session.write("../outside", "bad"), /unknown slot/);
  await Promise.all([session.close(), session.close()]);
  const log = fs.readFileSync(session.bus.path, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(log.filter(m => m.type === "session_end").length, 1);
  assert.equal(session.evidence.listenerCount("comparison"), 0);
});

test("late activation receipts cannot change a closed session", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ears-session-"));
  const session = new Session(dir, true);
  t.after(async () => { await session.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const listening = once(session.bus, "listening");
  session.open({}, 0, path.join(dir, "logs")); await listening;
  const id = session.evidence.begin("d2", "source", "test");
  session.engine.emit("active", { slot: "d2", execution_id: id, at: Date.now() + 50, basis: "pattern_event" });
  await session.close();
  assert.equal(session.evidence.activeRevision, 0);
  assert.equal(session.bus.recent.filter(m => m.type === "active").length, 0);
});
