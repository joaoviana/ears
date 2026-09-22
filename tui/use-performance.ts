// EARS. Left: the performer's code (edit tui/set/*.scd in your own editor; saving evals it on the next bar).
// Right: what the booth heard. Middle: the DJs in the booth and the options the active one is offering.
// Bottom: the field, drawn from the real master bus. Nothing a DJ says reaches the speakers without a keypress.
import { useEffect, useRef, useState } from "react";
import { useInput, useApp, useStdout } from "ink";
import fs from "fs";
import path from "path";
import { ROOT, type Hit } from "./engine.ts";
import { Listener, compare, type Profile, type Line } from "./report.ts";
import { summon, type Suggestion, type Past, type AskInput, WILD } from "./agent.ts";
import { LOOKS, PALETTE_NAMES, WIPES, UI, NEUTRAL, type Pulse, type Ramp, type Scene } from "./ascii.ts";
import { feed, fake } from "./audio.ts";
import { roster, save, accent, isAmbientDJ, type DJ } from "./djs.ts";
import { makeBase, STYLE_NAMES, DARK_NAMES, type Base, type Mood } from "./seed.ts";
import { Session, SLOTS } from "./session.ts";
import { sourceDiff, type Context } from "./evidence.ts";
import { SKILLS, skill, earned, recordNote } from "./skills.ts";
import { describeExpect, forPrompt, emptyTally, METRICS, type Tally } from "./shots.ts";
import { type SlotWindow } from "./slotears.ts";
import { brief as writeBrief, slotDrift, type Attempt } from "./brief.ts";
import { maskingLines } from "./masking.ts";
import { layerLines, type Beat } from "./layers.ts";
import { suggestionRound, configuredReviewer } from "./suggestion-round.ts";
import { ConversationRound, type MusicalQuestion } from "./conversation.ts";
import { fastRound } from "./fast-round.ts";
import { Moments, type Moment } from "./moments.ts";
import { DEVELOP, developMoment, type Development, type Inspiration } from "./inspiration.ts";
import { DEFAULT_WILD, angleKind, musicContext } from "./direction.ts";
import { AmbientLearning } from "./ambient-learning.ts";
import { AMBIENT_ARSENAL, ambientTide } from "./ambient-arsenal.ts";
import cfonts from "cfonts";

// name-in-lights fonts (cfonts). Each DJ keeps one; if it doesn't fit the terminal, fall through to narrower ones.
const FONTS = ["block", "slick", "pallet", "shade", "grid", "simple3d"] as const, NARROW = ["chrome", "tiny"] as const;
const bigText = (text: string, font: string): string[] => {
  try {
    const result = cfonts.render(text, { font, colors: ["system"], space: false, env: "node", maxLength: 0, lineHeight: 0 }, false, 0, { width: 500, height: 50 });
    return result ? result.string.replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter(line => line.trim()) : [];
  } catch { return []; }
};
const hashOf = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const SET = process.env.EARS_SET || path.join(ROOT, "tui/set");   // EARS_SET lets a test instance play from its own folder
const REF = path.join(ROOT, "tui/refs/house.json");
export const RAMP_NAMES: Ramp[] = ["pixels", "ascii", "blocks", "dots", "code"];
export const { text: TEXT, dim: DIM, faint: FAINT } = NEUTRAL;
export const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const arg = (f: string) => process.argv.includes(f);
const MUTE = arg("--mute"), AUTO = !arg("--manual"), DEMO = arg("--demo"), KEEP = arg("--keep");
// fills need 1 taken idea, vocals 2, drops 3. A showcase gets maybe four rounds, so the loudest moves are
// gated behind a counter it cannot reach. --skills hands every DJ the lot on arrival.
const ARMED = arg("--skills");
const MOOD0 = ((): Mood => { const i = process.argv.indexOf("--mood"), v = i > 0 ? process.argv[i + 1] : "vibey"; return v === "dark" || v === "any" ? v : "vibey"; })();
const STYLE0 = (() => { const i = process.argv.indexOf("--style"); return i > 0 ? process.argv[i + 1] : (process.env.EARS_STYLE || undefined); })();
const INITIAL_STYLE = STYLE0 || "ambient";
const SEED = (() => { const i = process.argv.indexOf("--seed"); return i > 0 ? Number(process.argv[i + 1]) : Math.floor(Math.random() * 9000) + 1000; })();
export const fgc = ([r, g, b]: number[], k = 1) => `\x1b[38;2;${Math.round(r * k)};${Math.round(g * k)};${Math.round(b * k)}m`, RESET = "\x1b[39m";
const YOU = [255, 255, 255], SEEDC = [138, 135, 153];   // your own edits are white; the seed's are grey; DJs bring their colour
export const tokens = (c: string) => c.replace(/\s*\n\s*/g, " ").trim().split(/(?<=,)\s+/).filter(Boolean);
type PulseVoice = "kick" | "snare" | "hat" | "stab";
const TAU: Record<PulseVoice, number> = { kick: 0.22, snare: 0.16, hat: 0.07, stab: 0.3 };
const KIND: Record<string, PulseVoice> = { kick: "kick", clap: "snare", hat: "hat", stab: "stab", bass: "stab" };


export type Say = { text: string; kind: "dj" | "ok" | "refused" };

interface Guest { dj: DJ; since: number; offered: number; taken: number; level: "suggest" | "auto"; remote?: boolean; pending: string[]; calls?: Tally }
type Option = Suggestion & Context & { id: number; agent: string };

interface Author { name: string; rgb: number[]; bar: number; fresh: Set<string> }
interface Application { phase: "submitted" | "queued" | "active" | "failed"; proposal?: number; agent: string; why: string; diff: string; at: number; previousAuthor?: Author }
/**
 * The change the booth band talks about: who made it, what they said it was for, and — per slot — the keys it
 * actually moved. `parts[].diff` comes from the patch the host wrote (or from diffing the two versions of the
 * source, for a save from your own editor), so CHANGED is never a paraphrase of the idea, it is the edit.
 */
export interface Change { at: number; bar: number; who: string; rgb: number[]; why: string; evidence: string; parts: { slot: string; keys: Keys; diff: string }[] }
type Keys = ReturnType<typeof sourceDiff>["parameters"];

