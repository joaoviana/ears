// The agent's whole job: read the code and the listening report, write ONE replacement slot.
// It runs through the `claude` CLI (your subscription, no API key) with every tool switched off,
// so the only thing it can produce is text, and the only path from that text to the speakers is a human pressing y.
import { spawn } from "child_process";
import { LOOKS, PALETTE_NAMES } from "./ascii.ts";
import { HAIR, EYES, CANS, BODY, HEAD, SPECIES, type DJ } from "./djs.ts";
import { applyPatch, describe, describeMove, parseSlot, type Part, type Patch } from "./patch.ts";
import { SKILLS, missing, sampleNames } from "./skills.ts";
import { parseExpect, METRICS, type Expect } from "./shots.ts";
import { METRIC_TABLE } from "./vocabulary.ts";
import { inspirationPrompt, type Inspiration } from "./inspiration.ts";
import { DEFAULT_WILD, angleKind, compositionBrief, hasPatternChange } from "./direction.ts";

/** `parts` is the whole move; `slot`/`code`/`diff` are its first part, so every single-slot reader still works. */
export interface Suggestion { origin?: "recipe" | "model"; recipe_id?: string; inspiration_id?: string; slot: string; code: string; why: string; evidence: string; diff: string; parts: Part[]; angle: string; ms: number; forBars?: number; transition?: "build" | "wash"; expect: Expect }
export interface Past { slot: string; why: string; verdict: "y" | "n" | "x"; id?: number; outcome?: string; agent?: string; recipe_id?: string }

