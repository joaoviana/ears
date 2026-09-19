// EARS. Left: the performer's code (edit tui/set/*.scd in your own editor; saving evals it on the next bar).
// Right: what the booth heard. Middle: the DJs in the booth and the options the active one is offering.
// Bottom: the field, drawn from the real master bus. Nothing a DJ says reaches the speakers without a keypress.
import React, { useEffect, useRef, useState } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import { Engine, ROOT, type Hit } from "./engine.ts";
import { Listener, compare, asText, type Profile, type Line } from "./report.ts";
import { ask, summon, type Suggestion, type Past } from "./agent.ts";
import { render as field, LOOKS, PALETTE_NAMES, WIPES, UI, NEUTRAL, type Pulse, type Ramp, type Scene, type Banner } from "./ascii.ts";
import { feed, fake } from "./audio.ts";
import { roster, save, avatar, accent, type DJ } from "./djs.ts";
import { makeBase, type Base } from "./seed.ts";
import { Bus, pretty, type Msg } from "./bus.ts";
import { applyPatch, describe } from "./patch.ts";
import { validate } from "./agent.ts";
import { spawn, execSync } from "child_process";
import { TextInput, Select, Spinner, ThemeProvider, extendTheme, defaultTheme } from "@inkjs/ui";
import asciichart from "asciichart";
import gradient from "gradient-string";
import cfonts from "cfonts";

// name-in-lights fonts (cfonts). Each DJ keeps one; if it doesn't fit the terminal, fall through to narrower ones.
const FONTS = ["block", "slick", "pallet", "shade", "grid", "simple3d"] as const, NARROW = ["chrome", "tiny"] as const;
const bigText = (text: string, font: string) => { try { return (cfonts.render(text, { font, colors: ["system"], space: false, env: "node", maxLength: 0, lineHeight: 0 }, false, 0, { width: 500, height: 50 }) as any).string.replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter((l: string) => l.trim()) as string[]; } catch { return []; } };
const hashOf = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// DJs can speak their greeting through macOS `say` (v toggles it). Each gets a stable voice from whatever is installed.
const VOICES = (() => { try { const have = execSync("say -v '?'", { encoding: "utf8" }).split("\n").map((l) => l.split(/\s{2,}/)[0].trim()); return ["Daniel", "Samantha", "Fred", "Zarvox", "Trinoids", "Whisper", "Karen", "Moira", "Ralph", "Rishi", "Tessa", "Albert"].filter((v) => have.includes(v)); } catch { return []; } })();
const voiceOf = (id: string) => VOICES[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % Math.max(1, VOICES.length)];

const SET = process.env.EARS_SET || path.join(ROOT, "tui/set");   // EARS_SET lets a test instance play from its own folder
const REF = path.join(ROOT, "tui/refs/detroit.json");
const SLOTS = ["d1", "d2", "d3", "d4"], RAMP_NAMES: Ramp[] = ["pixels", "ascii", "blocks", "dots", "code"];
const { text: TEXT, dim: DIM, faint: FAINT } = NEUTRAL;
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const arg = (f: string) => process.argv.includes(f);
const MUTE = arg("--mute"), AUTO = !arg("--manual"), DEMO = arg("--demo"), KEEP = arg("--keep");
const SEED = (() => { const i = process.argv.indexOf("--seed"); return i > 0 ? Number(process.argv[i + 1]) : Math.floor(Math.random() * 9000) + 1000; })();
const fgc = ([r, g, b]: number[], k = 1) => `\x1b[38;2;${Math.round(r * k)};${Math.round(g * k)};${Math.round(b * k)}m`, RESET = "\x1b[39m";
const YOU = [255, 255, 255], SEEDC = [138, 135, 153];   // your own edits are white; the seed's are grey; DJs bring their colour
const tokens = (c: string) => c.replace(/\s*\n\s*/g, " ").trim().split(/(?<=,)\s+/).filter(Boolean);
const TAU: Record<string, number> = { kick: 0.22, snare: 0.16, hat: 0.07, stab: 0.3 };
const KIND: Record<string, string> = { kick: "kick", clap: "snare", hat: "hat", stab: "stab", bass: "stab" };
const read = (s: string) => { try { return fs.readFileSync(path.join(SET, s + ".scd"), "utf8"); } catch { return ""; } };

interface Guest { dj: DJ; since: number; offered: number; taken: number; level: "suggest" | "auto"; remote?: boolean }
type Option = Suggestion & { id: number; agent: string };
const LOGC: Record<string, number[]> = { observation: [110, 231, 255], proposal: [255, 184, 107], rejected: [255, 111, 97], error: [255, 111, 97], verdict: [198, 242, 78], applied: [232, 230, 240], landed: [143, 211, 255], grant: [255, 95, 210], enter: [255, 95, 210], transition: [199, 184, 255], note: [255, 255, 255] };
interface Author { name: string; rgb: number[]; bar: number; fresh: Set<string> }

