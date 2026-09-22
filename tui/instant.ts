import { applyPatch, describe, parseSlot, type Patch } from "./patch.ts";
import { validate, type AskInput, type Suggestion } from "./agent.ts";

type Notes = { items: (number | string)[]; suffix: string };
const values = (code: string) => Object.fromEntries(parseSlot(code).map(p => [p.key, p.value]));
const rotate = <T,>(items: T[], n: number) => [...items.slice(n % items.length), ...items.slice(0, n % items.length)];
const hash = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Deliberately small grammar. Never evaluate SC, or guess what an arbitrary expression means. */
export function simpleNotes(value = ""): Notes | null {
  const match = value.match(/^Pseq\(\s*\[([^\[\]]+)\]\s*,\s*inf\s*\)(\.stutter\(\d+\))?$/);
  if (!match) return null;
  const raw = match[1].split(",").map(x => x.trim());
  if (raw.length < 2 || raw.length > 64 || raw.some(x => !/^(?:\d+(?:\.\d+)?|\\r|Rest\(0\))$/.test(x))) return null;
  const items = raw.map(x => /^\d/.test(x) ? Number(x) : x);
  if (items.some(x => typeof x === "number" && (x < 12 || x > 108))) return null;
  return { items, suffix: match[2] || "" };
}
const noteSource = (notes: Notes) => `Pseq([${notes.items.join(", ")}], inf)${notes.suffix}`;
const rows = (value = "") => [...value.matchAll(/"([Xx-]{4,64})"/g)].map(m => m[1]);

/** Compile at request time against live source. Nothing here changes source files or sends audio commands. */
export function instantVariations(input: AskInput): Suggestion[] {
  // Free-form instructions and skill demonstrations need interpretation. Never silently ignore them.
  if (input.note.trim() || input.showcase || input.signal?.aborted) return [];
  const started = performance.now(), out: Suggestion[] = [];
  const bias = hash(input.dj.id), round = input.round ?? 0;
  const add = (slot: string, patch: Patch, recipe: string, why: string, sourceSlot?: string) => {
    const before = input.slots[slot], code = applyPatch(before, patch);
    if (code === before.trim() || validate({ slot, code }) || out.some(o => o.code === code)) return;
    const diff = describe(before, patch), part = { slot, code, diff };
    out.push({ origin: "recipe", recipe_id: recipe, slot, code, diff, parts: [part], angle: "instant",
      why, evidence: sourceSlot ? `saved ${sourceSlot} pattern adapted to current ${slot}; source reference, not audio extraction` : `current ${slot}; ${recipe}; event rate and gain preserved`,
      ...(input.inspiration ? { inspiration_id: input.inspiration.artifact_id } : {}),
      ms: performance.now() - started, expect: { metric: "density", dir: "same" },
    });
  };
  const saved: (Record<string, string> & { slot: string })[] = input.inspiration ? Object.entries(input.inspiration.slots).map(([slot, code]) => ({ slot, ...values(code) })) : [];
  const rhythmSources = saved.filter(s => rows(s.amp).length);
  const noteSources = saved.map(s => ({ slot: s.slot, notes: simpleNotes(s.midinote) })).filter(s => s.notes);

  // Anchor d1. Shift the kit voice rows along with the amplitude rows to keep samples and accents together.
  for (const slot of rotate(["d2", "d3", "d6", "d5", "d4"], (round + bias) % 2)) {
    const old = values(input.slots[slot] || ""), currentRows = rows(old.amp);
    if (!old.amp?.startsWith("~x.(") || !currentRows.length) continue;
    if (input.inspiration?.intent === "answer") continue;
    const source = rhythmSources.find(s => rows(s.amp)[0].length === currentRows[0].length);
    if (input.inspiration && !source) continue;
    const shifts = rotate([1, 3, 5, 7], (round + bias) % 4);
    for (const shift of shifts) {
      let index = 0;
      const savedRows = source ? rows(source.amp) : currentRows;
      const amp = old.amp.replace(/"([Xx-]{4,64})"/g, (_m, row: string) => {
        const reference = savedRows[index++ % savedRows.length];
        return `"${rotate([...(reference.length === row.length ? reference : row)], shift).join("")}"`;
      });
      if (amp === old.amp) continue;
      const patch: Patch = { slot, set: [{ key: "amp", value: amp }] };
      if (old.buf?.startsWith("~kp.(")) patch.set.push({ key: "buf", value: old.buf.replace(/"([kCnhHrstmwxcvb-]{4,64})"/g, (_m, row: string) => `"${rotate([...row], shift).join("")}"`) });
      add(slot, patch, `accent-shift-${shift}`, `${slot}: ${source ? "kept accents return" : "accents slip"} ${shift} steps around the beat.`, source?.slot);
      break;
    }
  }
  const rhythm = out.splice(0);
  for (const slot of rotate(["d6", "d4", "d5"], (round + bias) % 3)) {
    const old = values(input.slots[slot] || ""), notes = simpleNotes(old.midinote);
    if (!notes || input.inspiration?.intent === "rhythm") continue;
    const source = noteSources[(round + bias) % Math.max(1, noteSources.length)];
    if (input.inspiration && !source) continue;
    let motif = notes;
    if (source?.notes) {
      // Borrow contour ranks, not old pitches: use notes already present in the current voice/key.
      const savedPitches = [...new Set(source.notes.items.filter(x => typeof x === "number"))].sort((a, b) => a - b);
      const livePitches = [...new Set(notes.items.filter(x => typeof x === "number"))].sort((a, b) => a - b);
      if (!savedPitches.length || !livePitches.length) continue;
      motif = { suffix: notes.suffix, items: notes.items.map((_, i) => {
        const x = source.notes!.items[i % source.notes!.items.length];
        return typeof x === "number" ? livePitches[Math.round(savedPitches.indexOf(x) / Math.max(1, savedPitches.length - 1) * (livePitches.length - 1))] : x;
      }) };
    }
    for (const recipe of (round + bias) % 2 ? ["reverse", "octave-answer"] : ["octave-answer", "reverse"]) {
      const items = recipe === "reverse" ? motif.items.slice().reverse() : motif.items.map((x, i) => typeof x === "number" && i % 2 === 1 && x <= 84 ? x + 12 : x);
      const value = noteSource({ ...motif, items });
      if (value.replace(/\s/g, "") === old.midinote.replace(/\s/g, "")) continue;
      add(slot, { slot, set: [{ key: "midinote", value }] }, recipe,
        `${slot}: ${source ? "kept contour" : "the phrase"} ${recipe === "reverse" ? "runs backwards" : "answers an octave up"}.`, source?.slot);
    }
  }
  // Prefer distinct mechanisms and voices; fall back to a second compatible variation, never fabricated code.
  const melody = out.splice(0), candidates = [...(rhythm[0] ? [rhythm[0]] : []), ...melody, ...rhythm.slice(1)];
  const selected: Suggestion[] = [];
  for (const o of candidates) if (!selected.some(x => x.slot === o.slot)) { selected.push(o); if (selected.length === 2) return selected; }
  for (const o of candidates) if (!selected.includes(o)) { selected.push(o); if (selected.length === 2) break; }
  return selected;
}