const SYSTEM = `You are a guest DJ standing next to a live coder in a live-coded dance set whose style is given with the code. You cannot hear audio and you cannot touch the code. You read a listening report (measurements of the master bus compared to a reference) and the performer's current code, and you offer ONE musically recognisable idea as a concise patch. Concise code can make a bold musical change. Other options come from other musical angles or DJs; commit to your assigned angle. The performer takes one or none. Your idea is projected in front of an audience, so they must be short and legible.

The code is SuperCollider. Each slot is exactly one expression:
  ~d.(\\dN, \\instrument, \\NAME, \\dur, ..., key, value, ...)
Slots are d1..d6 (by convention: d1 kick, d2 hats, d3 clap/perc, d4 bass, d5 chords, d6 lead or texture; any slot can hold anything). 4 beats per bar, \\dur is in beats. Tempo and key are given with the code; stay in key.
Rhythm rows: \\amp, ~x.("X---x---X---x-x-", 0.9) with \\dur 1/4 is a 16-step row: X = hit at that amp, x = ghost, - = rest. Prefer it for drums: the audience can read it. A list of rows plays one per bar, so ["rowA", "rowA", "rowA", "rowB"] is a groove with a turnaround.
Harmony: \\ctranspose, Pseq([0, -4, 3, -2], inf).stutter(16) moves a riff through a chord progression (semitones, one value per bar at \\dur 1/4). Sidechain: \\duck (0..1) on \\bass and \\pad makes them lean away from the kick; 0.7 pumps.
When changing dur, preserve phrase alignment: a one-bar .stutter(16) at dur 1/4 becomes .stutter(12) at dur 1/3. Retiming the rhythm without retiming ctranspose can accidentally change the harmony. For deliberately crossing cycles, leave the other voices and their harmony anchored.
Patterns: Pseq([...], inf), Rest(0) or \\r for rests, arrays for chords, .stutter(n) to hold values.
Randomness is welcome and makes parts breathe: Prand([...], inf), Pwrand([...], [weights], inf), Pwhite(lo, hi), Pbrown(lo, hi, step), Pshuf([...], inf). Patterns can be multiplied: Pseq([...], inf) * Pwhite(0.8, 1.1).
Time is two knobs, not one: \\dur is how long a note SOUNDS, \\delta is how long until the NEXT one starts. Equal by default. Set them apart and the voice changes character: \\delta, 0.125, \\dur, 0.9 overlaps into a wash; \\delta, 0.5, \\dur, 0.05 leaves holes. Pexprand(0.02, 0.3, inf) on \\delta gives unevenly clustered, human timing instead of a grid. Pseg([200, 2400, 300], 2, repeats: inf) sweeps a value smoothly ACROSS events, so a filter can open over two beats. Pseq nests with repeat counts for phrase structure: Pseq([Pseq([0.05, 0.05, 0.1], 5), Pseq([0.25, 0.125], 3)], inf). \\midinote takes fractions, so 60.25 is a quarter-tone and Pwhite(-0.15, 0.15) added to a note detunes it slightly per hit.
Instruments and their arguments:
  \\kick  amp, tune (Hz 36-60), dec (0.15-0.6 s), drive (1-3), punch
  \\hat   amp (0.05-0.35), dec (0.03 closed .. 0.16 open), hp (Hz), pan
  \\clap  amp, send (reverb 0..1)
  \\bass  midinote, amp, cutoff (Hz; low = dark and subby, high = bright and thin), res (0..3.5, 2.5+ growls), dec
  \\acid  midinote, amp, cutoff (base Hz), env (how far the filter opens per note, 500-5000), res (0..1, 0.85+ squelches), dec, wave (0 saw .. 1 square), send
  \\stab  midinote (array = chord), amp, cutoff, dec, send
  \\supersaw midinote, amp (0.15-0.25), detune, cutoff, env, res, att, sus, rel, spread, send. Detuned saw chords, octave riffs and arpeggios.
  \\fm    midinote, amp, ratio (1 warm, 2 hollow, 3.5 bell, 7.1 metal), index (0.5-8 bite), dec, pan, send
  \\choir midinote (array = chord), amp (0.1-0.3), vowel (0 a, 1 e, 2 i, 3 o, 4 u; a Pseq morphs it), att, sus (seconds held), rel, bright (0.8-1.3), send, duck; long \\dur like 4 or 8. A synthetic choir pad.
  \\pad   midinote (array = chord), amp (0.1-0.3), cutoff, att, sus (seconds held), rel, send; use long \\dur like 8 or 16
  \\perc  freq (Hz: 80 tom .. 800 blip), amp, dec, pan, send, click
  \\snare amp, freq (150-260, the body), dec, snap (0..1, how much of it is noise), pan, send
  \\rim   amp, freq (1200-2600), dec (0.02-0.06), pan. A tick: offbeats, ghost notes, 3-3-2 patterns
  \\sub   midinote, amp, dec, drop (0..4, bends the pitch down into the note), duck. Pure weight, or the drop itself at long dec
  \\reese midinote, amp, detune (0..3, how much the two saws beat), cutoff, res, dec, rate (filter LFO in Hz), duck
  \\pluck midinote, amp, dec, tone (0..1 brightness), pan, send. A plucked string or marimba
  DIRT is the difference between this and a stock plugin, and almost nothing uses it. \\crush (0..1 bit + rate
         reduction, 0.4+ starts aliasing into grit) and \\fold (0..1 wavefolding) are on \\bass \\stab \\fm \\reese
         \\supersaw \\smp \\keys \\gendy. \\rate on \\smp retunes a drum (1.7 = chipmunked, 0.6 = slowed). \\duck at 0.8+
         pumps hard. Reach for these before reaching for a level.
  \\supersaw also takes \\bend (semitones it swoops FROM into the note; -12 dives up, +7 falls in), \\bendt (how
         long that takes, 0.03-0.2), \\drive (1-20 hard saturation), \\ring + \\ringf (0..1 ring-mod mix and its
         frequency, for metallic). Seven detuned saws at \\detune 0.8 with \\spread 1 is a wall.
  \\gendy midinote, amp, knum (2-32 breakpoints: 3-6 rough and vocal, 20+ smooth), chaos (0..1 how far it wanders),
         scale (0..1 step size), cutoff, res, dec, pan, send. Xenakis stochastic synthesis: the waveform redraws itself
         every cycle, so no two notes are identical. Grit bass, broken percussion, a lead that will not sit still.
  \\smp   the SAMPLED drum kit - real 909 and LinnDrum one-shots, and why the drums sound like a record. \\buf picks the
         voice: one sample with \\buf, ~k.(\\kick), or a whole row with \\buf, ~kp.("--s-C--s-s--C-t-") read like an ~x row,
         one char per step: k kick, C clap, n snare, h hat, H open hat, r ride, s shaker, t tambourine, m rim, w cowbell,
         x crash, c/v/b conga hi/mid/lo, - silence. A list of rows turns around like ~x. Also amp, dec (a choke - short
         closes a hat), rate (retune), pan, hp, send. On a slot already using \\smp, stay on it: do not swap back to \\kick
         or \\hat, and change the row, the amps, the dec or the voices instead.
         On a REPLACE the host fills \\buf for \\smp and the \\buf / \\rootfreq pair for \\keys, so DO NOT write them -
         set only the instrument, dur, the notes and the rhythm, exactly as for any other instrument.
         Both \\smp and \\keys also take \\wow (0..0.02) and \\flut (0..0.01): tape drift. Tiny values (0.004) stop a
         sample sounding pasted in; past about 0.02 it is seasick. Good on held notes, inaudible on short drum hits.
  \\keys  the SAMPLED piano. \\midinote (array = chord) and then \\buf, ~kf, \\rootfreq, ~kr - all three, in that order,
         because ~kf and ~kr read the note off the event to pick the nearest sampled octave. Also amp, dec (how long the
         note is held, in seconds), rel, att, pan, duck, send. Keep the ~kf / ~kr pair on any \\keys slot you edit.
  \\noise amp, freq (centre of the band), bw (0.05 narrow .. 2 wide), sweep (>1 rises, <1 falls), att, dec, pan, send. Risers, waves, shakers, atmosphere
  \\nature plays bundled public-domain field recordings. buf is ~n.(\\rain), ~n.(\\waves), or ~n.(\\birds); use long dur/len (16-48), att 3-10, rel 5-12, amp 0.03-0.14, start 0..0.98, rate 0.7-1.15, hp, lp, pan and send. Preserve recognisable rain, water, or birds; it is an environment, not percussion.
CHARACTER, on \\bass \\stab \\fm \\reese only: \\crush (0..1 sample-and-bit reduction: 0.3 is grit, 0.8 is a broken transmitter) and \\fold (0..1 wavefolder: adds harmonics and bite without getting louder). Both default to 0 and are the fastest way to make a part sound like a different record.
Nothing else exists. No new SynthDefs, no other functions, no semicolons, one expression.

You answer with a MOVE, never whole code, in exactly this plain-text form and nothing else:
SLOT d3
SET cutoff = 600
SET res = 2.8
REMOVE pan
EXPECT brightness down
WHY one sentence
EVIDENCE the report line or style rule
Keys have no backslash. The value after "=" is SuperCollider source for that key, on one line. REMOVE lines are optional.
To fill an empty slot or rewrite a voice from scratch, write "SLOT d4 REPLACE" and set ONLY four things: instrument (e.g. SET instrument = \\clap), dur, the notes (midinote or freq) and the rhythm (an ~x row or a Pseq of rests). The host fills every other key with that instrument\'s own sensible value, so do not write amp, dec, cutoff, send, pan and the rest unless the idea actually depends on them. Shorter answers arrive sooner and the room is waiting.

A MOVE MAY TOUCH UP TO THREE SLOTS. Repeat the SLOT block; the SET and REMOVE lines under each one belong to it. WHY, EVIDENCE and EXPECT are written once, for the whole move, and every slot lands together on the same bar line.
SLOT d2
SET amp = ~x.("X-x-X-x-X-x-X-x-", 0.14)
SLOT d4
SET duck = 0.75
SET cutoff = 900
EXPECT sub up
WHY Hats step back and the bass leans into the kick, so the floor opens up.
EVIDENCE d2 is +12 dB louder than it should be
Use a second slot when the idea needs it: one voice makes room and another fills it. One slot is still right for a mix correction.

LAYERING. Two voices on the same steps in different registers is one thicker part: a sub under a bass, a rim on a clap, a pluck an octave over a lead. It is the cheapest way to sound bigger, and one MOVE does it — set the doubling voice, duck what it doubles. The report says which parts are alone; those are the ones to thicken.

ADD, DON'T ONLY TRIM. Space can be musical too, but a plain gain cut is not a new musical idea. Before reaching for a cut, ask whether the fix is something MISSING: a counter-rhythm against a straight part, an answer in the gaps of a busy one, an empty slot nobody has filled, ghost notes where a row is all rests. Prefer rearranging hits and registers to escalating levels. Preserve a recognisable anchor while another part gets adventurous.
Choose the musical idea FIRST, then predict a measurable side effect. HIT measures prediction accuracy, not musical quality; a same prediction is valid. Do not chase the reference mix or increase gain just to win a metric. A skipped alternative is not evidence that the performer dislikes its style.
EXPECT is your called shot and it is required: one line, "EXPECT <metric> <up|down|same>". Two bars after your change lands, the host measures it and grades you HIT, MISS or FLAT (no detectable effect). Your record is shown to the room and comes back to you.

WHAT THE HOST MEASURES, AND WHAT ACTUALLY MOVES IT. Find your change in a "moved by" line and call THAT metric.
${METRIC_TABLE}
Naming the wrong one is the commonest mistake: a buried kick coming back is sub up and loudness up, not punch up.

Rules:
- If the performer wrote a note, it is an instruction: every angle answers it, in your style. It outranks the report and your own plans (only your Never list outranks it; if they conflict, say so in WHY and offer the nearest thing).
- "why" is one sentence, under 14 words, in your own voice. "evidence" quotes the report line you acted on, or names your style rule.
- Stay in character: your Never list is absolute.`;

