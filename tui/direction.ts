import { parseSlot, type Part } from "./patch.ts";

export const DEFAULT_WILD = 2;
export const angleKind = (angle: string) => angle.replace(/\d+$/, "");

/** A creative brief, not a round-indexed recipe. The model chooses the musical mechanism. */
export function compositionBrief(angle: string, context = ""): string {
  if (!["groove", "hook", "turn", "add", "droplets", "texture", "transform"].includes(angleKind(angle))) return "";
  const common = `\n\nCOMPOSE FROM THIS SET: choose your own musical mechanism from the current source, the performer's request and your DJ's idiom. First identify the role the existing phrase plays; develop or deliberately contrast that role using the available SuperCollider instruments and pattern vocabulary. Do not default to rotating a row, reversing a motif, transposing alternate notes, or changing subdivision just to be different. Those operations need a specific musical reason. A simple, well-placed idea is better than arbitrary complexity. Preserve a recognisable anchor. WHY describes the intended musical event; EVIDENCE points to the source or measurements that motivated it. You have not heard the audio. The performer's explicit request takes priority.`;
  if (!/ambient|nature/i.test(context)) return common;
  return common + `\n\nAMBIENT SYSTEM: this set is a calm environment, not a dance track. Let sounds coexist without demanding attention. Think in 16-64 beat spans: long attacks and releases, open intervals, sparse events, gentle stochastic variation, and recognisable rain/water/birds. Change one relationship at a time and allow silence. Never add bells, chimes, porcelain, glassy resonators or long struck tones: sparse high notes with long tails sound ominous here. Do not add a kick, backbeat, bass riff, arpeggiator ostinato, riser, drop, vocal slogan, bitcrush or dramatic filter sweep unless the performer explicitly asks. Low volume is intentional, but close physical textures should remain clearly present. The nature recordings are foreground material, not decoration. Follow these constraints even if the DJ persona normally plays club music.

CALM IS NOT THE SAME AS FLAT. The performer's standing complaint about this set is that it has no highs, no lows and no surprises: every layer sits at a similar level in a similar register and nothing ever happens. Calm is a matter of TIME SCALE, not of dynamic range, so an ambient gesture is allowed to be genuinely deep, genuinely bright or genuinely absent as long as it takes its time and does not become a groove. Reach for real contrast: a low body that arrives, holds for six to ten seconds and releases completely (never a permanent drone or floor); a burst of five or six close events inside one beat followed by fifteen to thirty beats of nothing; an event so rare the performer cannot predict it, written as a heavy rest weight in a Pwrand plus Pexprand deltas rather than an even sprinkle; the top of the room taken seriously, a sample played back above its own pitch or a band of air that opens high and slides down as it fades. Silence and removal are complete ideas: hollowing an existing voice out to one event every thirty seconds, or taking a layer away and putting nothing in its place, is a real proposal and needs no companion. What is forbidden is fake drama - a riser, a drop, a loud sweep, or simply raising the gain on everything. A gesture that is too quiet to be heard over the field recordings is not subtle, it is absent: if the idea is worth proposing, make it audible.`;
}

