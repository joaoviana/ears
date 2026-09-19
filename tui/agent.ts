// The agent's whole job: read the code and the listening report, write ONE replacement slot.
// It runs through the `claude` CLI (your subscription, no API key) with every tool switched off,
// so the only thing it can produce is text, and the only path from that text to the speakers is a human pressing y.
import { spawn } from "child_process";
import { LOOKS, PALETTE_NAMES } from "./ascii.ts";
import { HAIR, EYES, CANS, BODY, type DJ } from "./djs.ts";

export interface Suggestion { slot: string; code: string; why: string; evidence: string }
export interface Past { slot: string; why: string; verdict: "y" | "n" }

const SYSTEM = `You are a guest DJ standing next to a live coder in a techno set. You cannot hear audio and you cannot touch the code. You read a listening report (measurements of the master bus compared to a reference) and the performer's current code, and you offer up to THREE different options. The performer takes one or none. Your options are projected in front of an audience, so they must be short and legible.

The code is SuperCollider. Each slot is exactly one expression:
  ~d.(\\dN, \\instrument, \\NAME, \\dur, ..., key, value, ...)
Slots are d1..d4. 130 BPM, 4 beats per bar, \\dur is in beats. Patterns: Pseq([...], inf), Prand, Pwhite(lo, hi), Pdup(n, pat), Rest(0) or \\r for rests, arrays for chords.
Instruments and their arguments:
  \\kick  amp, tune (Hz, default 44)
  \\hat   amp, dec (seconds, 0.03 closed / 0.16 open), hp (Hz), pan
  \\clap  amp, send (reverb send 0..1)
  \\bass  midinote, amp, cutoff (Hz, the Moog filter: low = dark and subby, high = bright and thin), res (0..3.5), dec
  \\stab  midinote (array = chord), amp, cutoff, dec, send
Nothing else exists. No new SynthDefs, no other functions, no semicolons, one expression.

Rules:
- Offer 2 or 3 genuinely different options, each for ONE slot: typically one that fixes the biggest problem in the report, one that pushes the track toward your style, and one bolder move (a new voice in an empty slot, or a rewritten rhythm).
- Each option changes as little as it can to do its job.
- Do not repeat an idea the performer already skipped. If they wrote a note, the note outranks everything.
- "why" is one sentence, under 14 words, in your own voice. "evidence" quotes the report line you acted on, or names the style rule.
- Stay in character: your Never list is absolute.`;

const OPTION = {
  type: "object", additionalProperties: false, required: ["slot", "code", "why", "evidence"],
  properties: { slot: { enum: ["d1", "d2", "d3", "d4"] }, code: { type: "string" }, why: { type: "string" }, evidence: { type: "string" } },
};
const SCHEMA = { type: "object", additionalProperties: false, required: ["options"], properties: { options: { type: "array", minItems: 1, maxItems: 3, items: OPTION } } };

const FORBIDDEN = /unixCmd|systemCmd|\bFile\b|\bPipe\b|interpret|compile|thisProcess|\.load|Quarks|NetAddr|Server|\bs\.|SynthDef|;|\bexit\b/;

/** The agent's text never reaches the engine without passing this. */
export function validate(s: Suggestion): string | null {
  const code = s.code.trim();
  if (!new RegExp(`^~d\\.\\(\\\\${s.slot}\\b`).test(code)) return `must start with ~d.(\\${s.slot}, ...`;
  if (FORBIDDEN.test(code)) return "uses something outside the instrument vocabulary";
  let depth = 0;
  for (const ch of code) { if ("([".includes(ch)) depth++; if (")]".includes(ch)) depth--; if (depth < 0) break; }
  if (depth !== 0) return "unbalanced brackets";
  if (code.length > 600) return "too long to read on a projector";
  return null;
}

function claude<T>(prompt: string, system: string, schema: object, timeout = 70000): Promise<T> {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", prompt, "--system-prompt", system, "--json-schema", JSON.stringify(schema), "--output-format", "json",
      "--model", process.env.EARS_MODEL || "sonnet", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"], { stdio: ["ignore", "pipe", "pipe"] });
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

const persona = (d: DJ) => `\n\nYOU ARE ${d.name}. ${d.tagline}\nStyle: ${d.style}\nIdioms you reach for:\n${d.idioms.map((x) => "- " + x).join("\n")}\nNever:\n${d.never.map((x) => "- " + x).join("\n")}`;

export async function ask(input: { dj: DJ; slots: Record<string, string>; report: string; note: string; history: Past[] }): Promise<Suggestion[]> {
  const prompt = [
    "CURRENT CODE", ...Object.entries(input.slots).map(([k, v]) => `-- ${k}\n${v.trim() || "(empty)"}`),
    "", "LISTENING REPORT", input.report,
    "", "PERFORMER NOTE", input.note || "(none)",
    "", "WHAT HAPPENED TO EARLIER IDEAS", input.history.length ? input.history.slice(-8).map((h) => `${h.verdict === "y" ? "taken " : "skipped"} ${h.slot}: ${h.why}`).join("\n") : "(none)",
  ].join("\n");
  const res = await claude<{ options: Suggestion[] }>(prompt, SYSTEM + persona(input.dj), SCHEMA);
  const good = (res.options || []).map((o) => ({ ...o, code: o.code.trim() })).filter((o) => !validate(o));
  if (!good.length) throw new Error("every option was rejected by the validator");
  return good;
}

const DJ_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["id", "name", "tagline", "palette", "look", "hair", "eyes", "cans", "body", "style", "idioms", "never", "greeting"],
  properties: {
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+){0,3}$" }, name: { type: "string" }, tagline: { type: "string" },
    palette: { enum: PALETTE_NAMES }, look: { enum: LOOKS }, hair: { enum: [...HAIR] }, eyes: { enum: [...EYES] }, cans: { enum: [...CANS] }, body: { enum: [...BODY] },
    style: { type: "string" }, idioms: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } }, never: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } }, greeting: { type: "string" },
  },
};

/** Writes a new guest from a description. The result is saved as markdown and joins the booth. */
export function summon(description: string, taken: string[]): Promise<DJ> {
  const system = `You create guest DJ personas for a live-coded techno set. A guest only ever acts by suggesting edits to SuperCollider patterns that use five instruments: \\kick (amp, tune), \\hat (amp, dec, hp, pan), \\clap (amp, send), \\bass (midinote, amp 0-1, cutoff 200-4000 Hz, res 0-3.5 where 2.5+ growls and 3.3 squeals, dec in seconds), \\stab (midinote chords, amp, cutoff Hz, dec seconds, send 0-1), at a fixed 130 BPM. Amps are 0-1; hat dec is 0.03 closed to 0.16 open. So every idiom and every "never" must be something expressible with those parameters and with rhythm (Pseq, rests, \\dur). Be specific: numbers, beats, ranges. The Never list is what gives a DJ a personality; make it sharp.
name: 1-3 words, uppercase stage name. tagline: one line, when to summon them. style: 2-3 sentences. greeting: what they say walking into the booth, under 12 words, in character. Pick the face parts, palette and visual look that suit them. id: kebab-case, not one of: ${taken.join(", ") || "(none)"}.`;
  return claude<DJ>(`Create a guest DJ: ${description}`, system, DJ_SCHEMA);
}
