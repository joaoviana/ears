// A shader whose framebuffer is text. Three kinds of look:
//   field   a function of (x, y) evaluated per cell, like a fragment shader (some raymarch a 3D scene)
//   braille line art drawn on a dot canvas with 2x4 dots per cell, so 8x the resolution of the grid
//   glyph   the performer's own code is the texture, and a field lights it
// Every cell gets its own 24-bit colour from a cosine palette. Looks and palettes are picked by name,
// so an agent chooses from a list and never writes drawing code.
export interface Pulse { kick: number; snare: number; hat: number; stab: number; bar: number; barN: number; bands: number[] }
import { audio } from "./audio.ts";
export interface Banner { lines: string[]; rgb: number[]; t: number }   // t runs 0..1 over the banner's life
export interface Ctx { code: string; banner?: Banner | null }

const LONG = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
// "pixels" isn't a ramp: each cell is a ▀ whose foreground is one sample and whose background is the one below it,
// so field looks render at twice the vertical resolution, as colour instead of glyph density
const RAMPS = { ascii: LONG, pixels: " ", blocks: " ░░▒▒▓▓██", dots: " ⠁⠂⠃⠇⠧⠷⡷⣷⣿", code: " .·:;=+x%#@" };
export type Ramp = keyof typeof RAMPS;

// ---- colour --------------------------------------------------------------------------------
type V3 = [number, number, number];
const PALETTES: Record<string, [V3, V3, V3, V3]> = {
  ember: [[0.85, 0.55, 0.42], [0.15, 0.3, 0.3], [1, 1, 1], [0.0, 0.12, 0.3]],       // gold <-> coral, no teal
  neon:  [[0.65, 0.55, 0.7], [0.35, 0.45, 0.3], [1, 1, 1], [0.0, 0.33, 0.67]],
  ice:   [[0.55, 0.72, 0.85], [0.3, 0.25, 0.15], [1, 1, 0.8], [0.55, 0.6, 0.7]],
  acid:  [[0.6, 0.75, 0.3], [0.4, 0.25, 0.3], [1.2, 0.8, 1], [0.2, 0.0, 0.5]],
  sunset: [[0.8, 0.45, 0.55], [0.2, 0.35, 0.35], [1, 1, 1], [0.0, 0.1, 0.55]],
  mono:  [[0.8, 0.8, 0.8], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
};
export const PALETTE_NAMES = Object.keys(PALETTES);
/** The interface wears the same palette as the field: two accents per palette, neutrals shared. */
export const UI: Record<string, { a: string; b: string }> = {
  ember: { a: "#ffb86b", b: "#ff6f61" }, neon: { a: "#ff5fd2", b: "#6ee7ff" }, ice: { a: "#8fd3ff", b: "#c7b8ff" },
  acid: { a: "#c6f24e", b: "#ff7ab8" }, sunset: { a: "#ff8a5c", b: "#ffd166" }, mono: { a: "#f0f0f0", b: "#9a9aa6" },
};
export const NEUTRAL = { text: "#e8e6f0", dim: "#8a8799", faint: "#3d3b4a" };
let pal = PALETTES.ember;
/** Inigo Quilez's cosine palette, scaled by luminance, packed to one int. */
function colour(h: number, lum: number): number {
  const l = (0.42 + 0.58 * Math.max(0, Math.min(1, lum))) * 255;   // density carries the dark end; colour never goes invisible
  const c = (i: number) => Math.max(0, Math.min(255, (pal[0][i] + pal[1][i] * Math.cos(6.2832 * (pal[2][i] * h + pal[3][i]))) * l)) | 0;
  return (c(0) << 16) | (c(1) << 8) | c(2);
}

// ---- noise ---------------------------------------------------------------------------------
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number, oct = 4) {
  let v = 0, amp = 0.5;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x, y); const nx = 1.6 * x + 1.2 * y; y = -1.2 * x + 1.6 * y; x = nx; amp *= 0.5; }
  return v;
}

