import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ask } from "../agent.ts";
import { parse } from "../djs.ts";

test("cancelling a superseded wildcard terminates its CLI process and offers no late patch", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ears-cancel-")), started = path.join(dir, "started"), stopped = path.join(dir, "stopped");
  const oldPath = process.env.PATH;
  const controller = new AbortController();
  t.after(() => { controller.abort(); process.env.PATH = oldPath; fs.rmSync(dir, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(dir, "claude"), `#!${process.execPath}\nconst fs = require('node:fs');\nprocess.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(stopped)}, 'yes'); process.exit(0); });\nfs.writeFileSync(${JSON.stringify(started)}, 'yes');\nsetTimeout(() => process.exit(0), 5000);\n`, { mode: 0o755 });
  process.env.PATH = dir + path.delimiter + oldPath;
  const dj = parse("---\nname: TEST\n---\n# Style\nHouse", "test")!;
  const pending = ask({ dj, angle: "turn", context: "", slots: {}, note: "", report: "", history: [], signal: controller.signal }, () => assert.fail("cancelled patch offered"));
  const rejected = assert.rejects(pending, /no angle produced/);
  const until = Date.now() + 2000;
  while (!fs.existsSync(started) && Date.now() < until) await delay(10);
  assert.ok(fs.existsSync(started), "fake CLI must actually start");
  controller.abort(); await rejected;
  while (!fs.existsSync(stopped) && Date.now() < until) await delay(10);
  assert.ok(fs.existsSync(stopped), "CLI must receive termination, not run until its deadline");
});
