import test from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { Engine } from "../engine.ts";

test("occupied audio ports report a recoverable startup failure without terminating their owner", { timeout: 5000 }, async t => {
  const held = dgram.createSocket("udp4"); held.bind(0, "127.0.0.1"); await once(held, "listening");
  const original = { EARS_SCLANG: process.env.EARS_SCLANG, EARS_SC_PORT: process.env.EARS_SC_PORT };
  const engine = new Engine(), messages: string[] = [];
  t.after(() => {
    engine.stop(); held.close();
    for (const [key, value] of Object.entries(original)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  process.env.EARS_SCLANG = process.execPath;
  process.env.EARS_SC_PORT = String(held.address().port);
  engine.on("log", message => messages.push(message));
  await engine.start(true);
  assert.equal(engine.ready, false);
  assert.ok(messages.some(message => /audio port .* unavailable/.test(message)));
  assert.equal(held.address().port, Number(process.env.EARS_SC_PORT));
});

test("stopping during executable discovery prevents the child process from starting", { timeout: 5000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ears-boot-")), marker = path.join(dir, "started"), executable = path.join(dir, "sclang");
  fs.writeFileSync(executable, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started');\n`, { mode: 0o755 });
  const previous = process.env.EARS_SCLANG, engine = new Engine();
  t.after(() => { engine.stop(); previous === undefined ? delete process.env.EARS_SCLANG : process.env.EARS_SCLANG = previous; fs.rmSync(dir, { recursive: true, force: true }); });
  process.env.EARS_SCLANG = executable;
  const starting = engine.start(true); engine.stop(); await starting;
  assert.equal(fs.existsSync(marker), false);
  assert.equal(engine.ready, false);
});

test("late moment cleanup cannot send through a closed engine socket", { timeout: 2000 }, async () => {
  const engine = new Engine();
  const internals = engine as unknown as { sock: dgram.Socket; lang: number };
  internals.sock.bind(0, "127.0.0.1"); await once(internals.sock, "listening"); internals.lang = 57120;
  engine.stop(); await new Promise(resolve => setTimeout(resolve, 450));
  assert.doesNotThrow(() => engine.stopAudition());
});