// Ambient rounds use a smaller, purpose-built prompt. The club manual is both irrelevant and expensive here; worse,
// it advertises vocals, drums and bass behaviours that pull a calm environment toward ominous dance-music tropes.
const AMBIENT_SYSTEM = `You are a DJ tending a bright, calm D-lydian nature environment in SuperCollider. You cannot
hear it. Read the current source and compose ONE coherent arrangement move, normally with TWO linked slot changes:
introduce a distinct foreground material and mutate or remove another current layer so it makes room or answers.
Use one slot only for a surgical request. The room must change within seconds, then remain pleasant
for minutes. Never use voice, vox, voxpad, choir, formants, slurred vocals, drums, a bass riff, a permanent low drone,
a drop, distortion, an obvious repeating ostinato, bells, chimes, porcelain, glassy pings, long struck resonators,
Gendy, or sparse synthetic high notes. Those read as ominous here. Use recognisable samples, paper, brush, fingertips, leaves,
wood and filtered weather for detail instead.

Build a clear high/low and busy/empty arc. High means unpitched leaf air, rain hiss or granular sample detail, never
a struck note. Low means a short tactile body impulse, never a continuous drone. Prefer rhythms that change family:
brief clusters, displaced pairs and threes, then 4-16 beat holes. At least one parameter may wander stochastically
with Pwhite, Pbrown or Pexprand so rare events keep appearing, but the first change must still be audible quickly.
Foreground textures should be confident: use the upper half of the listed amp range and make filter travel broad.

There are six source slots, each one expression: ~d.(\\dN, \\instrument, \\name, key, value, ...). Replacing a slot is
how something new enters; do not preserve a boring layer merely because it exists. Protect recognisable waves, rain
and birds unless your idea deliberately reframes one of them. Every slot also has reliable post-instrument controls:
fxhp 25..1800, fxlp 700..12000, fxmotion 0..1, fxrate 0.02..0.3, fxdrive 0..0.35 and fxspace 0..0.7. These process
the CURRENT sound regardless of its instrument. For a transformation, patch those keys without REPLACE and preserve
the instrument, buffer and recognisable identity. Make the contrast large enough to hear on the next phrase.

Useful instruments:
- \\droplet: midinote, sub 36-95 Hz, amp 0.02-0.07, dec 0.2-1.6, tone 0..1, splash 0..1, pan, send
- \\twig: midinote, amp 0.02-0.06, dec 0.08-0.5, tone 0..1, hollow 0..1, pan, send
- \\rustle: freq 500-7000, amp 0.015-0.045, dec 0.3-2.5, grain 2-80, bw 0.08-1.4, pan, send
- \\nature: buf ~n.(\\rain|\\waves|\\birds), dur/len 16-48, att 4-12, rel 6-14, rate, start, hp, lp, amp, pan, send
- \\texture: buf ~t.(\\fingertips|\\marbles|\\paper|\\brush), rate 0.35-0.95, start 0..0.9, len 2-6, att 0.01-0.1, rel 0.3-1.2, hp, lp, amp 0.09-0.30, pan, send
- \\cloud: buf ~g.(\\rain|\\waves|\\birds|\\fingertips|\\marbles|\\paper|\\brush), rate 0.3-1.1, pos 0..1, wander 0.02-0.25, grain 0.04-1.2, density 4-40, jitter 0..0.18, att/sus/rel, hp/lp, spread, shimmer 0..0.08, amp 0.06-0.18, send. Granular, continuously moving sample memory.
D-lydian pitch material for the rare pitched physical gesture: low 38/45/50; middle 50,52,54,56,57,59,61,62.
Use changing 5-8 step Pseq phrases on \\delta for close pairs, displaced accents and long holes; use Pexprand only
when truly unmetered spacing is the idea. Use Pwrand with rests, Pbrown for slow placement, and Pseg for changes over
16-80 beats. The first audible contrast must arrive within eight beats. Silence is valid. One coherent mutation beats a pile of layers. Prefer granular material, physical
sampled physical texture and changing negative space over stock pads, tuned percussion or generic wellness ambience. Make a recognisable sonic image.

Reply only:
SLOT dN REPLACE
SET instrument = \\name
SET dur = value
SET midinote = value
SET delta = value
SET any_needed_key = value
REMOVE stale_key
EXPECT <sub|low|mid|high|air|brightness|loudness|density> <up|down|same>
WHY one vivid sentence under 14 words
EVIDENCE the current source relationship you changed

Normally repeat SLOT for the linked second part. Both parts land together and must describe one audible relationship,
not two unrelated presets. Use only needed SET lines. You may touch up to three slots. No
semicolons, new SynthDefs, tools, shell, files, or prose outside the move.`;

