import { spawn } from "child_process";
const run = (args: string[], prompt: string) => new Promise<string>((res) => { const t = Date.now(); const p = spawn("claude", ["-p", prompt, ...args], { stdio: ["ignore", "pipe", "pipe"] }); let o = ""; p.stdout.on("data", (d) => (o += d)); p.on("close", () => res(`${((Date.now() - t) / 1000).toFixed(1)}s  ${o.slice(0, 60).replace(/\n/g, " ")}`)); });
const base = ["--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--system-prompt", "Reply with one word."];
for (const [name, extra] of [["sonnet", ["--model", "sonnet"]], ["haiku", ["--model", "haiku"]], ["haiku again", ["--model", "haiku"]]] as const) console.log(name.padEnd(12), await run([...base, ...extra], "Say ok."));
