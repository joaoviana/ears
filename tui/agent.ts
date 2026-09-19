// The agent's whole job: read the code and the listening report, write ONE replacement slot.
// It runs through the `claude` CLI (your subscription, no API key) with every tool switched off,
// so the only thing it can produce is text, and the only path from that text to the speakers is a human pressing y.
import { spawn } from "child_process";
import { LOOKS, PALETTE_NAMES } from "./ascii.ts";
import { HAIR, EYES, CANS, BODY, HEAD, SPECIES, type DJ } from "./djs.ts";
import { applyPatch, describe, parseSlot, type Patch } from "./patch.ts";
import { SKILLS, missing, sampleNames } from "./skills.ts";
import { parseExpect, METRICS, type Expect } from "./shots.ts";
import { METRIC_TABLE } from "./vocabulary.ts";

export interface Suggestion { slot: string; code: string; why: string; evidence: string; diff: string; angle: string; ms: number; forBars?: number; transition?: "build" | "wash"; expect: Expect }
export interface Past { slot: string; why: string; verdict: "y" | "n"; id?: number; outcome?: string; agent?: string }

const SYSTEM = `You are a guest DJ standing next to a live coder in a techno set. You cannot hear audio and you cannot touch the code. You read a listening report (measurements of the master bus compared to a reference) and the performer's current code, and you offer ONE idea as a small patch. Two other DJs' brains are offering a different angle at the same moment, so commit to yours. The performer takes one or none. Your idea is projected in front of an audience, so they must be short and legible.

The code is SuperCollider. Each slot is exactly one expression:
  ~d.(\\dN, \\instrument, \\NAME, \\dur, ..., key, value, ...)
Slots are d1..d6 (by convention: d1 kick, d2 hats, d3 clap/perc, d4 bass, d5 chords, d6 lead or texture; any slot can hold anything). 4 beats per bar, \\dur is in beats. Tempo and key are given with the code; stay in key.
Rhythm rows: \\amp, ~x.("X---x---X---x-x-", 0.9) with \\dur 1/4 is a 16-step row: X = hit at that amp, x = ghost, - = rest. Prefer it for drums: the audience can read it. A list of rows plays one per bar, so ["rowA", "rowA", "rowA", "rowB"] is a groove with a turnaround.
Harmony: \\ctranspose, Pseq([0, -4, 3, -2], inf).stutter(16) moves a riff through a chord progression (semitones, one value per bar at \\dur 1/4). Sidechain: \\duck (0..1) on \\bass and \\pad makes them lean away from the kick; 0.7 pumps.
Patterns: Pseq([...], inf), Rest(0) or \\r for rests, arrays for chords, .stutter(n) to hold values.
Randomness is welcome and makes parts breathe: Prand([...], inf), Pwrand([...], [weights], inf), Pwhite(lo, hi), Pbrown(lo, hi, step), Pshuf([...], inf). Patterns can be multiplied: Pseq([...], inf) * Pwhite(0.8, 1.1).
Instruments and their arguments:
  \\kick  amp, tune (Hz 36-60), dec (0.15-0.6 s), drive (1-3), punch
  \\hat   amp (0.05-0.35), dec (0.03 closed .. 0.16 open), hp (Hz), pan
  \\clap  amp, send (reverb 0..1)
  \\bass  midinote, amp, cutoff (Hz; low = dark and subby, high = bright and thin), res (0..3.5, 2.5+ growls), dec
  \\acid  midinote, amp, cutoff (base Hz), env (how far the filter opens per note, 500-5000), res (0..1, 0.85+ squelches), dec, wave (0 saw .. 1 square), send
  \\stab  midinote (array = chord), amp, cutoff, dec, send
  \\fm    midinote, amp, ratio (1 warm, 2 hollow, 3.5 bell, 7.1 metal), index (0.5-8 bite), dec, pan, send
  \\choir midinote (array = chord), amp (under 0.15), vowel (0 a, 1 e, 2 i, 3 o, 4 u; a Pseq morphs it), att, sus (seconds held), rel, bright (0.8-1.3), send, duck; long \\dur like 4 or 8. A synthetic choir pad.
  \\pad   midinote (array = chord), amp (keep under 0.15), cutoff, att, sus (seconds held), rel, send; use long \\dur like 8 or 16
  \\perc  freq (Hz: 80 tom .. 800 blip), amp, dec, pan, send, click
Nothing else exists. No new SynthDefs, no other functions, no semicolons, one expression.

You answer with a PATCH to one slot, never whole code, in exactly this plain-text form and nothing else:
SLOT d3
SET cutoff = 600
SET res = 2.8
REMOVE pan
EXPECT brightness down
WHY one sentence
EVIDENCE the report line or style rule
Keys have no backslash. The value after "=" is SuperCollider source for that key, on one line. REMOVE lines are optional.
To fill an empty slot or rewrite a voice from scratch, write "SLOT d4 REPLACE" and SET every key it needs, starting with instrument (e.g. SET instrument = \\clap) and dur.
Patch as few keys as the idea needs: usually one to three.
EXPECT is your called shot and it is required: one line, "EXPECT <metric> <up|down|same>". Two bars after your change lands, the host measures it and grades you HIT, MISS or FLAT (no detectable effect). Your record is shown to the room and comes back to you.

WHAT THE HOST MEASURES, AND WHAT ACTUALLY MOVES IT. Find your change in a "moved by" line and call THAT metric.
${METRIC_TABLE}
The commonest mistake is naming the wrong one: bringing a buried kick back is sub up and loudness up, not punch up. A small parameter nudge usually measures FLAT, so if you want a metric to move, move it properly.

Rules:
- If the performer wrote a note, it is an instruction: every angle answers it, in your style. It outranks the report and your own plans (only your Never list outranks it; if they conflict, say so in WHY and offer the nearest thing).
- Do not repeat an idea the performer already skipped.
- "why" is one sentence, under 14 words, in your own voice. "evidence" quotes the report line you acted on, or names your style rule.
- Stay in character: your Never list is absolute.`;

