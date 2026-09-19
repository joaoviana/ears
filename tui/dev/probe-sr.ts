import { Engine } from "../engine.ts";
const e = new Engine(); e.on("evald", (r) => { if (r.id === "sr") { console.log("server:", r.msg); e.stop(); setTimeout(() => process.exit(0), 900); } });
e.on("ready", () => e.eval(`"sample rate % Hz · output device %".format(s.sampleRate, ServerOptions.outDevices.first)`, "sr")); e.start(true);