export function usePerformance() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [session] = useState(() => new Session(SET, DEMO));
  const { engine, bus, evidence, grading, speech } = session;
  const [ambientLearning] = useState(() => new AmbientLearning());
  const read = (slot: string) => session.read(slot);
  const [ears] = useState(() => ({ current: new Listener() }));
  const last = useRef<Profile | null>(null);
  const hits = useRef<Hit[]>([]), pulse = useRef<Pulse>({ kick: 0, snare: 0, hat: 0, stab: 0, bar: 0, barN: 0, bands: [0, 0, 0, 0, 0] });
  const barAt = useRef({ at: Date.now(), len: 1846 }), busy = useRef(false), t0 = useRef(Date.now()).current;
  const [all] = useState(() => ({ current: roster().filter(isAmbientDJ) }));
  const base = useRef<Base | null>(null), baseStartedAt = useRef(0), lanes = useRef<Record<string, number[]>>(Object.fromEntries(SLOTS.map((k) => [k, Array(16).fill(0)]))), amps = useRef<Record<string, number[]>>(Object.fromEntries(SLOTS.map((k) => [k, Array(16).fill(0)])));
  const authors = useRef<Record<string, Author>>({}), applications = useRef<Record<string, Application>>({}), archived = useRef(false), banner = useRef<{ lines: string[]; rgb: number[]; rgb2: number[]; from: number; ms: number } | null>(null), trend = useRef<{ loud: number[]; bright: number[]; marks: (number[] | null)[] }>({ loud: [], bright: [], marks: [] }), landed = useRef<number[] | null>(null), bpmRef = useRef(130), lastSummary = useRef(""), build = useRef<{ from: number; until: number; kind: string } | null>(null);
  const [st] = useState(() => ({ current: {
    slots: Object.fromEntries(SLOTS.map((s) => [s, read(s)])) as Record<string, string>, report: "", note: "", history: [] as Past[],
    reverts: [] as { slot: string; code: string; appliedCode: string; atBar: number }[],
    options: null as Option[] | null, by: "", round: 0, seq: 0, autoAt: 0, autoN: 0, bar: 0, booted: false, askAt: 4,
    booth: [{ dj: all.current.find((d) => d.id === "resident") ?? all.current[0], since: 0, offered: 0, taken: 0, level: "suggest", pending: [] }] as Guest[], turn: 0,
    scene: { look: "orbit", palette: "ember" } as Scene, next: null as Scene | null, wipeAt: 0, pending: null as Scene | null, lastWipeBar: -9,
  } }));

  const scheduled = useRef(new Set<ReturnType<typeof setTimeout>>());
  // A fresh base is six separate engine submissions. Suggestions formed before all six activate can correctly
  // become stale as the remaining slots land, so the first round waits for this set to drain.
  const baseActivating = useRef<Set<string> | null>(null);
  const later = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => { scheduled.current.delete(timer); callback(); }, delay);
    scheduled.current.add(timer);
    return timer;
  };
  const closeSession = useRef<() => Promise<unknown> | void>(() => {});
  const moments = useRef<Moments | null>(null);
  const stateContext = () => ({ tempo: bpmRef.current, key: base.current?.key ?? null, seed: base.current?.seed ?? null });
  const refreshState = () => session.refresh(stateContext());
  const writeSlot = (slot: string, code: string) => session.write(slot, code);
  const evaluateSlot = (slot: string, code: string, authorId: string, context: Context = {}) => {
    st.current.slots[slot] = code;
    session.evaluate(slot, code, authorId, context);
  };
  const discardOptions = (reason: string) => {
    roundAbort.current?.abort();
    conversation.current = null; setQuestion(null);
    st.current.round++;
    for (const o of st.current.options ?? []) bus.send("verdict", "host", { proposal: o.id, request_id: o.request_id, decision: "skip", by: "host", reason });
    st.current.options = null;
  };

  const [, tick] = useState(0);
  const [status, setStatus] = useState<Record<string, { text: string; phase: "queued" | "active" | "failed" }>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [ref, setRef] = useState<Profile | null>(() => { try { return JSON.parse(fs.readFileSync(REF, "utf8")); } catch { return null; } });
  const reference = useRef(ref); reference.current = ref;
  // `say` used to carry three different things in one string — a DJ speaking, the host confirming, the host refusing —
  // told apart on screen by sniffing for a quote character. A refusal is the one the performer must not miss, so the
  // kind is now carried rather than guessed, and the warning accent follows it.
  const [say, setSayState] = useState<Say>({ text: "waiting for the first report", kind: "ok" });
  const setSay = (text: string, kind: Say["kind"] = "ok") => setSayState({ text, kind });
  const [typing, setTyping] = useState<"tell" | "summon" | null>(null), [thinking, setThinking] = useState("");
  const [question, setQuestion] = useState<MusicalQuestion | null>(null);
  const conversation = useRef<ConversationRound | null>(null);
  const [ramp, setRamp] = useState(0), [full, setFull] = useState(arg("--full")), [muted, setMuted] = useState(MUTE), [voice, setVoice] = useState(arg("--voice")), [overlay, setOverlay] = useState<null | "help" | "roster" | "skills" | "moments" | "moment-action">(null), [logs, setLogs] = useState(arg("--logs")), [log, setLog] = useState(DEMO ? "demo mode: no sound engine" : "booting SuperCollider…");
  const [momentStatus, setMomentStatus] = useState("[ save A · ] save B · \\ hear A/B · M keep · H memories");
  const [savedMoments, setSavedMoments] = useState<Moment[]>([]);
  const [selectedMoment, setSelectedMoment] = useState<Moment | null>(null);
  const inspiration = useRef<Inspiration | null>(null);
  const requestState = useRef({ startedAt: 0, error: "" });
  const captureMoment = (kind: "A" | "B" | "favorite") => {
    if (DEMO || !engine?.ready) { setMomentStatus("audio capture needs a running engine"); return; }
    if (recording.current) { setMomentStatus("finish the voice recording first"); return; }
    const context = { ...stateContext(), bar: st.current.bar, source_revision: evidence.revision, active_revision: evidence.activeRevision, slots: { ...evidence.slots }, active_slots: { ...evidence.activeSlots }, ...(inspiration.current ? { inspiration_id: inspiration.current.artifact_id, development: inspiration.current.intent } : {}) };
    moments.current?.capture(kind, context).catch(error => setMomentStatus(error.message));
  };
  const playMoments = (items: Moment[]) => {
    if (recording.current) { setMomentStatus("finish the voice recording first"); return; }
    try { moments.current?.play(items); } catch (error) { setMomentStatus((error as Error).message); }
  };

  const voiceRef = useRef(voice); voiceRef.current = voice;
  const logsRef = useRef(logs); logsRef.current = logs;
  const greet = useRef<{ who: string; rgb: number[]; text: string; until: number } | null>(null);
  const showcase = useRef<{ agent: string; skill: string } | null>(null), recording = useRef(false), mood = useRef<Mood>(MOOD0);
  const slotEars = grading.slots;
  // what each voice measured when this base started: the reference slot drift is judged against
  const slotRef = useRef<Record<string, SlotWindow> | null>(null), needSlotRef = useRef(false), attempts = useRef<Attempt[]>([]);
  const [diagnosis, setDiagnosis] = useState<{ drift: { slot: string; db: number }[]; masking: string[] }>({ drift: [], masking: [] });
  const lastChange = useRef<Change | null>(null);   // what the booth band shows under CHANGED, and what BECAUSE explains
  const shotCard = useRef<{ who: string; rgb: number[]; call: string; text: string; grade: string; until: number } | null>(null);   // a skill this DJ must demonstrate in its next round
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

  // What the `add` angle is given instead of the problem list: the parts nobody has touched. A ranked report names one
  // worst thing and every angle then solves that one thing; this is the other half of the room.
  const beats = useRef<Beat[]>([]);     // every hit that sounded, so the report can say what doubles what
  const roundAbort = useRef<AbortController | null>(null);
  const rideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [stacking, setStacking] = useState(false);
  const marks = useRef<Set<number>>(new Set());   // options picked to land together (alt+1/2/3, enter to commit)
  const stacked = useRef<number[]>([]);
  const wild = useRef(DEFAULT_WILD);   // 0 tame .. 3 unhinged; w cycles it
  const musicalRound = useRef(0);
  /** Where the set is in its own arc, as the arsenal computes it for the DJs. The band shows the performer the same
   *  phase the composer was handed, so NOW is the booth's own idea of the room, not a second one invented on screen. */
  const tideNow = () => ambientTide({ round: musicalRound.current, history: st.current.history });
  const turns = useRef<string[]>([]);   // recent left-turn ideas shown to the performer
  /** One voice per angle: the worst drift for fix, something empty or undoubled for add, anything else for turn. */
  const aimAt = (round: number): Record<string, string> => {
    const s = st.current, all = SLOTS;
    const drift = slotRef.current ? slotDrift(slotEars.all(Date.now() - 6000, Date.now()), slotRef.current) : [];
    const empty = all.filter((k) => !(evidence.slots[k] || "").trim());
    const stale = all.filter((k) => (evidence.slots[k] || "").trim()).map((k) => ({ k, n: s.bar - (authors.current[k]?.bar ?? 0) })).sort((a, b) => b.n - a.n);
    const fix = drift[0]?.slot ?? stale[0]?.k ?? "d1";
    const add = empty[0] ?? stale.map((x) => x.k).find((k) => k !== fix) ?? "d6";
    const turn = all.find((k) => k !== fix && k !== add) ?? "d3";
    return { fix, add, turn: wild.current >= 2 ? "d6" : turn, groove: round % 2 ? "d3" : "d2", hook: round % 2 ? "d4" : "d5" };
  };
  const quietLine = () => {
    const s = st.current, stale = SLOTS.filter((k) => (evidence.slots[k] || "").trim())
      .map((k) => ({ k, bars: s.bar - (authors.current[k]?.bar ?? 0) })).filter((x) => x.bars >= 8).sort((a, b) => b.bars - a.bars);
    if (!stale.length) return "Everything has been touched in the last 8 bars.";
    return `Nothing has changed in ${stale.slice(0, 4).map((x) => `${x.k} for ${x.bars} bars`).join(", ")}.`;
  };
  const author = (slot: string, code: string, a: { name: string; rgb: number[] }) => {
    const before = new Set(tokens(st.current.slots[slot] || ""));
    authors.current[slot] = { ...a, bar: st.current.bar, fresh: new Set(tokens(code).filter((t) => !before.has(t))) };
  };
  const ride = (kind: "build" | "wash" | "riser", bars: number, then?: () => void) => {
    const now = Date.now(), nextBar = barAt.current.at + Math.ceil((now - barAt.current.at) / barAt.current.len) * barAt.current.len, drop = nextBar + (bars - 1) * barAt.current.len;
    clearTimeout(rideTimer.current);
    const releaseBars = kind === "wash" ? 4 : 1, until = drop + releaseBars * barAt.current.len;
    engine?.transition(kind, bars, releaseBars); build.current = { from: now, until, kind }; evidence.riding(now, until + 400); bus.send("transition", "host", { kind, bars });
    if (then) rideTimer.current = setTimeout(then, Math.max(0, drop - now - 450));   // written just before the bar line, so Pdef's quantise lands it on the drop
  };
  const newBase = (seed: number, smooth = false, style = STYLE0) => {
    const b = (base.current = makeBase(seed, mood.current, style)), ambient = b.style === "ambient";
    const sd = { name: ambient ? "ambient system" : `seed ${seed}`, rgb: SEEDC };
    needSlotRef.current = true; slotRef.current = null; attempts.current = []; applications.current = {}; lastChange.current = null; shotCard.current = null; setStatus({});   // a new base is not a change to the old one: the band starts empty with it

    if (!archived.current) { archived.current = true; try { const dir = path.join(ROOT, "tui/sets", new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")); fs.mkdirSync(dir, { recursive: true }); for (const k of SLOTS) fs.copyFileSync(path.join(SET, k + ".scd"), path.join(dir, k + ".scd")); } catch {} }   // never lose the set that was on disk
    baseActivating.current = ambient ? new Set(SLOTS) : null;
    const loading = baseActivating.current;
    for (const k of SLOTS) { author(k, b.slots[k], sd); authors.current[k].fresh = new Set();   // a whole new base isn't a 'change' to highlight
      writeSlot(k, b.slots[k]); evaluateSlot(k, b.slots[k], "seed"); }
    bpmRef.current = b.bpm; engine?.tempo(b.bpm, smooth ? 4 : 0); refreshState(); discardOptions("new base"); st.current.askAt = ambient ? Number.POSITIVE_INFINITY : st.current.bar + 4;
    setSay(ambient ? `ambient system · ${b.bpm} bpm · ${b.key}` : `new base · seed ${seed} · ${b.bpm} bpm · ${b.key} · ${b.about}`); if (st.current.booted) { announce(ambient ? "AMBIENT" : `SEED ${seed}`, [237, 230, 216]); queueScene({}); }
    if (loading) later(() => {
      if (baseActivating.current !== loading) return;
      baseActivating.current = null; refreshState(); st.current.askAt = st.current.bar; think();
    }, Math.min(7500, (240 / b.bpm) * 1000 + 700));
  };

  const offer = (o: Suggestion, agent: string, context: Context, seen?: Record<string, string>) => {
    const s = st.current;
    // A revision covers the whole session, so one edit anywhere used to invalidate every idea in flight -- a whole
    // round came back with nothing but "stale revision". An idea is only stale if a slot IT touches has moved since.
    const touched = (o.parts ?? [{ slot: o.slot }]).map((x) => x.slot);
    const untouched = !!seen && touched.every((k) => (seen[k] ?? "").trim() === (evidence.slots[k] || "").trim());
    const stale = evidence.check(context);
    if (stale && untouched) context = { ...context, based_on_revision: evidence.revision };
    // 'stale revision' told us nothing about WHY, nine times in ten rounds. Name the slot that moved and what it
    // was, so the log says whether this is the guard working or the guard misfiring.
    const moved = seen ? touched.filter((k) => (seen[k] ?? "").trim() !== (evidence.slots[k] || "").trim()) : [];
    const why = untouched ? null : stale ? (moved.length ? `${moved.join(" and ")} changed since this idea was formed; read_room and reconsider` : `${stale} (no snapshot of what the agent saw)`) : null;
    const bad = why || (s.options && s.options.length >= 3 ? "booth is full; wait for a verdict" : null);
    if (bad) { bus.send("rejected", agent, { request_id: context.request_id, reason: bad }); return; }
    const opt: Option = { ...o, ...context, id: ++s.seq, agent };
    if (!s.options?.length) { s.by = agent; s.autoAt = s.bar + 2; }
    s.options = [...(s.options || []), opt].slice(0, 3);
    if (angleKind(o.angle) === "turn") turns.current = [...turns.current, o.why].slice(-5);
    bus.send("proposal", agent, { ...context, id: opt.id, slot: o.slot, slots: o.parts?.map((x) => x.slot) ?? [o.slot], diff: o.diff, code: o.code, why: o.why, evidence: o.evidence, angle: o.angle, ms: o.ms, origin: o.origin, recipe_id: o.recipe_id, ...(o.inspiration_id ? { inspiration_id: o.inspiration_id } : {}), expect: o.expect, expected_change: o.expect ? `${o.expect.metric} ${o.expect.dir}` : undefined });   // the prediction is on the wire when the idea is first offered, not only when it is taken
  };
  const askInput = (dj: DJ, round: number, angle?: string): AskInput => ({
    dj, round, inspiration: inspiration.current, skills: [...(dj.skills || [])], showcase: showcase.current?.agent === dj.id ? showcase.current.skill : null,
    slots: { ...evidence.slots }, report: st.current.report, quiet: quietLine(), turns: [...turns.current],
    aim: aimAt(round), wild: wild.current, angle,
    layers: layerLines(beats.current.filter(x => (x.bar ?? 0) > st.current.bar - 8)),
    note: st.current.note, history: [...st.current.history], context: musicContext(bpmRef.current, base.current),
    recipeScores: ambientLearning.scores(dj.id, AMBIENT_ARSENAL.map(seed => `ambient-${seed.id}`)),
  });
  const think = () => {
    const s = st.current;
    if ((busy.current && !roundAbort.current?.signal.aborted) || s.options?.length || !Object.values(evidence.slots).some(code => code.trim())) return;
    const here = s.booth.filter((x) => !x.remote);
    if (!here.length) { setSay("waiting for the wire"); return; }
    const round = ++s.round, noteSent = s.note, variation = musicalRound.current++;
    refreshState();
    const context: Context = { based_on_revision: evidence.revision, evidence_ids: evidence.latest ? [evidence.latest.id] : [] };
    const seen = { ...evidence.slots };   // what the agents were shown, to judge staleness per slot rather than per session
    const controller = new AbortController(); roundAbort.current = controller;
    busy.current = true; requestState.current = { startedAt: Date.now(), error: "" };
    const ambient = /ambient|nature/i.test(musicContext(bpmRef.current, base.current));
    const conversational = !ambient && process.env.EARS_CONVERSATION !== "0" && wild.current >= 2 && !s.note && !inspiration.current && !showcase.current
      && !here.some(g => g.level === "auto");
    let completed = 0, total = conversational ? 1 : 3, reviewing = false;
    const showProgress = () => setThinking(`${reviewing ? "Jev reviewing" : "DJs composing"} · ${completed}/${total} composers finished`);
    showProgress();
    const ordered = here.map((_, n) => here[(s.turn + n) % here.length]);
    const inputs = ordered.map(g => ({ ...askInput(g.dj, variation), signal: controller.signal }));
    bus.send("round_start", "host", {
      round, variation, ambient, agents: ordered.map(g => g.dj.id), revision: evidence.revision,
      active_revision: evidence.activeRevision, listen_bars: ambient ? 3 : 0,
      recipe_scores: ambient ? inputs[0]?.recipeScores : undefined,
    });
    const onOption = (o: Suggestion, agent: string) => {
        if (st.current.round !== round || controller.signal.aborted) return;
        refreshState();
        if (conversational && (SLOTS.some(slot => (evidence.slots[slot] || "").trim() !== (seen[slot] || "").trim())
          || inputs[0].context !== musicContext(bpmRef.current, base.current))) {
          requestState.current.error = "the set changed while composing; a asks again";
          return;
        }
        offer(o, agent, context, seen);
        const g = here.find(g => g.dj.id === agent); if (g) g.offered++;
        if (showcase.current?.agent === agent && skill(showcase.current.skill).uses(o.code, o)) showcase.current = null;
        setSay("");
      };
    const onEvent = (kind: string, detail: Record<string, unknown>) => {
        if (st.current.round !== round || controller.signal.aborted) return;
        if (kind === "composition") {
          completed = Number(detail.completed); total = Number(detail.total);
          showProgress();
          return;
        }
        if (kind === "review") {
          if (!detail.background) { reviewing = detail.status === "pending"; showProgress(); }
          bus.send("note", "jev", detail);
          return;
        }
        if (kind === "curation") { bus.send("curation", String(detail.agent || ordered[0].dj.id), detail); return; }
        if (kind === "rejected" && st.current.round === round) requestState.current.error = String(detail.reason || "no usable response");
        bus.send(kind === "ask" ? "request" : "rejected", String(detail.agent || ordered[0].dj.id), detail);
      };
    let pending: Promise<void>;
    if (conversational) {
      const reviewer = configuredReviewer();
      const next = new ConversationRound(inputs[0], (option, input) => {
        onOption(option, input.dj.id);
        // A source opinion cannot delay a human's selected musical move.
        if (reviewer && st.current.options?.length) {
          onEvent("review", { status: "pending", background: true, text: "Jev reviewing the offered move in the background" });
          void reviewer(input, [{ option, agent: input.dj.id }]).then(result => {
            onEvent("review", { status: "complete", background: true, text: "Jev source review complete", ...result });
          }).catch(() => onEvent("review", { status: "unavailable", background: true, text: "Jev review unavailable; composed move remains available" }));
        }
      }, onEvent);
      conversation.current = next; setQuestion(next.question);
      setThinking("Preparing both directions");
      pending = next.done;
    } else if (ambient && !inspiration.current) pending = fastRound(inputs, onOption, onEvent);
    else pending = suggestionRound(inputs, onOption, onEvent);
    pending
      .catch(error => { if (st.current.round === round) requestState.current.error ||= String(error.message); })
      .then(() => { if (st.current.round === round && s.note === noteSent) s.note = ""; })
      .finally(() => {
        if (roundAbort.current !== controller) return;
        conversation.current = null; setQuestion(null);
        busy.current = false; setThinking("");
        if (!st.current.options?.length && st.current.round === round && !controller.signal.aborted) {
          requestState.current.error ||= "no usable response";
          st.current.askAt = st.current.bar + 4;
          setSay(`no ideas: ${requestState.current.error} · a retries now`, "refused");
        }
        if (st.current.round !== round && !st.current.options?.length && st.current.bar >= st.current.askAt) think();
      });
  };

  const answerQuestion = (index: number) => {
    const current = conversation.current, answer = current?.question.answers[index];
    if (!current || !answer) return;
    setQuestion(null); setThinking(`Composing: ${answer.label.toLowerCase()}`);
    bus.send("note", "human", { text: answer.label, question: current.question.text, to: active().id });
    current.choose(index);
  };

  const developFavorite = (moment: Moment, intent: Development) => {
    try {
      const reference = developMoment(moment, intent);
      inspiration.current = reference; requestState.current.error = "";
      st.current.note = ""; showcase.current = null;
      discardOptions("favourite development changed");
      setOverlay(null); st.current.askAt = st.current.bar;
      bus.send("inspiration", "human", { decision: "develop", ...reference });
      setSay(`${DEVELOP[intent].toLowerCase()} · ${moment.label}`);
      think();
    } catch (error) { setMomentStatus((error as Error).message); }
  };
  const clearInspiration = () => {
    const previous = inspiration.current;
    if (!previous) return;
    inspiration.current = null; requestState.current.error = ""; discardOptions("favourite development cleared");
    bus.send("inspiration", "human", { decision: "clear", artifact_id: previous.artifact_id });
    st.current.askAt = st.current.bar; setSay("favourite direction cleared");
  };
  const enter = (dj: DJ, remote = false) => {
    bus.send("enter", "host", { agent: dj.id, name: dj.name, remote });
    const s = st.current;
    if (s.booth.some((g) => g.dj.id === dj.id)) { s.turn = s.booth.findIndex((g) => g.dj.id === dj.id); } else { if (ARMED) dj.skills = SKILLS.map((k) => k.id); s.booth = [...s.booth, { dj, since: Date.now(), offered: 0, taken: 0, level: "suggest" as const, remote, pending: [] as string[] }].slice(-3); s.turn = s.booth.length - 1; }
    discardOptions("DJ changed"); if (base.current?.style !== "ambient") ride("riser", 1); queueScene({ look: dj.look, palette: dj.palette }); announce(dj.name, accent(dj.palette), 3, dj.id); greet.current = { who: dj.name, rgb: accent(dj.palette), text: dj.greeting, until: st.current.bar + 8 }; if (voiceRef.current && !MUTE) speech.greet(dj.id, dj.greeting, barAt.current.len);
    setSay(""); s.askAt = s.bar; later(think, 0);   // compose as the DJ walks in; the greeting stays pinned above ready options
  };
  const submit = (raw: string) => {
    const text = raw.trim(), mode = typing, s = st.current; setTyping(null);
    if (!text) return;
    if (mode === "tell") {
      const g = s.booth[s.turn % s.booth.length], wants = /filter|carve|darken|brighten|muffle|open up/i.test(text) ? "carve" : /fracture|stutter|fill|rhythmic burst|break up/i.test(text) ? "fracture" : /reveal|wash|emerge|open wide/i.test(text) ? "reveal" : null;
      if (wants && (g.dj.skills || []).includes(wants)) showcase.current = { agent: g.dj.id, skill: wants };   // asking for what a skill provides makes one angle use it, for certain
      if (wants && !(g.dj.skills || []).includes(wants)) { const k = skill(wants); greet.current = { who: g.dj.name, rgb: accent(g.dj.palette), text: `I can't do ${k.name.toLowerCase()} yet: that skill is locked (it unlocks after ${k.takes} of my ideas are taken; I'm on ${g.taken}). Press K to give it to me now.`, until: s.bar + 10 }; }
      s.note = text; discardOptions("new performer instruction"); s.round++; bus.send("note", "human", { text, to: active().id }); think(); }
    else { setThinking(`writing a DJ who ${text}`); summon(text, all.current.map((d) => d.id)).then((dj) => { save(dj); all.current = roster(); enter(dj); }, (e) => setSay("summon failed: " + e.message, "refused")).finally(() => setThinking("")); }
  };
  const grantSkill = (g: Guest, id: string) => {
    const s = st.current, k = skill(id);
    if ((g.dj.skills || []).includes(id)) {
      s.turn = s.booth.indexOf(g); showcase.current = { agent: g.dj.id, skill: id };
      discardOptions("ambient power called"); s.round++; setSay(""); think(); return;
    }
    g.pending = g.pending.filter((x) => x !== id); g.dj.skills = [...(g.dj.skills || []), id]; if (!g.remote) save(g.dj);
    bus.send("grant", "human", { agent: g.dj.id, skill: id }); announce(k.name, accent(g.dj.palette), 2, g.dj.id);
    greet.current = { who: `${g.dj.name} · ${k.glyph} ${k.name}`, rgb: accent(g.dj.palette), text: `${k.blurb}. Watch the next options: they'll use it`, until: s.bar + 12 };
    s.turn = s.booth.indexOf(g); showcase.current = { agent: g.dj.id, skill: id }; discardOptions("skill changed"); s.round++; setSay(""); think();
  };
  /** Land several marked options on one bar line. Slots must not overlap: two writes to one slot is the overwrite
   *  race the revision guard exists to stop, and the second would silently win. Grading says both landed together. */
  const takeStack = (by = "human") => {
    if (moments.current?.playing) { setSay("esc returns live before taking a stack", "refused"); return; }
    const s = st.current, ids = [...marks.current];
    const picked = (s.options ?? []).filter((o) => ids.includes(o.id));
    if (picked.length < 2) { marks.current = new Set(); const one = (s.options ?? []).findIndex((o) => o.id === ids[0]); if (one >= 0) take(one, by); return; }
    const slots = picked.flatMap((o) => (o.parts ?? [{ slot: o.slot }]).map((x) => x.slot));
    const clash = slots.find((k, n) => slots.indexOf(k) !== n);
    if (clash) { setSay(`both of those rewrite ${clash} — take one, then the other`, "refused"); return; }
    if (picked.some(option => option.transition)) { setSay("a reveal needs its own wash · take it separately", "refused"); return; }
    refreshState();
    const stale = picked.map(option => evidence.check(option)).find(Boolean);
    if (stale) { setSay(stale, "refused"); return; }
    marks.current = new Set();
    stacked.current = picked.map((o) => o.id);   // so each one's outcome can say it did not land alone
    for (const o of picked) { const at = (st.current.options ?? []).findIndex((x) => x.id === o.id); if (at >= 0) take(at, by, true); }
    const s2 = st.current;
    (s2.options ?? []).forEach((x) => { s2.history.push({ slot: x.slot, why: x.why, verdict: "n", agent: x.agent }); bus.send("verdict", "host", { proposal: x.id, request_id: x.request_id, decision: "skip", by, reason: "a stack was taken" }); });
    s2.options = null; s2.round++; s2.turn++; s2.askAt = s2.bar + (base.current?.style === "ambient" ? 3 : 0); roundAbort.current?.abort();
    setSay(`${picked.length} ideas landed together on the next bar`);
  };
  const take = (i: number, by = "human", more = false) => {
    if (moments.current?.playing) { setSay("esc returns live before taking an idea", "refused"); return; }
    const s = st.current, o = s.options?.[i] as (Option & { riding?: boolean }) | undefined; if (!o) return;
    if (by === "grant:auto" && s.booth.find(g => g.dj.id === o.agent)?.level !== "auto") { setSay("automatic take cancelled: grant revoked", "refused"); return; }
    if (!DEMO && !engine?.ready) { setSay("engine is still booting; take this option once ready", "refused"); return; }
    if (!more) {
      refreshState();
      const stale = evidence.check(o);
      if (stale) { bus.send("rejected", o.agent, { request_id: o.request_id, proposal: o.id, reason: stale }); s.options = s.options!.filter(x => x !== o); setSay(stale, "refused"); return; }
    }
    const parts = o.parts?.length ? o.parts : [{ slot: o.slot, code: o.code, diff: o.diff }];
    if (parts.every((x) => (evidence.slots[x.slot] || "").trim() === x.code.trim())) { bus.send("rejected", o.agent, { request_id: o.request_id, proposal: o.id, reason: "no source change" }); s.options = s.options!.filter(x => x !== o); return; }
    if (o.transition && !o.riding) { o.riding = true; setSay(`${o.transition} into it…`); ride(o.transition, 2, () => take(s.options?.indexOf(o) ?? -1, by)); return; }   // DROPS: the change arrives on the drop
    const g = s.booth.find((x) => x.dj.id === o.agent), who = g?.dj ?? active(); if (g) g.taken++;
    if (o.forBars) for (const x of parts) s.reverts.push({ slot: x.slot, code: evidence.slots[x.slot] || "", appliedCode: x.code.trim(), atBar: s.bar + o.forBars });   // FILLS: put every slot back afterwards
    if (g && !g.remote) for (const k of earned(g.taken, g.dj.skills || [], g.pending)) { g.pending.push(k.id); bus.send("unlock", "host", { agent: g.dj.id, skill: k.id }); later(() => setSay(`${g.dj.name} unlocked ${k.name}: ${k.blurb}.  k activates it`), 1500); }
    // every slot of a move is written before any of them is evaluated, so they swap on the same bar line
    for (const x of parts) {
      const previous = authors.current[x.slot];
      applications.current[x.slot] = { phase: "submitted", proposal: o.id, agent: o.agent, why: o.why, diff: x.diff, at: Date.now(),
        previousAuthor: previous ? { ...previous, fresh: new Set(previous.fresh) } : undefined };
      author(x.slot, x.code, { name: who.name, rgb: accent(who.palette) });   // set before writing, so the file watcher doesn't credit the change to you
    }
    // The same per-key before/after the `applied` receipt carries, so the band shows the edit the evidence layer
    // recorded rather than a second opinion about it. `diff` is the patch's own sentence, kept as the fallback for
    // a slot `parseSlot` cannot read.
    lastChange.current = { at: Date.now(), bar: s.bar, who: who.name, rgb: accent(who.palette), why: o.why, evidence: o.evidence,
      parts: parts.map((x) => ({ slot: x.slot, keys: sourceDiff(evidence.slots[x.slot] || "", x.code).parameters, diff: x.diff })) };
    for (const x of parts) writeSlot(x.slot, x.code);
    bus.send("verdict", by === "human" ? "human" : "host", { proposal: o.id, request_id: o.request_id, decision: "take", by });
    // a move that touches more than one slot cannot be attributed to one tap: it is graded on the room
    if (o.expect) grading.call(o.id, { agent: o.agent, name: who.name, rgb: accent(who.palette), slot: parts.length > 1 ? "" : o.slot, stacked: more, expect: o.expect });
    for (const x of parts) evaluateSlot(x.slot, x.code, o.agent, { ...o, proposal: o.id, expected_change: o.expect ? `${o.expect.metric} ${o.expect.dir}` : undefined });
    s.history.push({ slot: o.slot, why: o.why, verdict: "y", id: o.id, agent: o.agent, recipe_id: o.recipe_id });
    if (o.recipe_id) bus.send("learning", o.agent, { recipe: o.recipe_id, signal: "take", ...ambientLearning.decision(o.agent, o.recipe_id, "take") });
    if (more) { s.options = s.options!.filter((x) => x.id !== o.id); return; }   // a stack keeps the round open
    s.options!.filter((_, k) => k !== i).forEach((x) => { s.history.push({ slot: x.slot, why: x.why, verdict: "n", agent: x.agent, recipe_id: x.recipe_id }); bus.send("verdict", "host", { proposal: x.id, request_id: x.request_id, decision: "skip", by, reason: "another option was taken" }); });
    s.options = null; s.round++; s.turn++; s.askAt = s.bar + (base.current?.style === "ambient" ? 3 : 0); roundAbort.current?.abort(); setSay(`${by === "human" ? "taken" : who.name + " took it"}: ${o.why}  · submitted to the engine`);
  };
  const skip = (by = "human") => {
    const s = st.current; if (!s.options) return;
    s.options.forEach((o) => {
      s.history.push({ slot: o.slot, why: o.why, verdict: "n", agent: o.agent, recipe_id: o.recipe_id });
      if (o.recipe_id) bus.send("learning", o.agent, { recipe: o.recipe_id, signal: "skip", ...ambientLearning.decision(o.agent, o.recipe_id, "skip") });
      bus.send("verdict", by === "human" ? "human" : "host", { proposal: o.id, request_id: o.request_id, decision: "skip", by });
    });
    s.options = null; s.round++; s.turn++; s.askAt = /ambient|nature/i.test(musicContext(bpmRef.current, base.current)) ? s.bar : s.bar + 1; roundAbort.current?.abort(); setSay("skipped. next DJ up");
  };

  useEffect(() => {
    session.on("log", message => setLog(message.slice(0, 110)));
    session.on("status", ({ slot, text, phase, code }) => {
      setStatus(current => ({ ...current, [slot]: { text, phase } }));
      const application = applications.current[slot];
      if (application) { application.phase = phase; application.at = Date.now(); }
      if (phase === "failed") {
        if (code !== undefined) st.current.slots[slot] = code;
        if (application?.previousAuthor) authors.current[slot] = application.previousAuthor; else delete authors.current[slot];
        const history = application?.proposal == null ? undefined : st.current.history.find(item => item.id === application.proposal);
        if (history) { history.verdict = "x"; history.outcome = `engine refused: ${text}`; }
        setSay(`${slot} rejected by SuperCollider · previous sound restored · ${text}`, "refused");
      }
    });
    session.on("active", slot => {
      landed.current = authors.current[slot]?.rgb ?? YOU;
      if (st.current.booted && !st.current.pending) queueScene({});
      const loading = baseActivating.current;
      if (loading?.delete(slot) && loading.size === 0) {
        baseActivating.current = null;
        baseStartedAt.current = st.current.bar;
        st.current.askAt = st.current.bar;
        later(think, 0);
      }
    });
    session.on("edit", ({ slot, code }) => {
      const previous = authors.current[slot];
      // A save from your own editor carries no patch, so the only record of what it did is the two versions of the
      // source -- which is exactly what the `applied` receipt diffs. Same function, so the band and the wire agree.
      const keys = sourceDiff(st.current.slots[slot] || "", code).parameters;
      const moved = keys.length ? `${keys.length} key${keys.length === 1 ? "" : "s"}: ${keys.map((k) => k.key).slice(0, 4).join(", ")}` : "rewritten by hand";
      applications.current[slot] = { phase: "submitted", agent: "human", why: "you saved the file", diff: moved, at: Date.now(), previousAuthor: previous ? { ...previous, fresh: new Set(previous.fresh) } : undefined };
      lastChange.current = { at: Date.now(), bar: st.current.bar, who: "you", rgb: YOU, why: "you saved the file", evidence: "", parts: [{ slot, keys, diff: moved }] };
      author(slot, code, { name: "you", rgb: YOU });
      evaluateSlot(slot, code, "human");
    });
    grading.on("outcome", ({ proposal, shot, outcome, perSlot }) => {
      const guest = st.current.booth.find(g => g.dj.id === shot.agent);
      if (guest) { guest.calls ??= emptyTally(); guest.calls[outcome.grade]++; }
      const history = st.current.history.find(h => h.id === proposal);
      if (history) history.outcome = forPrompt(shot.expect, outcome, true);
      if (history?.recipe_id) bus.send("learning", shot.agent, { recipe: history.recipe_id, signal: outcome.grade, ...ambientLearning.outcome(shot.agent, history.recipe_id, outcome.grade) });
      attempts.current.push({ metric: shot.expect.metric, slot: shot.slot || "the move", grade: outcome.grade });
      if (attempts.current.length > 12) attempts.current.shift();
      shotCard.current = { who: shot.name, rgb: shot.rgb, call: describeExpect(shot.expect), text: outcome.text + (perSlot ? `  (${shot.slot} alone)` : ""), grade: outcome.grade, until: st.current.bar + 8 };
    });
    session.on("remote", message => {
      const id = message.agent;
      if (!st.current.booth.some(g => g.dj.id === id)) enter({ id, name: id.toUpperCase().replace(/-/g, " "), tagline: "an agent on the wire", palette: "mono", look: "codefield", head: "robot", species: "robot", skills: [], hair: "antenna", eyes: "visor", cans: "none", body: "laptop", style: "", idioms: [], never: [], greeting: message.greeting || "Connected. I can read the room but not touch it." }, true);
      if (message.kind === "note") { setSay(`${id}: ${message.text}`, "dj"); bus.send("note", id, { text: message.text }); }
      else offer(message.suggestion, id, message.context);
    });
    session.open(stateContext());
    const b = bus, e = engine;
    const memory = moments.current = new Moments(e, b, process.env.EARS_MOMENTS_DIR || path.join(ROOT, "tui/moments"));
    memory.on("change", setMomentStatus);
    e.on("ready", () => { setLog(e.sampleRate && e.sampleRate < 44000 ? `audio device is at ${Math.round(e.sampleRate / 1000)} kHz: check the audio device/input configuration, then restart` : "engine ready"); if (KEEP) SLOTS.forEach((s) => evaluateSlot(s, st.current.slots[s], "startup")); else newBase(SEED, false, INITIAL_STYLE); later(() => (st.current.booted = true), 3000); });
    e.on("ears", (f) => { ears.current.push(f, { revision: evidence.revision, active_revision: evidence.activeRevision }); pulse.current.bands = f.bands; });
    e.on("scope", feed);
    e.on("slotears", f => slotEars.push(f));
    e.on("onset", () => ears.current.onset());
    e.on("hit", (h: Hit) => { hits.current.push(h); ears.current.hit(h.offGrid ?? 0);
      beats.current.push({ slot: h.slot, step: h.step, bar: st.current.bar });   // a rolling window of who hit where, for layers.ts
      if (beats.current.length > 400) beats.current.shift(); });
    const onBar = (n: number, at: number, len: number) => {
      const s = st.current; barAt.current = { at, len }; s.bar = n; bus.bar = n; ears.current.bar();
      later(() => (pulse.current.barN = n), Math.max(0, at - Date.now()));
      if (s.pending && n - s.lastWipeBar >= 2) { s.next = s.pending; s.pending = null; s.wipeAt = at; s.lastWipeBar = n; }   // a change in the music is a change on screen, on the bar
      if (n % 2 === 0) { const p = ears.current.take(); if (p) { last.current = p; const l = compare(p, reference.current); setLines(l); {
        const win = p.capture ?? null, hereNow = win ? slotEars.all(win.start_ms, win.end_ms) : {};
        if (needSlotRef.current && Object.keys(hereNow).length >= 3) { slotRef.current = hereNow; needSlotRef.current = false; }   // first clean window after a new base
        const floors = Object.fromEntries(METRICS.map((k) => [k, grading.floor(k, slotDrift(hereNow, slotRef.current ?? hereNow)[0]?.slot ?? "d1")]));
        const drift = slotRef.current ? slotDrift(hereNow, slotRef.current) : [], masking = win ? maskingLines(slotEars.bandFrames(win.start_ms, win.end_ms)) : [];
        const layers = layerLines(beats.current.filter((x) => (x.bar ?? 0) > st.current.bar - 8));
        setDiagnosis({ drift, masking });
        s.report = writeBrief(l, slotRef.current ? "how this base sounded when it started" : "the house reference", drift, floors, attempts.current, masking, layers);
      } { const summary = l.filter((x) => x.word && x.word !== "ok").map((x) => `${x.label.split(" ")[0]} ${x.word}`).join(" · ") || "balanced"; evidence.observe(p, summary, s.report, summary === lastSummary.current); lastSummary.current = summary; } const tr = trend.current; tr.loud.push(Math.max(0, Math.min(1, (p.rms + 24) / 24))); tr.bright.push(Math.max(0, Math.min(1, p.centroid / 7000))); tr.marks.push(landed.current); landed.current = null; for (const k of ["loud", "bright", "marks"] as const) if (tr[k].length > 120) tr[k].shift(); } }
      bus.bar = n;
      for (const r of s.reverts.filter((r) => n >= r.atBar)) { if (read(r.slot).trim() !== r.appliedCode) { bus.send("note", "host", { text: `Skipped ${r.slot} fill restore: a newer edit is on disk` }); continue; } writeSlot(r.slot, r.code); evaluateSlot(r.slot, r.code, "fill over"); }
      s.reverts = s.reverts.filter((r) => n < r.atBar);
      // takeover: a DJ you've granted `auto` takes its own idea once the veto window closes. n still vetoes.
      const owner = s.options?.length ? s.booth.find((g) => g.dj.id === s.options![0].agent) : null;
      if (owner?.level === "auto" && n >= s.autoAt && !busy.current && !memory.playing) {
        const want = ["style", "fix", "turn"][s.autoN++ % 3], i = Math.max(0, s.options!.findIndex((o) => o.angle === want));
        const option = s.options![i];
        if (option.angle === "turn") ride("build", 2, () => take(s.options?.indexOf(option) ?? -1, "grant:auto")); else take(i, "grant:auto");
      }
      if (AUTO && n >= s.askAt) think();
    };
    e.on("bar", ({ n, at, bpm }) => { bpmRef.current = Math.round(bpm); session.syncContext(stateContext()); onBar(n, at, (240 / bpm) * 1000); });
    let demo: ReturnType<typeof setTimeout> | undefined;
    if (DEMO) {
      if (!KEEP) newBase(SEED, false, INITIAL_STYLE);
      let n = 0;
      const demoBeat = () => {
        const beat = 60000 / bpmRef.current, at = Date.now() + 50, st4 = (n % 4) * 4;
        hits.current.push({ slot: "d1", inst: "kick", at, amp: 0.9, step: st4, offGrid: 0 });
        if (n % 2) hits.current.push({ slot: "d4", inst: "clap", at, amp: 0.5, step: st4, offGrid: 0 });
        for (let i = 0; i < 4; i++) hits.current.push({ slot: "d2", inst: "hat", at: at + (i * beat) / 4, amp: 0.2, step: st4 + i, offGrid: 0 });
        if (n % 4 === 0) onBar(n / 4, at, beat * 4); if (n % 32 === 31) queueScene({}); n++;
        demo = setTimeout(demoBeat, beat);
      };
      demoBeat();
    } else e.start(MUTE);
    const timer = setInterval(() => {
      const now = Date.now(), p = pulse.current, s = st.current;
      for (const k of (Object.keys(TAU) as PulseVoice[])) p[k] *= Math.exp(-0.066 / TAU[k]);
      hits.current = hits.current.filter((h) => { if (h.at > now) return true; if (lanes.current[h.slot]) { const i = h.step; lanes.current[h.slot][i] = h.at; amps.current[h.slot][i] = Math.max(0.35, Math.min(1, h.amp * 2.5)); } const k = KIND[h.inst]; if (k) p[k] = Math.max(p[k], Math.min(1, h.amp * 4 + 0.4)); return false; });
      p.bar = Math.max(0, Math.min(1, (now - barAt.current.at) / barAt.current.len)) % 1;
      if (DEMO) { fake((now - t0) / 1000, p.kick); p.bands = [0.4 + p.kick * 0.2, 0.18, 0.05, 0.015, 0.002]; }
      if (s.next && now - s.wipeAt > barAt.current.len) { s.scene = s.next; s.next = null; }
      tick((x) => x + 1);
    }, 66);
    let closed = false;
    const bye = () => { roundAbort.current?.abort(); roundAbort.current = null; clearTimeout(rideTimer.current); if (closed) return; closed = true; for (const pending of scheduled.current) clearTimeout(pending); scheduled.current.clear(); clearInterval(timer); clearTimeout(demo); memory.close(); return session.close(); };
    closeSession.current = bye;
    process.on("exit", bye);
    return () => { clearInterval(timer); clearTimeout(demo); process.off("exit", bye); bye(); };
  }, []);

  useInput((input, key) => {
    const s = st.current;
    if (key.escape && moments.current?.playing) { moments.current.stop(); return; }
    if (typing) { if (key.escape) setTyping(null); return; }   // the TextInput owns the keyboard
    if (overlay) {
      if (overlay === "roster" || overlay === "skills" || overlay === "moments" || overlay === "moment-action") { if (key.escape || input === "q") setOverlay(overlay === "moment-action" ? "moments" : null); return; }   // the Select owns the arrows and enter
      setOverlay(null); return;
    }
    if (input === "?") { setOverlay("help"); return; }
    if (input === "D") { all.current = roster().filter(isAmbientDJ); setOverlay("roster"); return; }
    if (input === "[") { captureMoment("A"); return; }
    if (input === "]") { captureMoment("B"); return; }
    if (input === "M") { captureMoment("favorite"); return; }
    if (input === "J") { clearInspiration(); return; }
    if (input === "H") { setSavedMoments(moments.current?.favorites() ?? []); setOverlay("moments"); return; }
    if (input === "\\") {
      const memory = moments.current;
      if (!memory?.A || !memory.B) setMomentStatus("[ captures A, ] captures B; then \\ auditions both");
      else playMoments([memory.A, memory.B]);
      return;
    }
    if (key.tab && s.booth.length > 1) { s.turn++; discardOptions("active DJ changed"); s.askAt = s.bar + 1; setSay(`${active().name} steps up`); return; }
    if (input === "q") { engine.stop(); setTimeout(() => { Promise.resolve(closeSession.current()).finally(() => { exit(); process.exit(0); }); }, 600); }
    if (question) {
      if (input === "1" || input === "2") { answerQuestion(Number(input) - 1); return; }
      if (input === "n" || key.escape) { discardOptions("question dismissed"); s.askAt = s.bar + 8; setSay("direction skipped · a asks again · t gives your own brief"); return; }
      if (input === "0" || input === "y" || input === "3") return;
    }
    // `0` opens stack mode: 1/2/3 then mark instead of taking, enter lands them together. Alt+digit was the first
    // idea and it cannot work -- on macOS Option+1 is `¡`, not meta+1, unless the terminal is set to send meta.
    if (input === "0") { const entering = !stacking;   // `stacking` still holds the pre-toggle value inside this handler
      setStacking(entering); marks.current = new Set();
      setSay(entering ? "stack: mark with 1 2 3, enter lands them on one bar, 0 cancels" : ""); return; }
    if (stacking) {
      if (key.escape) { setStacking(false); marks.current = new Set(); setSay(""); return; }
      if ("123".includes(input)) { const o = s.options?.[Number(input) - 1]; if (o) {
        marks.current.has(o.id) ? marks.current.delete(o.id) : marks.current.add(o.id);
        setSay(`${marks.current.size} marked · enter lands them together`); } return; }
      if (key.return) { setStacking(false); takeStack(); return; }
      return;   // nothing else gets through while stacking
    }
    if (input === "y" || input === "1") take(0);
    if (input === "2") take(1);
    if ("!@#".includes(input) && base.current?.style === "ambient") return;
    if ("!@#".includes(input) && input && s.options?.["!@#".indexOf(input)]) { const o = s.options["!@#".indexOf(input)]; setSay("building into it…"); ride("build", 2, () => take(s.options?.indexOf(o) ?? -1)); }
    if (input === "3") take(2);
    if (input === "n") skip();
    if (input === "a") think();
    if (input === "t") setTyping("tell");
    if (input === "s" && base.current?.style !== "ambient") setTyping("summon");
    if (input === "d") { const out = all.current.filter((d) => !s.booth.some((g) => g.dj.id === d.id) && (base.current?.style !== "ambient" || isAmbientDJ(d))); if (out.length) enter(out[Math.floor(Math.random() * out.length)]); else setSay("every ambient listener is already in the booth. [s] summons someone new", "refused"); }
    if (input === "x" && s.booth.length > 1) { const g = s.booth.splice(s.turn % s.booth.length, 1)[0]; bus.send("leave", "host", { agent: g.dj.id }); discardOptions("DJ left"); setSay(`${g.dj.name} leaves the booth`); }
    if (input === "l" || input === "L") s.scene = { ...s.scene, look: LOOKS[(LOOKS.indexOf(s.scene.look) + (input === "l" ? 1 : LOOKS.length - 1)) % LOOKS.length] };
    if (input === "p") s.scene = { ...s.scene, palette: PALETTE_NAMES[(PALETTE_NAMES.indexOf(s.scene.palette) + 1) % PALETTE_NAMES.length] };
    if (input === "c") setRamp((r) => (r + 1) % RAMP_NAMES.length);
    if (input === "f") setFull((x) => !x);
    if (input === "v") { setVoice((x) => !x); setSay(voice ? "DJs go quiet" : speech.available ? "DJs will speak their greeting when they walk in" : "no `say` voices found on this machine"); }
    if (input === "o" || input === "O") { const gs = input === "O" ? s.booth : [s.booth[s.turn % s.booth.length]], level = gs[0].level === "auto" ? "suggest" : "auto"; gs.forEach((g) => { g.level = level; bus.send("grant", "human", { agent: g.dj.id, level }); }); if (conversation.current) discardOptions("takeover changed"); setSay(level === "auto" ? `${gs.map((g) => g.dj.name).join(" + ")} can take their own ideas after a 2-bar veto window. n vetoes, o takes it back` : "back to suggestions only"); if (level === "auto") s.autoAt = s.bar + 2; }
    if (input === "R" && base.current?.style === "ambient") return;
    if (input === "R" && !recording.current) {   // a voice note: the mix drops out, you talk or sing for 4 s, it becomes a sample the DJs can chop
      if (moments.current?.playing) { setMomentStatus("esc returns live before recording a voice note"); return; }
      recording.current = true; const was = muted; engine?.volume(0); announce("REC", [255, 80, 80], 2); setSay("recording 4 seconds from the microphone… talk, sing, anything");
      recordNote(4).then((name) => { const g = s.booth[s.turn % s.booth.length]; setSay(`recorded “${name}” → tui/samples/${name}.wav. DJs with vocals can use it`); if ((g.dj.skills || []).includes("vocals")) { showcase.current = { agent: g.dj.id, skill: "vocals" }; s.note = `The performer just recorded a voice note called "${name}". Build your vocal idea from it: ~v.("${name}"). Try \\voxpad or pitched \\vox chops.`; discardOptions("new voice note"); s.round++; think(); } else greet.current = { who: g.dj.name, rgb: accent(g.dj.palette), text: `nice voice. I need the vocals skill to use it: press K`, until: s.bar + 10 }; },
        (e) => setSay(`couldn't record: ${e.message}. (First time? macOS asks to let your terminal use the microphone.)`, "refused")).finally(() => { recording.current = false; if (!was) engine?.volume(1); });
      return;
    }
    if (input === "K") { setOverlay("skills"); return; }
    if (input === "k") {
      const g = [s.booth[s.turn % s.booth.length], ...s.booth].find((x) => x.pending.length);
      if (g) grantSkill(g, g.pending[0]);
      else {
        const current = s.booth[s.turn % s.booth.length], activeSkills = SKILLS.filter(skill => (current.dj.skills || []).includes(skill.id));
        if (activeSkills.length) grantSkill(current, activeSkills[s.round % activeSkills.length].id);
        else setSay("no ambient power active yet · K opens carve, fracture and reveal", "refused");
      }
    }
    if (input === "e") setLogs((x) => !x);
    if (input === "g") { const seed = Math.floor(Math.random() * 9000) + 1000; discardOptions("base transition"); setSay("washing into a new base…"); ride("wash", 4, () => newBase(seed, true)); }
    if (input === "W") { wild.current = (wild.current + 1) % WILD.length; const w = WILD[wild.current];
      discardOptions("the booth changed gear"); st.current.askAt = st.current.bar;
      bus.send("mode", "human", { wild: wild.current, name: w.name, angles: w.angles, slots: w.slots, effort: w.effort, push: w.push });
      setSay(`booth is ${w.name.toUpperCase()}: ${w.say}`); return; }
    if (input === "b") { mood.current = mood.current === "vibey" ? "dark" : mood.current === "dark" ? "any" : "vibey"; setSay(`bases are now ${mood.current === "vibey" ? `vibey: ${STYLE_NAMES.join(", ")}` : mood.current === "dark" ? `the archive: ${DARK_NAMES.join(", ")}` : "anything goes: every style, retired ones included"}. g rolls one`); }
    if (input === "u" && base.current?.style === "ambient") return;
    if (input === "u") ride("build", 2);
    if (input === "w") ride("wash", 4);
    if (input === "m") { engine.volume(muted ? 1 : 0); setMuted(!muted); }
    if (input === "r" && last.current) { needSlotRef.current = true; slotRef.current = null; fs.mkdirSync(path.dirname(REF), { recursive: true }); fs.writeFileSync(REF, JSON.stringify(last.current, null, 2)); setRef(last.current); setLog("saved what you just heard as the reference"); }
  });

  return {
    trend, build, muted, log, stdout, st, pulse, stacking, inspiration, busy, requestState, base, baseStartedAt, bpmRef, barAt, logs, banner, full, ramp, overlay, t0, authors, applications, lanes, amps, status, ref, lines, diagnosis, shotCard, lastChange, tideNow, manual: !AUTO, greet, typing, thinking, question, say, marks, all, setOverlay, enter, grantSkill, selectedMoment, setSelectedMoment, savedMoments, playMoments, developFavorite, moments, momentStatus, bus, submit, active,
  };
}
