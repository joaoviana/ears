// The demo script: what to say, keyed to what is actually happening. A beat is chosen by the newest message on the
// wire, never by a timer, so the words on the sidebar are always about something the audience can see on screen.
// Each beat reads the real state (the options on offer, the change that landed, the grade, who is in the booth) and
// says it in plain words. Each line is tagged with the part of the mechanism it explains. Pure functions: tests
// drive them without a terminal.
import type { Msg } from "./bus.ts";
import { instrumentOf, parseSlot } from "./patch.ts";
import { ribbon } from "./guide.ts";

export type Part = "claude" | "sound" | "sc" | "protocol" | "djs";
/** `once`: an explanation, said the first time its beat happens in a session and left out after that */
export interface Line { part: Part; text: string; once?: boolean }

/** What is on screen right now, handed in by the app so the script can talk about the actual example. */
export interface PartChange { slot: string; after: string; before?: string; keys?: { key: string; before?: string | null; after?: string | null }[] }
export interface Context {
  options?: { n: number; parts: PartChange[]; why: string; expect?: string; origin?: "recipe" | "model"; agent?: string; ms?: number }[];
  change?: { parts: PartChange[]; why: string; who: string };
  grade?: { who: string; call: string; text: string; grade: string };
  booth?: string[];
  active?: string;
  note?: string;
  /** what the model is doing, if anything: "composing · 12s" */
  thinking?: string;
  /** how many ideas are on the table */
  ideas?: number;
  /** the field's look and palette, for the visuals line */
  look?: string; palette?: string;
  /** what is playing: slots grouped by instrument */
  playing?: { slots: string[]; inst: string }[];
  /** the booth, with each listener's record */
  listeners?: { name: string; active: boolean; taken: number; offered: number; right: number; wrong: number; flat: number; powers: string[]; auto?: boolean; guest?: boolean }[];
  /** the newest check, kept until the next one: what was said, what the meter showed, and the verdict or the reason */
  lastCheck?: { who: string; call: string; text?: string; grade: string; reason?: string; slot?: string; id?: number };
  /** the clock, for countdowns: ms to the next bar (a written change lands then) and to the next meter report */
  nextBarMs?: number; nextReportMs?: number;
  /** the next round is held until this idea's verdict */
  awaiting?: number | null;
  /** the step the strip is allowed to show (the app paces the display one step at a time) */
  showStep?: number;
}
/** `then`: what to do now. `todo`: how to make this beat happen, for the list of beats not yet shown. */
export interface Beat { id: string; title: string; say: (m: Msg | null, ctx: Context) => Line[]; then: string; todo: string | null }

const L = (part: Part, text: string): Line => ({ part, text });
const once = (part: Part, text: string): Line => ({ part, text, once: true });
const s = (x: unknown) => String(x ?? "");
const list = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

// Plain names for what is in a slot. An audience hears "the rain" and "a warm chord", not "\nature" and "\glow".
const VOICE: Record<string, string> = { nature: "field recording", texture: "close-up recording", cloud: "grain cloud", glow: "warm chord",
  twig: "wood tap", droplet: "water drop", rustle: "leaf air", stone: "low thump", sub: "low note", noise: "band of air", pad: "pad", gendy: "rough tone" };
const SAMPLE: Record<string, string> = { waves: "the sea", rain: "rain", birds: "birds", fingertips: "fingertips", marbles: "glass marbles", paper: "paper", brush: "forest brush" };
// Which knob a changed key is, in one word. Unlisted keys are colour: the audience does not need them.
const ASPECT: [RegExp, string][] = [[/^(delta|dur)$/, "timing"], [/^amp$/, "level"], [/^rate$/, "speed"], [/^midinote$/, "notes"],
  [/^buf$/, "recording"], [/^(fx(hp|lp|motion|rate)|hp|lp|cutoff|warm|saw|shine)$/, "tone"], [/^(fxspace|send)$/, "space"], [/^pan$/, "place"], [/^fx(freeze|reverse|delay|blur|gate)/, "shape"]];
