// What the visuals know about the actual sound: the last 43 ms of the master bus (mono + stereo),
// and its spectrum folded into 32 log-spaced bands. Computed here from samples SuperCollider streams over.
const N = 512, SR = 12000, BANDS = 32;
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((6.2832 * i) / (N - 1)));
const rev = new Uint16Array(N);
for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < 9; b++) r |= ((i >> b) & 1) << (8 - b); rev[i] = r; }
const edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.max(1, Math.round(((40 * Math.pow(5500 / 40, i / BANDS)) / SR) * N)));

export interface Audio { l: Float32Array; r: Float32Array; mono: Float32Array; spec: Float32Array; level: number; live: boolean }
export const audio: Audio = { l: new Float32Array(N), r: new Float32Array(N), mono: new Float32Array(N), spec: new Float32Array(BANDS), level: 0, live: false };
const re = new Float32Array(N), im = new Float32Array(N);

export function feed(interleaved: number[]) {
  const a = audio; let sum = 0;
  for (let i = 0; i < N; i++) { a.l[i] = interleaved[2 * i] || 0; a.r[i] = interleaved[2 * i + 1] || 0; a.mono[i] = (a.l[i] + a.r[i]) * 0.5; sum += a.mono[i] * a.mono[i]; }
  a.level = Math.sqrt(sum / N); a.live = true;
  for (let i = 0; i < N; i++) { re[rev[i]] = a.mono[i] * hann[i]; im[rev[i]] = 0; }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = -6.2832 / size;
    for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) {
      const c = Math.cos(step * k), sn = Math.sin(step * k), i0 = s + k, i1 = i0 + half;
      const tr = re[i1] * c - im[i1] * sn, ti = re[i1] * sn + im[i1] * c;
      re[i1] = re[i0] - tr; im[i1] = im[i0] - ti; re[i0] += tr; im[i0] += ti;
    }
  }
  for (let b = 0; b < BANDS; b++) {
    let m = 0; for (let k = edges[b]; k <= Math.max(edges[b], edges[b + 1] - 1); k++) m = Math.max(m, Math.hypot(re[k], im[k]));
    // tilt: highs are far quieter than lows, so lift them until the picture uses its whole width
    const v = Math.min(1, Math.pow((m / N) * 14 * (1 + b * 0.22), 0.6));
    a.spec[b] = v > a.spec[b] ? v : a.spec[b] * 0.82 + v * 0.18;
  }
}

/** Demo mode has no engine, so synthesise something shaped like a techno mix. */
export function fake(t: number, kick: number) {
  const buf: number[] = [];
  for (let i = 0; i < N; i++) { const x = t + i / SR, v = Math.sin(x * 6.2832 * 55) * (0.3 + kick * 0.5) + Math.sin(x * 6.2832 * 220 + Math.sin(x * 900) * 2) * 0.12 + (Math.random() - 0.5) * 0.06; buf.push(v + Math.sin(x * 1400) * 0.05, v - Math.sin(x * 1400) * 0.05); }
  feed(buf);
}
