// DJ faces, rendered rather than drawn: each species is a small stack of shapes (ellipses, triangles, rounded boxes)
// in a -1..1 square, shaded from a light at the top left, supersampled 2x2 for soft edges, and written out as
// half-blocks (one text cell = two pixels, foreground over background). Because it's geometry and not a bitmap, it
// moves continuously: the head bobs with the kick, ears twitch on the hats, eyes blink and glance, the mouth opens
// as wide as the clap is loud.
export const SPECIES = ["cat", "dog", "fox", "owl", "bear", "rabbit", "frog", "robot", "alien", "skull"];
export interface FaceState { kick: number; snare: number; hat: number; active: boolean; shades: boolean; blink: boolean; t?: number; bar?: number; cans?: boolean }
type RGB = number[];
type Test = (x: number, y: number) => boolean;
interface Layer { in: Test; rgb: RGB; flat?: boolean }

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0): Test => { const c = Math.cos(rot), s = Math.sin(rot); return (x, y) => { const dx = x - cx, dy = y - cy, u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry; return u * u + v * v <= 1; }; };
const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Test => (x, y) => { const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
const box = (cx: number, cy: number, hw: number, hh: number, r = 0.06): Test => (x, y) => { const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= r; };
const both = (a: Test, b: Test): Test => (x, y) => a(x, y) && b(x, y);
const minus = (a: Test, b: Test): Test => (x, y) => a(x, y) && !b(x, y);
const mix = (a: RGB, b: RGB, k: number): RGB => a.map((v, i) => v + (b[i] - v) * k);
const WHITE = [246, 244, 250], INK = [22, 20, 30];

function build(species: string, body: RGB, second: RGB, s: FaceState): Layer[] {
  const L: Layer[] = [], add = (t: Test, rgb: RGB, flat = false) => L.push({ in: t, rgb, flat });
  const light = mix(body, WHITE, 0.55), dark = mix(body, INK, 0.45), ear = s.hat * 0.12, open = 0.015 + s.snare * 0.07;
  const glance = Math.sin((s.t ?? 0) * 0.7) * 0.025, lid = s.blink ? 0.12 : 1;
  const eyes = (ex: number, ey: number, rx: number, ry: number, pupil = 0.5, slit = false, tilt = 0) => { for (const d of [-1, 1]) { add(ell(d * ex, ey, rx, ry * lid, d * tilt), WHITE, true); add(ell(d * ex + glance, ey + 0.01, slit ? rx * 0.3 : rx * pupil, ry * lid * (slit ? 0.92 : pupil), d * tilt), INK, true); if (!s.blink) add(ell(d * ex + glance - rx * 0.22, ey - ry * 0.3, rx * 0.16, ry * 0.16), WHITE, true); } };
  const shoulders = () => add(ell(0, 1.12, 0.78, 0.42), dark);
  const cans = () => { if (s.cans === false) return; const glow = mix(mix(second, INK, 0.45), second, 0.35 + s.hat * 0.65); add(both(minus(ell(0, -0.02, 0.8, 0.78), ell(0, -0.02, 0.69, 0.67)), (_x, y) => y < 0.0), mix(second, INK, 0.5)); for (const d of [-1, 1]) { add(ell(d * 0.72, 0.1, 0.15, 0.24), glow); add(ell(d * 0.74, 0.1, 0.07, 0.13), mix(glow, INK, 0.5)); } };

  shoulders();
  switch (species) {
    case "cat": {
      for (const d of [-1, 1]) { add(tri(d * 0.62, -0.18, d * (0.5 + ear), -0.98, d * 0.12, -0.42), body); add(tri(d * 0.52, -0.3, d * (0.47 + ear), -0.8, d * 0.24, -0.44), second); }
      cans(); add(ell(0, 0.08, 0.64, 0.55), body); add(ell(0, 0.34, 0.3, 0.2), light);
      eyes(0.27, 0.0, 0.13, 0.14, 0.5, true); add(tri(-0.05, 0.22, 0.05, 0.22, 0, 0.29), second, true); add(ell(0, 0.37, 0.07, open), INK, true);
      for (const d of [-1, 1]) for (const k of [0, 1]) add(box(d * 0.47, 0.3 + k * 0.08, 0.13, 0.008, 0.004), light, true);
      break; }
    case "dog": {
      cans(); add(ell(0, 0.04, 0.58, 0.56), body);
      for (const d of [-1, 1]) add(ell(d * (0.6 + ear * 0.4), 0.12, 0.17, 0.42, d * -0.22), dark);
      add(ell(0, 0.34, 0.34, 0.26), light); eyes(0.24, -0.06, 0.1, 0.11, 0.62); add(ell(0, 0.2, 0.1, 0.07), INK, true);
      add(ell(0, 0.42, 0.13, open), INK, true); if (s.snare > 0.3) add(ell(0, 0.5, 0.08, 0.05 + s.snare * 0.06), second, true);
      add(ell(-0.3, -0.12, 0.2, 0.16), dark); eyes(0.24, -0.06, 0.1, 0.11, 0.62);
      break; }
    case "fox": {
      for (const d of [-1, 1]) { add(tri(d * 0.7, -0.1, d * (0.62 + ear), -1.0, d * 0.1, -0.4), body); add(tri(d * 0.62, -0.62, d * (0.62 + ear), -1.0, d * 0.47, -0.7), INK); add(tri(d * 0.58, -0.25, d * (0.57 + ear), -0.74, d * 0.26, -0.42), light); }
      cans(); add(ell(0, 0.0, 0.66, 0.46), body); add(tri(-0.66, 0.0, 0.66, 0.0, 0, 0.72), body);
      for (const d of [-1, 1]) add(tri(d * 0.66, 0.02, d * 0.12, 0.22, 0, 0.72), WHITE); add(tri(-0.16, 0.2, 0.16, 0.2, 0, 0.72), WHITE);
      eyes(0.27, -0.04, 0.12, 0.08, 0.6, false, 0.35); add(ell(0, 0.62, 0.07, 0.055), INK, true); add(ell(0, 0.5, 0.05, open * 0.7), INK, true);
      break; }
    case "owl": {
      for (const d of [-1, 1]) add(tri(d * 0.56, -0.4, d * (0.6 + ear), -0.92, d * 0.2, -0.5), dark);
      cans(); add(ell(0, 0.06, 0.64, 0.6), body);
      for (const d of [-1, 1]) { add(ell(d * 0.27, -0.04, 0.27, 0.28), light); add(ell(d * 0.27, -0.04, 0.2, 0.21 * lid), WHITE, true); add(ell(d * 0.27 + glance, -0.04, 0.11, 0.12 * lid), INK, true); if (!s.blink) add(ell(d * 0.27 + glance - 0.04, -0.09, 0.035, 0.035), WHITE, true); }
      add(tri(-0.07, 0.12, 0.07, 0.12, 0, 0.3 + open), second, true);
      for (let i = -2; i <= 2; i++) for (const r of [0, 1]) add(tri(i * 0.17 + r * 0.085 - 0.06, 0.42 + r * 0.1, i * 0.17 + r * 0.085 + 0.06, 0.42 + r * 0.1, i * 0.17 + r * 0.085, 0.5 + r * 0.1), dark);
      break; }
    case "bear": {
      for (const d of [-1, 1]) { add(ell(d * 0.5, -0.46 - ear * 0.3, 0.2, 0.2), body); add(ell(d * 0.5, -0.45 - ear * 0.3, 0.11, 0.11), second); }
      cans(); add(ell(0, 0.08, 0.66, 0.58), body); add(ell(0, 0.32, 0.3, 0.24), light);
      eyes(0.25, -0.04, 0.075, 0.085, 0.7); add(ell(0, 0.22, 0.1, 0.065), INK, true); add(box(0, 0.33, 0.008, 0.05, 0.004), INK, true); add(ell(0, 0.42, 0.1, open), INK, true);
      break; }
    case "rabbit": {
      for (const d of [-1, 1]) { add(ell(d * (0.26 + ear), -0.62, 0.13, 0.44, d * (0.12 + ear)), body); add(ell(d * (0.26 + ear), -0.6, 0.06, 0.34, d * (0.12 + ear)), second); }
      cans(); add(ell(0, 0.16, 0.56, 0.5), body); for (const d of [-1, 1]) add(ell(d * 0.17, 0.38, 0.17, 0.13), light);
      eyes(0.25, 0.06, 0.085, 0.1, 0.72); add(tri(-0.05, 0.27, 0.05, 0.27, 0, 0.33), second, true); add(box(0, 0.46 + open * 0.5, 0.055, 0.05 + open * 0.4, 0.01), WHITE, true); add(box(0, 0.46, 0.004, 0.05, 0.002), mix(WHITE, INK, 0.4), true);
      break; }
    case "frog": {
      cans(); for (const d of [-1, 1]) add(ell(d * 0.36, -0.36, 0.23, 0.23), body);
      add(ell(0, 0.14, 0.72, 0.5), body); add(ell(0, 0.4, 0.5, 0.24), light);
      for (const d of [-1, 1]) { add(ell(d * 0.36, -0.37, 0.16, 0.16 * lid), WHITE, true); add(ell(d * 0.36 + glance, -0.37, 0.09, 0.05 * lid + 0.02), INK, true); }
      add(both(minus(ell(0, 0.08, 0.56, 0.26 + open), ell(0, 0.04, 0.58, 0.24)), (_x, y) => y > 0.12), INK, true); if (s.snare > 0.4) add(ell(0, 0.34, 0.12, s.snare * 0.07), second, true);
      for (const d of [-1, 1]) add(ell(d * 0.07, 0.04, 0.02, 0.015), dark, true);
      break; }
    case "robot": {
      add(box(0, -0.78, 0.015, 0.14, 0.01), dark); add(ell(0, -0.92, 0.06, 0.06), mix(second, WHITE, s.hat * 0.7), true);
      cans(); add(box(0, 0.06, 0.6, 0.52, 0.14), body); add(box(0, 0.06, 0.52, 0.44, 0.1), mix(body, INK, 0.72), true);
      for (const d of [-1, 1]) { add(box(d * 0.25, -0.06, 0.15, 0.1 * lid + 0.01, 0.03), mix(second, WHITE, 0.25 + s.kick * 0.5), true); add(box(d * 0.25 + glance * 2, -0.06, 0.05, 0.06 * lid, 0.02), INK, true); }
      for (let i = -3; i <= 3; i++) add(box(i * 0.09, 0.3, 0.025, 0.03 + Math.abs(Math.sin((s.t ?? 0) * 9 + i)) * s.snare * 0.12, 0.01), second, true);
      for (const d of [-1, 1]) add(ell(d * 0.5, 0.48, 0.035, 0.035), light, true);
      break; }
    case "alien": {
      cans(); add(ell(0, -0.16, 0.66, 0.56), body); add(tri(-0.6, -0.02, 0.6, -0.02, 0, 0.86), body); add(ell(0, 0.42, 0.24, 0.3), body);
      for (const d of [-1, 1]) { add(ell(d * 0.29, 0.0, 0.24, 0.13 * lid + 0.01, d * 0.55), INK, true); if (!s.blink) { add(ell(d * 0.33 + glance, -0.06, 0.06, 0.035, d * 0.55), mix(second, WHITE, 0.4), true); add(ell(d * 0.22, 0.05, 0.025, 0.02), WHITE, true); } }
      for (const d of [-1, 1]) add(ell(d * 0.03, 0.36, 0.012, 0.02), dark, true); add(ell(0, 0.53, 0.06, open * 0.6), INK, true);
      add(ell(-0.2, -0.46, 0.2, 0.1, -0.4), light);
      break; }
    default: {   // skull
      cans(); add(ell(0, -0.1, 0.62, 0.54), mix(body, WHITE, 0.35)); add(box(0, 0.42 + open, 0.34, 0.2, 0.1), mix(body, WHITE, 0.3)); add(box(0, 0.3, 0.4, 0.16, 0.08), mix(body, WHITE, 0.35));
      for (const d of [-1, 1]) { add(ell(d * 0.26, -0.04, 0.17, 0.18, d * 0.2), INK, true); add(ell(d * 0.26 + glance, -0.02, 0.05, 0.05 * lid), mix(second, WHITE, 0.2 + s.kick * 0.6), true); }
      add(tri(-0.07, 0.24, 0.07, 0.24, 0, 0.1), INK, true); add(box(0, 0.4 + open * 0.5, 0.26, 0.012 + open * 0.5, 0.005), INK, true);
      for (let i = -3; i <= 3; i++) add(box(i * 0.075, 0.43 + open * 0.5, 0.006, 0.09, 0.002), INK, true);
      for (const d of [-1, 1]) add(ell(d * 0.5, 0.18, 0.06, 0.1), mix(body, INK, 0.35));
    }
  }
  if (s.shades) { add(box(0, species === "frog" ? -0.37 : species === "owl" ? -0.04 : species === "rabbit" ? 0.06 : -0.03, 0.5, 0.11, 0.05), INK, true); add(box(-0.22, species === "frog" ? -0.4 : -0.07, 0.12, 0.02, 0.01), mix(INK, WHITE, 0.35), true); }
  return L;
}

/** rows x cols of half-blocks (defaults 12 x 24: a 24 x 24 pixel portrait). */
export function face(species: string, body: RGB, second: RGB, s: FaceState, cols = 24, rows = 12): string[] {
  const dim = s.active ? 1 : 0.38, layers = build(species, body, second, s).reverse();
  const bob = s.active ? s.kick * 0.07 : 0, tilt = s.active ? Math.sin((s.bar ?? 0) * 6.2832) * 0.05 : 0, ct = Math.cos(tilt), sn = Math.sin(tilt), H = rows * 2;
  const px: (RGB | null)[] = new Array(cols * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < cols; i++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x0 = ((i + ox) / cols) * 2 - 1, y0 = ((j + oy) / H) * 2 - 1 - bob, x = x0 * ct + y0 * sn, y = -x0 * sn + y0 * ct;
      const hit = layers.find((l) => l.in(x, y)); if (!hit) continue;
      const shade = hit.flat ? 1 : Math.max(0.62, Math.min(1.12, 0.92 - (x * 0.22 + y * 0.3)));   // lit from the top left
      r += hit.rgb[0] * shade; g += hit.rgb[1] * shade; b += hit.rgb[2] * shade; n++;
    }
    if (n < 2) { px[j * cols + i] = null; continue; }
    const a = (n / 4) * dim, bg = 20 * (1 - n / 4);   // soft edge: partial coverage fades toward the terminal's dark
    px[j * cols + i] = [Math.min(255, (r / n) * a + bg), Math.min(255, (g / n) * a + bg), Math.min(255, (b / n) * a + bg)].map(Math.round);
  }
  const out: string[] = [];
  for (let y = 0; y < H; y += 2) {
    let line = "", fg = "", bgc = "";
    for (let x = 0; x < cols; x++) {
      const t = px[y * cols + x], b = px[(y + 1) * cols + x];
      const wantBg = t && b ? `48;2;${b[0]};${b[1]};${b[2]}` : "49", wantFg = t ? `38;2;${t[0]};${t[1]};${t[2]}` : b ? `38;2;${b[0]};${b[1]};${b[2]}` : fg;
      if (wantBg !== bgc) { line += `\x1b[${wantBg}m`; bgc = wantBg; }
      if (wantFg !== fg) { line += `\x1b[${wantFg}m`; fg = wantFg; }
      line += t ? "▀" : b ? "▄" : " ";
    }
    out.push(line + "\x1b[39m\x1b[49m");
  }
  return out;
}