const bufOf = (code: string) => code.match(/~[ntg]\.\(\\(\w+)\)/)?.[1];
const named = (code: string) => {
  const inst = instrumentOf(code), buf = bufOf(code);
  return buf && SAMPLE[buf] ? (inst === "cloud" ? `a cloud of ${SAMPLE[buf]}` : SAMPLE[buf]) : (VOICE[inst] ? `a ${VOICE[inst]}` : inst || "a voice");
};
/** One part of a change, short: "swaps the sea in d1 for glass marbles", "changes rain's timing in d2". */
export function plain(part: PartChange): string {
  const before = part.before ?? "";
  const keysChanged = part.before != null
    ? (() => { const a = Object.fromEntries(parseSlot(before).map((x) => [x.key, x.value])), b = Object.fromEntries(parseSlot(part.after).map((x) => [x.key, x.value]));
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]); })()
    : (part.keys ?? []).map((k) => k.key);
  const fromInst = part.before != null ? instrumentOf(before) : (part.keys?.find((k) => k.key === "instrument")?.before ?? `\\${instrumentOf(part.after)}`).replace(/^\\/, "");
  const fromBuf = part.before != null ? bufOf(before) : ((part.keys?.find((k) => k.key === "buf")?.before ?? "").match(/\\(\w+)/)?.[1] ?? bufOf(part.after));
  const from = fromInst ? (fromBuf && SAMPLE[fromBuf] ? SAMPLE[fromBuf] : VOICE[fromInst] ? `the ${VOICE[fromInst]}` : fromInst) : "";
  if (!part.after.trim()) return `removes ${from || "the voice"} from ${part.slot}`;
  if (!from || (part.before != null && !before.trim())) return `adds ${named(part.after)} in ${part.slot}`;
  if (fromInst !== instrumentOf(part.after) || (fromBuf && fromBuf !== bufOf(part.after))) return `swaps ${from} in ${part.slot} for ${named(part.after)}`;
  const aspects = [...new Set(keysChanged.map((k) => ASPECT.find(([re]) => re.test(k))?.[1]).filter((x): x is string => !!x))];
  const owner = from.replace(/^the /, "");
  return `changes ${owner}${owner.endsWith("s") ? "'" : "'s"} ${aspects.length ? list(aspects) : "colour"} in ${part.slot}`;
}
const describe = (parts: PartChange[]) => cap(parts.map(plain).join(", and "));
// A called shot, in words. "low ↑" is what the card prints; "more bass" is what it means.
const BAND: Record<string, string> = { sub: "the deep bass", low: "the bass", mid: "the middle of the sound", high: "the treble", air: "the very top", brightness: "the brightness", loudness: "the loudness", density: "how busy it is", punch: "the punch", width: "the stereo width", groove: "the swing" };
export const predicts = (call?: string) => {
  const m = (call ?? "").match(/^(\w+)\s*([↑↓=]|up|down|same)?/); if (!m) return "";
  const what = BAND[m[1]] ?? m[1], dir = m[2];
  return dir === "↑" || dir === "up" ? `bring up ${what}` : dir === "↓" || dir === "down" ? `bring down ${what}` : `leave ${what} alone`;
};
/** The meter's own line ("-0.5 dB: inside the noise (±1.2)") in words: what moved, by how much, against the normal wobble. */
export const measured = (text?: string, grade?: string) => {
  const m = (text ?? "").match(/([+-]?[\d.]+)\s*([A-Za-z/]+)/), amount = m ? `${Number(m[1]) > 0 ? "up" : Number(m[1]) < 0 ? "down" : "unchanged"}${Number(m[1]) ? ` by ${Math.abs(Number(m[1]))} ${m[2]}` : ""}` : (text ?? "");
  const wobble = (text ?? "").match(/±\s*([\d.]+)/)?.[1];
  if (grade === "flat") return amount === "unchanged"
    ? `it did not move at all${wobble ? ` (the music itself wobbles by ${wobble})` : ""}. ○ No real change.`
    : `it moved ${amount}, less than the music's own wobble${wobble ? ` of ${wobble}` : ""}. ○ No real change.`;
  if (grade === "hit") return `it went ${amount}. ✓ Correct.`;
  if (grade === "miss") return /held|moved/.test(text ?? "") && /moved$/.test(text ?? "") ? `it moved ${amount} when it should have stayed. ✗ Wrong.` : `it went ${amount}, the other way. ✗ Wrong.`;
  return amount;
};
// what the meter watches, said once and reused wherever "measure" first needs explaining
export const METER = "A meter listens to the output and writes down how loud it is, how much bass and treble, how bright, how busy.";
/** the verdict as an icon and a word: ✓ right, ✗ wrong, ○ no real change, ? could not check */
export const ICON: Record<string, string> = { hit: "✓", miss: "✗", flat: "○", ungraded: "?" };
/** why each verdict is the protocol working, said once per result: this is the case for the protocol, made in text */
export const WHY_GOOD: Record<string, string> = {
  hit: "A listener made a claim, the meter confirmed it. That is an idea you can trust, and it was proven, not asserted.",
  miss: "A wrong claim was caught by measurement, not by taste. The listener is told in numbers and corrects next round.",
  flat: "○ is not a fail. The meter heard no difference, so nothing is claimed. Only moves the room can hear are scored.",
  ungraded: "When the meter cannot tell, the protocol says so instead of guessing. Nothing is scored on a doubt.",
};
const verdictWord = (grade: string) => grade === "hit" ? "✓ Correct." : grade === "miss" ? "✗ Wrong." : grade === "flat" ? "○ No real change." : "? Could not tell.";
// who wrote an option, in five words
const origin = (o: NonNullable<Context["options"]>[number]) => o.origin === "model"
  ? (o.ms ? `Claude Code, written in ${Math.max(1, Math.round(o.ms / 1000))}s` : "Claude Code, written live") : "instant, from the library";

