// Skills are capabilities a DJ earns and the human activates. Until a skill is active for a DJ, the host refuses
// any proposal that uses it, and the DJ isn't even told it exists. On the wire: `unlock` (earned) and `grant` (activated).
import fs from "fs";
import path from "path";
import { execFile, spawnSync } from "child_process";
import { ROOT, type Engine } from "./engine.ts";

export interface Skill { id: string; name: string; glyph: string; takes: number; blurb: string; teach: string; gated?: boolean; uses: (code: string, extra: { forBars?: number; transition?: string }) => boolean }

export const SKILLS: Skill[] = [
  { id: "carve", name: "CARVE", glyph: "◒", takes: 1, blurb: "cut moving bands through the sound already playing",
    teach: `SKILL carve: transform the CURRENT voice with scalar post-slot controls that work on every instrument: fxhp 25..1800, fxlp 700..12000, fxmotion 0..1, fxrate 0.02..0.3, fxdrive 0..0.35, fxspace 0..0.7, fxgate 0..1 with fxgaterate 0.02..8 (cuts holes in the voice already playing: rhythm without restarting the phrase), fxoctave -2..2 (moves its register without changing its instrument), fxdelay 0..1 with fxdelaytime 0.1..2 seconds and fxfeedback 0..0.85 (throws the voice's echo out over the field; the voice itself stays put), fxblur 0..1 (smears the spectrum sideways, so the material goes out of focus at the same level instead of getting quieter), fxfreeze 0..0.92 (holds the slot's last second and a half under the live voice, which lengthens a gesture without repeating it), fxreverse 0..0.92 (that same memory played backwards), fxduck 0..1 with fxducksrc 1..6 (this slot steps back whenever THAT slot sounds, so two voices share the room without either changing level). Preserve its instrument and sample. Make the before/after unmistakable without a harsh sweep.`,
    uses: (c) => /\\fx(?:hp|lp|motion|rate|drive|space|blur|freeze|reverse|delay|delaytime|feedback|duck|ducksrc)\b/.test(c) },
  { id: "fracture", name: "FRACTURE", glyph: "⟲", takes: 2, blurb: "a tactile rhythmic mutation that restores itself after two bars", gated: true,
    teach: `SKILL fracture: change the current voice's delta to an asymmetric phrase and add "FOR 2". Use close pairs, a long hole and one changed return. Keep the instrument/sample and level; the host restores the original after two bars.`,
    uses: (_c, x) => !!x.forBars },
  { id: "reveal", name: "REVEAL", glyph: "✦", takes: 3, blurb: "replace one colour through a slow, audible wash", gated: true,
    teach: `SKILL reveal: transform or exchange one voice, add fxspace and slow filter motion, then write "WITH wash". The host closes the room and reveals the change on the phrase boundary. No riser, drop, drums or voices.`,
    uses: (_c, x) => !!x.transition },
];
export const skill = (id: string) => SKILLS.find((s) => s.id === id)!;

/** Which locked skills has this DJ earned by now? */
export const earned = (taken: number, active: string[], offered: string[]) => SKILLS.filter((s) => taken >= s.takes && !active.includes(s.id) && !offered.includes(s.id));
/** A proposal that reaches for a skill its DJ hasn't been granted is refused before the human sees it. */
export const missing = (code: string, extra: { forBars?: number; transition?: string }, active: string[]) => SKILLS.find((s) => s.gated && !active.includes(s.id) && s.uses(code, extra))?.name ?? null;

// ---- vocals: render phrases with `say`, load them into SuperCollider, and only then let the slot be evaluated ----
const DIR = path.join(ROOT, "tui/vox"), SAMPLES = path.join(ROOT, "tui/samples"), loaded = new Set<string>();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
/** real recordings dropped into tui/samples (or made with R): DJs use them by name, ~v.("note-1") */
export const sampleNames = () => { try { return fs.readdirSync(SAMPLES).filter((f) => /\.(wav|aiff?|flac)$/i.test(f)).map((f) => f.replace(/\.[^.]+$/, "")); } catch { return []; } };
const sampleFile = (phrase: string) => { try { return fs.readdirSync(SAMPLES).map((f) => path.join(SAMPLES, f)).find((f) => slug(path.basename(f).replace(/\.[^.]+$/, "")) === slug(phrase)); } catch { return undefined; } };

// Never the default input: if that is a Bluetooth headset, opening its mic drops the headset (and the whole audio
// device) to 16-24 kHz. Prefer the Mac's own microphone.
let mic: string | null = null;
function micName(): string {
  if (mic) return mic;
  try { const out = spawnSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { encoding: "utf8" }).stderr as string, audio = out.slice(out.indexOf("audio devices")); const names = [...audio.matchAll(/\] \[\d+\] (.+)/g)].map((m) => m[1].trim()); mic = names.find((n) => /macbook.*microphone|built-in microphone/i.test(n)) ?? names.find((n) => !/airpods|headset|bluetooth/i.test(n)) ?? "default"; } catch { mic = "default"; }
  return mic!;
}

/** Record a voice note from the Mac's own microphone. Trims leading silence and normalises it. */
export function recordNote(seconds = 4): Promise<string> {
  fs.mkdirSync(SAMPLES, { recursive: true });
  const n = sampleNames().filter((x) => /^note-\d+$/.test(x)).length + 1, name = `note-${n}`, file = path.join(SAMPLES, name + ".wav");
  return new Promise((resolve, reject) => execFile("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", ":" + micName(), "-t", String(seconds), "-af", "silenceremove=start_periods=1:start_threshold=-42dB,loudnorm=I=-16", "-ar", "44100", "-ac", "1", file], { timeout: (seconds + 8) * 1000 }, (err, _o, stderr) => (err || !fs.existsSync(file) ? reject(new Error((stderr || String(err)).split("\n")[0].slice(0, 120) || "recording failed")) : resolve(name))));
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
