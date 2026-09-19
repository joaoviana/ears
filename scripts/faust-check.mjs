// Compiles each .dsp with the same libfaust the browser uses and renders 8s offline.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { instantiateFaustModuleFromFile, LibFaust, FaustCompiler, FaustMonoDspGenerator } from "@grame/faustwasm/dist/esm/index.js";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mod = await instantiateFaustModuleFromFile(path.join(root, "node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.js"));
const compiler = new FaustCompiler(new LibFaust(mod));
for (const f of fs.readdirSync(path.join(root, "src/faust")).filter((f) => f.endsWith(".dsp"))) {
  const gen = new FaustMonoDspGenerator();
  const ok = await gen.compile(compiler, f.replace(".dsp", ""), fs.readFileSync(path.join(root, "src/faust", f), "utf8"), "-I libraries/");
  if (!ok) { console.log(f, "COMPILE FAILED", compiler.getErrorMessage?.()); continue; }
  const proc = await gen.createOfflineProcessor(48000, 1024);
  const out = proc.render(null, 48000 * 8);
  for (const [i, ch] of out.entries()) {
    let s = 0, p = 0, nan = 0; for (const v of ch) { if (Number.isNaN(v)) nan++; s += v * v; p = Math.max(p, Math.abs(v)); }
    console.log(f, "ch" + i, "rms", Math.sqrt(s / ch.length).toFixed(4), "peak", p.toFixed(3), "nan", nan);
  }
}