// Short. Every line is one plain sentence an audience can take in at a glance. `then` is what to do now.
export const BEATS: Beat[] = [
  { id: "open", title: "THE ROOM", then: "Wait for ideas, or press a.", todo: null,
    say: (_m, ctx) => [
      L("sound", "Six layers of code are playing: sea, rain, birds, forest brush, a warm chord, fingertips."),
      L("claude", "Claude cannot hear it. Every 2 bars it gets a written report, and that is all it gets."),
      once("claude", METER),
      L("djs", ctx.booth?.length ? `In the booth: ${list(ctx.booth)}. A listener is a text file: a taste and a never-list.` : "A listener is a text file: a taste and a never-list."),
    ] },
  { id: "proposal", title: "IDEAS", then: "Press 1 or 2 to take one. n skips. t: type what you want.", todo: "wait for ideas (or press a)",
    say: (_m, ctx) => {
      const opts = ctx.options ?? [], writing = !opts.some((x) => x.origin === "model") && ctx.thinking;
      return [
        ...opts.map((o) => L("sound", `${o.n}: ${describe(o.parts).replace(/^./, (c) => c.toLowerCase())} (${o.origin === "model" ? `Claude Code${o.ms ? `, ${Math.max(1, Math.round(o.ms / 1000))}s` : ""}` : "instant, from the library"}).${o.expect ? ` It says this will ${predicts(o.expect)}.` : ""}`)),
        ...(writing ? [L("claude", `${opts.length + 1}: Claude Code is writing this one now.`)] : []),
        once("protocol", "Each idea says in advance what it will do to the sound. After it plays, a meter checks."),
      ];
    } },
  { id: "take", title: "TAKEN", then: "Watch the CHECK line next to the ideas fill in.", todo: "take an idea (1 or 2)",
    say: (_m, ctx) => [
      L("sound", ctx.change ? `${describe(ctx.change.parts)}.` : "Your idea is being written into its layer."),
      once("protocol", "Host checks the text, writes the file; SuperCollider swaps it in on the next bar. Only your key can do this."),
    ] },
  { id: "skip", title: "SKIPPED", then: "Wait for the next round, or press a.", todo: "skip a round (n)",
    say: () => [L("protocol", "Skipped. It is recorded. Nothing changed."), once("djs", "The next ideas are about what is still playing.")] },
  { id: "refused", title: "REFUSED", then: "Nothing to press. Take one of the ideas that passed.", todo: null,
    say: (m) => [L("protocol", `The host threw out an idea${m?.reason ? `: ${s(m.reason)}` : ""}.`), once("claude", "Text is checked before it can become sound.")] },
  { id: "active", title: "PLAYING", then: "Wait 2 bars for the result.", todo: "take an idea and wait a bar",
    say: (_m, ctx) => [
      L("sound", ctx.change ? `Playing now: ${describe(ctx.change.parts).replace(/^./, (c) => c.toLowerCase())}.` : "Playing now."),
      once("protocol", "In 2 bars the meter reports again and the host checks whether the idea did what it said."),
    ] },
  { id: "graded", title: "RESULT", then: "Take another idea.", todo: "take an idea and wait two bars",
    say: (m, ctx) => [
      ...(ctx.grade?.grade === "ungraded" || m?.grade === "ungraded"
        ? [L("protocol", `${cap(s(ctx.grade?.who ?? m?.agent ?? "the listener"))} said this would ${predicts(ctx.grade?.call ?? `${s((m?.expected as { metric?: string })?.metric)} ${s((m?.expected as { dir?: string })?.dir)}`)}. ? It could not be checked: ${s(m?.reason ?? "the meter had no clean before and after")}.`),
           L("protocol", WHY_GOOD.ungraded)]
        : [L("protocol", ctx.grade ? `${cap(ctx.grade.who)} said this would ${predicts(ctx.grade.call)}. The meter says ${measured(ctx.grade.text, ctx.grade.grade)}` : "The host compared what the idea said with what the meter heard."),
           L("protocol", `${WHY_GOOD[ctx.grade?.grade ?? "flat"] ?? WHY_GOOD.flat} The result goes into the listener's next prompt: nobody typed it.`)]),
    ] },
  { id: "note", title: "YOUR WORDS", then: "Take one of the answers.", todo: "type a direction (t)",
    say: (m, ctx) => [
      L("claude", `You wrote "${s(m?.text ?? ctx.note)}". Every answer must follow it.`),
      once("djs", "1 is instant, from the library. 2 is Claude Code, with your words."),
    ] },
  { id: "unlock", title: "POWER EARNED", then: "Press k to perform it.", todo: "take two ideas from one listener",
    say: (m) => [
      L("djs", `${cap(s(m?.agent ?? "the listener"))} earned ${s(m?.skill ?? "a power").toUpperCase()} by getting ideas taken.`),
      once("protocol", "Off until you press k. A power is a grant, one line in its file."),
    ] },
  { id: "power", title: "POWER", then: "Listen for 2 bars.", todo: "perform a power (k)",
    say: (m) => [
      L("sound", `${s(m?.skill ?? "").toUpperCase() || "The power"}: ${m?.skill === "carve" ? "moving filter bands cut through the sound" : m?.skill === "fracture" ? "a stutter for 2 bars, then the original comes back" : m?.skill === "reveal" ? "a colour swapped through a slow wash" : "the playing sound is changed"}.`),
      once("sc", "Works on whatever is playing."),
    ] },
  { id: "takeover", title: "TAKEOVER", then: "Let it run. n vetoes. o takes control back.", todo: "grant takeover (o)",
    say: (m) => [
      L("protocol", `${cap(s(m?.agent ?? "the listener"))} now acts alone: the host takes an idea for it after a 2 bar veto.`),
      once("claude", "You gave that. You can take it back with one key. Every auto take is logged."),
    ] },
  { id: "guest", title: "GUEST", then: "Watch its ideas join the same list.", todo: "connect a guest agent to port 57400",
    say: (m) => [
      L("protocol", `${cap(s(m?.name ?? m?.agent ?? "another program"))} connected from outside. It can only send an idea or a note.`),
      once("claude", "Same checks, same decision as everyone else."),
    ] },
  { id: "enter", title: "WALKS IN", then: "Let its calling card land, or press n.", todo: "bring a listener in (d)",
    say: (m, ctx) => [
      L("djs", `${cap(s(m?.name ?? m?.agent ?? "a listener"))} walked in.${ctx.booth?.length ? ` Booth: ${list(ctx.booth)}.` : ""}`),
      once("djs", "Its calling card is on the table and lands in 2 bars unless you press n. Each listener has its own repertoire."),
    ] },
  { id: "leave", title: "LEAVES", then: "Press d to bring another in.", todo: "retire a listener (x)",
    say: (m, ctx) => [
      L("djs", `${cap(s(m?.name ?? m?.agent ?? "a listener"))} left.${ctx.booth?.length ? ` Booth: ${list(ctx.booth)}.` : ""}`),
      once("protocol", "Its open ideas were withdrawn. Its layers keep playing."),
    ] },
  { id: "transition", title: "WASH", then: "Listen for the change under it.", todo: "renew the base (g)",
    say: (m) => [L("sc", `A slow ${s(m?.kind ?? "wash")} across the whole mix.`), once("sound", "The change lands underneath it.")] },
  { id: "wire", title: "THE WIRE", then: "Press e to close it.", todo: "open the wire (e)",
    say: () => [
      L("protocol", "Every message, one line each: report, idea, decision, written, playing, measured, marked."),
      L("protocol", "Same lines on screen, in a file, and to anyone who connects."),
    ] },
];

