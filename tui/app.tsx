// EARS. Left: the performer's code (edit tui/set/*.scd in your own editor; saving evals it on the next bar).
// Right: what the booth heard. Middle: the DJs in the booth and the options the active one is offering.
// Bottom: the field, drawn from the real master bus. Nothing a DJ says reaches the speakers without a keypress.
import React, { useEffect, useRef, useState } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import figlet from "figlet";
import { Engine, ROOT, type Hit } from "./engine.ts";
import { Listener, compare, asText, type Profile, type Line } from "./report.ts";
import { ask, summon, type Suggestion, type Past } from "./agent.ts";
import { render as field, LOOKS, PALETTE_NAMES, WIPES, type Pulse, type Ramp, type Scene, type Banner } from "./ascii.ts";
import { feed, fake } from "./audio.ts";
import { roster, save, avatar, accent, type DJ } from "./djs.ts";
import { makeBase, type Base } from "./seed.ts";

const SET = process.env.EARS_SET || path.join(ROOT, "tui/set");   // EARS_SET lets a test instance play from its own folder
const REF = path.join(ROOT, "tui/refs/detroit.json");
const SLOTS = ["d1", "d2", "d3", "d4"], RAMP_NAMES: Ramp[] = ["ascii", "blocks", "dots", "code"];
const AMBER = "#f2a93b", CYAN = "#6fc3d6", DIM = "#8d8474";
const arg = (f: string) => process.argv.includes(f);
const MUTE = arg("--mute"), AUTO = !arg("--manual"), DEMO = arg("--demo"), KEEP = arg("--keep");
const SEED = (() => { const i = process.argv.indexOf("--seed"); return i > 0 ? Number(process.argv[i + 1]) : Math.floor(Math.random() * 9000) + 1000; })();
const fgc = ([r, g, b]: number[], k = 1) => `\x1b[38;2;${Math.round(r * k)};${Math.round(g * k)};${Math.round(b * k)}m`, RESET = "\x1b[39m";
const YOU = [111, 195, 214], SEEDC = [141, 132, 116];
const tokens = (c: string) => c.replace(/\s*\n\s*/g, " ").trim().split(/(?<=,)\s+/).filter(Boolean);
const TAU: Record<string, number> = { kick: 0.22, snare: 0.16, hat: 0.07, stab: 0.3 };
const KIND: Record<string, string> = { kick: "kick", clap: "snare", hat: "hat", stab: "stab", bass: "stab" };
const read = (s: string) => { try { return fs.readFileSync(path.join(SET, s + ".scd"), "utf8"); } catch { return ""; } };