// ---- field looks: return [luminance 0..1, hue] per cell --------------------------------------
type Field = (x: number, y: number, t: number, s: Pulse) => [number, number];
const out: [number, number] = [0, 0];

const FIELDS: Record<string, Field> = {
  // 28-step raymarch through a gyroid lattice with a tunnel bored down the middle
  gyroid: (x, y, t, s) => {
    const ang = t * 0.13 + s.barN * 0.4, ca = Math.cos(ang), sa = Math.sin(ang);
    x *= 0.5; y *= 0.62;
    let dx = x * ca - y * sa, dy = x * sa + y * ca, dz = 1.0; const il = 1 / Math.hypot(dx, dy, dz); dx *= il; dy *= il; dz *= il;
    const oz = t * 1.3, thick = 0.04 + s.bands[0] * 0.25 + s.kick * 0.05;
    let d = 1, dist = 0, glow = 0, i = 0;
    for (; i < 28; i++) {
      const px = dx * dist, py = dy * dist, pz = oz + dz * dist, k = 3.4;
      const g = Math.abs(Math.sin(px * k) * Math.cos(py * k) + Math.sin(py * k) * Math.cos(pz * k) + Math.sin(pz * k) * Math.cos(px * k)) / 3 - thick;
      d = Math.max(g, 0.62 - Math.hypot(px, py));
      glow += Math.exp(-Math.abs(d) * 14) * 0.012;
      if (d < 0.004 || dist > 9) break;
      dist += d * 0.9;
    }
    const fog = Math.exp(-dist * 0.38), ao = 1 - i / 28;
    const lum = fog * ao * ao + glow * (0.6 + s.hat * 1.2);
    out[0] = Math.pow(Math.min(1, lum * 1.7), 0.85) * (0.8 + s.kick * 0.3); out[1] = dist * 0.13 + t * 0.05;
    return out;
  },
  // a lit torus that turns once per bar and swells on the kick, over a star field
  torus: (x, y, t, s) => {
    const a = s.bar * 6.2832 + s.barN * 0.0, b = t * 0.37, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const R = 0.62, r = 0.22 + s.kick * 0.09 + s.bands[0] * 0.15;
    const sdf = (px: number, py: number, pz: number) => {
      const y1 = py * ca - pz * sa, z1 = py * sa + pz * ca, x2 = px * cb - z1 * sb, z2 = px * sb + z1 * cb;
      return Math.hypot(Math.hypot(x2, z2) - R, y1) - r;
    };
    let dx = x * 0.55, dy = y * 0.75, dz = 1.6; const il = 1 / Math.hypot(dx, dy, dz); dx *= il; dy *= il; dz *= il;
    let dist = 0, d = 1;
    for (let i = 0; i < 28; i++) { d = sdf(dx * dist, dy * dist, dz * dist - 2.2); if (d < 0.005 || dist > 5) break; dist += d; }
    if (d < 0.02) {
      const px = dx * dist, py = dy * dist, pz = dz * dist - 2.2, e = 0.01;
      const nx = sdf(px + e, py, pz) - d, ny = sdf(px, py + e, pz) - d, nz = sdf(px, py, pz + e) - d, nl = 1 / (Math.hypot(nx, ny, nz) + 1e-9);
      const diff = Math.max(0, (nx * -0.5 + ny * -0.6 + nz * -0.62) * nl), rim = Math.pow(1 - Math.abs(nz * nl), 3);
      out[0] = 0.12 + diff * 0.85 + rim * (0.3 + s.snare * 0.7); out[1] = diff * 0.5 + t * 0.04 + rim * 0.3;
    } else {
      const star = hash(Math.floor(x * 40 + t * 2), Math.floor(y * 22));
      out[0] = star > 0.985 ? 0.05 + s.hat * 0.12 : 0; out[1] = star * 3;
    }
    return out;
  },
  // three nested fbm passes feeding each other's coordinates: smoke that the bass stirs
  warp: (x, y, t, s) => {
    const sc = 0.4 + s.bands[0] * 0.3, px = x * sc, py = y * sc * 1.4;
    const qx = fbm(px + t * 0.08, py, 3), qy = fbm(px + 5.2, py + 1.3 - t * 0.06, 3);
    const w = 1.3 + s.kick * 0.6 + s.bands[2] * 3;
    const rx = fbm(px + w * qx + 1.7, py + w * qy + 9.2 + t * 0.12, 3), ry = fbm(px + w * qx + 8.3, py + w * qy + 2.8, 3);
    const f = fbm(px + w * rx, py + w * ry, 3);
    out[0] = Math.pow(Math.max(0, f * 1.9 - 0.35), 1.6) * (0.9 + s.kick * 0.4) + s.snare * 0.1; out[1] = f * 0.8 + qx * 0.6 + t * 0.03;
    return out;
  },
  // interference between two ring systems plus kaleidoscope folds that add one per 8 bars
  moire: (x, y, t, s) => {
    const folds = 3 + (Math.floor(s.barN / 8) % 5), seg = 6.2832 / folds;
    let a = Math.atan2(y, x) + s.bar * seg; const r = Math.hypot(x, y);
    a = Math.abs(((a % seg) + seg) % seg - seg / 2);
    const kx = Math.cos(a) * r, ky = Math.sin(a) * r;
    const m = Math.sin(Math.hypot(kx - 0.35, ky) * (6 + s.kick * 1.5) - t) * Math.sin(Math.hypot(kx + 0.3 * Math.sin(t * 0.3), ky - 0.3) * 5 + t * 0.6);
    out[0] = Math.pow(0.5 + 0.5 * m, 2.2) * (1 - r * 0.1) + s.hat * 0.06; out[1] = r * 0.7 + a + t * 0.05;
    return out;
  },
};