export const PART_LABEL: Record<Part, string> = { claude: "claude", sound: "sound", sc: "supercollider", protocol: "protocol", djs: "listeners" };

const beat = (id: string) => BEATS.find((b) => b.id === id)!;
const discarded = (m: Msg, recent: Msg[]) => m.type === "verdict" && m.decision === "skip"
  && recent.some((x) => x.type === "verdict" && x.decision === "take" && x.t <= m.t && m.t - x.t < 2000);

/** Which beat a message belongs to, if any. */
export function beatOf(m: Msg, recent: Msg[]): Beat | null {
  switch (m.type) {
    case "proposal": return m.id != null ? beat("proposal") : null;
    case "verdict": return discarded(m, recent) || m.by === "host" ? null : beat(m.decision === "take" ? "take" : "skip");
    case "rejected": return beat("refused");
    case "active": return beat("active");
    case "outcome": return beat("graded");
    case "note": return m.from === "human" ? beat("note") : null;
    case "unlock": return beat("unlock");
    case "grant": return m.skill ? beat("power") : m.level === "auto" ? beat("takeover") : null;
    case "enter": return beat(m.remote ? "guest" : "enter");
    case "leave": return beat("leave");
    case "transition": return beat("transition");
    default: return null;
  }
}

export interface Script { current: Beat; message: Msg | null; since: number | null; shown: Set<string>; remaining: Beat[] }

