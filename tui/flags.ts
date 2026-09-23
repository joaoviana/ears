// What the command line asked for. Read once, at load: the seed is rolled here, so a run keeps one seed from boot.
import type { Mood } from "./seed.ts";

const arg = (f: string) => process.argv.includes(f);
const at = (f: string) => process.argv.indexOf(f);

export type Layout = "show" | "stage" | "window";
export const MUTE = arg("--mute"), AUTO = !arg("--manual"), DEMO = arg("--demo"), KEEP = arg("--keep");
// fills need 1 taken idea, vocals 2, drops 3. A showcase gets maybe four rounds, so the loudest moves are
// gated behind a counter it cannot reach. --skills hands every DJ the lot on arrival.
export const ARMED = arg("--skills");
export const MOOD0 = ((): Mood => { const i = at("--mood"), v = i > 0 ? process.argv[i + 1] : "vibey"; return v === "dark" || v === "any" ? v : "vibey"; })();
export const STYLE0 = (() => { const i = at("--style"); return i > 0 ? process.argv[i + 1] : (process.env.EARS_STYLE || undefined); })();
export const INITIAL_STYLE = STYLE0 || "ambient";
export const SEED = (() => { const i = at("--seed"); return i > 0 ? Number(process.argv[i + 1]) : Math.floor(Math.random() * 9000) + 1000; })();
/** How the screen starts; keys toggle each of these afterwards. */
export const START = {
  layout: (arg("--full") ? "stage" : arg("--window") ? "window" : "show") as Layout,
  guide: !arg("--no-guide"), script: arg("--script"), voice: arg("--voice"), logs: arg("--logs"),
};