// Defined at module level on purpose: a component created inside App would be a new type on every frame (the screen
// redraws 15 times a second), and React would remount everything inside it, including the text input mid-keystroke.
const Pane = (props: { title: string; note?: string; width: number; height: number; children?: any; row?: boolean; grad: (s: string) => string }) => (
  <Box flexDirection="column" width={props.width} height={props.height} borderStyle="round" borderColor={FAINT} paddingX={1} overflow="hidden">
    <Text wrap="truncate"><Text bold>{props.grad(props.title)}</Text>{props.note ? <Text color={DIM}>  {props.note}</Text> : null}</Text>
    <Box flexDirection={props.row ? "row" : "column"} flexGrow={1}>{props.children}</Box>
  </Box>
);

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const eng = useRef<Engine>(null as any), ears = useRef(new Listener()), last = useRef<Profile | null>(null);
  const hits = useRef<Hit[]>([]), pulse = useRef<Pulse>({ kick: 0, snare: 0, hat: 0, stab: 0, bar: 0, barN: 0, bands: [0, 0, 0, 0, 0] });
  const barAt = useRef({ at: Date.now(), len: 1846 }), busy = useRef(false), t0 = useRef(Date.now()).current;
  const all = useRef<DJ[]>(roster());
  const base = useRef<Base | null>(null), lanes = useRef<Record<string, number[]>>(Object.fromEntries(SLOTS.map((k) => [k, Array(16).fill(0)]))), amps = useRef<Record<string, number[]>>(Object.fromEntries(SLOTS.map((k) => [k, Array(16).fill(0)])));
  const authors = useRef<Record<string, Author>>({}), archived = useRef(false), banner = useRef<{ lines: string[]; rgb: number[]; rgb2: number[]; from: number; ms: number } | null>(null), trend = useRef<{ loud: number[]; bright: number[]; marks: (number[] | null)[] }>({ loud: [], bright: [], marks: [] }), landed = useRef<number[] | null>(null), bpmRef = useRef(130), bus = useRef(new Bus()), lastSummary = useRef(""), build = useRef<{ from: number; until: number; kind: string } | null>(null);
  const st = useRef({
    slots: Object.fromEntries(SLOTS.map((s) => [s, read(s)])) as Record<string, string>, report: "", note: "", history: [] as Past[],
    options: null as Option[] | null, by: "", round: 0, seq: 0, autoAt: 0, autoN: 0, bar: 0, booted: false, askAt: 4,
    booth: [{ dj: all.current.find((d) => d.id === "resident") ?? all.current[0], since: 0, offered: 0, taken: 0, level: "suggest" }] as Guest[], turn: 0,
    scene: { look: "orbit", palette: "ember" } as Scene, next: null as Scene | null, wipeAt: 0, pending: null as Scene | null, lastWipeBar: -9,
  });

  const [, tick] = useState(0);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [ref, setRef] = useState<Profile | null>(() => { try { return JSON.parse(fs.readFileSync(REF, "utf8")); } catch { return null; } });
  const [say, setSay] = useState("waiting for the first report");
  const [typing, setTyping] = useState<"tell" | "summon" | null>(null), [thinking, setThinking] = useState("");
  const [ramp, setRamp] = useState(0), [full, setFull] = useState(arg("--full")), [muted, setMuted] = useState(MUTE), [voice, setVoice] = useState(arg("--voice")), [overlay, setOverlay] = useState<null | "help" | "roster">(null), [logs, setLogs] = useState(arg("--logs")), [log, setLog] = useState(DEMO ? "demo mode: no sound engine" : "booting SuperCollider…");

  const voiceRef = useRef(voice); voiceRef.current = voice;
  const logsRef = useRef(logs); logsRef.current = logs;
  const greet = useRef<{ who: string; rgb: number[]; text: string; until: number } | null>(null);
  const active = () => st.current.booth[st.current.turn % st.current.booth.length].dj;
  const announce = (text: string, rgb: number[], bars = 2, fontKey = text) => {
    const cols = stdout.columns || 120, W = cols - (logsRef.current ? Math.min(96, Math.floor(cols * 0.5)) : 0) - 2, to = hex((UI[st.current.pending?.palette ?? st.current.scene.palette] ?? UI.ember).b);
    for (const font of [FONTS[hashOf(fontKey) % FONTS.length], "block", ...NARROW]) {
      const lines = bigText(text, font); if (!lines.length) continue;
      const w = Math.max(...lines.map((l) => l.length));
      if (w + 4 <= W) { banner.current = { lines: ["", ...lines, ""].map((l) => "  " + l.padEnd(w) + "  "), rgb, rgb2: to, from: Date.now(), ms: barAt.current.len * bars }; return; }
    }
  };
  const queueScene = (sc: Partial<Scene>) => { const s = st.current; s.pending = { wipe: WIPES[Math.floor(Math.random() * WIPES.length)], look: sc.look ?? LOOKS[(LOOKS.indexOf(s.scene.look) + 1 + Math.floor(Math.random() * (LOOKS.length - 1))) % LOOKS.length], palette: sc.palette ?? PALETTE_NAMES[(PALETTE_NAMES.indexOf(s.scene.palette) + 1) % (PALETTE_NAMES.length - 1)] }; };

  const author = (slot: string, code: string, a: { name: string; rgb: number[] }) => {
    const before = new Set(tokens(st.current.slots[slot] || ""));
    if (st.current.booted) landed.current = a.rgb;
    authors.current[slot] = { ...a, bar: st.current.bar, fresh: new Set(tokens(code).filter((t) => !before.has(t))) };
  };
  const ride = (kind: "build" | "wash" | "riser", bars: number, then?: () => void) => {
    const now = Date.now(), nextBar = barAt.current.at + Math.ceil((now - barAt.current.at) / barAt.current.len) * barAt.current.len, drop = nextBar + (bars - 1) * barAt.current.len;
    eng.current?.transition(kind, bars); build.current = { from: now, until: drop, kind }; bus.current.send("transition", "host", { kind, bars });
    if (then) setTimeout(then, Math.max(0, drop - now - 450));   // written just before the bar line, so Pdef's quantise lands it on the drop
  };
  const newBase = (seed: number) => {
    const b = (base.current = makeBase(seed)), sd = { name: `seed ${seed}`, rgb: SEEDC };
    if (!archived.current) { archived.current = true; try { const dir = path.join(ROOT, "tui/sets", new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")); fs.mkdirSync(dir, { recursive: true }); for (const k of SLOTS) fs.copyFileSync(path.join(SET, k + ".scd"), path.join(dir, k + ".scd")); } catch {} }   // never lose the set that was on disk
    for (const k of SLOTS) { author(k, b.slots[k], sd); authors.current[k].fresh = new Set();   // a whole new base isn't a 'change' to highlight
      fs.writeFileSync(path.join(SET, k + ".scd"), b.slots[k] + "\n"); st.current.slots[k] = b.slots[k]; }
    bpmRef.current = b.bpm; eng.current?.tempo(b.bpm); bus.current.send("state", "host", { tempo: b.bpm, key: b.key, seed, slots: b.slots }); st.current.options = null; st.current.askAt = st.current.bar + 4;
    setSay(`new base · seed ${seed} · ${b.bpm} bpm · ${b.key} · ${b.about}`); if (st.current.booted) { announce(`SEED ${seed}`, [237, 230, 216]); queueScene({}); }
  };

  const offer = (o: Suggestion, agent: string) => {
    const s = st.current, opt: Option = { ...o, id: ++s.seq, agent };
    if (!s.options?.length) { s.by = agent; s.autoAt = s.bar + 2; }
    s.options = [...(s.options || []), opt].slice(0, 3);
    bus.current.send("proposal", agent, { id: opt.id, slot: o.slot, diff: o.diff, code: o.code, why: o.why, evidence: o.evidence, angle: o.angle, ms: o.ms });
  };
  const think = () => {
    const s = st.current;
    if (busy.current || s.options?.length || !s.report) return;
    const g = s.booth[s.turn % s.booth.length], dj = g.dj, round = ++s.round;
    if (g.remote) { setSay(`waiting for ${dj.name.toLowerCase()} to propose over the wire`); return; }   // outside agents speak when they like
    busy.current = true; setThinking(`${dj.name.toLowerCase()} is listening`);
    ask({ dj, slots: s.slots, report: s.report, note: s.note, history: s.history, context: `${bpmRef.current} BPM${base.current ? `, key ${base.current.key} (bass root midinote ${base.current.root})` : ""}` },
      (o) => { if (st.current.round !== round) return; offer(o, dj.id); setThinking(""); setSay(""); },
      (kind, d) => bus.current.send(kind === "ask" ? "request" : "rejected", dj.id, d))
      .then(() => { s.note = ""; g.offered++; }, (e) => { setSay(String(e.message)); s.askAt = s.bar + 4; })
      .finally(() => { busy.current = false; setThinking(""); });
  };
  const enter = (dj: DJ, remote = false) => {
    bus.current.send("enter", "host", { agent: dj.id, name: dj.name, remote });
    const s = st.current;
    if (s.booth.some((g) => g.dj.id === dj.id)) { s.turn = s.booth.findIndex((g) => g.dj.id === dj.id); } else { s.booth = [...s.booth, { dj, since: Date.now(), offered: 0, taken: 0, level: "suggest" as const, remote }].slice(-3); s.turn = s.booth.length - 1; }
    s.options = null; ride("riser", 1); queueScene({ look: dj.look, palette: dj.palette }); announce(dj.name, accent(dj.palette), 3, dj.id); greet.current = { who: dj.name, rgb: accent(dj.palette), text: dj.greeting, until: st.current.bar + 8 }; if (voiceRef.current && VOICES.length && !MUTE) setTimeout(() => { try { spawn("say", ["-v", voiceOf(dj.id), "-r", "165", dj.greeting], { stdio: "ignore" }); } catch {} }, barAt.current.len);   // speaks on the drop
    setSay(`${dj.name}: “${dj.greeting}”`); s.askAt = s.bar + 2;
  };
  const submit = (raw: string) => {
    const text = raw.trim(), mode = typing, s = st.current; setTyping(null);
    if (!text) return;
    if (mode === "tell") { s.note = text; s.options = null; s.round++; bus.current.send("note", "human", { text, to: active().id }); think(); }
    else { setThinking(`writing a DJ who ${text}`); summon(text, all.current.map((d) => d.id)).then((dj) => { save(dj); all.current = roster(); enter(dj); }, (e) => setSay("summon failed: " + e.message)).finally(() => setThinking("")); }
  };
  const take = (i: number, by = "human") => {
    const s = st.current, o = s.options?.[i]; if (!o) return;
    const g = s.booth.find((x) => x.dj.id === o.agent), who = g?.dj ?? active(); if (g) g.taken++;
    author(o.slot, o.code, { name: who.name, rgb: accent(who.palette) }); s.slots[o.slot] = o.code;   // set before writing, so the file watcher doesn't credit the change to you
    fs.writeFileSync(path.join(SET, o.slot + ".scd"), o.code + "\n");
    bus.current.send("verdict", by === "human" ? "human" : "host", { proposal: o.id, decision: "take", by });
    bus.current.send("applied", "host", { slot: o.slot, author: o.agent, lands: s.bar + 1 });
    s.history.push({ slot: o.slot, why: o.why, verdict: "y" });
    s.options.filter((_, k) => k !== i).forEach((x) => s.history.push({ slot: x.slot, why: x.why, verdict: "n" }));
    s.options = null; s.round++; s.turn++; s.askAt = s.bar + 2; setSay(`${by === "human" ? "taken" : who.name + " took it"}: ${o.why}  · lands on the next bar`);
  };
  const skip = (by = "human") => {
    const s = st.current; if (!s.options) return;
    s.options.forEach((o) => { s.history.push({ slot: o.slot, why: o.why, verdict: "n" }); bus.current.send("verdict", by === "human" ? "human" : "host", { proposal: o.id, decision: "skip", by }); });
    s.options = null; s.round++; s.turn++; s.askAt = s.bar + 1; setSay("skipped. next DJ up");
  };

  useEffect(() => {
    const b = bus.current.open(); b.send("hello", "host", { host: "ears-tui", protocol: 0, log: b.path });
    b.on("msg", () => {});
    b.on("inbound", (m: Msg) => {
      const s = st.current, id = String(m.from || "guest").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 24) || "guest";
      if (!s.booth.some((g) => g.dj.id === id)) enter({ id, name: id.toUpperCase().replace(/-/g, " "), tagline: "an agent on the wire", palette: "mono", look: "codefield", head: "robot", hair: "antenna", eyes: "visor", cans: "none", body: "laptop", style: "", idioms: [], never: [], greeting: String(m.greeting || "Connected. I can read the room but not touch it.") }, true);
      if (m.type === "note") setSay(`${id}: ${String(m.text).slice(0, 200)}`);
      if (m.type !== "proposal") return;
      const slot = String(m.slot), before = s.slots[slot] || "", patch = { slot, set: (m.set as any) || [], remove: (m.remove as any) || [], replace: !!m.replace };
      const code = typeof m.code === "string" ? m.code.trim() : applyPatch(before, patch), bad = !SLOTS.includes(slot) ? "unknown slot" : validate({ slot, code });
      if (bad) { b.send("rejected", id, { reason: bad, angle: "wire" }); return; }
      offer({ slot, code, why: String(m.why || "").slice(0, 140), evidence: String(m.evidence || "").slice(0, 140), diff: typeof m.code === "string" ? "rewrite" : describe(before, patch), angle: "wire", ms: 0 }, id);
    });
    const e = (eng.current = new Engine());
    e.on("ready", () => { setLog("engine ready"); if (KEEP) SLOTS.forEach((s) => st.current.slots[s].trim() && e.eval(st.current.slots[s], s)); else newBase(SEED); setTimeout(() => (st.current.booted = true), 3000); });
    e.on("ears", (f) => { ears.current.push(f); pulse.current.bands = f.bands; });
    e.on("scope", feed);
    e.on("onset", () => ears.current.onset());
    e.on("hit", (h: Hit) => hits.current.push(h));
    e.on("evald", ({ id, ok, msg }) => { if (SLOTS.includes(id)) bus.current.send(ok ? "landed" : "error", "engine", ok ? { slot: id } : { slot: id, reason: msg }); setStatus((x) => ({ ...x, [id]: ok ? "ok" : msg })); if (ok && st.current.booted && !st.current.pending) queueScene({}); });
    e.on("log", (l: string) => setLog(l.slice(0, 110)));
    const onBar = (n: number, at: number, len: number) => {
      const s = st.current; barAt.current = { at, len }; s.bar = n; ears.current.bar();
      setTimeout(() => (pulse.current.barN = n), Math.max(0, at - Date.now()));
      if (s.pending && n - s.lastWipeBar >= 2) { s.next = s.pending; s.pending = null; s.wipeAt = at; s.lastWipeBar = n; }   // a change in the music is a change on screen, on the bar
      if (n % 2 === 0) { const p = ears.current.take(); if (p) { last.current = p; const l = compare(p, ref); setLines(l); s.report = asText(l, "detroit"); { const summary = l.filter((x) => x.word && x.word !== "ok").map((x) => `${x.label.split(" ")[0]} ${x.word}`).join(" · ") || "balanced"; bus.current.send("observation", "ears", { kind: "listening-report", same: summary === lastSummary.current, summary, text: s.report, metrics: p }); lastSummary.current = summary; } if (false) bus.current.send("observation", "ears", { kind: "listening-report", summary: l.filter((x) => x.word && x.word !== "ok").map((x) => `${x.label.split(" ")[0]} ${x.word}`).join(" · ") || "balanced", text: s.report, metrics: p }); const tr = trend.current; tr.loud.push(Math.max(0, Math.min(1, (p.rms + 24) / 24))); tr.bright.push(Math.max(0, Math.min(1, p.centroid / 7000))); tr.marks.push(landed.current); landed.current = null; for (const k of ["loud", "bright", "marks"] as const) if (tr[k].length > 120) tr[k].shift(); } }
      bus.current.bar = n;
      // takeover: a DJ you've granted `auto` takes its own idea once the veto window closes. n still vetoes.
      const owner = s.options?.length ? s.booth.find((g) => g.dj.id === s.options![0].agent) : null;
      if (owner?.level === "auto" && n >= s.autoAt && !busy.current) {
        const want = ["style", "fix", "bold"][s.autoN++ % 3], i = Math.max(0, s.options!.findIndex((o) => o.angle === want));
        if (s.options![i].angle === "bold") ride("build", 2, () => take(i, "grant:auto")); else take(i, "grant:auto");
      }
      if (AUTO && n >= s.askAt) think();
    };
    e.on("bar", ({ n, at, bpm }) => { bpmRef.current = Math.round(bpm); onBar(n, at, (240 / bpm) * 1000); });
    let demo: any;
    if (DEMO) {
      if (!KEEP) newBase(SEED);
      const beat = 60000 / 130; let n = 0;
      demo = setInterval(() => { const at = Date.now() + 50; const st4 = (n % 4) * 4; hits.current.push({ slot: "d1", inst: "kick", at, amp: 0.9, step: st4 }); if (n % 2) hits.current.push({ slot: "d4", inst: "clap", at, amp: 0.5, step: st4 }); for (let i = 0; i < 4; i++) hits.current.push({ slot: "d2", inst: "hat", at: at + (i * beat) / 4, amp: 0.2, step: st4 + i }); if (n % 4 === 0) onBar(n / 4, at, beat * 4); if (n % 32 === 31) queueScene({}); n++; }, beat);
    } else e.start(MUTE);
    const w = chokidar.watch(SET, { ignoreInitial: true }).on("all", (_ev, file) => {
      const s = path.basename(file, ".scd");
      if (!SLOTS.includes(s)) return;
      const code = read(s);
      if (code.trim() !== (st.current.slots[s] || "").trim()) { author(s, code, { name: "you", rgb: YOU }); bus.current.send("applied", "human", { slot: s, author: "human", lands: st.current.bar + 1 }); }
      st.current.slots[s] = code;
      e.eval(st.current.slots[s].trim() || `~hush.(\\${s})`, s);
      bus.current.send("state", "host", { tempo: bpmRef.current, key: base.current?.key, slots: { ...st.current.slots } });
    });
    const timer = setInterval(() => {
      const now = Date.now(), p = pulse.current, s = st.current;
      for (const k of Object.keys(TAU)) (p as any)[k] *= Math.exp(-0.066 / TAU[k]);
      hits.current = hits.current.filter((h) => { if (h.at > now) return true; if (lanes.current[h.slot]) { const i = h.step; lanes.current[h.slot][i] = h.at; amps.current[h.slot][i] = Math.max(0.35, Math.min(1, h.amp * 2.5)); } const k = KIND[h.inst]; if (k) (p as any)[k] = Math.max((p as any)[k], Math.min(1, h.amp * 4 + 0.4)); return false; });
      p.bar = Math.max(0, Math.min(1, (now - barAt.current.at) / barAt.current.len)) % 1;
      if (DEMO) { fake((now - t0) / 1000, p.kick); p.bands = [0.4 + p.kick * 0.2, 0.18, 0.05, 0.015, 0.002]; }
      if (s.next && now - s.wipeAt > barAt.current.len) { s.scene = s.next; s.next = null; }
      tick((x) => x + 1);
    }, 66);
    const bye = () => { e.stop(); w.close(); };
    process.on("exit", bye);
    return () => { clearInterval(timer); clearInterval(demo); bye(); };
  }, []);

  useInput((input, key) => {
    const s = st.current;
    if (typing) { if (key.escape) setTyping(null); return; }   // the TextInput owns the keyboard
    if (overlay) {
      if (overlay === "roster") { if (key.escape || input === "q") setOverlay(null); return; }   // the Select owns the arrows and enter
      setOverlay(null); return;
    }
    if (input === "?") { setOverlay("help"); return; }
    if (input === "D") { all.current = roster(); setOverlay("roster"); return; }
    if (key.tab && s.booth.length > 1) { s.turn++; s.options = null; s.askAt = s.bar + 1; setSay(`${active().name} steps up`); return; }
    if (input === "q") { eng.current.stop(); setTimeout(() => { exit(); process.exit(0); }, 600); }
    if (input === "y" || input === "1") take(0);
    if (input === "2") take(1);
    if ("!@#".includes(input) && input && s.options?.["!@#".indexOf(input)]) { const i = "!@#".indexOf(input); setSay("building into it…"); ride("build", 2, () => take(i)); }
    if (input === "3") take(2);
    if (input === "n") skip();
    if (input === "a") think();
    if (input === "t") setTyping("tell");
    if (input === "s") setTyping("summon");
    if (input === "d") { const out = all.current.filter((d) => !s.booth.some((g) => g.dj.id === d.id)); if (out.length) enter(out[Math.floor(Math.random() * out.length)]); else setSay("everyone on the roster is already in the booth. [s] summons someone new"); }
    if (input === "x" && s.booth.length > 1) { const g = s.booth.splice(s.turn % s.booth.length, 1)[0]; bus.current.send("leave", "host", { agent: g.dj.id }); s.options = null; setSay(`${g.dj.name} leaves the booth`); }
    if (input === "l" || input === "L") s.scene = { ...s.scene, look: LOOKS[(LOOKS.indexOf(s.scene.look) + (input === "l" ? 1 : LOOKS.length - 1)) % LOOKS.length] };
    if (input === "p") s.scene = { ...s.scene, palette: PALETTE_NAMES[(PALETTE_NAMES.indexOf(s.scene.palette) + 1) % PALETTE_NAMES.length] };
    if (input === "c") setRamp((r) => (r + 1) % RAMP_NAMES.length);
    if (input === "f") setFull((x) => !x);
    if (input === "v") { setVoice((x) => !x); setSay(voice ? "DJs go quiet" : VOICES.length ? "DJs will speak their greeting when they walk in" : "no `say` voices found on this machine"); }
    if (input === "o" || input === "O") { const gs = input === "O" ? s.booth : [s.booth[s.turn % s.booth.length]], level = gs[0].level === "auto" ? "suggest" : "auto"; gs.forEach((g) => { g.level = level; bus.current.send("grant", "human", { agent: g.dj.id, level }); }); setSay(level === "auto" ? `${gs.map((g) => g.dj.name).join(" + ")} can take their own ideas after a 2-bar veto window. n vetoes, o takes it back` : "back to suggestions only"); if (level === "auto") s.autoAt = s.bar + 2; }
    if (input === "e") setLogs((x) => !x);
    if (input === "g") { const seed = Math.floor(Math.random() * 9000) + 1000; setSay(`building into seed ${seed}…`); ride(Math.random() < 0.5 ? "build" : "wash", 2, () => newBase(seed)); }
    if (input === "u") ride("build", 2);
    if (input === "w") ride("wash", 2);
    if (input === "m") { eng.current.volume(muted ? 1 : 0); setMuted(!muted); }
    if (input === "r" && last.current) { fs.mkdirSync(path.dirname(REF), { recursive: true }); fs.writeFileSync(REF, JSON.stringify(last.current, null, 2)); setRef(last.current); setLog("saved what you just heard as the reference"); }
  });

  const W = Math.max(90, stdout.columns || 120), H = stdout.rows || 48, s = st.current, p = pulse.current, now = Date.now();
  const wipe = s.next ? Math.min(1, Math.max(0, (now - s.wipeAt) / barAt.current.len)) : 0;
  const th = UI[(s.next && wipe > 0.5 ? s.next : s.scene).palette] ?? UI.ember, A = th.a, B = th.b, Argb = hex(A), Brgb = hex(B), Trgb = hex(TEXT), Drgb = hex(DIM), Frgb = hex(FAINT);
  const tight = H < 42, paneH = 15, boothH = tight ? 6 : 15, leftW = Math.floor(W * 0.56), boothW = tight ? Math.min(44, Math.floor(W * 0.4)) : Math.min(s.booth.length, 3) * 21 + 4;
  const fieldH = full ? Math.max(6, H - 8) : Math.max(4, H - 2 - paneH - boothH);
  const bn = banner.current && now - banner.current.from < banner.current.ms ? ({ lines: banner.current.lines, rgb: banner.current.rgb, t: (now - banner.current.from) / banner.current.ms } as Banner) : null;
  const logW = logs ? Math.min(96, Math.floor(W * 0.5)) : 0;
  const rows = overlay ? [] : field(s.scene, s.next, wipe, RAMP_NAMES[ramp], W - logW, fieldH, (now - t0) / 1000, p, { code: SLOTS.map((k) => s.slots[k]).join(" "), banner: bn });
  const beat = Math.floor(p.bar * 4), who = active(), codeW = (full ? W - 24 : leftW) - 4, step = Math.floor(p.bar * 16) % 16;

  // The code pane is the live thing. Lane: the hits that actually sounded, in the colour of whoever wrote the slot.
  // Code: keys recede, values stand out, step rows are drawn as steps, and what a change brought in glows for 8 bars.
  const paint = (t: string, fresh: boolean) => {
    if (fresh) return "\x1b[1m" + fgc(Argb) + t + "\x1b[22m";
    const row = t.match(/^(.*?")([Xx\-. ]{4,})(".*)$/);
    if (row) return fgc(Drgb) + row[1] + [...row[2]].map((c) => (c === "X" ? fgc(Trgb) + "█" : c === "x" ? fgc(Drgb) + "▄" : fgc(Frgb) + "·")).join("") + fgc(Drgb) + row[3];
    return (t.startsWith("\\") || t.startsWith("~d.(") ? fgc(Drgb) : fgc(Trgb)) + t;
  };
  const slotView = (k: string) => {
    const a = authors.current[k], rgb = a?.rgb ?? Drgb, lane = lanes.current[k], hot = !!a && s.bar - a.bar < 8;
    const laneStr = lane.map((at, i) => { const age = (now - at) / barAt.current.len, lit = at > 0 && age < 0.97; return lit ? fgc(i === step ? [255, 255, 255] : rgb, (0.45 + amps.current[k][i] * 0.55) * (1 - age * 0.5)) + (age < 0.06 ? "█" : "■") : fgc(i === step ? Trgb : Frgb, i % 4 === 0 && i !== step ? 1.5 : 1) + (i === step ? "▁" : i % 4 === 0 ? "╷" : "·"); }).join("") + RESET;
    const out: string[] = [""]; let len = 0;
    for (const t of tokens(s.slots[k] || "")) {
      if (len + t.length + 1 > codeW) { if (out.length === 2) { out[1] += fgc(Frgb) + "…"; break; } out.push(""); len = 0; }
      out[out.length - 1] += paint(t, hot && a!.fresh.has(t)) + " "; len += t.length + 1;
    }
    return { laneStr, code: out.map((l) => l + RESET), by: a ? `${a.name} · bar ${a.bar}` : "", rgb };
  };
  const grad = gradient([A, B]);
  const uiTheme = extendTheme(defaultTheme, { components: {
    Spinner: { styles: { frame: () => ({ color: A }), label: () => ({ color: DIM }) } },
    Select: { styles: { focusIndicator: () => ({ color: A }), selectedIndicator: () => ({ color: B }), label: ({ isFocused }: any) => ({ color: isFocused ? TEXT : DIM, bold: isFocused }) } },
  } });
  const meter = (v: number, n = 12) => { const k = Math.max(0, Math.min(1, v)) * n, fullN = Math.floor(k); return fgc(Brgb) + "━".repeat(fullN) + (k - fullN > 0.5 ? "╸" : "") + fgc(Frgb) + "─".repeat(Math.max(0, n - fullN - (k - fullN > 0.5 ? 1 : 0))) + RESET; };
  const chartW = W - leftW - 4 - 42 - 3, tr = trend.current;
  const chart = chartW >= 16 && tr.loud.length >= 2 ? (() => {
    const n = Math.min(tr.loud.length, chartW), cut = <T,>(xs: T[]) => xs.slice(-n);
    const plot = asciichart.plot([[0, 1], cut(tr.loud), cut(tr.bright)], { height: 8, colors: ["\x1b[30m", fgc(Argb), fgc(Brgb)] as any, format: () => "", padding: "" }) as string;   // the invisible [0,1] series pins the axis
    return { rows: plot.split("\n").map((r) => fgc(Frgb) + r + RESET), marks: " " + cut(tr.marks).map((m) => (m ? fgc(m) + "▴" : fgc(Frgb) + "·")).join("") + RESET };
  })() : null;
  const riding = build.current && now < build.current.until ? build.current : null;
  const KEYS: [string, [string, string][]][] = [
    ["the booth", [["1 2 3", "take an option"], ["! @ #", "take it with a build"], ["n", "skip, next DJ steps up"], ["tab", "next DJ, no questions"], ["t", "tell the active DJ something"], ["a", "ask for options now"]]],
    ["djs", [["d", "bring in someone from the roster"], ["D", "pick who from a list"], ["s", "summon a new DJ from a description"], ["x", "retire the active DJ"], ["o / O", "takeover: this DJ / everyone acts alone"]]],
    ["the set", [["g", "new random base, through a build"], ["u / w", "build / wash by hand"], ["m", "mute"], ["v", "DJs speak their greeting (macOS say)"], ["r", "save what's playing as the reference"]]],
    ["the screen", [["f", "stage mode"], ["l / L", "next / previous look"], ["p", "palette"], ["c", "characters"], ["e", "live protocol log"], ["?", "this"], ["q", "quit"]]],
  ];

  return (
    <ThemeProvider theme={uiTheme}>
    <Box flexDirection="column" width={W}>
      <Box justifyContent="space-between" paddingX={1}>
        <Text wrap="truncate"><Text bold>{grad("E A R S")}</Text>  {[0, 1, 2, 3].map((i) => <Text key={i} color={i === beat ? (i === 0 ? A : TEXT) : FAINT}>{i === beat ? "● " : "○ "}</Text>)} <Text color={TEXT}>bar {s.bar}</Text><Text color={DIM}> · {bpmRef.current} bpm{base.current ? ` · seed ${base.current.seed} · ${base.current.key} · ${base.current.about}` : " · set from disk"}</Text></Text>
        <Text wrap="truncate">{riding ? <Text color={B} bold>{riding.kind} {"▁▂▃▄▅▆▇█".slice(0, 1 + Math.floor(((now - riding.from) / (riding.until - riding.from)) * 7.99)).padEnd(8, " ")} </Text> : null}{muted ? <Text color={B}>muted  </Text> : null}<Text color={DIM}>{log === "engine ready" ? "" : log.slice(0, 50)}</Text></Text>
      </Box>
      {!full && <Box>
        <Pane grad={grad} title="code" note="tui/set/*.scd · save to land it on the next bar" width={leftW} height={paneH}>
          {SLOTS.map((k) => {
            const v = slotView(k), bad = status[k] && status[k] !== "ok";
            return (
              <Box key={k} flexDirection="column">
                <Text wrap="truncate">{fgc(v.rgb)}[1m{k}[22m{RESET} {v.laneStr}  {bad ? <Text color={B}>✗ still playing the last good version · {status[k]}</Text> : <Text color={DIM}>{s.slots[k].trim() ? v.by : "empty"}</Text>}</Text>
                <Text wrap="truncate">{v.code[0] || " "}</Text>
                <Text wrap="truncate">{v.code[1] || " "}</Text>
              </Box>
            );
          })}
        </Pane>
        <Pane grad={grad} title="ears" note={ref ? "every 2 bars, against the reference" : "no reference yet · r saves what's playing"} width={W - leftW} height={paneH} row>
          <Box flexDirection="column" width={41}>
            {lines.length === 0 ? <Spinner label="listening" /> : lines.map((l, li) => {
              const off = l.word && l.word !== "ok", d = l.delta ?? 0;
              return (
                <Text key={l.label} wrap="truncate"><Text color={off ? TEXT : DIM}>{(({ "onsets/beat": "onsets", centroid: "bright", loudness: "loud" } as Record<string, string>)[l.label] ?? l.label.replace(/\s+.*$/, "")).padEnd(9)}</Text>{li < 5 ? meter((20 * Math.log10(Math.max(p.bands[li], 1e-5)) + 56) / 56) : li === 7 ? meter((20 * Math.log10(Math.max(p.bands.reduce((x, y) => x + y, 0), 1e-5)) + 40) / 40) : " ".repeat(12)} <Text color={off ? B : FAINT}>{Math.abs(d) < 0.05 ? "  " : d > 0 ? "▲ " : "▼ "}{Math.abs(d).toFixed(1).padStart(4)}</Text> {off ? <Text color={B} bold>{l.word}</Text> : <Text color={FAINT}>·</Text>}</Text>
              );
            })}
          </Box>
          {chart && <Box flexDirection="column" marginLeft={1}>
            {chart.rows.map((r, i) => <Text key={i} wrap="truncate">{r}</Text>)}
            <Text wrap="truncate">{chart.marks}</Text>
            <Text wrap="truncate"><Text color={A}>━ loudness</Text>  <Text color={B}>━ brightness</Text>  <Text color={DIM}>▴ change</Text></Text>
          </Box>}
        </Pane>
      </Box>}
      {!full && <Box>
        <Pane grad={grad} title="booth" note={tight ? undefined : `${s.booth.length}/3`} width={boothW} height={boothH} row>
          {s.booth.map((g) => {
            const on = g.dj.id === who.id, rise = Math.min(10, Math.floor((now - g.since) / 90)), art = tight ? [] : avatar(g.dj, p, on);
            const shown = g.since && !tight ? [...Array(10 - rise).fill(""), ...art.slice(0, rise)] : art, mine = SLOTS.filter((k) => authors.current[k]?.name === g.dj.name);
            return (
              <Box key={g.dj.id} flexDirection="column" width={tight ? undefined : 21} marginRight={tight ? 2 : 0}>
                {shown.map((r, i) => <Text key={i} wrap="truncate">{r || " "}</Text>)}
                <Text wrap="truncate">{fgc(accent(g.dj.palette), on ? 1 : 0.55)}{on ? "▸ " : "  "}{on ? "\x1b[1m" : ""}{g.dj.name}{"\x1b[22m"}{RESET}{g.level === "auto" ? <Text color={B} bold> AUTO</Text> : null}{g.remote ? <Text color={DIM}> wire</Text> : null}</Text>
                <Text color={DIM} wrap="truncate">  {g.taken}/{g.offered} taken{mine.length ? " · " + mine.join(" ") : ""}</Text>
              </Box>
            );
          })}
        </Pane>
        <Pane grad={grad} title={typing ? (typing === "tell" ? `you → ${who.name.toLowerCase()}` : "summon a dj") : `${who.name.toLowerCase()} offers`} note={typing ? "enter to send · esc to cancel" : s.options?.length ? (s.booth.find((g) => g.dj.id === s.options![0].agent)?.level === "auto" ? `takes its own in ${Math.max(0, s.autoAt - s.bar)} bar${s.autoAt - s.bar === 1 ? "" : "s"} · n vetoes · o takes control back` : "1 2 3 take · ⇧ with a build · n skip · t tell") : "a ask · t tell · s summon · ? keys"} width={W - boothW} height={boothH}>
          {greet.current && s.bar < greet.current.until && !typing ? <Text wrap="truncate">{fgc(greet.current.rgb)}{"\x1b[1m"}{greet.current.who}{"\x1b[22m"}{RESET} <Text color={TEXT}>“{greet.current.text}”</Text></Text> : null}
          {typing ? <Box><Text color={A}>{typing === "summon" ? "a DJ who " : "› "}</Text><TextInput key={typing} placeholder={typing === "summon" ? "plays acid, a bit unhinged…" : "more dub, less bright…"} onSubmit={submit} /></Box>
            : s.options?.length ? <>
              {s.options.map((o, i) => (
                <Box key={o.id} flexDirection="column" marginTop={i && !tight ? 1 : 0}>
                  <Text wrap="truncate"><Text color={A} bold> {i + 1} </Text><Text color={B}>{o.slot}</Text>  <Text color={TEXT}>{o.why}</Text><Text color={FAINT}>   {o.angle}{o.ms ? ` · ${(o.ms / 1000).toFixed(1)}s` : ""}{o.agent !== who.id ? ` · ${o.agent}` : ""}</Text></Text>
                  {!tight && <Text wrap="truncate-end"><Text color={DIM}>      {o.diff}</Text></Text>}
                  {!tight && <Text wrap="truncate"><Text color={FAINT}>      ↳ {o.evidence}</Text></Text>}
                </Box>
              ))}
              {thinking && s.options.length < 3 ? <Box marginTop={1}><Spinner label="more coming" /></Box> : null}
            </> : thinking ? <Spinner label={thinking} />
            : <Text color={say.includes("“") ? TEXT : DIM} wrap="wrap">{say || "…"}</Text>}
          <Box flexGrow={1} />
          {!tight && <Text wrap="truncate"><Text color={FAINT}>{s.history.slice(-24).map((h) => (h.verdict === "y" ? "●" : "·")).join(" ")}</Text>{s.note ? <Text color={DIM}>   note: “{s.note}”</Text> : null}</Text>}
        </Pane>
      </Box>}

      {overlay === "help" && <Box flexDirection="row" paddingX={2} paddingY={1} height={fieldH} overflow="hidden">
        {KEYS.map(([group, keys]) => (
          <Box key={group} flexDirection="column" marginRight={5}>
            <Text color={A} bold>{group}</Text>
            {keys.map(([k, what]) => <Text key={k}><Text color={B}>{k.padEnd(7)}</Text><Text color={TEXT}>{what}</Text></Text>)}
          </Box>
        ))}
      </Box>}
      {overlay === "roster" && <Box flexDirection="column" paddingX={2} paddingY={1} height={fieldH} overflow="hidden">
        <Text bold>{grad("who walks in?")}<Text color={DIM}>   ↑↓ choose · enter · esc closes</Text></Text>
        <Select visibleOptionCount={Math.max(3, fieldH - 4)} options={all.current.map((d) => ({ value: d.id, label: `${d.name.padEnd(18)} ${s.booth.some((g) => g.dj.id === d.id) ? "(in the booth) " : ""}${d.tagline}`.slice(0, W - 10) }))} onChange={(id) => { const dj = all.current.find((d) => d.id === id); setOverlay(null); if (dj) enter(dj); }} />
      </Box>}
      {!overlay && <Box>
        <Box flexDirection="column" width={W - logW}>{rows.map((r, i) => <Text key={i} wrap="truncate">{r}</Text>)}</Box>
        {logs && <Box flexDirection="column" width={logW} height={fieldH} paddingLeft={2} overflow="hidden">
          <Text wrap="truncate"><Text bold>{grad("the wire")}</Text><Text color={DIM}>  every message between host, agents and you · also in tui/logs/latest.jsonl</Text></Text>
          {bus.current.recent.filter((m) => !m.same && m.type !== "state" && (m.type !== "request" || m.angle === "fix")).slice(-(fieldH - 1)).map((m, i) => { const l = pretty(m), c = LOGC[m.type] ?? Drgb; return <Text key={m.t + ":" + i} wrap="truncate">{fgc(Frgb, 1.6)}{l.time.slice(3)} {fgc(c)}{l.type.padEnd(12)}{fgc(Drgb)}{l.from.slice(0, 12).padEnd(13)}{fgc(m.type === "proposal" || m.type === "verdict" || m.type === "note" ? Trgb : Drgb)}{l.text}{RESET}</Text>; })}
        </Box>}
      </Box>}

      {full && <Box flexDirection="column" paddingX={1}>
        {SLOTS.map((k) => { const v = slotView(k); return <Text key={k} wrap="truncate">{fgc(v.rgb)}[1m{k}[22m{RESET} {v.laneStr}  {v.code[0]}</Text>; })}
        <Text wrap="truncate">{s.booth.map((g) => fgc(accent(g.dj.palette), g.dj.id === who.id ? 1 : 0.5) + (g.dj.id === who.id ? "▸ " : "  ") + g.dj.name).join("   ")}{RESET}   {s.options ? s.options.map((o, i) => <Text key={i}><Text color={A} bold> {i + 1} </Text><Text color={TEXT}>{o.why}   </Text></Text>) : <Text color={DIM}>{say}</Text>}</Text>
      </Box>}
      <Box justifyContent="space-between" paddingX={1}>
        <Text color={DIM} wrap="truncate"><Text color={B}>?</Text> keys   <Text color={B}>g</Text> new base   <Text color={B}>d</Text> dj   <Text color={B}>o</Text> takeover   <Text color={B}>e</Text> wire   <Text color={B}>f</Text> stage</Text>
        <Text color={DIM} wrap="truncate">{s.scene.look} · {s.scene.palette} · {RAMP_NAMES[ramp]}</Text>
      </Box>
    </Box>
    </ThemeProvider>
  );
}

render(<App />);
