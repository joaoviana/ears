// Bisect the intermittent vox spike: swap the SynthDef for variants and watch the peak for 8 s each.
import { Engine } from "../engine.ts"; import { ensureVox } from "../skills.ts";
const e = new Engine(); let peak = 0; e.on("ears", (f: any) => (peak = Math.max(peak, f.peak))); e.on("log", (l) => console.log("[sc]", l));
const code = `~d.(\\d4, \\instrument, \\vox, \\dur, 1/2, \\buf, ~v.("work it"), \\chop, Pseq([0, 0, 0.5, 0], inf), \\len, 0.22, \\rate, Pwrand([1, 0.8], [0.8, 0.2], inf), \\amp, ~x.("X-xX--X-", 0.5))`;
const def = (body: string) => `SynthDef(\\vox, { |out = 0, buf = 0, rate = 1, chop = 0, len = 0.4, amp = 0.5, pan = 0, send = 0.4, hp = 180| var env = EnvGen.kr(Env.linen(0.004, len, 0.03), doneAction: 2); ${body} Out.ar(out, Pan2.ar(sig, pan, amp)); Out.ar(~fx, sig * amp * send ! 2); }).add; 1`;
const variants: [string, string][] = [
  ["as shipped (HPF)", "var sig = PlayBuf.ar(1, buf, BufRateScale.kr(buf) * rate, 1, chop.clip(0, 0.98) * BufFrames.kr(buf), 0) * env; sig = HPF.ar(sig, hp);"],
  ["no filter", "var sig = PlayBuf.ar(1, buf, BufRateScale.kr(buf) * rate, 1, chop.clip(0, 0.98) * BufFrames.kr(buf), 0) * env;"],
  ["filter then envelope, .ir buffer info", "var sig = PlayBuf.ar(1, buf, BufRateScale.ir(buf) * rate, 1, chop.clip(0, 0.98) * BufFrames.ir(buf), 0); sig = HPF.ar(sig, hp.max(40)) * env;"],
];
e.on("ready", async () => { await ensureVox(e, code, "Fred");
  for (const [name, body] of variants) { e.eval(def(body), "def"); await new Promise((r) => setTimeout(r, 600)); peak = 0; e.eval(code, "d4"); await new Promise((r) => setTimeout(r, 9000)); console.log(name.padEnd(42), "peak", peak.toFixed(3)); e.eval("~hush.(\\d4)", "h"); await new Promise((r) => setTimeout(r, 1500)); }
  e.stop(); setTimeout(() => process.exit(0), 900); });
e.start(true);
