// Spare muted engine: do the four new categories actually measure anything?
import { Engine } from "../engine.ts"; import { Listener, compare } from "../report.ts"; import { makeBase } from "../seed.ts"; import { maskingLines } from "../masking.ts";
const e = new Engine(); let listener = new Listener(), frames: { slot: string; bands: number[] }[] = [];
e.on("ears", (f) => listener.push(f)); e.on("onset", () => listener.onset()); e.on("hit", (h: any) => listener.hit(h.offGrid ?? 0));
e.on("slotears", (f: any) => frames.push({ slot: f.slot, bands: f.bands })); e.on("log", (l) => /ERROR/.test(l) && console.log("[sc]", l.slice(0, 120)));
let bars: (() => void)[] = []; e.on("bar", () => { listener.bar(); bars.splice(0).forEach((f) => f()); });
const nextBar = () => new Promise<void>((r) => bars.push(r));
const take = async () => { await nextBar(); listener = new Listener(); frames = []; for (let i = 0; i < 4; i++) await nextBar(); return listener.take()!; };
e.on("ready", async () => {
  const b = makeBase(41, "dark"); e.tempo(b.bpm); for (const [k, c] of Object.entries(b.slots)) if (c) e.eval(c, k);
  await nextBar(); await nextBar(); const ref = await take();
  console.log(`width ${ref.width.toFixed(1)} dB · headroom ${ref.headroom.toFixed(1)} dB · groove ${(ref.offGrid * 1000).toFixed(0)} ms off the grid`);
  console.log("masking:", maskingLines(frames).length ? "\n" + maskingLines(frames).join("\n") : "nothing fighting");
  // make two voices collide on purpose: bass up into the kick's band, and a wide pan for width
  e.eval(`~d.(\\d4, \\instrument, \\bass, \\dur, 1, \\midinote, ${b.root}, \\cutoff, 90, \\res, 1, \\dec, 0.5, \\amp, 0.9)`, "d4");
  e.eval(`~d.(\\d2, \\instrument, \\hat, \\dur, 1/3, \\amp, 0.25, \\pan, Pwhite(-0.9, 0.9))`, "d2");
  await nextBar(); const after = await take();
  console.log(`after: width ${after.width.toFixed(1)} dB · headroom ${after.headroom.toFixed(1)} dB · groove ${(after.offGrid * 1000).toFixed(0)} ms`);
  console.log("masking:", maskingLines(frames).length ? "\n" + maskingLines(frames).join("\n") : "nothing fighting");
  console.log("\nreport lines:"); compare(after, ref).slice(-4).forEach((l) => console.log(`  ${l.label.padEnd(10)} ${l.value.padStart(11)}  ${l.delta === null ? "" : (l.delta >= 0 ? "+" : "") + l.delta.toFixed(1)}  ${l.word}`));
  e.stop(); setTimeout(() => process.exit(0), 900);
});
e.start(true);