/**
 * The beat to read now, the message that chose it, and which beats the demo has already reached. The current beat is
 * the newest message with a script, and stays until the next one: a demo pauses on a moment, and the words should
 * pause with it. `wireOpen` makes the wire its own beat, because opening it is a thing you do, not a message.
 */
// A listener walking in or out, a grade, an unlock, a grant or your own note is a moment the room should get to
// see, and each one is followed within a second by a new round of ideas (or, in a demo, by a refusal). Those hold
// the script for a few seconds against the beats that merely follow from them.
const HELD = new Set(["enter", "leave", "unlock", "power", "takeover", "guest", "graded", "note"]);
const FOLLOWERS = new Set(["proposal", "refused"]);
const HOLD_MS = 12000;

export function script(recent: Msg[], opts: { wireOpen?: boolean } = {}): Script {
  const shown = new Set<string>(["open"]);
  let current: Beat = beat("open"), message: Msg | null = null;
  const beats: { b: Beat; m: Msg }[] = [];
  for (const m of recent) { const b = beatOf(m, recent); if (b) { shown.add(b.id); beats.push({ b, m }); } }
  if (beats.length) ({ b: current, m: message } = beats[beats.length - 1]);
  if (FOLLOWERS.has(current.id)) {
    const held = [...beats].reverse().find((x) => HELD.has(x.b.id) && message!.t - x.m.t < HOLD_MS && !beats.some((y) => y.m.t > x.m.t && !FOLLOWERS.has(y.b.id) && y !== x));
    if (held) ({ b: current, m: message } = held);
  }
  // a refusal beside fresh ideas is a footnote, not the beat: the ideas are what is on the table
  if (current.id === "refused") {
    const ideas = [...beats].reverse().find((x) => x.b.id === "proposal" && Math.abs(x.m.t - message!.t) < 15000);
    if (ideas) ({ b: current, m: message } = ideas);
  }
  if (opts.wireOpen) { shown.add("wire"); current = beat("wire"); }
  return { current, message, since: message?.t ?? null, shown, remaining: BEATS.filter((b) => !shown.has(b.id)) };
}