interface Guest { dj: DJ; since: number; offered: number; taken: number }
interface Author { name: string; rgb: number[]; bar: number; fresh: Set<string> }

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const eng = useRef<Engine>(null as any), ears = useRef(new Listener()), last = useRef<Profile | null>(null);
  const hits = useRef<Hit[]>([]), pulse = useRef<Pulse>({ kick: 0, snare: 0, hat: 0, stab: 0, bar: 0, barN: 0, bands: [0, 0, 0, 0, 0] });
  const barAt = useRef({ at: Date.now(), len: 1846 }), busy = useRef(false), t0 = useRef(Date.now()).current;
  const all = useRef<DJ[]>(roster());
  const base = useRef<Base | null>(null), lanes = useRef<Record<string, number[]>>(Object.fromEntries(SLOTS.map((k) => [k, Array(16).fill(0)]))), amps = useRef<Record<string, number[]>>(Object.fromEntries(SLOTS.map((k) => [k, Array(16).fill(0)])));
  const authors = useRef<Record<string, Author>>({}), archived = useRef(false), banner = useRef<{ lines: string[]; rgb: number[]; from: number; ms: number } | null>(null), bpmRef = useRef(130), build = useRef<{ from: number; until: number; kind: string } | null>(null);
  const st = useRef({
    slots: Object.fromEntries(SLOTS.map((s) => [s, read(s)])) as Record<string, string>, report: "", note: "", history: [] as Past[],
    options: null as Suggestion[] | null, by: "", bar: 0, booted: false, askAt: 4,
    booth: [{ dj: all.current.find((d) => d.id === "resident") ?? all.current[0], since: 0, offered: 0, taken: 0 }] as Guest[], turn: 0,
    scene: { look: "orbit", palette: "ember" } as Scene, next: null as Scene | null, wipeAt: 0, pending: null as Scene | null, lastWipeBar: -9,
  });

  const [, tick] = useState(0);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [ref, setRef] = useState<Profile | null>(() => { try { return JSON.parse(fs.readFileSync(REF, "utf8")); } catch { return null; } });
  const [say, setSay] = useState("waiting for the first report");
  const [typing, setTyping] = useState<{ mode: "tell" | "summon"; text: string } | null>(null);
  const [ramp, setRamp] = useState(0), [full, setFull] = useState(arg("--full")), [muted, setMuted] = useState(MUTE), [log, setLog] = useState(DEMO ? "demo mode: no sound engine" : "booting SuperCollider…");

  const active = () => st.current.booth[st.current.turn % st.current.booth.length].dj;
  const announce = (text: string, rgb: number[], bars = 2) => {
    const W = (stdout.columns || 120) - 4;
    for (const font of ["ANSI Shadow", "Calvin S", "Small"] as const) {
      try { const lines = figlet.textSync(text, { font }).split("\n").filter((l) => l.trim()); const w = Math.max(...lines.map((l) => l.length)); if (w + 6 <= W) { banner.current = { lines: ["", ...lines, ""].map((l) => "   " + l.padEnd(w) + "   "), rgb, from: Date.now(), ms: barAt.current.len * bars }; return; } } catch {}
    }
  };
  const queueScene = (sc: Partial<Scene>) => { const s = st.current; s.pending = { wipe: WIPES[Math.floor(Math.random() * WIPES.length)], look: sc.look ?? LOOKS[(LOOKS.indexOf(s.scene.look) + 1 + Math.floor(Math.random() * (LOOKS.length - 1))) % LOOKS.length], palette: sc.palette ?? PALETTE_NAMES[(PALETTE_NAMES.indexOf(s.scene.palette) + 1) % (PALETTE_NAMES.length - 1)] }; };

  const author = (slot: string, code: string, a: { name: string; rgb: number[] }) => {
    const before = new Set(tokens(st.current.slots[slot] || ""));
    authors.current[slot] = { ...a, bar: st.current.bar, fresh: new Set(tokens(code).filter((t) => !before.has(t))) };
  };
  const ride = (kind: "build" | "wash" | "riser", bars: number, then?: () => void) => {
    const now = Date.now(), nextBar = barAt.current.at + Math.ceil((now - barAt.current.at) / barAt.current.len) * barAt.current.len, drop = nextBar + (bars - 1) * barAt.current.len;
    eng.current?.transition(kind, bars); build.current = { from: now, until: drop, kind };
    if (then) setTimeout(then, Math.max(0, drop - now - 450));   // written just before the bar line, so Pdef's quantise lands it on the drop
  };
  const newBase = (seed: number) => {
    const b = (base.current = makeBase(seed)), sd = { name: `seed ${seed}`, rgb: SEEDC };
    if (!archived.current) { archived.current = true; try { const dir = path.join(ROOT, "tui/sets", new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")); fs.mkdirSync(dir, { recursive: true }); for (const k of SLOTS) fs.copyFileSync(path.join(SET, k + ".scd"), path.join(dir, k + ".scd")); } catch {} }   // never lose the set that was on disk
    for (const k of SLOTS) { author(k, b.slots[k], sd); fs.writeFileSync(path.join(SET, k + ".scd"), b.slots[k] + "\n"); st.current.slots[k] = b.slots[k]; }
    bpmRef.current = b.bpm; eng.current?.tempo(b.bpm); st.current.options = null; st.current.askAt = st.current.bar + 4;
    setSay(`new base · seed ${seed} · ${b.bpm} bpm · ${b.key} · ${b.about}`); if (st.current.booted) { announce(`SEED ${seed}`, [237, 230, 216]); queueScene({}); }
  };

  const think = () => {
    const s = st.current;
    if (busy.current || s.options || !s.report) return;
    const dj = active(); busy.current = true; setSay(`${dj.name} is listening…`);
    ask({ dj, slots: s.slots, report: s.report, note: s.note, history: s.history, context: `${bpmRef.current} BPM${base.current ? `, key ${base.current.key} (bass root midinote ${base.current.root})` : ""}` })
      .then((opts) => { s.options = opts; s.by = dj.id; s.note = ""; setSay(""); const g = s.booth.find((x) => x.dj.id === dj.id); if (g) g.offered++; }, (e) => { setSay(String(e.message)); s.askAt = s.bar + 4; })
      .finally(() => (busy.current = false));
  };
  const enter = (dj: DJ) => {
    const s = st.current;
    if (s.booth.some((g) => g.dj.id === dj.id)) { s.turn = s.booth.findIndex((g) => g.dj.id === dj.id); } else { s.booth = [...s.booth, { dj, since: Date.now(), offered: 0, taken: 0 }].slice(-3); s.turn = s.booth.length - 1; }
    s.options = null; ride("riser", 1); queueScene({ look: dj.look, palette: dj.palette }); announce(dj.name, accent(dj.palette), 3); setSay(`${dj.name}: “${dj.greeting}”`); s.askAt = s.bar + 2;
  };
  const take = (i: number) => {
    const s = st.current, o = s.options?.[i]; if (!o) return;
    const g = s.booth.find((x) => x.dj.id === s.by), who = g?.dj ?? active(); if (g) g.taken++;
    author(o.slot, o.code, { name: who.name, rgb: accent(who.palette) }); s.slots[o.slot] = o.code;   // set before writing, so the file watcher doesn't credit the change to you
    fs.writeFileSync(path.join(SET, o.slot + ".scd"), o.code + "\n");
    s.history.push({ slot: o.slot, why: o.why, verdict: "y" });
    s.options.filter((_, k) => k !== i).forEach((x) => s.history.push({ slot: x.slot, why: x.why, verdict: "n" }));
    s.options = null; s.turn++; s.askAt = s.bar + 3; setSay(`taken: ${o.why}  · lands on the next bar`);
  };

  useEffect(() => {
    const e = (eng.current = new Engine());
    e.on("ready", () => { setLog("engine ready"); if (KEEP) SLOTS.forEach((s) => st.current.slots[s].trim() && e.eval(st.current.slots[s], s)); else newBase(SEED); setTimeout(() => (st.current.booted = true), 3000); });
    e.on("ears", (f) => { ears.current.push(f); pulse.current.bands = f.bands; });
    e.on("scope", feed);
    e.on("onset", () => ears.current.onset());
    e.on("hit", (h: Hit) => hits.current.push(h));
    e.on("evald", ({ id, ok, msg }) => { setStatus((x) => ({ ...x, [id]: ok ? "ok" : msg })); if (ok && st.current.booted && !st.current.pending) queueScene({}); });
    e.on("log", (l: string) => setLog(l.slice(0, 110)));
    const onBar = (n: number, at: number, len: number) => {
      const s = st.current; barAt.current = { at, len }; s.bar = n; ears.current.bar();
      setTimeout(() => (pulse.current.barN = n), Math.max(0, at - Date.now()));
      if (s.pending && n - s.lastWipeBar >= 2) { s.next = s.pending; s.pending = null; s.wipeAt = at; s.lastWipeBar = n; }   // a change in the music is a change on screen, on the bar
      if (n % 2 === 0) { const p = ears.current.take(); if (p) { last.current = p; const l = compare(p, ref); setLines(l); s.report = asText(l, "detroit"); } }
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
      if (code.trim() !== (st.current.slots[s] || "").trim()) author(s, code, { name: "you", rgb: YOU });
      st.current.slots[s] = code;
      e.eval(st.current.slots[s].trim() || `~hush.(\\${s})`, s);
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
    if (typing) {
      if (key.return || /[\r\n]/.test(input)) {
        const text = (typing.text + input.replace(/[\r\n]/g, "")).trim(); setTyping(null);
        if (!text) return;
        if (typing.mode === "tell") { s.note = text; s.options = null; think(); }
        else { setSay(`summoning “${text}”… (a new DJ is being written)`); summon(text, all.current.map((d) => d.id)).then((dj) => { save(dj); all.current = roster(); enter(dj); }, (e) => setSay("summon failed: " + e.message)); }
      } else if (key.escape) setTyping(null);
      else if (key.backspace || key.delete) setTyping({ ...typing, text: typing.text.slice(0, -1) });
      else if (input && !key.ctrl && !key.meta) setTyping({ ...typing, text: typing.text + input });
      return;
    }
    if (input === "q") { eng.current.stop(); setTimeout(() => { exit(); process.exit(0); }, 600); }
    if (input === "y" || input === "1") take(0);
    if (input === "2") take(1);
    if ("!@#".includes(input) && input && s.options?.["!@#".indexOf(input)]) { const i = "!@#".indexOf(input); setSay("building into it…"); ride("build", 2, () => take(i)); }
    if (input === "3") take(2);
    if (input === "n" && s.options) { s.options.forEach((o) => s.history.push({ slot: o.slot, why: o.why, verdict: "n" })); s.options = null; s.turn++; s.askAt = s.bar + 2; setSay("skipped. next DJ up"); }
    if (input === "a") think();
    if (input === "t") setTyping({ mode: "tell", text: "" });
    if (input === "s") setTyping({ mode: "summon", text: "" });
    if (input === "d") { const out = all.current.filter((d) => !s.booth.some((g) => g.dj.id === d.id)); if (out.length) enter(out[Math.floor(Math.random() * out.length)]); else setSay("everyone on the roster is already in the booth. [s] summons someone new"); }
    if (input === "x" && s.booth.length > 1) { const g = s.booth.splice(s.turn % s.booth.length, 1)[0]; s.options = null; setSay(`${g.dj.name} leaves the booth`); }
    if (input === "l" || input === "L") s.scene = { ...s.scene, look: LOOKS[(LOOKS.indexOf(s.scene.look) + (input === "l" ? 1 : LOOKS.length - 1)) % LOOKS.length] };
    if (input === "p") s.scene = { ...s.scene, palette: PALETTE_NAMES[(PALETTE_NAMES.indexOf(s.scene.palette) + 1) % PALETTE_NAMES.length] };
    if (input === "c") setRamp((r) => (r + 1) % RAMP_NAMES.length);
    if (input === "f") setFull((x) => !x);
    if (input === "g") { const seed = Math.floor(Math.random() * 9000) + 1000; setSay(`building into seed ${seed}…`); ride(Math.random() < 0.5 ? "build" : "wash", 2, () => newBase(seed)); }
    if (input === "u") ride("build", 2);
    if (input === "w") ride("wash", 2);
    if (input === "m") { eng.current.volume(muted ? 1 : 0); setMuted(!muted); }
    if (input === "r" && last.current) { fs.mkdirSync(path.dirname(REF), { recursive: true }); fs.writeFileSync(REF, JSON.stringify(last.current, null, 2)); setRef(last.current); setLog("saved what you just heard as the reference"); }
  });

  const W = Math.max(90, stdout.columns || 120), H = stdout.rows || 48, s = st.current, p = pulse.current, now = Date.now();
  const compact = H < 50, leftW = Math.floor(W * 0.55), boothW = Math.min(s.booth.length, 3) * 21 + 4;
  const fieldH = full ? Math.max(6, H - 10) : Math.max(5, H - (compact ? 1 : 4) - 15 - 16 - 3);
  const wipe = s.next ? Math.min(1, Math.max(0, (now - s.wipeAt) / barAt.current.len)) : 0;
  const bn = banner.current && now - banner.current.from < banner.current.ms ? ({ lines: banner.current.lines, rgb: banner.current.rgb, t: (now - banner.current.from) / banner.current.ms } as Banner) : null;
  const rows = field(s.scene, s.next, wipe, RAMP_NAMES[ramp], W - 2, fieldH, (now - t0) / 1000, p, { code: SLOTS.map((k) => s.slots[k]).join(" "), banner: bn });
  const beat = Math.floor(p.bar * 4), who = active(), codeW = (full ? W - 24 : leftW) - 4, step = Math.floor(p.bar * 16) % 16;
  // the code pane is the live thing: each slot has a 16-step lane lit by the hits that actually sounded,
  // coloured by whoever wrote the slot, and the tokens a change brought in glow for 8 bars
  const slotView = (k: string) => {
    const a = authors.current[k], rgb = a?.rgb ?? SEEDC, lane = lanes.current[k], hot = a && s.bar - a.bar < 8;
    const laneStr = lane.map((at, i) => { const age = (now - at) / barAt.current.len, lit = at > 0 && age < 0.97; return lit ? fgc(i === step ? [255, 255, 255] : rgb, (0.4 + amps.current[k][i] * 0.6) * (1 - age * 0.55)) + (age < 0.06 ? "█" : "▆") : fgc(SEEDC, i === step ? 1.6 : i % 4 === 0 ? 0.9 : 0.5) + (i === step ? "▁" : i % 4 === 0 ? "┃" : "·"); }).join("") + RESET;
    const out: string[] = [""]; let len = 0;
    for (const t of tokens(s.slots[k] || "")) {
      if (len + t.length + 1 > codeW) { if (out.length === 2) { out[1] += fgc(SEEDC) + "…"; break; } out.push(""); len = 0; }
      out[out.length - 1] += (hot && a!.fresh.has(t) ? "\x1b[1m" + fgc([255, 255, 255]) : fgc(rgb, 0.85)) + t + "\x1b[22m "; len += t.length + 1;
    }
    return { laneStr, code: out.map((l) => l + RESET), by: a ? `${a.name} · bar ${a.bar}` : "", rgb };
  };

  return (
    <Box flexDirection="column" width={W}>
      <Box justifyContent="space-between">
        <Text color={AMBER} bold>{full || compact ? "EARS" : figlet.textSync("EARS", { font: "Small" }).split("\n").slice(0, 4).join("\n")}</Text>
        <Box flexDirection="column" alignItems="flex-end">
          <Text>bar <Text bold>{String(s.bar).padStart(3)}</Text>  {[0, 1, 2, 3].map((i) => (i === beat ? "●" : "○")).join(" ")}  {bpmRef.current} bpm {build.current && now < build.current.until ? <Text color={AMBER}> {build.current.kind.toUpperCase()} {"▁▂▃▄▅▆▇█".slice(0, 1 + Math.floor(((now - build.current.from) / (build.current.until - build.current.from)) * 7.99))}</Text> : ""}{muted ? <Text color={AMBER}> MUTED</Text> : ""}</Text>
          {!full && !compact && <Text color={DIM}>{base.current ? `seed ${base.current.seed} · ${base.current.key} · ${base.current.about}` : "continuing the set on disk (--keep)"}</Text>}
          {!full && !compact && <Text color={DIM}>{log}</Text>}
        </Box>
      </Box>
      {!full && <Box>
        <Box flexDirection="column" width={leftW} height={15} borderStyle="single" borderColor={CYAN} paddingX={1} overflow="hidden">
          <Text color={CYAN} wrap="truncate">CODE · tui/set/*.scd · lit by what is sounding, coloured by who wrote it</Text>
          {SLOTS.map((k) => {
            const v = slotView(k), bad = status[k] && status[k] !== "ok";
            return (
              <Box key={k} flexDirection="column">
                <Text wrap="truncate"><Text bold>{k}</Text> {v.laneStr}  {bad ? <Text color={AMBER}>✗ last good version still playing · {status[k]}</Text> : <Text color={DIM}>{s.slots[k].trim() ? "by " + v.by : "empty"}</Text>}</Text>
                <Text wrap="truncate">{v.code[0] || " "}</Text>
                <Text wrap="truncate">{v.code[1] || " "}</Text>
              </Box>
            );
          })}
        </Box>
        <Box flexDirection="column" width={W - leftW} height={15} borderStyle="single" borderColor={AMBER} paddingX={1} overflow="hidden">
          <Text color={AMBER}>LISTENING REPORT · every 2 bars{ref ? ' · vs "detroit"' : " · no reference: press r when it sounds right"}</Text>
          {lines.length === 0 ? <Text color={DIM}>listening…</Text> : lines.map((l, li) => (
            <Text key={l.label} wrap="truncate">{li < 5 ? <Text color={li === 0 ? AMBER : CYAN}>{"▮".repeat(Math.round(Math.max(0, Math.min(1, (20 * Math.log10(Math.max(p.bands[li], 1e-5)) + 56) / 56)) * 10)).padEnd(10, "·")} </Text> : "           "}{l.label.padEnd(12)}<Text color={DIM}>{l.value.padStart(9)}</Text>  {l.delta === null ? "" : ((l.delta >= 0 ? "+" : "") + l.delta.toFixed(1) + (l.label === "centroid" ? "%" : "")).padStart(7)}  <Text color={l.word === "ok" || !l.word ? DIM : AMBER}>{l.word}</Text></Text>
          ))}
        </Box>
      </Box>}
      {!full && <Box>
        <Box width={boothW} height={16} borderStyle="single" borderColor={CYAN} paddingX={1} overflow="hidden">
          {s.booth.map((g) => {
            const on = g.dj.id === who.id, rise = Math.min(10, Math.floor((now - g.since) / 90)), art = avatar(g.dj, p, on);
            const shown = g.since ? [...Array(10 - rise).fill(""), ...art.slice(0, rise)] : art;
            return (
              <Box key={g.dj.id} flexDirection="column" width={21}>
                <Text color={on ? "white" : DIM} bold={on} wrap="truncate">{on ? "▶ " : "  "}{g.dj.name}</Text>
                {shown.map((r, i) => <Text key={i} wrap="truncate">{r || " "}</Text>)}
                <Text color={DIM} wrap="truncate">  took {g.taken}/{g.offered} {SLOTS.filter((k) => authors.current[k]?.name === g.dj.name).map((k) => "· " + k).join(" ")}</Text>
                <Text color={DIM} wrap="truncate">  {g.dj.palette} · {g.dj.look}</Text>
              </Box>
            );
          })}
        </Box>
        <Box flexDirection="column" width={W - boothW} height={16} borderStyle="single" borderColor={AMBER} paddingX={1} overflow="hidden">
          <Text color={AMBER} wrap="truncate">{who.name} OFFERS · <Text color={CYAN}>[1][2][3] take  [!][@][#] take with a build  [n] skip  [t] tell  [a] ask  [s] summon  [d] next DJ  [x] dismiss</Text></Text>
          {typing ? <Text>{typing.mode === "tell" ? `you → ${who.name}: ` : "summon a DJ who… "}{typing.text}<Text inverse> </Text></Text>
            : s.options ? s.options.map((o, i) => (
              <Box key={i} flexDirection="column" marginTop={i ? 1 : 0}>
                <Text wrap="truncate"><Text color={CYAN} bold>[{i + 1}]</Text> <Text bold>{o.slot}</Text>  {o.why}  <Text color={DIM}>← {o.evidence}</Text></Text>
                <Text color={AMBER} wrap="truncate-end">    {o.code.replace(/\s*\n\s*/g, " ")}</Text>
              </Box>
            )) : <Text color={DIM} wrap="wrap">{say || "…"}</Text>}
          <Box flexGrow={1} />
          <Text color={DIM} wrap="truncate">taken/skipped: {s.history.slice(-14).map((h) => (h.verdict === "y" ? "●" : "○")).join("") || "—"}{s.note ? `   your note: "${s.note}"` : ""}</Text>
        </Box>
      </Box>}

      <Box flexDirection="column" borderStyle="single" borderColor={DIM}>
        {rows.map((r, i) => <Text key={i} wrap="truncate">{r}</Text>)}
      </Box>
      {full && <Box flexDirection="column" paddingX={1}>
        {SLOTS.map((k) => { const v = slotView(k); return <Text key={k} wrap="truncate"><Text bold>{k}</Text> {v.laneStr}  {v.code[0]}</Text>; })}
        <Text wrap="truncate"><Text color="white" bold>{s.booth.map((g) => (g.dj.id === who.id ? "▶ " : "  ") + g.dj.name).join("   ")}</Text>  {s.options ? s.options.map((o, i) => `\x1b[38;2;111;195;214m[${i + 1}]\x1b[39m ${o.slot} ${o.why}`).join("   ") : <Text color={DIM}>{say}</Text>}</Text>
      </Box>}
      <Text color={DIM} wrap="truncate"> [l/L] look: {s.scene.look}   [p] palette: {s.scene.palette}   [c] chars: {RAMP_NAMES[ramp]}   [g] new base   [u] build  [w] wash   [f] fullscreen   [m] mute   [r] save ref   [q] quit</Text>
    </Box>
  );
}

render(<App />);