// ---- braille canvas -------------------------------------------------------------------------
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
class Dots {
  bits: Uint8Array; col: Int32Array; W: number; H: number;
  constructor(public w: number, public h: number) { this.bits = new Uint8Array(w * h); this.col = new Int32Array(w * h); this.W = w * 2; this.H = h * 4; }
  set(x: number, y: number, c: number) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y >> 2) * this.w + (x >> 1); this.bits[i] |= DOT[y & 3][x & 1]; this.col[i] = c;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    if (n > 4000) return;
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  circle(cx: number, cy: number, r: number, c: number) { const n = Math.max(12, r * 5); for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832; this.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95, c); } }
}

const PHI = 1.618034;
const ICO: V3[] = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
const ICO_E: [number, number][] = [];
for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (Math.abs(Math.hypot(ICO[i][0] - ICO[j][0], ICO[i][1] - ICO[j][1], ICO[i][2] - ICO[j][2]) - 2) < 0.01) ICO_E.push([i, j]);
const rings: { born: number; hue: number }[] = [];
let lastSnare = 0, lastKick = 0;

type Brush = (c: Dots, t: number, s: Pulse) => void;
const BRAILLE: Record<string, Brush> = {
  // two nested icosahedra counter-rotating, shock rings on the snare, hats as orbiting sparks
  wire: (c, t, s) => {
    const cx = c.W / 2, cy = c.H / 2, R = Math.min(c.W / 2, c.H) * 0.42;
    if (s.snare > 0.9 && lastSnare <= 0.9) rings.push({ born: t, hue: t * 0.1 }); lastSnare = s.snare;
    for (let k = rings.length - 1; k >= 0; k--) { const age = t - rings[k].born; if (age > 1.6) rings.splice(k, 1); else c.circle(cx, cy, age * c.W * 0.4, colour(rings[k].hue, 1 - age / 1.6)); }
    for (const [scale, dir, hue] of [[1 + s.kick * 0.35, 1, 0], [0.5 + s.stab * 0.3, -1.7, 0.45]] as const) {
      const ay = (s.bar + s.barN) * 1.5708 * dir, ax = t * 0.31 * dir, cy_ = Math.cos(ay), sy = Math.sin(ay), cxr = Math.cos(ax), sx = Math.sin(ax);
      const pts = ICO.map(([x, y, z]) => {
        const x1 = x * cy_ - z * sy, z1 = x * sy + z * cy_, y2 = y * cxr - z1 * sx, z2 = y * sx + z1 * cxr, p = 3.2 / (3.2 + z2 * 0.5);
        return [cx + x1 * p * R * scale * 0.55, cy + y2 * p * R * scale * 0.55 * 0.95, z2] as V3;
      });
      for (const [i, j] of ICO_E) c.line(pts[i][0], pts[i][1], pts[j][0], pts[j][1], colour(hue + t * 0.03, 0.55 - (pts[i][2] + pts[j][2]) * 0.14));
    }
    for (let i = 0; i < 28; i++) { const a = i * 2.399 + t * (0.3 + (i % 5) * 0.07), r = R * (1.05 + 0.5 * hash(i, 3)) * (1 + s.hat * 0.25); c.set(cx + Math.cos(a) * r * 1.9, cy + Math.sin(a) * r * 0.9, colour(i * 0.07, 0.4 + s.hat * 0.6)); }
  },
  // an outrun horizon: the five bands are the mountain range, the grid scrolls one square per beat
  terrain: (c, t, s) => {
    const hor = c.H * 0.42, cx = c.W / 2;
    const sunR = c.H * 0.3 * (1 + s.kick * 0.12);
    for (let y = -sunR; y < 0; y += 1) { if (Math.floor((y + sunR) / 3 + t * 2) % 3 === 0 && y > -sunR * 0.55) continue; const w = Math.sqrt(sunR * sunR - y * y) * 2.1; for (let x = -w; x < w; x += 1) c.set(cx + x, hor + y, colour(0.02 + (y / sunR) * 0.12, 0.95)); }
    const band = (u: number) => { const f = Math.min(30.999, Math.max(0, u * 31)), i = Math.floor(f), k = f - i; return (audio.spec[i] * (1 - k) + audio.spec[i + 1] * k) * 0.42; };   // the FFT, bass at the centre
    for (let zi = 0; zi < 14; zi++) {
      const z = 0.35 + ((zi + 1 - ((s.bar * 4) % 1)) / 14) * 3.2, p = 1 / z; let px = NaN, py = 0;
      for (let xi = -30; xi <= 30; xi++) {
        const u = Math.abs(xi) / 30, hgt = (band(u) * 3.2 + vnoise(xi * 0.45, zi + Math.floor(s.bar * 4 + s.barN * 4)) * 0.5) * Math.min(1, u * 3) * (0.7 + s.kick * 0.3);
        const X = cx + xi * 0.13 * p * c.W * 0.5, Y = hor + (0.55 - hgt * 0.45) * p * c.H * 0.55;
        if (!Number.isNaN(px)) c.line(px, py, X, Y, colour(0.5 + z * 0.12, 1.1 - z * 0.27)); px = X; py = Y;
      }
    }
    for (let xi = -30; xi <= 30; xi += 5) c.line(cx + xi * 0.13 * (1 / 0.35) * c.W * 0.5, c.H, cx + xi * 0.13 * (1 / 3.55) * c.W * 0.5, hor + 0.55 * (1 / 3.55) * c.H * 0.55, colour(0.62, 0.4));
  },
  // The actual master bus, 43 ms of it, drawn in phase space: x is the signal now, y is the same signal a few
  // milliseconds later. A pure bass note traces an ellipse, harmonics fold it into knots, noise turns it to dust.
  // Three delays give three nested figures. Nothing here is invented: silence draws a dot.
  orbit: (c, t, s) => {
    const m = audio.mono, n = m.length, cx = c.W / 2, cy = c.H / 2;
    const gain = 0.85 / Math.max(0.08, audio.level * 2.6);
    [[70, 0.0, 1], [31, 0.33, 0.72], [11, 0.62, 0.45]].forEach(([tau, hue, size]) => {
      let px = NaN, py = 0;
      for (let i = 0; i + tau < n; i++) {
        const X = cx + m[i] * gain * size * c.W * 0.46, Y = cy - m[i + tau] * gain * size * c.H * 0.46;
        const col = colour(hue + i / n * 0.35 + t * 0.03, 0.35 + (i / n) * 0.65 + s.kick * 0.2);
        if (!Number.isNaN(px) && Math.hypot(X - px, Y - py) < c.W * 0.12) c.line(px, py, X, Y, col); else c.set(X, Y, col);
        px = X; py = Y;
      }
    });
    // the stereo field as a thin goniometer along the bottom: left-right difference against the sum
    for (let i = 0; i < n; i += 2) c.set(cx + (audio.l[i] - audio.r[i]) * gain * c.W * 1.2, c.H - 3 - Math.abs(audio.mono[i]) * gain * c.H * 0.12, colour(0.5, 0.5));
  },
  // the waveform itself, mirrored into a ring: radius is the signal, one lap is 43 ms
  ring: (c, t, s) => {
    const m = audio.mono, n = m.length, cx = c.W / 2, cy = c.H / 2, gain = 0.6 / Math.max(0.08, audio.level * 2.6);
    for (const [base, hue] of [[0.62, 0], [0.34, 0.4]] as const) {
      let px = NaN, py = 0;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * 6.2832 + t * 0.2 + s.bar * 6.2832 * (base > 0.5 ? 1 : -1), v = m[i % n] * gain, r = (base + v * 0.3) * (1 + s.kick * 0.06);
        const X = cx + Math.cos(a) * r * c.W * 0.5 * 0.62, Y = cy + Math.sin(a) * r * c.H * 0.5;
        if (!Number.isNaN(px)) c.line(px, py, X, Y, colour(hue + i / n * 0.5 + t * 0.04, 0.5 + Math.abs(v))); px = X; py = Y;
      }
    }
    for (let b = 0; b < audio.spec.length; b++) { const a = (b / audio.spec.length) * 6.2832 - 1.5708, r0 = 0.12, r1 = 0.12 + audio.spec[b] * 0.17; c.line(cx + Math.cos(a) * r0 * c.W * 0.31, cy + Math.sin(a) * r0 * c.H * 0.5, cx + Math.cos(a) * r1 * c.W * 0.31, cy + Math.sin(a) * r1 * c.H * 0.5, colour(b / 32, 0.9)); }
  },
};