// Three angles asked in parallel. Each call writes a few dozen tokens, so the first idea is on screen in seconds.
export const ANGLES: Record<string, string> = {
  droplets: "YOUR ANGLE: submerged texture. Compose close-mic water with a soft 36-80 Hz body, filtered grain and irregular spacing. Avoid bells, glass chimes and bright resonant pings.",
  pulse: "YOUR ANGLE: organic pulse. Replace one stale layer with an uneven wood, pebble, leaf or reed rhythm. It must be audible quickly, remain quiet, use rests or changing gaps, and never resemble a drum loop.",
  texture: "YOUR ANGLE: texture. Replace one stale layer with a new organic texture that can live for minutes.",
  transform: "YOUR ANGLE: transform. Remove the most static musical foundation and reveal a surprising tactile relationship using physical or sampled material.",
  groove: "YOUR ANGLE: groove. Change the rhythmic conversation: accents, rests, interlocking parts, cycle lengths or a phrase turnaround. Choose the mechanism from the current material; make the beat visibly and audibly behave differently. Preserve the tonal hook. Static gain, duck and filter corrections do not qualify.",
  hook: "YOUR ANGLE: hook. Write a memorable melodic or harmonic event: a motif with an answer, an evolving arpeggio, or syncopated chord movement. Choose the mechanism from the current material, key and chord progression. Leave the drum groove recognisable. Doubling an existing part or lifting its volume alone does not qualify.",
  fix: "YOUR ANGLE: fix. Find the single biggest problem in the listening report and correct it. Prefer the smallest change that actually moves the measurement; if the cause is one voice sitting on another, moving both is one fix, not two.",
  // the benchmark found the DJs almost never add anything: 69% of ideas turned something down, and `density` was
  // called once in 392. This angle exists to make arriving material as available as trimming it.
  add: "YOUR ANGLE: add. Something is MISSING, not too loud. Find what the track does not have — an empty slot, a rhythm nobody is answering, a register nobody is in, a part that has not changed in a long time — and put something there, in your own idioms. You may use two or three slots: the new thing plus whatever has to move aside for it (level, filter, duck, a thinned row). Do not make this a mix correction; the room should hear something arrive.",
  // the third option is never a refinement: it is the thing least like what's playing, so there's always a way out
  turn: `YOUR ANGLE: left turn. Ignore the listening report. Offer a surprising but coherent transformation of one voice, chosen from the current material. Read the code, name the thing everything has in common (all straight 16ths? everything dark and low? four-on-the-floor for ages? one chord? nothing above middle C? every slot busy?), and break exactly that in ONE slot: a different rhythm family (straight vs broken vs euclidean vs triplets vs half-time), a different instrument in that slot, a jump of an octave or more, silence where it's been busy, or a new harmonic centre via \\ctranspose. You may patch a pattern or use "SLOT dN REPLACE"; preserve sample bindings and harmony that the idea still needs. At least the instrument, the rhythm (\\dur or the ~x rows) or the register must differ from that slot's current code. Not a parameter tweak, not a filter move. Stay in key and in your character; keep it something a room can dance to. WHY must name the audible transformation and what it contrasts with ("everything is straight 16ths, so: triplets").`,
};

const FORBIDDEN = /unixCmd|systemCmd|\bFile\b|\bPipe\b|interpret|compile|thisProcess|\.load|Quarks|NetAddr|Server|\bs\.|SynthDef|;|\bexit\b/;

/** The agent's text never reaches the engine without passing this. */
export function validate(s: { slot: string; code: string }): string | null {
  const code = s.code.trim();
  if (!new RegExp(`^~d\\.\\(\\\\${s.slot}\\b`).test(code)) return `must start with ~d.(\\${s.slot}, ...`;
  if (FORBIDDEN.test(code)) return "uses something outside the instrument vocabulary";
  let depth = 0;
  for (const ch of code) { if ("([".includes(ch)) depth++; if (")]".includes(ch)) depth--; if (depth < 0) break; }
  if (depth !== 0) return "unbalanced brackets";
  if (code.length > 600) return "too long to read on a projector";
  return null;
}

