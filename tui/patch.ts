// A proposal is a patch, not a rewrite: "in d3, set \cutoff to 600". Small to generate (fast), small to read on a
// projector, and the host, not the agent, writes the code. Slots are one expression: ~d.(\dN, \key, value, ...).
export interface Patch { slot: string; set: { key: string; value: string }[]; remove?: string[]; replace?: boolean }

/** Split on top-level commas only, so Pseq([1, 2], inf) stays one piece. */
function split(src: string): string[] {
  const out: string[] = []; let depth = 0, quote = false, cur = "";
  for (const c of src) {
    if (c === '"') quote = !quote;
    if (!quote) { if ("([{".includes(c)) depth++; if (")]}".includes(c)) depth--; }
    if (c === "," && depth === 0 && !quote) { out.push(cur.trim()); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseSlot(code: string): { key: string; value: string }[] {
  const m = code.replace(/\s*\n\s*/g, " ").trim().match(/^~d\.\(\\d\d\s*,\s*(.*)\)\s*$/s);
  if (!m) return [];
  const parts = split(m[1]), pairs: { key: string; value: string }[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) pairs.push({ key: parts[i].replace(/^\\/, ""), value: parts[i + 1] });
  return pairs;
}

// A rewrite used to mean writing every key, which is most of what a slow angle spends its time typing — and output
// length is the entire cost of a suggestion (a 6.9k system prompt costs the same as "You are a DJ"; a long reply
// costs four seconds more). SuperCollider's own SynthDef defaults cannot cover it, because Pbind's default event
// always sends \amp, so an unset amp becomes 0.1 rather than the instrument's own. So the host fills them.
export const DEFAULTS: Record<string, Record<string, string>> = {
  kick:     { amp: "0.9", tune: "44", dec: "0.36", drive: "1.6", punch: "190" },
  hat:      { amp: "0.2", dec: "0.03", hp: "8500" },
  clap:     { amp: "0.5", send: "0.5" },
  snare:    { amp: "0.35", freq: "190", dec: "0.16", snap: "0.6", send: "0.2" },
  rim:      { amp: "0.25", freq: "1700", dec: "0.035" },
  bass:     { amp: "0.7", cutoff: "600", res: "2.4", dec: "0.17", duck: "0.4" },
  sub:      { amp: "0.6", dec: "0.5", duck: "0.5" },
  reese:    { amp: "0.35", detune: "0.6", cutoff: "700", res: "2.2", dec: "0.7", rate: "0.3", duck: "0.4" },
  acid:     { amp: "0.5", cutoff: "500", res: "0.8", env: "2500", dec: "0.18", send: "0.1" },
  stab:     { amp: "0.3", cutoff: "1800", dec: "0.16", send: "0.6" },
  supersaw: { amp: "0.22", detune: "0.3", cutoff: "400", env: "2200", res: "0.3", att: "0.01", sus: "0.3", rel: "0.25", spread: "0.8", send: "0.6" },
  fm:       { amp: "0.2", ratio: "2", index: "3", dec: "0.4", send: "0.5" },
  pluck:    { amp: "0.3", dec: "1.2", tone: "0.5", send: "0.3" },
  perc:     { amp: "0.3", freq: "180", dec: "0.14", send: "0.3", click: "0.3" },
  pad:      { amp: "0.2", cutoff: "1600", att: "0.8", sus: "2", rel: "2", send: "0.6", duck: "0.7" },
  choir:    { amp: "0.24", vowel: "0", att: "0.5", sus: "2", rel: "1.5", bright: "1", send: "0.6", duck: "0.7" },
  noise:    { amp: "0.12", freq: "2000", att: "0.4", dec: "1.2", bw: "0.5", sweep: "1", send: "0.5" },
  nature:   { buf: "~n.(\\rain)", amp: "0.1", rate: "1", start: "0", len: "24", att: "4", rel: "6", hp: "40", lp: "12000", send: "0.55" },
  texture:  { buf: "~t.(\\fingertips)", amp: "0.1", rate: "0.7", start: "0", len: "4", att: "0.015", rel: "0.7", hp: "35", lp: "10000", send: "0.55" },
  cloud:    { buf: "~g.(\\rain)", amp: "0.09", rate: "0.7", pos: "0.2", wander: "0.12", grain: "0.2", density: "14", jitter: "0.1", att: "2", sus: "8", rel: "4", hp: "80", lp: "8000", spread: "0.9", shimmer: "0.06", send: "0.72" },
  porcelain:{ amp: "0.06", dec: "4", colour: "0.45", irregular: "0.06", pan: "0", send: "0.9" },
  droplet:  { amp: "0.05", sub: "55", dec: "0.9", tone: "0.35", splash: "0.45", pan: "0", send: "0.68" },
  twig:     { amp: "0.045", dec: "0.24", tone: "0.45", hollow: "0.5", pan: "0", send: "0.72" },
  rustle:   { amp: "0.032", dec: "1.2", grain: "18", bw: "0.55", pan: "0", send: "0.78" },
  glow:     { midinote: "[50, 57, 64, 69]", amp: "0.04", att: "7", sus: "14", rel: "11", warm: "3.2", breath: "0.12", shine: "0.3", swell: "0.4", saw: "0.4", pan: "0", send: "0.7" },
  // The two sampled instruments carry a binding the agent must not have to remember. \keys is useless without the
  // ~kf / ~kr pair (they read the event to pick the nearest sampled octave), and a \smp with no \buf plays silence.
  // Filling them here means a rewrite costs the agent four keys again instead of eight, and it cannot forget them.
  gendy:    { amp: "0.2", knum: "12", chaos: "0.6", scale: "0.5", dec: "0.4", cutoff: "4000", res: "0.3", send: "0.4" },
  smp:      { buf: "~k.(\\kick)", amp: "0.5", dec: "8", send: "0.1" },
  // ORDER MATTERS on \keys: ~kf and ~kr read \midinote and \ctranspose off the event, so both must already be in
  // the Pbind when \buf is reached. A key the agent sets that is NOT listed here gets appended at the END, which
  // would put \midinote after \buf and render a silent, mis-pitched piano. So both are seeded here.
  keys:     { midinote: "60", ctranspose: "0", buf: "~kf", rootfreq: "~kr", amp: "0.4", dec: "0.4", rel: "0.2", send: "0.4" },
};

export function applyPatch(code: string, p: Patch): string {
  const inst = p.set.find((x) => x.key.replace(/^\\/, "") === "instrument")?.value.replace(/^\\/, "").trim();
  // on a rewrite, seed the instrument's own sensible values; anything the agent sets wins over them
  let pairs = p.replace ? Object.entries((inst && DEFAULTS[inst]) || {}).map(([key, value]) => ({ key, value })) : parseSlot(code);
  const drop = new Set((p.remove || []).map((k) => k.replace(/^\\/, "")));
  pairs = pairs.filter((x) => !drop.has(x.key));
  for (const s of p.set) { const key = s.key.replace(/^\\/, ""), at = pairs.findIndex((x) => x.key === key); at >= 0 ? (pairs[at] = { key, value: s.value.trim() }) : pairs.push({ key, value: s.value.trim() }); }
  // instrument and dur read best first
  const rank = (k: string) => (k === "instrument" ? 0 : k === "dur" ? 1 : 2);
  pairs = pairs.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x.key) - rank(b.x.key) || a.i - b.i).map((y) => y.x);
  return `~d.(\\${p.slot}, ${pairs.map((x) => `\\${x.key}, ${x.value}`).join(", ")})`;
}

/** A move is one idea that touches up to three slots at once, applied on the same bar line. */
export interface Part { slot: string; code: string; diff: string }
/** What a whole move changed, for the projector: "d2 amp … → … | d4 + duck 0.7". */
export const describeMove = (parts: Part[]) => parts.map((p) => (parts.length > 1 ? `${p.slot} ` : "") + p.diff).join("  |  ");

/** What changed, for the projector: "cutoff 3800 → 600 · + res 2.8". */
/**
 * Two long values that differ late read as identical when both are cut from the left: a 16-step row edited at step 11
 * showed `~x.(["----X---…` → `~x.(["----X---…` on the projector, so a real change looked like nothing happened.
 * Window both sides around the first character where they diverge instead.
 */
export function pair(a: string, b: string, width = 28): [string, string] {
  if (a.length <= width && b.length <= width) return [a, b];
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const start = Math.max(0, Math.min(i - 6, Math.min(a.length, b.length) - width));
  const cut = (s: string) => (start > 0 ? "…" : "") + s.slice(start, start + width) + (start + width < s.length ? "…" : "");
  return [cut(a), cut(b)];
}

export function describe(code: string, p: Patch): string {
  const before = Object.fromEntries(parseSlot(code).map((x) => [x.key, x.value])), short = (v: string) => (v.length > 28 ? v.slice(0, 27) + "…" : v);
  if (p.replace) return "rewrite · " + p.set.map((s) => `${s.key.replace(/^\\/, "")} ${short(s.value)}`).slice(0, 3).join(" · ");
  return [...p.set.map((s) => { const k = s.key.replace(/^\\/, ""); if (!(k in before)) return `+ ${k} ${short(s.value)}`; const [x, y] = pair(before[k], s.value); return `${k} ${x} → ${y}`; }), ...(p.remove || []).map((k) => `− ${k.replace(/^\\/, "")}`)].join(" · ");
}

/** The instrument a slot is holding, for the "which slots hold what" line. Slots that only carry mixer keys
 *  (a `fxhp` sweep over whatever is already there) have no instrument of their own, and say so. */
export function instrumentOf(code: string): string {
  const pairs = parseSlot(code);
  const inst = pairs.find((x) => x.key === "instrument")?.value.replace(/^\\/, "").trim();
  if (inst) return inst;
  return pairs.some((x) => x.key.startsWith("fx")) ? "fx" : "";
}
