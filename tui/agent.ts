// The agent's whole job: read the code and the listening report, write ONE replacement slot.
// It runs through the `claude` CLI (your subscription, no API key) with every tool switched off,
// so the only thing it can produce is text, and the only path from that text to the speakers is a human pressing y.
import { spawn } from "child_process";
import { LOOKS } from "./ascii.ts";

export interface Suggestion { slot: string; code: string; why: string; evidence: string; look?: string }
export interface Past { slot: string; why: string; verdict: "y" | "n" }

const SYSTEM = `You are the second pair of ears in a live-coded techno set. You cannot hear audio. You read a listening report (measurements of the master bus compared to a reference) and the performer's current code, and you propose ONE change. The performer decides whether to take it. Your suggestion is projected in front of an audience, so it must be short and legible.

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
- Fix the biggest problem in the report. Change as little as possible: usually one or two values in one slot.
- An empty slot can be filled if the report says sparse or a band is missing something only a new voice can add.
- Do not repeat a suggestion the performer already skipped. If they wrote a note, the note outranks the report.
- "why" is one sentence, under 16 words, plain language. "evidence" quotes the report line you acted on.
- "look" optionally picks the visual: one of ${LOOKS.join(", ")}.`;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["slot", "code", "why", "evidence"],
  properties: { slot: { enum: ["d1", "d2", "d3", "d4"] }, code: { type: "string" }, why: { type: "string" }, evidence: { type: "string" }, look: { enum: LOOKS } },
};

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

export function ask(input: { slots: Record<string, string>; report: string; note: string; history: Past[] }): Promise<Suggestion> {
  const prompt = [
    "CURRENT CODE", ...Object.entries(input.slots).map(([k, v]) => `-- ${k}\n${v.trim() || "(empty)"}`),
    "", "LISTENING REPORT", input.report,
    "", "PERFORMER NOTE", input.note || "(none)",
    "", "YOUR LAST SUGGESTIONS", input.history.length ? input.history.slice(-5).map((h) => `${h.verdict === "y" ? "taken " : "skipped"} ${h.slot}: ${h.why}`).join("\n") : "(none)",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", prompt, "--system-prompt", SYSTEM, "--json-schema", JSON.stringify(SCHEMA), "--output-format", "json",
      "--model", process.env.EARS_MODEL || "sonnet", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { p.kill(); reject(new Error("agent timed out")); }, 60000);
    p.on("close", () => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(out);
        const s: Suggestion = res.structured_output ?? JSON.parse(res.result);
        const bad = validate(s);
        bad ? reject(new Error(`rejected: ${bad}`)) : resolve({ ...s, code: s.code.trim() });
      } catch { reject(new Error((err || out).slice(0, 160) || "agent returned nothing")); }
    });
  });
}