// ---- waterfall: the listening report as a picture --------------------------------------------
const history: Float32Array[] = [];
function waterfall(w: number, h: number, s: Pulse, chars: string[]): { ch: string[]; col: number[] } {
  history.unshift(Float32Array.from(audio.spec));
  if (history.length > 200) history.pop();
  const ch: string[] = [], col: number[] = [], B = audio.spec.length;
  for (let j = 0; j < h; j++) {
    const row = history[Math.min(history.length - 1, j)];
    for (let i = 0; i < w; i++) {
      const u = Math.abs((i / (w - 1)) * 2 - 1), f = Math.min(B - 1.001, u * (B - 1)), k = Math.floor(f);
      const v = (row[k] * (1 - (f - k)) + row[k + 1] * (f - k)) * (1 - (j / h) * 0.5) + (j === 0 && u < 0.08 ? s.kick * 0.3 : 0);
      ch.push(chars[Math.max(0, Math.min(chars.length - 1, Math.floor(v * chars.length)))]); col.push(colour(u * 0.7 + j * 0.012, v * 1.2));
    }
  }
  return { ch, col };
}

export const LOOKS = [...Object.keys(FIELDS), ...Object.keys(BRAILLE), "codefield", "waterfall"];

interface Cells { ch: string[]; col: number[]; bg?: Int32Array }
const shade = (c: number, k: number) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k);

