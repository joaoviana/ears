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

export function applyPatch(code: string, p: Patch): string {
  let pairs = p.replace ? [] : parseSlot(code);
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
