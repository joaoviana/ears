// Terminal colour and type: truecolor escapes, the neutral text shades, and the name-in-lights banner.
import cfonts from "cfonts";
import { NEUTRAL, type Ramp } from "./ascii.ts";

export const RAMP_NAMES: Ramp[] = ["pixels", "ascii", "blocks", "dots", "code"];
export const { text: TEXT, dim: DIM, faint: FAINT } = NEUTRAL;
export const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const fgc = ([r, g, b]: number[], k = 1) => `\x1b[38;2;${Math.round(r * k)};${Math.round(g * k)};${Math.round(b * k)}m`, RESET = "\x1b[39m";
/** A slot's code as the comma-separated pieces the code pane colours one by one. */
export const tokens = (c: string) => c.replace(/\s*\n\s*/g, " ").trim().split(/(?<=,)\s+/).filter(Boolean);

// name-in-lights fonts (cfonts). Each DJ keeps one; if it doesn't fit the terminal, fall through to narrower ones.
const FONTS = ["block", "slick", "pallet", "shade", "grid", "simple3d"] as const, NARROW = ["chrome", "tiny"] as const;
const bigText = (text: string, font: string): string[] => {
  try {
    const result = cfonts.render(text, { font, colors: ["system"], space: false, env: "node", maxLength: 0, lineHeight: 0 }, false, 0, { width: 500, height: 50 });
    return result ? result.string.replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter(line => line.trim()) : [];
  } catch { return []; }
};
const hashOf = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** `text` in big letters, padded into a box no wider than `width`; null if no font fits. `fontKey` picks the font. */
export const bannerLines = (text: string, width: number, fontKey = text): string[] | null => {
  for (const font of [FONTS[hashOf(fontKey) % FONTS.length], "block", ...NARROW]) {
    const lines = bigText(text, font); if (!lines.length) continue;
    const w = Math.max(...lines.map((l) => l.length));
    if (w + 4 <= width) return ["", ...lines, ""].map((l) => "  " + l.padEnd(w) + "  ");
  }
  return null;
};
