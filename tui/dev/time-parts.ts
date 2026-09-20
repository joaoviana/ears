// Where does a suggestion's time actually go? Same model and flags as the real call, three at a time like a round.
//   npx tsx tui/dev/time-parts.ts
import { spawn } from "child_process";

const run = (sys: string, prompt: string) => new Promise<number>((res) => {
  const t = Date.now();
  const p = spawn("claude", ["-p", prompt, "--system-prompt", sys, "--output-format", "text", "--model", "sonnet",
    "--effort", "low", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"],
    { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", () => {});
  const k = setTimeout(() => { p.kill(); res(-1); }, 60000);
  p.on("close", () => { clearTimeout(k); res(Date.now() - t); });
});

const SHORT = "Reply with exactly this and nothing else:\nSLOT d2\nSET amp = 0.2\nEXPECT air down\nWHY hats are too loud\nEVIDENCE air fizzy";
const LONG = SHORT.replace("nothing else", "nothing else, but first read all of it") ;
const filler = (n: number) => "You are a guest DJ standing next to a live coder. ".repeat(n);

const tests: [string, string, string][] = [
  ["bare system, short reply", "You are a DJ.", SHORT],
  ["6.9k system, short reply", filler(139), SHORT],
  ["6.9k system + 4k prompt", filler(139), filler(80) + "\n" + SHORT],
  ["6.9k system, long reply", filler(139), LONG + "\nThen add 12 more SET lines with invented keys."],
];

for (const [label, sys, pr] of tests) {
  const runs = await Promise.all([run(sys, pr), run(sys, pr), run(sys, pr)]);
  const ok = runs.filter((r) => r > 0).sort((a, b) => a - b);
  console.log(label.padEnd(26), runs.map((r) => (r < 0 ? "timeout" : (r / 1000).toFixed(1) + "s")).join("  "),
    ok.length ? ` median ${(ok[Math.floor(ok.length / 2)] / 1000).toFixed(1)}s` : "");
}
