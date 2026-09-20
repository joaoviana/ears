// Does one long-lived claude process beat three fresh ones? `claude -p` pays a ~2.6s floor per spawn, and the host
// spawns three per round. A streaming session pays it once and then answers turns down an open pipe.
//   npx tsx tui/dev/time-resident.ts
import { spawn } from "child_process";

const SYS = "You are a guest DJ beside a live coder. Answer ONLY with:\nSLOT d2\nSET amp = <number>\nEXPECT air down\nWHY <one short sentence>\nEVIDENCE <one short phrase>\nNothing else.";
const ASKS = [
  "The sub is thin. Add weight.",
  "Too much reverb on the clap now.",
  "The lead is too busy. Thin it.",
  "Bring the chords forward.",
  "The hats are 12 dB too loud. Pull them back.",
  "Now the top end is dull. Open them a little.",
  "The kick is buried under the bass. Fix that instead.",
  "The clap is splashing. Dry it out.",
];

/** one spawn per ask, which is what the host does today */
async function cold(): Promise<number[]> {
  const one = (prompt: string) => new Promise<number>((res) => {
    const t = Date.now();
    const p = spawn("claude", ["-p", prompt, "--system-prompt", SYS, "--output-format", "text", "--model", "sonnet",
      "--effort", "low", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"], { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.resume(); p.stderr.resume();
    p.on("close", () => res(Date.now() - t));
  });
  const out: number[] = [];
  for (const a of ASKS) out.push(await one(a));
  return out;
}

/** one process, many turns */
async function warm(): Promise<number[]> {
  const p = spawn("claude", ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
    "--system-prompt", SYS, "--model", "sonnet", "--effort", "low", "--tools", "", "--strict-mcp-config",
    "--setting-sources", "", "--no-session-persistence"], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", waiting: ((s: string) => void) | null = null, acc = "";
  p.stderr.on("data", (d) => process.env.DEBUG && console.error("[err]", String(d).slice(0, 200)));
  p.stdout.on("data", (d) => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let m: any; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === "assistant") for (const c of m.message?.content ?? []) if (c.type === "text") acc += c.text;
      if (m.type === "result") { const r = acc || m.result || ""; acc = ""; waiting?.(r); waiting = null; }
    }
  });
  const turn = (text: string) => new Promise<string>((res) => {
    waiting = res;
    p.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n");
  });
  const out: number[] = [];
  for (const a of ASKS) { const t = Date.now(); await turn(a); out.push(Date.now() - t); }
  p.stdin.end(); p.kill();
  return out;
}

const fmt = (xs: number[]) => xs.map((x) => (x / 1000).toFixed(1) + "s").join("  ");
const warmed = await Promise.race([warm(), new Promise<number[]>((r) => setTimeout(() => r([]), 90000))]);
console.log("one long-lived process ", warmed.length ? fmt(warmed) : "FAILED — stream-json not usable this way");
console.log("a fresh spawn each time", fmt(await cold()));
process.exit(0);