// ---- the live strip -------------------------------------------------------------------------------------------
// The protocol in six words, with the one that is happening now lit: idea → check → write → play → measure → result.
// Under it, one short sentence about what is going on this second. This is what "feels live" is made of: the state
// changes the moment the message arrives, and the sentence changes with it.
// "vet" is the safety check of the text before it is written; "verdict" is the judgement of the claim after it played.
// They used to both be called "check", and nobody could tell which one the strip was on.
export const STEPS = ["idea", "vet", "write", "play", "measure", "verdict"] as const;
export type Step = (typeof STEPS)[number];
export interface Live { steps: { step: Step; state: "done" | "now" | "todo" }[]; now: string; what: string }

export const WHAT_IT_IS = "Claude suggests a change and says what it will do to the sound. You decide. The host plays it, then checks with a meter whether it was right.";

export function live(recent: Msg[], ctx: Context, now = Date.now()): Live {
  const r = ribbon(recent, now), skipped = r.skipped;
  const last = r.proposal ? [...recent].reverse().find((m) => m.type === "outcome" && m.proposal === r.proposal!.id) : null;
  const unchecked = last?.grade === "ungraded" ? String(last.reason ?? "the meter had no clean before and after") : null;
  let reached: Step | null = !r.proposal ? null
    : r.lit.has("graded") ? "verdict" : r.lit.has("measured") ? "measure" : r.lit.has("active") ? "play"
    : r.lit.has("applied") || r.lit.has("evaluated") ? "write" : r.lit.has("verdict") ? "vet" : "idea";
  const trueIdx = reached ? STEPS.indexOf(reached) : -1;
  // the app paces the display: a step is shown for a moment before the next, even when the host did both at once
  const idx = ctx.showStep != null && trueIdx > ctx.showStep ? ctx.showStep : trueIdx;
  if (idx !== trueIdx) reached = STEPS[idx];
  const done = reached === "verdict" || skipped;
  const steps = STEPS.map((step, i) => ({ step, state: (i < idx || (done && i === idx) ? "done" : i === idx ? "now" : "todo") as "done" | "now" | "todo" }));
  const ideas = ctx.ideas ?? 0;
  const secs = (ms?: number) => ms == null ? "" : `${Math.max(0, ms / 1000).toFixed(1)}s`;
  const tag = r.proposal ? `#${String(r.proposal.id)}${r.proposal.slot ? ` in ${String(r.proposal.slot)}` : ""}` : "";
  const sentence =
    ctx.thinking && reached !== "vet" && reached !== "write" ? `Claude Code is writing (${ctx.thinking.replace(/^.*?(\d+s)$/, "$1")}).`
    : !r.proposal ? `Listening. Next meter report in ${secs(ctx.nextReportMs) || "2 bars"}.`
    : skipped ? "Skipped. Next round soon."
    : reached === "idea" ? (ideas ? `${ideas} idea${ideas > 1 ? "s" : ""} on the table. Your call.` : "An idea arrived. Your call.")
    : reached === "vet" ? `Taken ${tag}. Vetting the text.`
    : reached === "write" ? `Written ${tag}. Lands on the next bar${ctx.nextBarMs != null ? ` in ${secs(ctx.nextBarMs)}` : ""}.`
    : reached === "play" ? `Playing ${tag}. Meter reports in ${secs(ctx.nextReportMs) || "2 bars"}, then the verdict.${ctx.awaiting != null ? " New ideas wait for it." : ""}`
    : reached === "measure" ? `Measured ${tag}. Judging the claim.`
    : unchecked ? `? ${tag}: could not judge, ${unchecked}.`
    : last ? `${ICON[String(last.grade)] ?? "○"} Verdict on ${tag}: ${last.grade === "hit" ? "right" : last.grade === "miss" ? "wrong" : "no real change"}. Claude reads it next round.`
    : `Verdict on ${tag} is in.`;
  return { steps, now: sentence, what: WHAT_IT_IS };
}

