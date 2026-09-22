import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AmbientLearning } from "../ambient-learning.ts";

test("ambient agents persist preference and audible-effect learning", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ears-learning-")), file = path.join(dir, "memory.json");
  const first = new AmbientLearning(file), fresh = first.score("river", "paper-aurora");
  first.decision("river", "paper-aurora", "take"); first.outcome("river", "paper-aurora", "hit");
  first.decision("river", "static-halo", "skip");
  const restored = new AmbientLearning(file);
  assert.ok(restored.score("river", "paper-aurora") > fresh);
  assert.ok(restored.score("river", "paper-aurora") > restored.score("river", "static-halo"));
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).version, 1); fs.rmSync(dir, { recursive: true });
});

test("new ambient agents inherit a weak global preference", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ears-learning-")), file = path.join(dir, "memory.json");
  const learning = new AmbientLearning(file); learning.decision("mineral", "brush-current", "take"); learning.outcome("mineral", "brush-current", "hit");
  assert.ok(learning.score("canopy", "brush-current") > learning.score("canopy", "unknown")); fs.rmSync(dir, { recursive: true });
});
