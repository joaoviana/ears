// Does quitting actually stop the sound? `q` used to leave scsynth running: sclang exits, the server it spawned
// does not, and it keeps playing while holding the audio port so the next session cannot boot.
//   EARS_SC_PORT=57191 EARS_PORT=57341 npx tsx tui/dev/quit-check.ts
import { execFile } from "node:child_process";
import { Engine } from "../engine.ts";

const port = Number(process.env.EARS_SC_PORT || 57110);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const holder = () => new Promise<string>((r) => execFile("lsof", ["-nP", `-iUDP:${port}`], (_e, out) => r(String(out || "").trim())));

async function main() {
  const engine = new Engine();
  engine.on("log", (line: string) => console.log("  [engine]", line));
  await engine.start(true);
  await wait(8000);
  console.log(`ready: ${engine.ready} · port ${port} held: ${!!(await holder())}`);
  if (!engine.ready) { console.log("engine never became ready; cannot test shutdown"); process.exit(2); }

  // The real failure needs a BUSY sclang. An idle interpreter answers /eval within the shutdown window, quits its
  // server and leaves nothing behind -- which is why quitting a demo engine looks fine. During a set sclang is
  // running patterns, and if it does not reach the eval before it is killed, s.quit never happens and the server
  // it spawned is orphaned. `--busy` blocks the interpreter first to reproduce that.
  if (process.argv.includes("--busy")) { engine.eval("500000.do { |i| i.sqrt.sin }; 1", "busy"); await wait(30); }
  engine.stop();
  await wait(2500);
  const left = await holder();
  console.log(left ? `FAIL: something still holds ${port}\n${left}` : `OK: ${port} released, no orphaned scsynth`);
  process.exit(left ? 1 : 0);
}
main();
