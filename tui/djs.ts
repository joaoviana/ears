// A DJ is a markdown file: who they are, what they'd never play, which look and palette they bring, and a face.
// The face is assembled from named parts, so a generated DJ picks parts from a list rather than drawing.
// Files live in tui/djs/<id>.md and survive the set; summoning writes a new one.
import fs from "fs";
import path from "path";
import { ROOT } from "./engine.ts";
import { LOOKS, PALETTE_NAMES, type Pulse } from "./ascii.ts";

export const DIR = process.env.EARS_DJS || path.join(ROOT, "tui/djs");   // EARS_DJS: a test roster that can be granted skills without touching the real one
export const HAIR = ["bald", "mohawk", "cap", "afro", "long", "beanie", "antenna"] as const;
export const EYES = ["dots", "shades", "visor", "closed", "stars", "wide"] as const;
export const CANS = ["big", "small", "none"] as const;
export const BODY = ["decks", "laptop", "modular"] as const;
export const HEAD = ["square", "round", "robot"] as const;

export interface DJ {
  id: string; name: string; tagline: string; palette: string; look: string;
  hair: (typeof HAIR)[number]; eyes: (typeof EYES)[number]; cans: (typeof CANS)[number]; body: (typeof BODY)[number]; head: (typeof HEAD)[number];
  style: string; idioms: string[]; never: string[]; greeting: string; skills: string[];
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

/** 10 rows x 20 cols. Nods on the kick, mouth opens on the snare, headphones flash on the hats. */
export function avatar(dj: DJ, p: Pulse, active: boolean): string[] {
  const acc = ACCENT[dj.palette] ?? ACCENT.ember, dim = active ? 1 : 0.45;
  const hit = p.kick > 0.55, eyes = EYE_ROW[dj.eyes]?.[hit ? 1 : 0] ?? EYE_ROW.dots[0];
  const mouth = p.snare > 0.5 ? "  ╰▽╯  " : hit ? "  ▔▔▔  " : "  ───  ";
  const can = dj.cans === "none" ? ["  ", "  ", "  "] : dj.cans === "big" ? ["╔╗", "║║", "╚╝"] : [" ╓", " ║", " ╙"];
  const canR = dj.cans === "none" ? ["  ", "  ", "  "] : dj.cans === "big" ? ["╔╗", "║║", "╚╝"] : ["╖ ", "║ ", "╜ "];
  const side = dj.hair === "long" ? "█" : " ";
  const [tl, tr, bl, br, hz, vt] = dj.head === "round" ? "╭╮╰╯─│" : dj.head === "robot" ? "╔╗╚╝═║" : "┌┐└┘─│";
  const head = [
    `  ${can[0]}${tl}${hz.repeat(9)}${tr}${canR[0]}  `,
    ` ${side}${can[1]}${vt}${eyes}${vt}${canR[1]}${side} `,
    ` ${side}${can[2]}${vt}    ${dj.head === "robot" ? "▪" : "▵"}    ${vt}${canR[2]}${side} `,
    ` ${side}  ${vt} ${mouth} ${vt}  ${side} `,
    `    ${bl}${hz.repeat(2)}┬${hz.repeat(3)}┬${hz.repeat(2)}${br}    `,
  ];
  const canCol = fg(acc, dim * (0.6 + p.hat * 0.4)), skin = fg([235, 225, 205], dim), hairCol = fg(acc, dim * 0.85), body = fg(acc, dim * (0.55 + p.kick * 0.45));
  const rows = [
    ...HAIR_ROWS[dj.hair].map((r) => hairCol + r),
    ...head.slice(0, 4).map((r, i) => (i < 3 ? r.slice(0, 2).replace(/█/g, hairCol + "█") + canCol + r.slice(2, 4) + skin + r.slice(4, 15) + canCol + r.slice(15, 17) + skin + r.slice(17).replace(/█/g, hairCol + "█") : skin + r.replace(/█/g, hairCol + "█" + skin))).map((r) => skin + r),
    skin + head[4],
    ...BODY_ROWS[dj.body].map((r) => body + r),
  ].map((r) => r + "\x1b[39m");
  return hit && active ? ["", ...rows.slice(0, -1)] : rows;   // the nod: everything drops a row for the length of the kick
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
    head: pick(f.head, HEAD, "square"), hair: pick(f.hair, HAIR, "bald"), eyes: pick(f.eyes, EYES, "dots"), cans: pick(f.cans, CANS, "big"), body: pick(f.body, BODY, "decks"),
    skills: (f.skills || "").split(",").map((x) => x.trim()).filter(Boolean), style: sec("Style") || "", idioms: list(sec("Idioms")), never: list(sec("Never")), greeting: sec("Greeting") || "",
  };
}

export const toMarkdown = (d: DJ) => `---
name: ${d.name}
description: ${d.tagline}
palette: ${d.palette}
look: ${d.look}
head: ${d.head}
hair: ${d.hair}
eyes: ${d.eyes}
cans: ${d.cans}
body: ${d.body}
skills: ${(d.skills || []).join(", ")}
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
export function save(d: DJ) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, d.id + ".md"), toMarkdown(d)); }
