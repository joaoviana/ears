// DJ faces, rendered rather than drawn: each species is a small stack of shapes (ellipses, triangles, rounded boxes)
// in a -1..1 square, shaded from a light at the top left, supersampled 2x2 for soft edges, and written out as
// half-blocks (one text cell = two pixels, foreground over background). Because it's geometry and not a bitmap, it
// moves continuously: the head bobs with the kick, ears twitch on the hats, eyes blink and glance, the mouth opens
// as wide as the clap is loud.
export const SPECIES = ["cat", "dog", "fox", "wolf", "owl", "bear", "rabbit", "bat", "moth", "frog", "axolotl", "robot", "alien", "skull"];
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
// Everything was drawn to the edge of the frame, so ears met the border and every species read as the same blob.
// Sampling a slightly wider square shrinks the drawing and leaves air around it, which is what a silhouette needs.
const ZOOM = 1.2;

function build(species: string, body: RGB, second: RGB, s: FaceState): Layer[] {
  const L: Layer[] = [], add = (t: Test, rgb: RGB, flat = false) => L.push({ in: t, rgb, flat });
  const light = mix(body, WHITE, 0.55), dark = mix(body, INK, 0.45), ear = s.hat * 0.12, open = 0.015 + s.snare * 0.07;
  const glance = Math.sin((s.t ?? 0) * 0.7) * 0.025, lid = s.blink ? 0.12 : 1;
  const eyes = (ex: number, ey: number, rx: number, ry: number, pupil = 0.5, slit = false, tilt = 0) => { for (const d of [-1, 1]) { add(ell(d * ex, ey, rx, ry * lid, d * tilt), WHITE, true); add(ell(d * ex + glance, ey + 0.01, slit ? rx * 0.3 : rx * pupil, ry * lid * (slit ? 0.92 : pupil), d * tilt), INK, true); if (!s.blink) add(ell(d * ex + glance - rx * 0.22, ey - ry * 0.3, rx * 0.16, ry * 0.16), WHITE, true); } };
  const shoulders = () => {
    add(ell(0, 1.12, 0.78, 0.42), dark);
    for (const d of [-1, 1]) { add(tri(d * 0.76, 0.74, d * 0.15, 0.76, d * 0.48, 1.12), mix(body, INK, 0.5)); add(tri(d * 0.68, 0.78, d * 0.27, 0.81, d * 0.48, 0.94), mix(second, INK, 0.35)); }
    add(box(0, 0.91, 0.2, 0.2, 0.035), mix(body, INK, 0.62));
  };
  const cans = () => { if (s.cans === false) return; const glow = mix(mix(second, INK, 0.45), second, 0.35 + s.hat * 0.65); add(both(minus(ell(0, -0.02, 0.8, 0.78), ell(0, -0.02, 0.69, 0.67)), (_x, y) => y < 0.0), mix(second, INK, 0.5)); for (const d of [-1, 1]) { add(ell(d * 0.72, 0.1, 0.15, 0.24), glow); add(ell(d * 0.74, 0.1, 0.07, 0.13), mix(glow, INK, 0.5)); add(ell(d * 0.735, 0.045, 0.028, 0.07), mix(glow, WHITE, 0.65), true); } };

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
      add(tri(-0.39, -0.34, 0.39, -0.34, 0, -0.02), mix(body, INK, 0.38));
      add(box(0, -0.42, 0.29, 0.075, 0.025), dark); add(box(0, -0.41, 0.12, 0.025, 0.012), mix(second, WHITE, 0.42), true);
      for (const d of [-1, 1]) { add(ell(d * 0.27, -0.04, 0.27, 0.28), light); add(ell(d * 0.27, -0.04, 0.2, 0.21 * lid), WHITE, true); add(ell(d * 0.27 + glance, -0.04, 0.11, 0.12 * lid), INK, true); if (!s.blink) add(ell(d * 0.27 + glance - 0.04, -0.09, 0.035, 0.035), WHITE, true); }
      add(tri(-0.07, 0.12, 0.07, 0.12, 0, 0.3 + open), second, true);
      for (let i = -2; i <= 2; i++) for (const r of [0, 1]) add(tri(i * 0.17 + r * 0.085 - 0.06, 0.42 + r * 0.1, i * 0.17 + r * 0.085 + 0.06, 0.42 + r * 0.1, i * 0.17 + r * 0.085, 0.5 + r * 0.1), dark);
      break; }
    case "bear": {
      for (const d of [-1, 1]) { add(ell(d * 0.5, -0.46 - ear * 0.3, 0.2, 0.2), body); add(ell(d * 0.5, -0.45 - ear * 0.3, 0.11, 0.11), second); }
      cans(); add(ell(0, 0.08, 0.66, 0.58), body); add(ell(0, 0.32, 0.3, 0.24), light);
      eyes(0.25, -0.05, 0.105, 0.115, 0.68); add(ell(0, 0.22, 0.11, 0.07), INK, true); add(box(0, 0.33, 0.008, 0.05, 0.004), INK, true); add(ell(0, 0.42, 0.1, open), INK, true);
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
    case "wolf": {
      for (const d of [-1, 1]) { add(tri(d * 0.58, -0.2, d * (0.5 + ear), -1.0, d * 0.14, -0.4), body); add(tri(d * 0.5, -0.32, d * (0.46 + ear), -0.8, d * 0.24, -0.44), dark); }
      cans(); add(ell(0, 0.0, 0.58, 0.44), body);
      add(tri(-0.46, 0.06, 0.46, 0.06, 0, 0.86), body);                                     // the long muzzle is the whole silhouette
      add(tri(-0.19, 0.26, 0.19, 0.26, 0, 0.82), mix(body, WHITE, 0.45));
      eyes(0.28, -0.1, 0.1, 0.075, 0.6, false, 0.32);
      add(ell(0, 0.68, 0.085, 0.06), INK, true); add(ell(0, 0.54, 0.05, open * 0.8), INK, true);
      break; }
    case "bat": {
      for (const d of [-1, 1]) { add(tri(d * 0.3, -0.22, d * (0.98 + ear), -0.92, d * 0.6, -0.02), body); add(tri(d * 0.38, -0.28, d * (0.84 + ear), -0.76, d * 0.55, -0.12), second); }
      cans(); add(ell(0, 0.14, 0.48, 0.44), body); add(ell(0, 0.34, 0.25, 0.17), light);
      eyes(0.2, 0.04, 0.11, 0.12, 0.55);
      add(tri(-0.06, 0.26, 0.06, 0.26, 0, 0.34), second, true); add(ell(0, 0.46, 0.1, open), INK, true);
      for (const d of [-1, 1]) add(tri(d * 0.04, 0.44, d * 0.1, 0.44, d * 0.07, 0.58), WHITE, true);   // fangs
      break; }
    case "moth": {
      for (const d of [-1, 1]) for (let k = 0; k < 6; k++) { const t = k / 5; add(ell(d * (0.18 + t * 0.6), -0.4 - t * 0.46, 0.115 - t * 0.035, 0.045), mix(second, body, t * 0.8)); }
      cans(); add(ell(0, 0.12, 0.56, 0.48), body);
      for (const d of [-1, 1]) { add(ell(d * 0.26, -0.02, 0.27, 0.28), mix(body, INK, 0.6)); add(ell(d * 0.26 + glance, -0.02, 0.13, 0.14 * lid), mix(second, WHITE, 0.45), true); if (!s.blink) add(ell(d * 0.26 + glance - 0.05, -0.08, 0.04, 0.04), WHITE, true); }
      add(ell(0, 0.4, 0.36, 0.17), light); add(ell(0, 0.44, 0.09, open), INK, true);
      break; }
    case "axolotl": {
      for (const d of [-1, 1]) for (const k of [0, 1, 2]) { const a = -0.34 + k * 0.3; add(ell(d * (0.74 + ear * 0.6), a, 0.21, 0.075, d * (0.32 - k * 0.32)), second); add(ell(d * 0.6, a, 0.1, 0.05), mix(second, WHITE, 0.35)); }
      cans(); add(ell(0, 0.12, 0.58, 0.48), body); add(ell(0, 0.3, 0.4, 0.23), light);
      eyes(0.3, -0.14, 0.08, 0.085, 0.78);
      add(both(minus(ell(0, 0.12, 0.4, 0.3 + open), ell(0, 0.06, 0.42, 0.28)), (_x, y) => y > 0.22), INK, true);   // a wide permanent smile
      for (const d of [-1, 1]) add(ell(d * 0.4, 0.26, 0.1, 0.055), mix(second, WHITE, 0.3), true);
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

// Quadrant blocks: one character is a 2 x 2 pixel cell, so a portrait gets twice the horizontal resolution of
// half-blocks in the same footprint. The cost is that a character carries only two colours, so the four pixels are
// split into two groups by the most distant pair and each group is painted with its mean. Bits: TL=1 TR=2 BL=4 BR=8.
const QUAD = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█";
const dist = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const mean = (xs: RGB[]): RGB => xs.reduce((acc, c) => acc.map((v, i) => v + c[i] / xs.length), [0, 0, 0]).map(Math.round);
const BRAILLE_BITS = [0, 3, 1, 4, 2, 5, 6, 7];   // row-major 2 x 4 samples → Unicode dot order
type CellMode = boolean | "quad" | "braille";

/** rows x cols of terminal cells. Braille samples 2 x 4 pixels per cell; quad keeps the older 2 x 2 path. */
export function face(species: string, body: RGB, second: RGB, s: FaceState, cols = 24, rows = 12, mode: CellMode = false): string[] {
  const dim = s.active ? 1 : 0.38, layers = build(species, body, second, s).reverse();
  const quad = mode === true || mode === "quad", braille = mode === "braille";
  const bob = s.active ? s.kick * 0.07 : 0, tilt = s.active ? Math.sin((s.bar ?? 0) * 6.2832) * 0.05 : 0, ct = Math.cos(tilt), sn = Math.sin(tilt), H = rows * (braille ? 4 : 2);
  const textCols = cols; if (quad || braille) cols *= 2;
  const px: (RGB | null)[] = new Array(cols * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < cols; i++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x0 = (((i + ox) / cols) * 2 - 1) * ZOOM, y0 = ((((j + oy) / H) * 2 - 1) - bob) * ZOOM, x = x0 * ct + y0 * sn, y = -x0 * sn + y0 * ct;
      const hit = layers.find((l) => l.in(x, y)); if (!hit) continue;
      const shade = hit.flat ? 1 : Math.max(0.62, Math.min(1.12, 0.92 - (x * 0.22 + y * 0.3)));   // lit from the top left
      r += hit.rgb[0] * shade; g += hit.rgb[1] * shade; b += hit.rgb[2] * shade; n++;
    }
    if (n < 2) { px[j * cols + i] = null; continue; }
    const a = (n / 4) * dim, bg = 20 * (1 - n / 4);   // soft edge: partial coverage fades toward the terminal's dark
    px[j * cols + i] = [Math.min(255, (r / n) * a + bg), Math.min(255, (g / n) * a + bg), Math.min(255, (b / n) * a + bg)].map(Math.round);
  }
  // Rim light and aura. A flat top-left shade read as a sticker on a projector; a neon edge in the palette's second
  // colour gives every silhouette a lit outline, and the active face sits in a soft halo that breathes with the kick.
  // Both are computed on the pixel grid after rasterising, so every species gets them for free.
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= cols || j >= H ? null : px[j * cols + i]);
  const neon = mix(second, WHITE, 0.35).map((v) => v * dim), halo = mix([18, 18, 26], second, 1);
  const rim: (RGB | null)[] = px.slice();
  for (let j = 0; j < H; j++) for (let i = 0; i < cols; i++) {
    const p = at(i, j);
    if (p) { if (!at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1)) rim[j * cols + i] = mix(p, neon, 0.3).map(Math.round); continue; }
    // Braille is useful for a crisp 2 x 4 silhouette, but sparse halo dots read as visual noise around a face.
    if (!s.active || braille) continue;
    const d1 = at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1) || at(i - 1, j - 1) || at(i + 1, j - 1) || at(i - 1, j + 1) || at(i + 1, j + 1);
    const d2 = !d1 && (at(i - 2, j) || at(i + 2, j) || at(i, j - 2) || at(i, j + 2) || at(i - 2, j - 1) || at(i + 2, j - 1) || at(i - 2, j + 1) || at(i + 2, j + 1) || at(i - 1, j - 2) || at(i + 1, j - 2) || at(i - 1, j + 2) || at(i + 1, j + 2));
    const k = d1 ? 0.07 + s.kick * 0.2 : d2 ? 0.025 + s.kick * 0.07 : 0;
    if (k > 0) rim[j * cols + i] = mix([12, 12, 18], halo, k).map(Math.round);
  }
  px.splice(0, px.length, ...rim);
  const out: string[] = [];
  if (braille) {
    for (let y = 0; y < H; y += 4) {
      let line = "", fg = "", bgc = "";
      for (let x = 0; x < textCols; x++) {
        const cell: (RGB | null)[] = [];
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) cell.push(px[(y + dy) * cols + x * 2 + dx]);
        const filled = cell.map((c, k) => (c ? k : -1)).filter((k) => k >= 0);
        let mask = 0, fgc: RGB | null = null, bgcol: RGB | null = null, glyph = " ";
        if (filled.length) {
          let dots = filled;
          // Never dither a filled cell: dots inside eyes and cheeks look like holes. Braille is reserved for the
          // silhouette edge; solid regions stay calm, readable blocks with their averaged colour.
          if (filled.length === 8) { fgc = mean(cell as RGB[]); glyph = "█"; dots = []; }
          else fgc = mean(filled.map((k) => cell[k]!));
          if (dots.length) { mask = dots.reduce((m, k) => m | (1 << BRAILLE_BITS[k]), 0); glyph = String.fromCodePoint(0x2800 + mask); }
        }
        const wantBg = bgcol ? `48;2;${bgcol[0]};${bgcol[1]};${bgcol[2]}` : "49", wantFg = fgc ? `38;2;${fgc[0]};${fgc[1]};${fgc[2]}` : fg;
        if (wantBg !== bgc) { line += `\x1b[${wantBg}m`; bgc = wantBg; }
        if (wantFg !== fg) { line += `\x1b[${wantFg}m`; fg = wantFg; }
        line += glyph;
      }
      out.push(line + "\x1b[39m\x1b[49m");
    }
    return out;
  }
  if (quad) {
    for (let y = 0; y < H; y += 2) {
      let line = "", fg = "", bgc = "";
      for (let x = 0; x < textCols; x++) {
        const cell = [px[y * cols + x * 2], px[y * cols + x * 2 + 1], px[(y + 1) * cols + x * 2], px[(y + 1) * cols + x * 2 + 1]];
        const filled = cell.map((c, k) => (c ? k : -1)).filter((k) => k >= 0);
        let mask = 0, fgc: RGB | null = null, bgcol: RGB | null = null;
        if (filled.length === 0) { /* empty */ }
        else if (filled.length < 4) { mask = filled.reduce((m, k) => m | (1 << k), 0); fgc = mean(filled.map((k) => cell[k]!)); }
        else {
          // the most distant pair seeds two groups; if the cell is nearly flat it is one full block of the mean
          let a = 0, b = 1, best = -1;
          for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) { const d = dist(cell[p]!, cell[q]!); if (d > best) { best = d; a = p; b = q; } }
          if (best < 2200) { mask = 15; fgc = mean(cell as RGB[]); }   // a smooth gradient is one block, not two-tone noise
          else {
            const ga: number[] = [], gb: number[] = [];
            for (let k = 0; k < 4; k++) (dist(cell[k]!, cell[a]!) <= dist(cell[k]!, cell[b]!) ? ga : gb).push(k);
            mask = ga.reduce((m, k) => m | (1 << k), 0); fgc = mean(ga.map((k) => cell[k]!)); bgcol = mean(gb.map((k) => cell[k]!));
          }
        }
        const wantBg = bgcol ? `48;2;${bgcol[0]};${bgcol[1]};${bgcol[2]}` : "49", wantFg = fgc ? `38;2;${fgc[0]};${fgc[1]};${fgc[2]}` : fg;
        if (wantBg !== bgc) { line += `\x1b[${wantBg}m`; bgc = wantBg; }
        if (wantFg !== fg) { line += `\x1b[${wantFg}m`; fg = wantFg; }
        line += QUAD[mask];
      }
      out.push(line + "\x1b[39m\x1b[49m");
    }
    return out;
  }
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
