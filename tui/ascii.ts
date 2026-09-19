// A shader, but the framebuffer is text. Each look is a scalar field f(x, y, t, s) -> 0..1 mapped
// onto a character ramp. Looks are picked by name, so an agent chooses from a list instead of writing code.
export interface Pulse { kick: number; snare: number; hat: number; stab: number; bar: number; bands: number[] }

const RAMPS = { ascii: " .:-=+*#%@", blocks: " ░▒▓█", dots: " ⠁⠃⠇⡇⣇⣧⣷⣿", code: " .,;!lI$@" };
export type Ramp = keyof typeof RAMPS;

type Field = (x: number, y: number, t: number, s: Pulse) => number;
const FIELDS: Record<string, Field> = {
  tunnel: (x, y, t, s) => {
    const r = Math.hypot(x, y) + 1e-3, a = Math.atan2(y, x);
    return 0.5 + 0.5 * Math.sin(6 / r + t * 2 + s.bar * 6.283) * Math.cos(a * 4 + t * 0.5) * Math.min(1, r * 1.6) + s.kick * 0.35 * (1 - r);
  },
  plasma: (x, y, t, s) =>
    0.5 + 0.25 * (Math.sin(x * 5 + t) + Math.sin(y * 7 - t * 1.3) + Math.sin((x + y) * 4 + t * 0.7) + Math.sin(Math.hypot(x, y) * (8 + s.bands[0] * 12) - t * 2)) * (0.6 + s.kick * 0.6),
  rings: (x, y, t, s) => {
    const r = Math.hypot(x, y);
    return Math.max(0, Math.sin(r * 14 - s.bar * 25.13) * 0.5 + 0.5 - r * 0.5) + s.kick * Math.exp(-Math.abs(r - 0.35) * 9) + s.snare * Math.exp(-Math.abs(r - 0.8) * 12);
  },
  moire: (x, y, t, s) => {
    const a = Math.sin(Math.hypot(x - 0.3 * Math.sin(t * 0.4), y) * 30), b = Math.sin(Math.hypot(x + 0.3 * Math.cos(t * 0.3), y + 0.1) * (30 + s.kick * 6));
    return 0.5 + 0.5 * a * b + s.hat * 0.15;
  },
  scope: (x, y, _t, s) => {
    // five fat columns, one per band: the listening report as a picture
    const i = Math.min(4, Math.floor((x + 1) / 0.4)), h = Math.min(1, s.bands[i] * 5 + (i === 0 ? s.kick * 0.3 : 0));
    return (1 - y) / 2 < h ? 0.35 + 0.65 * ((1 - y) / 2 / Math.max(h, 0.01)) : 0.04;
  },
};
export const LOOKS = Object.keys(FIELDS);

export function render(look: string, ramp: Ramp, w: number, h: number, t: number, s: Pulse): string[] {
  const f = FIELDS[look] ?? FIELDS.tunnel, chars = [...RAMPS[ramp]], rows: string[] = [];
  for (let j = 0; j < h; j++) {
    let row = "";
    for (let i = 0; i < w; i++) {
      // terminal cells are ~2x taller than wide, so x spans twice the range per column
      const v = f(((i / (w - 1)) * 2 - 1) * (w / h / 2.1), (j / (h - 1)) * 2 - 1, t, s);
      row += chars[Math.max(0, Math.min(chars.length - 1, Math.floor(v * chars.length)))];
    }
    rows.push(row);
  }
  return rows;
}
