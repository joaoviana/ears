import assert from "node:assert/strict";
import test from "node:test";
import { face } from "../sprites.ts";

const ANSI = /\x1b\[[0-9;]*m/g;
const state = { kick: 0.4, snare: 0.2, hat: 0.5, active: true, shades: false, blink: false, t: 1, bar: 2 };

test("braille portraits keep their terminal footprint while using the 2 x 4 cell grid", () => {
  const portrait = face("owl", [143, 211, 255], [165, 143, 255], state, 22, 10, "braille");
  const visible = portrait.map((row) => row.replace(ANSI, ""));
  assert.equal(visible.length, 10);
  assert.ok(visible.every((row) => [...row].length === 22));
  assert.ok(visible.some((row) => [...row].some((char) => char >= "\u2801" && char <= "\u28ff")));
  assert.ok(!portrait.join("").includes("\x1b[48;2;"), "filled facial features stay solid instead of becoming two-colour dot clusters");
});

test("quadrant mode remains available for callers that use the previous boolean flag", () => {
  const portrait = face("owl", [143, 211, 255], [165, 143, 255], state, 22, 10, true);
  assert.equal(portrait.length, 10);
  assert.ok(portrait.every((row) => [...row.replace(ANSI, "")].length === 22));
});