function cells(look: string, ramp: Ramp, palette: string, w: number, h: number, t: number, s: Pulse, ctx: Ctx): Cells {
  pal = PALETTES[palette] ?? PALETTES.ember;
  const chars = [...RAMPS[ramp === "pixels" ? "blocks" : ramp]], n = w * h; let ch: string[] = new Array(n), col: number[] = new Array(n);
  const aspect = w / h / 2.1;   // a terminal cell is about twice as tall as it is wide

  if (BRAILLE[look]) {
    const c = new Dots(w, h); BRAILLE[look](c, t, s);
    for (let i = 0; i < n; i++) { ch[i] = c.bits[i] ? String.fromCharCode(0x2800 + c.bits[i]) : " "; col[i] = c.col[i]; }
  } else if (look === "waterfall") {
    ({ ch, col } = waterfall(w, h, s, chars));
  } else if (look === "codefield") {
    // the performer's code, tiled, lit by a plasma and by a shockwave that leaves the centre on every kick
    const text = (ctx.code.replace(/\s+/g, " ").trim() || "~d.(\\d1, \\instrument, \\kick) ") + "   ";
    if (s.kick > 0.9 && lastKick <= 0.9) rings.push({ born: t, hue: 0 }); lastKick = s.kick;
    while (rings.length && t - rings[0].born > 1.4) rings.shift();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = ((i / (w - 1)) * 2 - 1) * aspect, y = (j / (h - 1)) * 2 - 1, r = Math.hypot(x, y);
      let v = 0.22 + 0.2 * (Math.sin(x * 3 + t * 0.7) + Math.sin(y * 4 - t * 0.5) + Math.sin((x + y) * 2.5 + t * 0.3)) / 3 + fbm(x * 1.5 + t * 0.1, y * 1.5) * 0.35;
      for (const ring of rings) { const age = t - ring.born; v += Math.exp(-Math.abs(r - age * 1.6) * 9) * (1 - age / 1.4) * 0.9; }
      const k = j * w + i, g = text[(k + Math.floor(j * 7)) % text.length];
      ch[k] = v > 0.78 ? g.toUpperCase() : v < 0.2 ? (g === " " ? " " : "·") : g; col[k] = colour(r * 0.5 + v * 0.6 + t * 0.03, v * 1.25 + s.snare * 0.2);
    }
  } else if (ramp === "pixels") {
    const f = FIELDS[look] ?? FIELDS.gyroid, bg = new Int32Array(n), H2 = h * 2;
    const px = (i: number, j2: number) => { const [lum, hue] = f(((i / (w - 1)) * 2 - 1) * aspect, (j2 / (H2 - 1)) * 2 - 1, t, s), l = Math.max(0, Math.min(1, lum)); return shade(colour(hue, 1), Math.pow(l, 1.25)); };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; ch[k] = "▀"; col[k] = px(i, j * 2); bg[k] = px(i, j * 2 + 1); }
    return { ch, col, bg };
  } else {
    const f = FIELDS[look] ?? FIELDS.gyroid;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const [lum, hue] = f(((i / (w - 1)) * 2 - 1) * aspect, (j / (h - 1)) * 2 - 1, t, s), k = j * w + i, l = Math.max(0, Math.min(0.9999, lum));
      ch[k] = chars[Math.floor(l * chars.length)]; col[k] = colour(hue, 0.25 + l * 0.9);
    }
  }
  return { ch, col };
}

