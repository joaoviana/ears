// Ears on Screen, as a terminal. Left: the performer's code (edit tui/set/*.scd in your own editor; saving
// evals it on the next bar). Right: what the agent heard, and its one suggestion. Bottom: the ASCII field.
import React, { useEffect, useRef, useState } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import figlet from "figlet";
import { Engine, ROOT, type Hit } from "./engine.ts";
import { Listener, compare, asText, type Profile, type Line } from "./report.ts";
import { ask, type Suggestion, type Past } from "./agent.ts";
import { render as field, LOOKS, PALETTE_NAMES, type Pulse, type Ramp } from "./ascii.ts";

const SET = path.join(ROOT, "tui/set"), REF = path.join(ROOT, "tui/refs/detroit.json");
const SLOTS = ["d1", "d2", "d3", "d4"];
const AMBER = "#f2a93b", CYAN = "#6fc3d6", DIM = "#8d8474";
const MUTE = process.argv.includes("--mute"), AUTO = !process.argv.includes("--manual");
const TAU: Record<string, number> = { kick: 0.22, snare: 0.16, hat: 0.07, stab: 0.3 };
const KIND: Record<string, keyof typeof TAU> = { kick: "kick", clap: "snare", hat: "hat", stab: "stab", bass: "stab" };
const read = (s: string) => { try { return fs.readFileSync(path.join(SET, s + ".scd"), "utf8"); } catch { return ""; } };

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const eng = useRef<Engine>(null as any), ears = useRef(new Listener());
  const hits = useRef<Hit[]>([]), pulse = useRef<Pulse>({ kick: 0, snare: 0, hat: 0, stab: 0, bar: 0, barN: 0, bands: [0, 0, 0, 0, 0] });
  const barAt = useRef({ at: Date.now(), len: 1846 }), busy = useRef(false);
  const st = useRef({ slots: Object.fromEntries(SLOTS.map((s) => [s, read(s)])) as Record<string, string>, report: "", note: "", history: [] as Past[], sug: null as Suggestion | null, bar: 0 });

  const [, tick] = useState(0);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [ref, setRef] = useState<Profile | null>(() => { try { return JSON.parse(fs.readFileSync(REF, "utf8")); } catch { return null; } });
  const last = useRef<Profile | null>(null);
  const [agent, setAgent] = useState("waiting for the first report");
  const [typing, setTyping] = useState<string | null>(null);
  const [look, setLook] = useState(0), [ramp, setRamp] = useState<Ramp>("ascii"), [palette, setPalette] = useState(0), [full, setFull] = useState(process.argv.includes("--full")), [muted, setMuted] = useState(MUTE), [log, setLog] = useState("booting SuperCollider…");

  const think = () => {
    const s = st.current;
    if (busy.current || s.sug || !s.report) return;
    busy.current = true; setAgent("listening…");
    ask({ slots: s.slots, report: s.report, note: s.note, history: s.history })
      .then((sug) => { s.sug = sug; s.note = ""; if (sug.look) setLook(Math.max(0, LOOKS.indexOf(sug.look))); setAgent(""); }, (e) => setAgent(String(e.message)))
      .finally(() => (busy.current = false));
  };

  useEffect(() => {
    const e = (eng.current = new Engine());
    e.on("ready", () => { setLog("engine ready"); SLOTS.forEach((s) => st.current.slots[s].trim() && e.eval(st.current.slots[s], s)); });
    e.on("ears", (f) => { ears.current.push(f); pulse.current.bands = f.bands; });
    e.on("onset", () => ears.current.onset());
    e.on("hit", (h: Hit) => hits.current.push(h));
    e.on("evald", ({ id, ok, msg }) => setStatus((x) => ({ ...x, [id]: ok ? "ok" : msg })));
    e.on("log", (l: string) => setLog(l.slice(0, 120)));
    e.on("bar", ({ n, at, bpm }) => {
      barAt.current = { at, len: (240 / bpm) * 1000 }; st.current.bar = n; setTimeout(() => (pulse.current.barN = n), Math.max(0, at - Date.now())); ears.current.bar();
      if (n % 2 === 0) {
        const p = ears.current.take();
        if (p) { last.current = p; const l = compare(p, ref); setLines(l); st.current.report = asText(l, "detroit"); }
      }
      if (AUTO && n % 8 === 4) think();
    });
    if (process.argv.includes("--demo")) {
      // visuals only: no engine, a fake 130 bpm pulse. For working on looks without SuperCollider.
      const beat = 60000 / 130; let n = 0;
      setInterval(() => { const at = Date.now() + 50; hits.current.push({ slot: "d1", inst: "kick", at, amp: 0.9 }); if (n % 2) hits.current.push({ slot: "d2", inst: "clap", at, amp: 0.5 }); for (let i = 0; i < 4; i++) hits.current.push({ slot: "d2", inst: "hat", at: at + (i * beat) / 4, amp: 0.2 }); if (n % 4 === 0) { barAt.current = { at, len: beat * 4 }; pulse.current.barN = st.current.bar = n / 4; } pulse.current.bands = [0.4, 0.18, 0.05, 0.015, 0.002].map((b) => b * (0.7 + Math.random() * 0.6)); n++; }, beat);
      setLog("demo mode: no sound engine");
    } else e.start(MUTE);
    const w = chokidar.watch(SET, { ignoreInitial: true }).on("all", (_ev, file) => {
      const s = path.basename(file, ".scd");
      if (!SLOTS.includes(s)) return;
      st.current.slots[s] = read(s);
      e.eval(st.current.slots[s].trim() || `~hush.(\\${s})`, s);
    });
    const timer = setInterval(() => {
      const now = Date.now(), p = pulse.current, dt = 0.066;
      for (const k of Object.keys(TAU)) (p as any)[k] *= Math.exp(-dt / TAU[k]);
      hits.current = hits.current.filter((h) => { if (h.at > now) return true; const k = KIND[h.inst]; if (k) (p as any)[k] = Math.max((p as any)[k], Math.min(1, h.amp * 4 + 0.4)); return false; });
      p.bar = Math.max(0, Math.min(1, (now - barAt.current.at) / barAt.current.len)) % 1;
      tick((x) => x + 1);
    }, 66);
    const bye = () => { e.stop(); w.close(); };
    process.on("exit", bye);
    return () => { clearInterval(timer); bye(); };
  }, []);

  useInput((input, key) => {
    const s = st.current;
    if (typing !== null) {
      if (key.return || /[\r\n]/.test(input)) { s.note = (typing + input.replace(/[\r\n]/g, "")).trim(); setTyping(null); s.sug = null; think(); }
      else if (key.escape) setTyping(null);
      else if (key.backspace || key.delete) setTyping(typing.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setTyping(typing + input);
      return;
    }
    if (input === "q") { eng.current.stop(); exit(); }
    if (input === "y" && s.sug) { fs.writeFileSync(path.join(SET, s.sug.slot + ".scd"), s.sug.code + "\n"); s.history.push({ slot: s.sug.slot, why: s.sug.why, verdict: "y" }); s.sug = null; setAgent("taken. lands on the next bar"); }
    if (input === "n" && s.sug) { s.history.push({ slot: s.sug.slot, why: s.sug.why, verdict: "n" }); s.sug = null; setAgent("skipped"); }
    if (input === "a") think();
    if (input === "t") setTyping("");
    if (input === "l") setLook((x) => (x + 1) % LOOKS.length);
    if (input === "L") setLook((x) => (x + LOOKS.length - 1) % LOOKS.length);
    if (input === "p") setPalette((x) => (x + 1) % PALETTE_NAMES.length);
    if (input === "f") setFull((x) => !x);
    if (input === "c") setRamp((r) => (["ascii", "blocks", "dots", "code"] as Ramp[])[((["ascii", "blocks", "dots", "code"] as Ramp[]).indexOf(r) + 1) % 4]);
    if (input === "m") { eng.current.volume(muted ? 1 : 0); setMuted(!muted); }
    if (input === "r" && last.current) { fs.mkdirSync(path.dirname(REF), { recursive: true }); fs.writeFileSync(REF, JSON.stringify(last.current, null, 2)); setRef(last.current); setLog("saved what you just heard as the reference"); }
  });

  const W = Math.max(80, stdout.columns || 120), H = stdout.rows || 40, s = st.current, p = pulse.current;
  const leftW = Math.floor(W * 0.55), fieldH = full ? Math.max(6, H - 4) : Math.max(6, H - 30);
  const t0 = useRef(Date.now()).current;
  const rows = field(LOOKS[look], ramp, PALETTE_NAMES[palette], W - 2, fieldH, (Date.now() - t0) / 1000, p, { code: SLOTS.map((k) => s.slots[k]).join(" ") });
  const beat = Math.floor(p.bar * 4);
  const wordColor = (w: string) => (w === "ok" || !w ? DIM : AMBER);

  return (
    <Box flexDirection="column" width={W}>
      <Box justifyContent="space-between">
        <Text color={AMBER} bold>{full ? "EARS" : figlet.textSync("EARS", { font: "Small" }).split("\n").slice(0, 4).join("\n")}</Text>
        <Box flexDirection="column" alignItems="flex-end">
          <Text>bar <Text bold>{String(s.bar).padStart(3)}</Text>  {[0, 1, 2, 3].map((i) => (i === beat ? "●" : "○")).join(" ")}  130 bpm {muted ? <Text color={AMBER}> MUTED</Text> : ""}</Text>
          {!full && <Text color={DIM}>human loop: save a file → next bar   agent loop: report → suggestion → your y/n</Text>}
          {!full && <Text color={DIM}>{log}</Text>}
        </Box>
      </Box>
      {!full && <Box>
        <Box flexDirection="column" width={leftW} borderStyle="single" borderColor={CYAN} paddingX={1}>
          <Text color={CYAN}>CODE · tui/set/*.scd · yours to edit</Text>
          {SLOTS.map((k) => (
            <Box key={k} flexDirection="column" marginTop={1}>
              <Text color={status[k] && status[k] !== "ok" ? AMBER : DIM}>{k} {status[k] && status[k] !== "ok" ? "✗ still playing the last good version · " + status[k] : s.slots[k].trim() ? "▶" : "·"}</Text>
              <Text>{s.slots[k].trim() || " "}</Text>
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" width={W - leftW}>
          <Box flexDirection="column" borderStyle="single" borderColor={AMBER} paddingX={1}>
            <Text color={AMBER}>LISTENING REPORT · every 2 bars · vs "detroit"{ref ? "" : " (no reference yet: press r when it sounds right)"}</Text>
            {lines.length === 0 ? <Text color={DIM}>listening…</Text> : lines.map((l) => (
              <Text key={l.label}>{l.label.padEnd(12)}<Text color={DIM}>{l.value.padStart(9)}</Text>  {l.delta === null ? "" : ((l.delta >= 0 ? "+" : "") + l.delta.toFixed(1) + (l.label === "centroid" ? "%" : "")).padStart(7)}  <Text color={wordColor(l.word)}>{l.word}</Text></Text>
            ))}
          </Box>
          <Box flexDirection="column" borderStyle="single" borderColor={AMBER} paddingX={1}>
            <Text color={AMBER}>SUGGESTION · <Text color={CYAN}>[y] take  [n] skip  [t] tell it  [a] ask</Text></Text>
            {typing !== null ? <Text>you: {typing}<Text inverse> </Text></Text> : s.sug ? (<>
              <Text color={AMBER}>{s.sug.code}</Text>
              <Text>{s.sug.why}</Text>
              <Text color={DIM}>because: {s.sug.evidence}</Text>
            </>) : <Text color={DIM}>{agent || "…"}</Text>}
            <Text color={DIM}>last: {s.history.slice(-8).map((h) => h.verdict).join(" ") || "—"}{s.note ? `   note: "${s.note}"` : ""}</Text>
          </Box>
        </Box>
      </Box>}
      {full && s.sug && <Text color={AMBER} wrap="truncate"> suggestion · {s.sug.why}  <Text color={CYAN}>[y] [n]</Text></Text>}
      <Box flexDirection="column" borderStyle="single" borderColor={DIM}>
        {rows.map((r, i) => <Text key={i} wrap="truncate">{r}</Text>)}
      </Box>
      <Text color={DIM}> [l] look: {LOOKS[look]}   [p] palette: {PALETTE_NAMES[palette]}   [c] chars: {ramp}   [f] fullscreen   [m] mute   [r] save ref   [q] quit</Text>
    </Box>
  );
}

render(<App />);
