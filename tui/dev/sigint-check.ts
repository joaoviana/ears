// Boots an engine, then SIGINTs itself the way Ctrl-C does. The port must be free afterwards.
//   EARS_SC_PORT=57191 EARS_PORT=57341 npx tsx tui/dev/sigint-check.ts
import { Engine } from "../engine.ts";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const engine = new Engine();
  await engine.start(true);
  await wait(8000);
  console.log("ready:", engine.ready, "-- sending myself SIGINT");
  process.kill(process.pid, "SIGINT");
  await wait(4000);
  process.exit(0);
}
main();
