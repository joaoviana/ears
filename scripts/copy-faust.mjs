// libfaust (the Faust compiler as WASM) has to be served as static files next to each other.
import fs from "fs";
fs.cpSync("node_modules/@grame/faustwasm/libfaust-wasm", "public/faust", { recursive: true, filter: (f) => !f.endsWith(".ts") && !f.endsWith(".cts") });
