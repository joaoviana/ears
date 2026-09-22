import assert from "node:assert/strict";
import test from "node:test";
import { asciiFace } from "../ascii-avatars.ts";
import { SPECIES } from "../sprites.ts";

const ANSI = /\x1b\[[0-9;]*m/g;

test("every hand-authored avatar fits the 22 x 10 booth footprint", () => {
  for (const species of SPECIES) {
    const portrait = asciiFace(species, [143, 211, 255], [165, 143, 255], { active: true, blink: false, hat: 0.3, snare: 0, eyes: "dots" });
    const visible = portrait.map((row) => row.replace(ANSI, ""));
    assert.equal(visible.length, 10, species);
    assert.ok(visible.every((row) => [...row].length === 22), species);
    assert.ok(!visible.join("").match(/[1-4eghm]/), `${species} leaked an art marker`);
    assert.ok(!visible.join("").match(/[\u2800-\u28ff]/u), `${species} used Braille`);
  }
});

test("the resident owl has calm closed eyes and opens its beak on the snare", () => {
  const calm = asciiFace("owl", [143, 211, 255], [165, 143, 255], { active: true, blink: false, hat: 0, snare: 0, eyes: "closed" }).join("").replace(ANSI, "");
  const speaking = asciiFace("owl", [143, 211, 255], [165, 143, 255], { active: true, blink: false, hat: 0, snare: 1, eyes: "closed" }).join("").replace(ANSI, "");
  assert.ok(calm.includes("─"));
  assert.ok(calm.includes("◆"));
  assert.ok(speaking.includes("◇"));
});
