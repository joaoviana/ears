// Which voices are doubling each other, and which are carrying a part alone?
//
// The positive twin of masking.ts. Masking asks which two voices are fighting for one band; this asks which two are
// playing the SAME RHYTHM, which is the difference between mud and a layer. Two voices on the same steps in
// different registers is a producer's oldest trick — a sub under a bass, a rim doubling a clap, a pluck an octave
// over a lead — and it is the one thing a mix report can never suggest, because in the master they are one sound.
//
// It reads the engine's own event times rather than audio: every hit arrives with its slot and its 16th-note step,
// so "do these two land together" is exact, not inferred from a spectrum.
export interface Beat { slot: string; step: number; bar?: number }

/** Two voices are locked when most of the smaller part's hits land on the same step as the larger one's. */
export interface Lock { a: string; b: string; together: number; of: number; share: number }

const steps = (hits: Beat[], slot: string) => {
  const m = new Map<string, number>();
  for (const h of hits) if (h.slot === slot) m.set(`${h.bar ?? 0}:${h.step}`, (m.get(`${h.bar ?? 0}:${h.step}`) ?? 0) + 1);
  return m;
};

export function locks(hits: Beat[], minHits = 4, minShare = 0.6): Lock[] {
  const slots = [...new Set(hits.map((h) => h.slot))].sort();
  const at = new Map(slots.map((s) => [s, steps(hits, s)] as const));
  const out: Lock[] = [];
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    const A = at.get(slots[i])!, B = at.get(slots[j])!;
    if (A.size < minHits || B.size < minHits) continue;
    const small = A.size <= B.size ? A : B, large = A.size <= B.size ? B : A;
    let together = 0; for (const k of small.keys()) if (large.has(k)) together++;
    const share = together / small.size;
    if (share >= minShare) out.push({ a: slots[i], b: slots[j], together, of: small.size, share });
  }
  return out.sort((x, y) => y.share - x.share);
}

/** Slots that hit often and share their rhythm with nobody: each is a candidate to be doubled. */
export function alone(hits: Beat[], minHits = 4): string[] {
  const paired = new Set(locks(hits, minHits, 0.5).flatMap((l) => [l.a, l.b]));
  const counted = [...new Set(hits.map((h) => h.slot))].filter((s) => steps(hits, s).size >= minHits);
  return counted.filter((s) => !paired.has(s)).sort();
}

/** For the report: what is already layered, and what is carrying its part on its own. */
export function layerLines(hits: Beat[]): string[] {
  const out = locks(hits).slice(0, 3).map((l) =>
    `  ${l.a} and ${l.b} play the same rhythm (${l.together} of ${l.of} hits together, ${Math.round(l.share * 100)}%): they are one layered part, so a change to one usually needs the other.`);
  const solo = alone(hits);
  if (solo.length) out.push(`  Nothing doubles ${solo.join(", ")} — each is carrying its part on its own, and could be thickened by a second voice on the same steps in a different register.`);
  return out;
}
