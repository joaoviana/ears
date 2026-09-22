// A DJ is a markdown file: who they are, what they'd never play, which look and palette they bring, and a face.
// The face is assembled from named parts, so a generated DJ picks parts from a list rather than drawing.
// Files live in tui/djs/<id>.md and survive the set; summoning writes a new one.
import fs from "fs";
import path from "path";
import { ROOT } from "./engine.ts";
import { LOOKS, PALETTE_NAMES, UI, type Pulse } from "./ascii.ts";
import { face, SPECIES } from "./sprites.ts";
export { SPECIES };

export const DIR = process.env.EARS_DJS || path.join(ROOT, "tui/djs");   // EARS_DJS: a test roster that can be granted skills without touching the real one
export const HAIR = ["bald", "mohawk", "cap", "afro", "long", "beanie", "antenna"] as const;
export const EYES = ["dots", "shades", "visor", "closed", "stars", "wide"] as const;
export const CANS = ["big", "small", "none"] as const;
export const BODY = ["decks", "laptop", "modular"] as const;
export const HEAD = ["square", "round", "robot"] as const;

export interface DJ {
  id: string; name: string; tagline: string; palette: string; look: string;
  hair: (typeof HAIR)[number]; eyes: (typeof EYES)[number]; cans: (typeof CANS)[number]; body: (typeof BODY)[number]; head: (typeof HEAD)[number]; species: string;
  style: string; idioms: string[]; never: string[]; greeting: string; skills: string[];
  /** the arsenal gestures this listener reaches for first: its repertoire, so two listeners never offer the same set */
  signature: string[];
  /** the gesture it walks in with: offered at once, and taken on its behalf after a two-bar veto */
  entrance: string;
}

const ACCENT: Record<string, [number, number, number]> = { ember: [255, 184, 107], neon: [255, 95, 210], ice: [143, 211, 255], acid: [198, 242, 78], sunset: [255, 138, 92], mono: [230, 230, 230] };
export const accent = (palette: string) => ACCENT[palette] ?? ACCENT.ember;
const fg = ([r, g, b]: number[], k = 1) => `\x1b[38;2;${Math.round(r * k)};${Math.round(g * k)};${Math.round(b * k)}m`;

const HAIR_ROWS: Record<string, [string, string]> = {
  bald:    ["                   ", "     ▁▁▁▁▁▁▁▁▁     "],
  mohawk:  ["        ▟█▙        ", "       ▟███▙       "],
  cap:     ["     ▁▁▁▁▁▁▁▁▁     ", "   ▝▀▀█████████    "],
  afro:    ["    ▟█████████▙    ", "   ▟███████████▙   "],
  long:    ["     ▁▁▁▁▁▁▁▁▁     ", "    ▟█████████▙    "],
  beanie:  ["       ▁▂▃▂▁       ", "     ▟▓▓▓▓▓▓▓▙     "],
  antenna: ["      ●     ●      ", "      │     │      "],
};
const EYE_ROW: Record<string, [string, string]> = {   // [open, on the kick]
  dots: ["  ●   ●  ", "  ◉   ◉  "], shades: [" ▆▆▆▁▆▆▆ ", " ███▁███ "], visor: [" ▒▒▒▒▒▒▒ ", " ▓▓▓▓▓▓▓ "],
  closed: ["  ─   ─  ", "  ‿   ‿  "], stars: ["  ✦   ✦  ", "  ✧   ✧  "], wide: ["  ◎   ◎  ", "  ●   ●  "],
};
const BODY_ROWS: Record<string, string[]> = {
  decks:   ["  ╭───┴─────┴───╮  ", "  │ ◎═╗ ▂▃▅ ╔═◎ │  ", "  ╰─────────────╯  "],
  laptop:  ["  ╭───┴─────┴───╮  ", "  │ ▛▀▀▀▀▀▀▀▀▀▜ │  ", "  ╰─▙▁▁▁▁▁▁▁▁▁▟─╯  "],
  modular: ["  ╭───┴─────┴───╮  ", "  │ ∘╲∘ ∘╱∘ ∘╲∘ │  ", "  ╰─∘─∘─∘─∘─∘─∘─╯  "],
};

/** 12 rows x 24 cols: a rendered portrait (see sprites.ts). */
export function avatar(dj: DJ, p: Pulse, active: boolean): string[] {
  const acc = ACCENT[dj.palette] ?? ACCENT.ember, b = UI[dj.palette]?.b ?? "#ffffff", second = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const now = Date.now() / 1000, seedT = dj.id.length * 1.7, blink = active && (now + seedT) % 3.7 < 0.13;   // each DJ blinks on its own schedule
  return face(dj.species, acc, second, { kick: p.kick, snare: p.snare, hat: p.hat, active, shades: dj.eyes === "shades" || dj.eyes === "visor", blink, t: now + seedT, bar: p.bar, cans: dj.cans !== "none" }, 22, 10, true).map((r) => " " + r);
}

// ---- files -----------------------------------------------------------------------------------
const list = (s?: string) => (s || "").split("\n").map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean);

export function parse(md: string, id: string): DJ | null {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const f = Object.fromEntries(m[1].split("\n").map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  const sec = (h: string) => m[2].match(new RegExp(`# ${h}\\n([\\s\\S]*?)(?=\\n# |$)`))?.[1].trim();
  const pick = <T extends readonly string[]>(v: string, opts: T, d: T[number]) => (opts.includes(v) ? v : d) as T[number];
  return {
    id, name: f.name || id, tagline: f.description || "", palette: pick(f.palette, PALETTE_NAMES as any, "ember"), look: pick(f.look, LOOKS as any, "orbit"),
    species: SPECIES.includes(f.species) ? f.species : SPECIES[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % SPECIES.length], head: pick(f.head, HEAD, "square"), hair: pick(f.hair, HAIR, "bald"), eyes: pick(f.eyes, EYES, "dots"), cans: pick(f.cans, CANS, "big"), body: pick(f.body, BODY, "decks"),
    skills: (f.skills || "").split(",").map((x) => x.trim()).filter(Boolean), signature: (f.signature || "").split(",").map((x) => x.trim()).filter(Boolean), entrance: (f.entrance || "").trim(), style: sec("Style") || "", idioms: list(sec("Idioms")), never: list(sec("Never")), greeting: sec("Greeting") || "",
  };
}

export const toMarkdown = (d: DJ) => `---
name: ${d.name}
description: ${d.tagline}
palette: ${d.palette}
look: ${d.look}
species: ${d.species}
head: ${d.head}
hair: ${d.hair}
eyes: ${d.eyes}
cans: ${d.cans}
body: ${d.body}
skills: ${(d.skills || []).join(", ")}
signature: ${(d.signature || []).join(", ")}
entrance: ${d.entrance || ""}
---
# Style
${d.style}

# Idioms
${d.idioms.map((x) => "- " + x).join("\n")}

# Never
${d.never.map((x) => "- " + x).join("\n")}

# Greeting
${d.greeting}
`;

export function roster(): DJ[] {
  try { return fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => parse(fs.readFileSync(path.join(DIR, f), "utf8"), f.replace(".md", ""))).filter(Boolean) as DJ[]; } catch { return []; }
}
/** Ambient mode only invites listeners whose style explicitly declares an ambient discipline. */
export const isAmbientDJ = (dj: DJ) => dj.id === "resident" || /AMBIENT DISCIPLINE:/i.test(dj.style);
export function save(d: DJ) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, d.id + ".md"), toMarkdown(d)); }