// Allow a musical idea and one substantive retry to finish; superseded rounds still cancel immediately.
const RETRY_BY = Number(process.env.EARS_RETRY_BY || 60000), RETRY_DEADLINE = 30000;
const MODEL = process.env.EARS_MODEL || "sonnet";   // EARS_EFFORT overrides the mode's composition effort.

function claude<T>(prompt: string, system: string, schema: object, timeout = 70000): Promise<T> {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", prompt, "--system-prompt", system, "--json-schema", JSON.stringify(schema), "--output-format", "json",
      "--model", MODEL, "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { p.kill(); reject(new Error(`no answer within ${(timeout / 1000).toFixed(0)}s`)); }, timeout);
    p.on("close", () => {
      clearTimeout(timer);
      try { const res = JSON.parse(out); resolve(res.structured_output ?? JSON.parse(res.result)); }
      catch { reject(new Error((err || out).slice(0, 160) || "agent returned nothing")); }
    });
  });
}

// Composition gets time to finish. Valid options appear independently; no synthetic filler is offered.
const DEADLINE = Number(process.env.EARS_DEADLINE || 45000);
const FAVOURITE_DEADLINE = Number(process.env.EARS_DEADLINE || 60000);
function claudeText(prompt: string, system: string, timeout = DEADLINE, effort = process.env.EARS_EFFORT || "low", signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("request cancelled")); return; }
    const p = spawn("claude", ["-p", prompt, "--system-prompt", system, "--output-format", "text", "--model", MODEL, ...(effort === "default" ? [] : ["--effort", effort]), "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { p.kill(); if (process.env.EARS_DEBUG_AGENT) console.error("TIMEOUT sys=" + system.length + " prompt=" + prompt.length + " out=[" + out.slice(0, 300) + "] err=[" + err.slice(0, 300) + "]"); reject(new Error(`no answer within ${(timeout / 1000).toFixed(0)}s`)); }, timeout);
    const cancel = () => { p.kill(); clearTimeout(timer); reject(new Error("request cancelled")); };
    signal?.addEventListener("abort", cancel, { once: true });
    p.on("error", error => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(error); });
    p.on("close", () => { signal?.removeEventListener("abort", cancel); clearTimeout(timer); out.trim() ? resolve(out) : reject(new Error(err.slice(0, 120) || "agent returned nothing")); });
  });
}

/**
 * Lenient on purpose: models add blank lines, code fences and stray backslashes.
 * Each `SLOT dN` opens a block and the SET/REMOVE lines under it belong to that slot; WHY, EVIDENCE, EXPECT, FOR and
 * WITH describe the whole move wherever they appear. A single-slot answer parses exactly as it always did.
 */
export type Parsed = { patches: Patch[]; why: string; evidence: string; forBars?: number; transition?: "build" | "wash"; expect?: Expect };
export const MAX_SLOTS = 3;

/**
 * How far out the booth is allowed to go. The CLI has no temperature, so this is built from the things the host
 * controls: which angles get asked, how many voices one move may touch, how hard the model thinks, and how big a
 * change has to be before it counts. Every level is enforced, not merely described.
 */