// Three angles asked in parallel. Each call writes a few dozen tokens, so the first idea is on screen in seconds.
export const ANGLES: Record<string, string> = {
  fix: "YOUR ANGLE: fix. Find the single biggest problem in the listening report and correct it with the smallest patch.",
  style: "YOUR ANGLE: style. Ignore small mix problems. Push one slot further toward your own sound, using your idioms.",
  // the third option is never a refinement: it is the thing least like what's playing, so there's always a way out
  turn: `YOUR ANGLE: left turn. Ignore the listening report. Offer the move that is LEAST like what is playing right now. Read the code, name the thing everything has in common (all straight 16ths? everything dark and low? four-on-the-floor for ages? one chord? nothing above middle C? every slot busy?), and break exactly that in ONE slot: a different rhythm family (straight vs broken vs euclidean vs triplets vs half-time), a different instrument in that slot, a jump of an octave or more, silence where it's been busy, or a new harmonic centre via \\ctranspose. It must be a rewrite: "SLOT dN REPLACE" with every key set, and at least the instrument, the rhythm (\\dur or the ~x rows) or the register must differ from that slot's current code. Not a parameter tweak, not a filter move. Stay in key and in your character; keep it something a room can dance to. WHY must name what it contrasts with ("everything is straight 16ths, so: triplets").`,
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

const MODEL = process.env.EARS_MODEL || "sonnet";   // at low effort: a patch needs taste, not deliberation (haiku hangs on this prompt)

function claude<T>(prompt: string, system: string, schema: object, timeout = 70000): Promise<T> {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", prompt, "--system-prompt", system, "--json-schema", JSON.stringify(schema), "--output-format", "json",
      "--model", MODEL, "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { p.kill(); reject(new Error("agent timed out")); }, timeout);
    p.on("close", () => {
      clearTimeout(timer);
      try { const res = JSON.parse(out); resolve(res.structured_output ?? JSON.parse(res.result)); }
      catch { reject(new Error((err || out).slice(0, 160) || "agent returned nothing")); }
    });
  });
}

function claudeText(prompt: string, system: string, timeout = 40000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", prompt, "--system-prompt", system, "--output-format", "text", "--model", MODEL, ...(process.env.EARS_EFFORT === "default" ? [] : ["--effort", process.env.EARS_EFFORT || "low"]), "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { p.kill(); if (process.env.EARS_DEBUG_AGENT) console.error("TIMEOUT sys=" + system.length + " prompt=" + prompt.length + " out=[" + out.slice(0, 300) + "] err=[" + err.slice(0, 300) + "]"); reject(new Error("agent timed out")); }, timeout);
    p.on("close", () => { clearTimeout(timer); out.trim() ? resolve(out) : reject(new Error(err.slice(0, 120) || "agent returned nothing")); });
  });
}