export const WIPES = ["iris", "blinds", "sweep", "shatter"] as const;
export interface Scene { look: string; palette: string; wipe?: (typeof WIPES)[number] }

/**
 * Rows of text with 24-bit colour escapes, one escape per run of identical colour.
 * `wipe` 0..1 brings `next` in over `now` as a ragged circle growing from the centre, with a bright rim.
 */
export function render(now: Scene, next: Scene | null, wipe: number, ramp: Ramp, w: number, h: number, t: number, s: Pulse, ctx: Ctx): string[] {
  let { ch, col, bg } = cells(now.look, ramp, now.palette, w, h, t, s, ctx);
  if (next && wipe > 0) {
    const b = cells(next.look, ramp, next.palette, w, h, t, s, ctx), aspect = w / h / 2.1, reach = Math.hypot(aspect, 1) * 1.1 * wipe;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = ((i / (w - 1)) * 2 - 1) * aspect, y = (j / (h - 1)) * 2 - 1, k = j * w + i;
      const kind = next.wipe ?? "iris";
      const edge = kind === "blinds" ? (((i / w) * 12) % 1) * 0.9 + Math.abs(y) * 0.1 - wipe * 1.05
        : kind === "sweep" ? (x / aspect + 1) / 2 * 0.8 + (y + 1) / 2 * 0.2 + (vnoise(y * 6, 3) - 0.5) * 0.15 - wipe * 1.1
        : kind === "shatter" ? hash(Math.floor(i / 6), Math.floor(j / 3)) * 0.9 + 0.05 - wipe * 1.05
        : Math.hypot(x, y) + (vnoise(x * 3 + 9, y * 3) - 0.5) * 0.5 - reach;
      if (edge < 0) { ch[k] = b.ch[k]; col[k] = b.col[k]; if (bg) bg[k] = b.bg ? b.bg[k] : -1; else if (b.bg) { bg = new Int32Array(w * h).fill(-1); bg[k] = b.bg[k]; } }
      if (Math.abs(edge) < (kind === "iris" ? 0.06 : 0.025)) { ch[k] = "▓▒░░"[Math.floor(hash(i, j + Math.floor(t * 20)) * 4)]; col[k] = shade(b.col[k] || 0xffffff, 1.6); if (bg) bg[k] = -1; }
    }
  }
  // a name in lights: big block letters over the field, assembled out of static and dissolving back into it
  const bn = ctx.banner;
  if (bn && bn.lines.length && bn.lines[0].length <= w) {
    const top = Math.max(0, Math.floor((h - bn.lines.length) / 2)), left = Math.floor((w - bn.lines[0].length) / 2);
    const present = bn.t < 0.18 ? bn.t / 0.18 : bn.t > 0.8 ? (1 - bn.t) / 0.2 : 1;
    for (let j = 0; j < bn.lines.length && top + j < h; j++) for (let i = 0; i < bn.lines[j].length; i++) {
      const g = bn.lines[j][i], k = (top + j) * w + left + i, n = hash(i * 1.3, j * 7.7);
      if (g === " ") { if (present > 0.3) { ch[k] = hash(i, j) > 0.5 ? ch[k] : " "; col[k] = ((col[k] >> 17) << 16) | (((col[k] >> 9) & 127) << 8) | ((col[k] >> 1) & 127); } continue; }   // dim the field behind the letters
      if (bg) bg[k] = -1;
      if (n > present) { if (n - present < 0.15) { ch[k] = "▓▒░"[Math.floor(n * 3)]; col[k] = 0xffffff; } continue; }
      const flick = 0.85 + 0.15 * Math.sin(t * 30 + j);
      ch[k] = g; col[k] = (Math.min(255, bn.rgb[0] * flick + s.kick * 60) << 16) | (Math.min(255, bn.rgb[1] * flick + s.kick * 60) << 8) | Math.min(255, bn.rgb[2] * flick + s.kick * 60);
    }
  }
  const rows: string[] = [];
  for (let j = 0; j < h; j++) {
    let row = "", last = -1, lastBg = -1;
    for (let i = 0; i < w; i++) {
      const k = j * w + i, c = col[k] & 0xf8f8f8;   // quantise so neighbouring cells share an escape
      if (bg) { const b = bg[k] < 0 ? -1 : bg[k] & 0xf8f8f8; if (b !== lastBg) { row += b < 0 ? "\x1b[49m" : `\x1b[48;2;${(b >> 16) & 255};${(b >> 8) & 255};${b & 255}m`; lastBg = b; } }
      if (ch[k] !== " " && c !== last) { row += `\x1b[38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`; last = c; }
      row += ch[k];
    }
    rows.push(row + "\x1b[39m" + (bg ? "\x1b[49m" : ""));
  }
  return rows;
}
