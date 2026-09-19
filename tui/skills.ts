// Skills are capabilities a DJ earns and the human activates. Until a skill is active for a DJ, the host refuses
// any proposal that uses it, and the DJ isn't even told it exists. On the wire: `unlock` (earned) and `grant` (activated).
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { ROOT, type Engine } from "./engine.ts";

export interface Skill { id: string; name: string; glyph: string; takes: number; blurb: string; teach: string; uses: (code: string, extra: { forBars?: number; transition?: string }) => boolean }

export const SKILLS: Skill[] = [
  { id: "fills", name: "FILLS", glyph: "⟲", takes: 1, blurb: "a change that lasts a bar or two, then puts itself back",
    teach: `SKILL fills: add a line "FOR 1" (or "FOR 2") and the host keeps your patch for that many bars, then restores the slot. Use it for drum fills, a stutter, a one-bar filter stab before a phrase turns over.`,
    uses: (_c, x) => !!x.forBars },
  { id: "vocals", name: "VOCALS", glyph: "♪", takes: 2, blurb: "a spoken phrase, rendered and chopped in time",
    teach: `SKILL vocals: a new instrument, \\vox, plays a spoken phrase the host renders for you. Write the phrase with ~v.("two or three words"). Keys: buf (always ~v.("...")), rate (1 normal, 0.8 deep, 1.5 chipmunk; patterns welcome), chop (0..1 where in the phrase to start; a Pseq of chops makes a hook), len (seconds each hit speaks, 0.1 stutter .. 0.6 word), amp (0.3-0.6), pan, send. Example for an empty slot: SLOT d4 REPLACE / SET instrument = \\vox / SET dur = 1/2 / SET buf = ~v.("work it") / SET chop = Pseq([0, 0, 0.5, 0], inf) / SET len = 0.22 / SET rate = Pwrand([1, 0.8], [0.8, 0.2], inf) / SET amp = ~x.("X-xX--X-", 0.5). Keep phrases short, in your character, fit for a room. \\note (semitones, patterns and arrays welcome) pitches a chop, so a Pseq of notes from the key turns one word into a melody. For a sustained, stretched vowel use the instrument \\voxpad instead: buf, chop (which syllable to hold, 0..1), note (an array makes a vocal chord), len (seconds held), amp 0.25-0.4, with \\dur 2 or 4: that is the chopped-up, pitched, reverb-soaked vocal sound.`,
    uses: (c) => /\\vox(pad)?\b|~v\./.test(c) },
  { id: "drops", name: "DROPS", glyph: "▲", takes: 3, blurb: "your idea arrives through a build or a wash, on the drop",
    teach: `SKILL drops: add a line "WITH build" or "WITH wash" and the host rides a two-bar transition so your change lands on the drop. Save it for the bold moves.`,
    uses: (_c, x) => !!x.transition },
];
export const skill = (id: string) => SKILLS.find((s) => s.id === id)!;

/** Which locked skills has this DJ earned by now? */
export const earned = (taken: number, active: string[], offered: string[]) => SKILLS.filter((s) => taken >= s.takes && !active.includes(s.id) && !offered.includes(s.id));
/** A proposal that reaches for a skill its DJ hasn't been granted is refused before the human sees it. */
export const missing = (code: string, extra: { forBars?: number; transition?: string }, active: string[]) => SKILLS.find((s) => !active.includes(s.id) && s.uses(code, extra))?.name ?? null;

// ---- vocals: render phrases with `say`, load them into SuperCollider, and only then let the slot be evaluated ----
const DIR = path.join(ROOT, "tui/vox"), SAMPLES = path.join(ROOT, "tui/samples"), loaded = new Set<string>();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
/** real recordings dropped into tui/samples (or made with R): DJs use them by name, ~v.("note-1") */
export const sampleNames = () => { try { return fs.readdirSync(SAMPLES).filter((f) => /\.(wav|aiff?|flac)$/i.test(f)).map((f) => f.replace(/\.[^.]+$/, "")); } catch { return []; } };
const sampleFile = (phrase: string) => { try { return fs.readdirSync(SAMPLES).map((f) => path.join(SAMPLES, f)).find((f) => slug(path.basename(f).replace(/\.[^.]+$/, "")) === slug(phrase)); } catch { return undefined; } };

/** Record a voice note from the default microphone. Trims leading silence and normalises it. */
export function recordNote(seconds = 4): Promise<string> {
  fs.mkdirSync(SAMPLES, { recursive: true });
  const n = sampleNames().filter((x) => /^note-\d+$/.test(x)).length + 1, name = `note-${n}`, file = path.join(SAMPLES, name + ".wav");
  return new Promise((resolve, reject) => execFile("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", ":default", "-t", String(seconds), "-af", "silenceremove=start_periods=1:start_threshold=-42dB,loudnorm=I=-16", "-ar", "44100", "-ac", "1", file], { timeout: (seconds + 8) * 1000 }, (err, _o, stderr) => (err || !fs.existsSync(file) ? reject(new Error((stderr || String(err)).split("\n")[0].slice(0, 120) || "recording failed")) : resolve(name))));
}
export const phrasesIn = (code: string) => [...code.matchAll(/~v\.\("([^"]{1,60})"\)/g)].map((m) => m[1]);

export function ensureVox(engine: Engine, code: string, voice: string | undefined): Promise<void> {
  const todo = phrasesIn(code).filter((p) => !loaded.has(p));
  if (!todo.length) return Promise.resolve();
  fs.mkdirSync(DIR, { recursive: true });
  return Promise.all(todo.map((phrase) => new Promise<void>((resolve) => {
    const recorded = sampleFile(phrase), file = recorded ?? path.join(DIR, slug(phrase) + ".wav");   // a real recording with that name wins over the robot
    const done = () => { const ack = (k: string) => { if (k === phrase) { engine.off("voxd", ack); loaded.add(phrase); resolve(); } }; engine.on("voxd", ack); engine.vox(phrase, file); setTimeout(resolve, 2500); };
    if (fs.existsSync(file)) return done();
    execFile("say", [...(voice ? ["-v", voice] : []), "-o", file, "--data-format=LEI16@44100", phrase.replace(/[^\w\s'.,!?-]/g, "")], (err) => (err ? resolve() : done()));
  }))).then(() => {});
}