/** Lenient on purpose: models add blank lines, code fences and stray backslashes. */
export type Parsed = Patch & { why: string; evidence: string; forBars?: number; transition?: "build" | "wash"; expect?: Expect };
export function parsePatch(text: string): Parsed | null {
  const p: Parsed = { slot: "", set: [], remove: [], why: "", evidence: "" };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^[`>*\s-]+/, "").trim(); let m: RegExpMatchArray | null;
    if ((m = line.match(/^SLOT\s+\\?(d[1-6])\b(.*)$/i))) { p.slot = m[1].toLowerCase(); p.replace = /replace/i.test(m[2]); }
    else if ((m = line.match(/^SET\s+\\?([A-Za-z]\w*)\s*=\s*(.+)$/i))) p.set.push({ key: m[1], value: m[2].trim().replace(/,$/, "") });
    else if ((m = line.match(/^REMOVE\s+\\?([A-Za-z]\w*)/i))) p.remove!.push(m[1]);
    else if (/^EXPECT\b/i.test(line)) p.expect = parseExpect(line) ?? p.expect;
    else if ((m = line.match(/^FOR\s+([12])\b/i))) p.forBars = Number(m[1]);
    else if ((m = line.match(/^WITH\s+(build|wash)\b/i))) p.transition = m[1].toLowerCase() as "build" | "wash";
    else if ((m = line.match(/^WHY\s*:?\s*(.+)$/i))) p.why = m[1];
    else if ((m = line.match(/^EVIDENCE\s*:?\s*(.+)$/i))) p.evidence = m[1];
  }
  return p.slot && p.set.length && p.why ? p : null;
}

const persona = (d: DJ) => `\n\nYOU ARE ${d.name}. ${d.tagline}\nStyle: ${d.style}\nIdioms you reach for:\n${d.idioms.map((x) => "- " + x).join("\n")}\nNever:\n${d.never.map((x) => "- " + x).join("\n")}`;

/** Is this patch really a departure? Different instrument, different rhythm, or a register an octave away. */
function isTurn(before: string, p: Parsed): boolean {
  const old = Object.fromEntries(parseSlot(before).map((x) => [x.key, x.value])), get = (k: string) => p.set.find((x) => x.key.replace(/^\\/, "") === k)?.value;
  if (!before.trim()) return true;                                     // filling an empty slot is always new
  const inst = get("instrument"), dur = get("dur"), amp = get("amp"), notes = get("midinote") ?? get("freq");
  const mean = (v?: string) => { const n = (v?.match(/\b\d{2,4}\b/g) || []).map(Number); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };
  const a = mean(notes), b = mean(old.midinote ?? old.freq), isFreq = !!get("freq");
  return (!!inst && inst !== old.instrument) || (!!dur && dur !== old.dur) || (!!amp && /~x\./.test(amp) && amp !== old.amp) || (a !== null && b !== null && Math.abs(a - b) >= (isFreq ? b * 0.9 : 11));
}

export interface AskInput { dj: DJ; /** a skill id the DJ must use this round: replaces the bold angle with a showcase */ showcase?: string | null; /** skills the human has activated for this DJ */ skills?: string[]; context: string; slots: Record<string, string>; report: string; note: string; history: Past[] }

/** Fires every angle at once and hands each idea over the moment it validates. Resolves when all are in. */
export function ask(input: AskInput, onOption: (o: Suggestion) => void, onEvent: (kind: string, detail: Record<string, unknown>) => void = () => {}): Promise<Suggestion[]> {
  const prompt = [
    "TEMPO AND KEY", input.context, "",
    "CURRENT CODE", ...Object.entries(input.slots).map(([k, v]) => `-- ${k}\n${v.trim() || "(empty)"}`),
    "", "LISTENING REPORT", input.report,
    "", "PERFORMER NOTE", input.note || "(none)",
    "", "WHAT HAPPENED TO EARLIER IDEAS (yours; lines marked [name] are another DJ's)", input.history.length ? input.history.slice(-8).map((h) => { const mine = !h.agent || h.agent === input.dj.id; return `${mine ? "" : `[${h.agent}] `}${h.verdict === "y" ? "taken " : "skipped"} ${h.slot}: ${h.why}${h.outcome && mine ? `\n        ${h.outcome}` : ""}`; }).join("\n") : "(none)",
  ].join("\n");
  const got: Suggestion[] = [], t0 = Date.now();
  const sk = input.showcase ? SKILLS.find((k) => k.id === input.showcase) : null;
  const angles: [string, string][] = sk
    ? [["showcase", `YOUR ANGLE: showcase. The performer wants to hear your ${sk.name} skill NOW. This idea MUST use it, exactly as the skill text describes${sk.id === "vocals" ? ": SLOT d6 REPLACE (or an empty slot if there is one), instrument \\vox, a two-or-three-word phrase in your character via ~v.(\"...\"), with chop, len, rate and an ~x amp row" : sk.id === "fills" ? ": a one-bar drum fill or stutter with a FOR 1 line" : ": your boldest move with a WITH build line"}. Do not offer anything else.`], ...Object.entries(ANGLES).slice(0, 2)]
    : Object.entries(ANGLES);
  return Promise.all(angles.slice(0, Number(process.env.EARS_ANGLES || 3)).map(async ([angle, brief]) => {
    onEvent("ask", { agent: input.dj.id, angle, model: MODEL });
    try {
      const active = input.skills || [], taught = SKILLS.filter((k) => active.includes(k.id)).map((k) => k.teach + (k.id === "vocals" && sampleNames().length ? ` REAL RECORDED VOICES are available and sound far better than a rendered phrase: use them by name, e.g. ~v.("${sampleNames()[sampleNames().length - 1]}"). Names: ${sampleNames().slice(-12).join(", ")}.` : "")).join("\n");
      const p = parsePatch(await claudeText(prompt, SYSTEM + persona(input.dj) + (taught ? "\n\nSKILLS THE PERFORMER HAS UNLOCKED FOR YOU (use them when they serve the idea, not every time):\n" + taught : "") + "\n\n" + brief));
      if (!p) { onEvent("rejected", { agent: input.dj.id, angle, reason: "not in patch form", ms: Date.now() - t0 }); return; }
      if (!p.expect) { onEvent("rejected", { agent: input.dj.id, angle, reason: "no called shot: an idea must say what it expects to change (EXPECT <metric> <up|down|same>)", ms: Date.now() - t0 }); return; }
      if (angle === "turn" && !isTurn(input.slots[p.slot] || "", p)) {
        onEvent("rejected", { agent: input.dj.id, angle, reason: "a left turn must change the instrument, the rhythm or the register, not a parameter; asking again", ms: Date.now() - t0 });
        const again = parsePatch(await claudeText(prompt + "\n\nYOUR LAST ANSWER WAS REFUSED: it was a tweak. A left turn must be SLOT dN REPLACE and must change that slot's instrument, its rhythm (dur or ~x rows) or its register by an octave. Try again, further out.", SYSTEM + persona(input.dj) + "\n\n" + brief));
        if (!again || !isTurn(input.slots[again.slot] || "", again)) return;
        Object.assign(p, again, { expect: again.expect ?? p.expect });
      }
      const before = input.slots[p.slot] || "", code = applyPatch(before, p), bad = validate({ slot: p.slot, code }) || (missing(code, p, active) ? `uses ${missing(code, p, active)}, which this DJ hasn't been granted` : null) || (got.some((g) => g.slot === p.slot && g.code === code) ? "same as another option" : null);
      if (bad) { onEvent("rejected", { agent: input.dj.id, angle, reason: bad, ms: Date.now() - t0 }); return; }
      const o: Suggestion = { slot: p.slot, code, why: p.why, evidence: p.evidence, diff: describe(before, p) + (p.forBars ? ` · for ${p.forBars} bar${p.forBars > 1 ? "s" : ""}` : "") + (p.transition ? ` · with a ${p.transition}` : ""), angle, ms: Date.now() - t0, forBars: p.forBars, transition: p.transition, expect: p.expect! };
      got.push(o); onOption(o);
    } catch (e: any) { onEvent("rejected", { agent: input.dj.id, angle, reason: String(e.message).slice(0, 80), ms: Date.now() - t0 }); }
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
  const system = `You create guest DJ personas for a live-coded techno set. A guest only ever acts by suggesting edits to SuperCollider patterns built from these instruments: \\kick (amp, tune, dec, drive), \\hat (amp, dec 0.03-0.16, hp, pan), \\clap (amp, send), \\bass (midinote, cutoff 200-4000 Hz, res 0-3.5, dec), \\acid (midinote, cutoff, env 500-5000, res 0-1, dec, wave), \\stab (chords, cutoff, dec, send), \\fm (midinote, ratio, index, dec, pan), \\pad (chords, cutoff, att, sus, rel), \\perc (freq Hz, dec, pan). Tempo and key vary per set, so describe notes as scale degrees or intervals from the root, not fixed pitches. Randomness (Prand, Pwhite, Pbrown, Pwrand) is available. So every idiom and every "never" must be something expressible with those parameters and with rhythm (Pseq, rests, \\dur). Be specific: numbers, beats, ranges. The Never list is what gives a DJ a personality; make it sharp.
name: 1-3 words, uppercase stage name. tagline: one line, when to summon them. style: 2-3 sentences. greeting: what they say walking into the booth, under 12 words, in character. Pick the species (their face is pixel art of that animal or creature), eyes (shades/visor put sunglasses on it), rig, palette and visual look that suit them. id: kebab-case, not one of: ${taken.join(", ") || "(none)"}.`;
  return claude<DJ>(`Create a guest DJ: ${description}`, system, DJ_SCHEMA).then((d) => ({ ...d, skills: [] }));
}