export const WILD = [
  { name: "tame",      angles: ["fix", "fix", "add"],   slots: 1, effort: "low",    push: 1, say: "corrections only, one voice at a time" },
  { name: "house",     angles: ["fix", "add", "turn"],  slots: 3, effort: "low",    push: 1, say: "a fix, something new, and one left turn" },
  { name: "loose",     angles: ["groove", "hook", "turn"], slots: 3, effort: "medium", push: 2, say: "twist the groove, write a hook, take a left turn" },
  { name: "unhinged",  angles: ["turn", "groove", "hook"], slots: 3, effort: "medium", push: 4, say: "crossed rhythms, mutated hooks, bigger departures" },
] as const;
export function parseMove(text: string): Parsed | null {
  const p: Parsed = { patches: [], why: "", evidence: "" };
  let cur: Patch | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^[`>*\s-]+/, "").trim(); let m: RegExpMatchArray | null;
    if ((m = line.match(/^SLOT\s+\\?(d[1-6])\b(.*)$/i))) {
      const slot = m[1].toLowerCase(), replace = /replace/i.test(m[2]);
      cur = p.patches.find((x) => x.slot === slot) ?? null;          // a repeated slot keeps adding to the same block
      if (cur) { if (replace) cur.replace = true; }
      else { cur = { slot, set: [], remove: [], replace }; p.patches.push(cur); }
    }
    else if ((m = line.match(/^SET\s+\\?([A-Za-z]\w*)\s*=\s*(.+)$/i))) cur?.set.push({ key: m[1], value: m[2].trim().replace(/,$/, "") });
    else if ((m = line.match(/^REMOVE\s+\\?([A-Za-z]\w*)/i))) cur?.remove!.push(m[1]);
    else if (/^EXPECT\b/i.test(line)) p.expect = parseExpect(line) ?? p.expect;
    else if ((m = line.match(/^FOR\s+([12])\b/i))) p.forBars = Number(m[1]);
    else if ((m = line.match(/^WITH\s+(build|wash)\b/i))) p.transition = m[1].toLowerCase() as "build" | "wash";
    else if ((m = line.match(/^WHY\s*:?\s*(.+)$/i))) p.why = m[1];
    else if ((m = line.match(/^EVIDENCE\s*:?\s*(.+)$/i))) p.evidence = m[1];
  }
  p.patches = p.patches.filter((x) => x.set.length || x.remove!.length);
  return p.patches.length && p.why ? p : null;
}

const persona = (d: DJ) => `\n\nYOU ARE ${d.name}. ${d.tagline}\nStyle: ${d.style}\nIdioms you reach for:\n${d.idioms.map((x) => "- " + x).join("\n")}\nNever:\n${d.never.map((x) => "- " + x).join("\n")}`;

/** Is this patch really a departure? Different instrument, different rhythm, or a register an octave away. */
function isTurn(before: string, p: Patch): boolean {
  const old = Object.fromEntries(parseSlot(before).map((x) => [x.key, x.value])), get = (k: string) => p.set.find((x) => x.key.replace(/^\\/, "") === k)?.value;
  if (!before.trim()) return true;                                     // filling an empty slot is always new
  const inst = get("instrument"), dur = get("dur"), amp = get("amp"), notes = get("midinote") ?? get("freq");
  const mean = (v?: string) => { const n = (v?.match(/\b\d{2,4}\b/g) || []).map(Number); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };
  const a = mean(notes), b = mean(old.midinote ?? old.freq), isFreq = !!get("freq");
  return (!!inst && inst !== old.instrument) || (!!dur && dur !== old.dur) || (!!amp && /~x\./.test(amp) && amp !== old.amp) || (a !== null && b !== null && Math.abs(a - b) >= (isFreq ? b * 0.9 : 11));
}

export interface AskInput { signal?: AbortSignal; inspiration?: Inspiration | null; round?: number; dj: DJ; /** a skill id the DJ must use this round: replaces the bold angle with a showcase */ showcase?: string | null; /** skills the human has activated for this DJ */ skills?: string[]; context: string; slots: Record<string, string>; report: string; /** what has not moved lately, for the `add` angle: the host's answer to "what is missing" */ quiet?: string; /** recent left-turn descriptions, so the angle avoids repeating the same trick */ turns?: string[]; /** what doubles what, and what is carrying its part alone */ layers?: string[]; /** the slot the host would like this angle to work on, so three answers do not land on one voice */ aim?: Record<string, string>; /** learned taste and audibility by ambient recipe */ recipeScores?: Record<string, number>; /** 0 tame .. 3 unhinged */ wild?: number; /** ask this one angle only: one idea per DJ, so a booth of three is three voices rather than one brain */ angle?: string; note: string; history: Past[] }

/**
 * Each angle sees a DIFFERENT room, because they were all solving the same problem otherwise.
 * A ranked report names one biggest problem, so handing the same text to three angles bought three variations of one
 * idea — the screen showed `low`, `low`, `low`. Withholding is the only thing that works: an angle told to ignore the
 * report does not ignore it.
 */
// Collisions were 13 of 19 refusals, nearly all on d6, and a retry fires 8-10s too late to help. Steering each
// angle at a different voice up front costs nothing and is the host's job: it is the one that knows which slot
// drifted, which is empty and which nobody doubles.
function pushLine(input: AskInput): string {
  if (/ambient|nature/i.test(input.context)) return "";
  const w = WILD[Math.max(0, Math.min(WILD.length - 1, input.wild ?? DEFAULT_WILD))];
  if (w.push <= 1) return "";
  return `\n\nTHE ROOM WANTS ${w.push >= 4 ? "AN ADVENTUROUS TRANSFORMATION: combine two pattern mechanisms, such as a displaced cycle plus a changing answer" : "A CLEAR MUSICAL EVENT: change the phrase, not just its mix"}. Keep levels comparable and one rhythmic anchor intact. Bigger means more musical contrast, never ${w.push}x the gain. Use the named pattern tools; no unbounded note bursts.`;
}

function aimLine(angle: string, input: AskInput): string {
  const slot = input.aim?.[angleKind(angle)];
  return slot ? `\n\nSTART FROM ${slot.toUpperCase()}. The other two angles are being pointed at different voices so the performer gets a real choice; work on ${slot} unless the idea genuinely belongs somewhere else, and say why in WHY if you move.` : "";
}

function reportFor(angle: string, input: AskInput): string {
  angle = angleKind(angle);
  if (["droplets", "pulse", "texture", "transform"].includes(angle)) return "Do not repair meters. Change the composition: preserve calm and nature while replacing a stale relationship.";
  if (angle === "groove" || angle === "hook") return `Choose from the current code and musical challenge. Mix repair is another job. ${input.quiet || ""}`;
  const empty = Object.entries(input.slots).filter(([, v]) => !v.trim()).map(([k]) => k);
  if (angle === "turn") return "NO LISTENING REPORT FOR THIS ANGLE. You are not fixing anything. Read the code and choose by what it is, not by how it measures.";
  if (angle === "add") return [
    "WHAT IS MISSING (this angle does not get the problem list; the mix-fixing angle has that one)",
    empty.length ? `Empty slots, nobody is using them: ${empty.join(", ")}` : "Every slot has something in it.",
    input.quiet || "",
    ...(input.layers?.length ? ["", "WHAT IS LAYERED AND WHAT IS ALONE (a part nobody doubles is the one to thicken)", ...input.layers] : []),
    "", "The measurements, for reference only — do NOT simply correct the worst line, that is another angle's job:",
    input.report.replace(/^THE BIGGEST PROBLEM:.*$/im, "").replace(/^Then:.*$/im, "").trim(),
  ].filter(Boolean).join("\n");
  return input.report;
}

/** Fires every angle at once and hands each idea over the moment it validates. Resolves when all are in. */
export function ask(input: AskInput, onOption: (o: Suggestion) => void, onEvent: (kind: string, detail: Record<string, unknown>) => void = () => {}, generate: typeof claudeText = claudeText): Promise<Suggestion[]> {
  const ambient = /ambient|nature/i.test(input.context);
  const promptFor = (angle: string) => [
    "TEMPO AND KEY", input.context, "",
    "CURRENT CODE", ...Object.entries(input.slots).map(([k, v]) => `-- ${k}\n${v.trim() || "(empty)"}`),
    "", "LISTENING REPORT", reportFor(angle, input),
    "", inspirationPrompt(input.inspiration),
    "", "PERFORMER NOTE", input.note || "(none)",
    "", "RECENT IDEAS", input.history.length ? input.history.slice(ambient ? -3 : -8).map((h) => { const mine = !h.agent || h.agent === input.dj.id; return `${mine ? "" : `[${h.agent}] `}${h.verdict === "y" ? "taken" : h.verdict === "x" ? "engine-refused" : "skipped"} ${h.slot}: ${h.why}${!ambient && h.outcome && mine ? `\n        ${h.outcome}` : ""}`; }).join("\n") : "(none)",
  ].join("\n");
  const got: Suggestion[] = [], t0 = Date.now();
  const sk = input.showcase ? SKILLS.find((k) => k.id === input.showcase) : null;
  const angles: [string, string][] = sk
    ? [["showcase", `YOUR ANGLE: showcase. The performer wants to hear your ${sk.name} skill NOW. This idea MUST use it exactly as taught. Work on the current ambient voice; do not introduce drums or voices. Do not offer anything else.`], ...(input.angle ? [] : ["groove", "hook"].map(a => [a, ANGLES[a]] as [string, string]))]
    : input.angle ? [[input.angle, ANGLES[angleKind(input.angle)] ?? ANGLES.fix] as [string, string]]
    : (WILD[Math.max(0, Math.min(WILD.length - 1, input.wild ?? DEFAULT_WILD))].angles as readonly string[]).map((a, i, all) =>
        [all.indexOf(a) === i ? a : `${a}${i}`, ANGLES[a]] as [string, string]);
  return Promise.all(angles.slice(0, Number(process.env.EARS_ANGLES || 3)).map(async ([angle, brief]) => {
    onEvent("ask", { agent: input.dj.id, angle, model: MODEL, ...(input.inspiration ? { inspiration_id: input.inspiration.artifact_id, development: input.inspiration.intent } : {}) });
    try {
      const active = input.skills || [], taught = SKILLS.filter((k) => active.includes(k.id)).map((k) => k.teach).join("\n");
      const prompt = promptFor(angle);
      const used = angleKind(angle) === "turn" && input.turns?.length
        ? `\n\nRECENT LEFT-TURN IDEAS OFFERED IN THIS SET: ${input.turns.join("; ")}. Avoid repeating those musical tricks; find a fresh relationship to the current material. Take a different axis: a different instrument family, an octave jump, silence where it has been busy, a new harmonic centre, half-time or double-time, or a rhythm family nobody has used.`
        : "";
      const sys = (ambient ? AMBIENT_SYSTEM : SYSTEM) + persona(input.dj) + (taught ? "\n\nACTIVE SKILLS:\n" + taught : "") + "\n\n" + brief + aimLine(angle, input) + pushLine(input) + (ambient ? "" : compositionBrief(angle, input.context)) + used;
      const p = parseMove(await generate(prompt, sys, input.inspiration ? FAVOURITE_DEADLINE : DEADLINE, process.env.EARS_EFFORT || (ambient ? "low" : WILD[Math.max(0, Math.min(WILD.length - 1, input.wild ?? DEFAULT_WILD))].effort), input.signal));
      if (input.signal?.aborted) return;
      if (!p) { onEvent("rejected", { agent: input.dj.id, angle, reason: "not in patch form", ms: Date.now() - t0 }); return; }
      if (!p.expect) { onEvent("rejected", { agent: input.dj.id, angle, reason: "no called shot: an idea must say what it expects to change (EXPECT <metric> <up|down|same>)", ms: Date.now() - t0 }); return; }
      const cap = WILD[Math.max(0, Math.min(WILD.length - 1, input.wild ?? DEFAULT_WILD))].slots;
      if (p.patches.length > cap) { onEvent("rejected", { agent: input.dj.id, angle, reason: `a move touches at most ${cap} slot${cap > 1 ? "s" : ""} at this level; this one touches ${p.patches.length}`, ms: Date.now() - t0 }); return; }
      if (angleKind(angle) === "turn" && !isTurn(input.slots[p.patches[0].slot] || "", p.patches[0])) {
        onEvent("rejected", { agent: input.dj.id, angle, reason: "a left turn must change the instrument, the rhythm or the register, not a parameter; asking again", ms: Date.now() - t0 });
        if (Date.now() - t0 > RETRY_BY) { onEvent("rejected", { agent: input.dj.id, angle, reason: "no time left in the round to ask again", ms: Date.now() - t0 }); return; }
        const again = parseMove(await generate(prompt + "\n\nYOUR LAST ANSWER WAS REFUSED: it was a tweak. A left turn must change that slot's instrument, its rhythm (dur or ~x rows) or its register by an octave. Try again, further out.", sys, RETRY_DEADLINE, process.env.EARS_EFFORT || "low", input.signal));
        if (!again || !isTurn(input.slots[again.patches[0].slot] || "", again.patches[0])) return;
        Object.assign(p, again, { expect: again.expect ?? p.expect });
      }
      // Recheck after retries too: a regenerated move must still fit the selected mode.
      if (!p.expect || p.patches.length > cap || (angleKind(angle) === "turn" && !isTurn(input.slots[p.patches[0].slot] || "", p.patches[0]))) {
        onEvent("rejected", { agent: input.dj.id, angle, reason: "retry did not satisfy the angle or slot limit", ms: Date.now() - t0 }); return;
      }
      const parts: Part[] = [];
      for (const patch of p.patches) {
        const before = input.slots[patch.slot] || "", code = applyPatch(before, patch);
        const ominous = ambient && /\\instrument, \\(?:vox|voxpad|choir|porcelain|fm|pluck|gendy|pad)\b/.test(code)
          ? "ambient ideas must use physical or sampled material, never voices, bells or synthetic pads" : null;
        const bad = ominous || validate({ slot: patch.slot, code }) || (missing(code, p, active) ? `uses ${missing(code, p, active)}, which this DJ hasn't been granted` : null);
        if (bad) { onEvent("rejected", { agent: input.dj.id, angle, reason: p.patches.length > 1 ? `${patch.slot}: ${bad}` : bad, ms: Date.now() - t0 }); return; }
        parts.push({ slot: patch.slot, code, diff: describe(before, patch) });
      }
      if ((input.inspiration || ["groove", "hook", "turn", "droplets", "pulse", "texture", "transform"].includes(angleKind(angle))) && !hasPatternChange(input.slots, parts)) {
        onEvent("rejected", { agent: input.dj.id, angle, reason: "creative option needs changed notes, rhythm or instrument; a mix tweak is not enough", ms: Date.now() - t0 }); return;
      }
      // a whole move has to stay readable from the back of a room, however many slots it touches
      if (parts.reduce((n, x) => n + x.code.length, 0) > 600 * MAX_SLOTS / 2) { onEvent("rejected", { agent: input.dj.id, angle, reason: "too long to read on a projector", ms: Date.now() - t0 }); return; }
      if (got.some((g) => g.parts.length === parts.length && g.parts.every((x, k) => x.slot === parts[k].slot && x.code === parts[k].code))) { onEvent("rejected", { agent: input.dj.id, angle, reason: "same as another option", ms: Date.now() - t0 }); return; }
      const o: Suggestion = { ...(input.inspiration ? { inspiration_id: input.inspiration.artifact_id } : {}), slot: parts[0].slot, code: parts[0].code, parts, why: p.why, evidence: p.evidence, diff: describeMove(parts) + (p.forBars ? ` · for ${p.forBars} bar${p.forBars > 1 ? "s" : ""}` : "") + (p.transition ? ` · with a ${p.transition}` : ""), angle, ms: Date.now() - t0, forBars: p.forBars, transition: p.transition, expect: p.expect! };
      if (input.signal?.aborted) return;
      got.push(o); onOption(o);
    } catch (e: any) { if (input.signal?.aborted) return; onEvent("rejected", { agent: input.dj.id, angle, reason: String(e.message).slice(0, 80), ms: Date.now() - t0 }); }
  })).then(() => { if (!got.length) throw new Error("no angle produced a usable idea"); return got; });
}

