// Evals many generated bases on a second, muted engine and reports anything SuperCollider refuses.
//   EARS_PORT=57300 EARS_SC_PORT=57190 npx tsx tui/probe-seeds.ts [count]
import { Engine } from "./engine.ts"; import { makeBase } from "./seed.ts";
const e = new Engine(), N = Number(process.argv[2] || 25); let sent = 0, ok = 0; const bad: string[] = [], logs: string[] = [];
e.on("log", (l) => logs.push(l));
e.on("evald", ({ id, ok: good, msg }) => { good ? ok++ : bad.push(`${id}: ${msg}`); });
e.on("ready", async () => {
  for (let seed = 1; seed <= N; seed++) { const b = makeBase(seed); for (const [k, code] of Object.entries(b.slots)) { e.eval(code, `${seed}/${k}`); sent++; } await new Promise((r) => setTimeout(r, 700)); }
  setTimeout(() => { console.log({ sent, ok, bad, scErrors: [...new Set(logs)].slice(0, 8) }); e.stop(); setTimeout(() => process.exit(0), 900); }, 2500);
});
e.start(true);