// ---- the components ------------------------------------------------------------------------------------------
// The demo is about four things: the picture, the listeners, the ideas, and the protocol that carries them. Each
// gets a permanent line with its live state and one sentence to say about it, so the presenter can talk about any
// of them at any moment, not only about whatever message arrived last. Pure: the app hands in the state.
export interface Section { id: "visuals" | "listeners" | "ideas" | "protocol"; label: string; status: string; say: string }
const LOOK: Record<string, string> = {
  orbit: "the signal drawn against itself", ring: "the waveform in a circle", terrain: "the spectrum as mountains", wire: "shapes shocked by the beat",
  gyroid: "a lattice lit by the beat", torus: "a ring turning once a bar", warp: "noise pushed by the pulse", moire: "rings folding every 8 bars",
  codefield: "the live code, lit by the sound", waterfall: "a picture of the spectrum",
};
export function sections(ctx: Context): Section[] {
  const playing = ctx.playing?.length ? ctx.playing.map((p) => `${p.slots.join(" ")} ${VOICE[p.inst] ?? p.inst}`).join(" · ") : "nothing yet";
  const who = ctx.listeners ?? [];
  const record = (l: NonNullable<Context["listeners"]>[number]) => {
    const checks = l.right + l.wrong + l.flat;
    return `${l.active ? "▸ " : ""}${l.name.toLowerCase()}${l.auto ? " (acting alone)" : ""}${l.guest ? " (guest)" : ""}: ${l.taken}/${l.offered} taken${checks ? `, ${l.right} right ${l.wrong} wrong` : ""}${l.powers.length ? `, powers ${l.powers.join(" ")}` : ""}`;
  };
  const opts = ctx.options ?? [];
  const ideas = opts.length ? opts.map((o) => `${o.n} ${describe(o.parts).replace(/^./, (c) => c.toLowerCase())} (${o.origin === "model" ? "Claude Code" : "instant"})`).join("  ·  ") : ctx.thinking ? `Claude Code is writing (${ctx.thinking.replace(/^.*?(\d+s)$/, "$1")})` : "none on the table";
  const c = ctx.lastCheck;
  const tally = (ctx.listeners ?? []).reduce((t, l) => ({ right: t.right + l.right, wrong: t.wrong + l.wrong, flat: t.flat + l.flat }), { right: 0, wrong: 0, flat: 0 });
  const soFar = tally.right + tally.wrong + tally.flat ? `  ·  so far ${tally.right} ✓ ${tally.wrong} ✗ ${tally.flat} ○` : "";
  const check = !c ? "no verdict yet: take an idea, wait two bars"
    : c.grade === "ungraded" ? `${c.id != null ? `#${c.id}: ` : ""}${c.who} said this would ${predicts(c.call)}${c.slot ? ` in ${c.slot}` : ""}. ? Not judged: ${c.reason ?? "no clean before and after"}`
    : `${c.id != null ? `#${c.id}: ` : ""}${c.who} said this would ${predicts(c.call)}${c.slot ? ` in ${c.slot}` : ""}. ${c.slot ? `That layer's meter` : "The meter"} says ${measured(c.text, c.grade)}`;
  // one line of state, one short line to say: the sidebar has about twenty rows for everything
  return [
    { id: "visuals", label: "PICTURE", status: `${ctx.look ?? "field"}: ${LOOK[ctx.look ?? ""] ?? "drawn from the live sound"}`, say: "Drawn from the live sound, not from a file. l look, p colours." },
    { id: "visuals", label: "SOUND", status: playing, say: "Six lines of SuperCollider code, one per layer, swapped on the bar." },
    { id: "listeners", label: "LISTENERS", status: who.length ? who.map(record).join("  ·  ") : "nobody in the booth", say: "Text files with a taste and a never-list. d in, x out, o acts alone." },
    { id: "ideas", label: "IDEAS", status: ideas, say: "Instant from a library, or written live by Claude Code. t asks in words." },
    { id: "protocol", label: "VERDICT", status: cap(check) + soFar, say: tally.flat >= 2 && !tally.right && !tally.wrong
        ? "○ is not a fail: it means the meter heard no difference. Two in a row says the moves are too gentle to register. Take a bolder one; the listener has been told the same."
        : c ? WHY_GOOD[c.grade] ?? WHY_GOOD.flat : "Every idea is held to its word by a meter. Nothing plays without a check and your yes." },
  ];
}