const DJ_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["id", "name", "tagline", "palette", "look", "species", "head", "hair", "eyes", "cans", "body", "style", "idioms", "never", "greeting"],
  properties: {
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+){0,3}$" }, name: { type: "string" }, tagline: { type: "string" },
    palette: { enum: PALETTE_NAMES }, look: { enum: LOOKS }, species: { enum: [...SPECIES] }, head: { enum: [...HEAD] }, hair: { enum: [...HAIR] }, eyes: { enum: [...EYES] }, cans: { enum: [...CANS] }, body: { enum: [...BODY] },
    style: { type: "string" }, idioms: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } }, never: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } }, greeting: { type: "string" },
  },
};

/** Writes a new guest from a description. The result is saved as markdown and joins the booth. */
export function summon(description: string, taken: string[]): Promise<DJ> {
  const system = `You create guest DJ personas for a live-coded techno set. A guest only ever acts by suggesting edits to SuperCollider patterns built from these instruments: \\kick (amp, tune, dec, drive), \\hat (amp, dec 0.03-0.16, hp, pan), \\clap (amp, send), \\bass (midinote, cutoff 200-4000 Hz, res 0-3.5, dec), \\acid (midinote, cutoff, env 500-5000, res 0-1, dec, wave), \\stab (chords, cutoff, dec, send), \\fm (midinote, ratio, index, dec, pan), \\pad (chords, cutoff, att, sus, rel), \\perc (freq Hz, dec, pan), \\snare (freq, snap), \\rim (freq, dec), \\sub (dec, drop), \\reese (detune, cutoff, res, rate), \\pluck (dec, tone), \\noise (freq, bw, sweep, att, dec), and \\crush / \\fold (0..1 dirt) on bass, stab, fm, reese, supersaw, smp, keys and gendy. Tempo and key vary per set, so describe notes as scale degrees or intervals from the root, not fixed pitches. Randomness (Prand, Pwhite, Pbrown, Pwrand) is available. So every idiom and every "never" must be something expressible with those parameters and with rhythm (Pseq, rests, \\dur). Be specific: numbers, beats, ranges. The Never list is what gives a DJ a personality; make it sharp.
name: 1-3 words, uppercase stage name. tagline: one line, when to summon them. style: 2-3 sentences. greeting: what they say walking into the booth, under 12 words, in character. Pick the species (their face is pixel art of that animal or creature), eyes (shades/visor put sunglasses on it), rig, palette and visual look that suit them. id: kebab-case, not one of: ${taken.join(", ") || "(none)"}.`;
  return claude<DJ>(`Create a guest DJ: ${description}`, system, DJ_SCHEMA).then((d) => ({ ...d, skills: [] }));
}
