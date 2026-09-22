import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findSclang, Speech } from "../platform.ts";
import { readOsc } from "../osc-reader.ts";
import { toBuffer } from "osc-min";

test("sclang discovery supports PATH, paths with spaces and an authoritative override", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ears platform "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, "sclang");
  fs.writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  assert.equal(await findSclang(root, { PATH: root }, "linux"), executable);
  assert.equal(await findSclang(root, { EARS_SCLANG: executable, PATH: "" }, "linux"), executable);
  await assert.rejects(findSclang(root, { EARS_SCLANG: path.join(root, "missing"), PATH: root }, "linux"), /EARS_SCLANG/);
  await assert.rejects(findSclang(root, { PATH: "" }, "linux"), /SuperCollider not found/);
});

test("optional speech is unavailable on other platforms without invoking say", async () => {
  const speech = new Speech(); await speech.load("linux");
  assert.equal(speech.available, false);
  assert.equal(speech.voiceFor("dj"), undefined);
  speech.greet("dj", "hello", 0); speech.close();
});

test("OSC boundary refuses wrong types, missing fields, bundles and nonfinite telemetry", () => {
  const packet = (args: (string | number)[]) => Buffer.from(toBuffer({ address: "/hit", args }).buffer);
  const good = readOsc(packet(["d2", 120]));
  assert.equal(good.string(0), "d2"); assert.equal(good.number(1), 120);
  assert.throws(() => good.number(0)); assert.throws(() => good.string(1)); assert.throws(() => good.number(2));
  assert.equal(good.number(2, 0), 0);
  assert.throws(() => readOsc(packet([NaN])).number(0));
  assert.throws(() => readOsc(Buffer.from(toBuffer({ timetag: [0, 1], elements: [] }).buffer)));
});