// Different musical mechanisms, rather than three ways to correct the same meter.
const TASKS: Record<string, string[]> = {
  groove: [
    "Displace the accents: a 3-3-2 figure or a five-step accent cycle against the existing pulse. Keep one recognisable anchor.",
    "Make a four-bar drum conversation: two statements, an answer, then a fourth-bar mutation. Use a list of ~x or ~kp rows, not four identical bars.",
    "Make ratchets selective: put a short burst into the gaps of an otherwise spacious rhythm using a Pseq of positive durations totalling four beats. Not constant double-time.",
    "Interlock two voices: one asks and the other answers in its rests. Complementary rows, not the same hits doubled.",
  ],
  hook: [
    "Write a question-and-answer riff: a memorable short motif, then a changed ending or octave reply. Follow the existing harmony.",
    "Make a short arpeggio cycle cross the drum grid: a five- or seven-note in-key Pseq against regular subdivisions. Reuse the current chord tones.",
    "Turn held harmony into syncopated chord stabs with a melodic top-note answer. Keep the chord progression recognisable.",
    "Transform the existing motif: alternate its original contour with a reversed or octave-displaced answer. Use explicit note lists and rests, not a wholly random melody.",
  ],
  // Ambient angles previously got no round challenge at all, so the model reached for the same slow granular veil
  // every time. These are the same kind of brief as the club ones, written for a 64-beat time scale.
  pulse: [
    "Write a rhythm from absence: a short flurry of close events inside one or two beats, then a gap of fifteen to thirty beats. Express it as a Pwrand or Pseq of deltas where the long value carries real weight. The gap is the phrase.",
    "Put two unrelated cycles against each other: a five-part delta cycle in one voice against the existing voice's longer cycle, so they only agree every few minutes. No grid, no kick.",
    "Make the timing stochastic rather than irregular: Pexprand deltas and a rest weight in a Pwrand, so the performer cannot predict where the next event lands, and some minutes are busier than others.",
    "Give one voice a swell and a collapse across 32-64 beats using Pseg on a filter or an amplitude, so the round has a shape instead of a level.",
  ],
  droplets: [
    "Compose a low that is an event, not a floor: it arrives, holds six to ten seconds, and releases completely, once or twice a minute. Nothing is allowed to sustain between arrivals.",
    "Answer the water with something dry and close, in its gaps, then let both of them stop.",
    "Take the existing close material down an octave in playback rate and let its gaps get much longer, so it reads as weight rather than detail.",
    "Write a rare event: something that happens roughly once every thirty to forty-five seconds and is clearly louder or deeper than everything around it, with silence in that slot the rest of the time.",
  ],
  texture: [
    "Take the top of the room seriously: play a recording above its own pitch until only its bright edge is left, and let it come and go.",
    "Change the depth rather than the surface: move one existing layer behind a nearly-closed filter for a long stretch, then let it surface again.",
    "Replace a continuous layer with the same material as discrete events, so what was a bed becomes a series of arrivals.",
    "Make the stereo image the change: the same material scattered wide and unpredictably, against something that stays dead centre.",
  ],
  transform: [
    "Remove something. Take one voice out or hollow it down to one event every thirty seconds and put nothing in its place; name what the absence reveals.",
    "Let a filter travel the whole range over a minute: nearly shut, then wide open, then shut, using Pseg rather than a sweep on a single event.",
    "Turn a layer inside out: the material that was background becomes the foreground event and the foreground becomes an occasional answer.",
    "Change the register of an existing voice by an octave or more without changing its instrument, so the room's centre of gravity moves.",
  ],
  turn: [
    "Create a rhythmic illusion: half-time or triplets in ONE voice against the unchanged pulse. Keep a clear return point in the phrase.",
    "Change the lead's identity: a new instrument family plus a new rhythmic phrase, preserving a recognisable fragment of its notes.",
    "Build tension through a four-bar phrase: gaps at the start, increasingly busy answers, then space on the restart. Express the arc in rows or Pseq, not louder gain.",
    "Use a different cycle length in one voice: a three- or five-beat phrase against the four-beat groove. Keep the kick steady so the phase shift is audible.",
  ],
};

export function patternTask(angle: string, round = 0): string {
  const tasks = TASKS[angleKind(angle)];
  if (!tasks) return "";
  const n = Number(angle.match(/\d+$/)?.[0] ?? 0);
  return `\n\nTHIS ROUND'S MUSICAL CHALLENGE: ${tasks[(Math.max(0, Math.floor(round)) + n) % tasks.length]} Interpret it in your DJ's style. The performer's explicit note takes priority. WHY names the audible trick and the voice it changes; EVIDENCE names the current pattern it answers. Do not substitute a gain cut or static filter tweak.`;
}

/** Structural guard only: this proves a pattern changed, not that the result sounds good. */
export function hasPatternChange(slots: Record<string, string>, parts: Part[]): boolean {
  const values = (code: string) => Object.fromEntries(parseSlot(code).map(x => [x.key, x.value.replace(/\s+/g, "")]));
  const rows = (v = "") => v.match(/"[Xx-]+"/g)?.join("|");
  return parts.some(p => {
    const before = values(slots[p.slot] || ""), after = values(p.code);
    if (["instrument", "dur", "midinote", "ctranspose", "buf"].some(k => after[k] !== undefined && after[k] !== before[k])) return true;
    if (rows(after.amp) && rows(after.amp) !== rows(before.amp)) return true;
    // A changing frequency or amplitude sequence counts; scaling an existing row does not.
    return ["amp", "freq"].some(k => {
      const sequence = (v = "") => v.match(/P(?:seq|shuf|rand|wrand)\(\[.*\]/)?.[0];
      return !!sequence(after[k]) && sequence(after[k]) !== sequence(before[k]);
    });
  });
}

export function musicContext(bpm: number, base?: { key: string; root: number; about: string; style: string } | null): string {
  return `${bpm} BPM, ${base ? `key ${base.key} (bass root midinote ${base.root}); ${base.style}: ${base.about}` : "key unknown: infer it from the current notes"}`;
}

/** Invalidated work cannot refill the bank after a new instruction, DJ or wildness level. */
export class PrefetchBank<T> {
  private generation = 0;
  private value: T | null = null;
  token() { return this.generation; }
  get ready() { return this.value !== null; }
  invalidate() { this.generation++; this.value = null; }
  put(token: number, value: T) { if (token === this.generation) this.value = value; }
  take() { const value = this.value; this.value = null; return value; }
}
