// The show layout's memory and voice. Pure functions over the wire, so a test can drive them without mounting Ink.
//
// The windowed layout shows everything at once, which is right for the performer and wrong for an audience: on a
// projector a screen that is dense from the first second teaches nothing, because nothing on it has happened yet.
// The show layout reveals its parts as the protocol produces them (the wire pane appears with the first verdict,
// the grade line with the first measured outcome), and a one-line guide points at whatever just happened and says
// what it means. Every reveal is keyed to a real message on the bus, never to a timer.
import type { Msg } from "./bus.ts";

export type Reveal = "room" | "wire" | "graded" | "powers" | "takeover" | "guests";

/** What the audience has earned the right to see: each part appears with the first message that gives it meaning. */
export function reveals(recent: Msg[]): Set<Reveal> {
  const out = new Set<Reveal>();
  for (const m of recent) {
    if (m.type === "observation") out.add("room");
    if (m.type === "verdict") out.add("wire");
    if (m.type === "outcome") out.add("graded");
    if (m.type === "unlock" || (m.type === "grant" && m.skill)) out.add("powers");
    if (m.type === "grant" && m.level === "auto") out.add("takeover");
    if (m.type === "enter" && m.remote) out.add("guests");
  }
  return out;
}

// The loop, as the protocol names it. A stage is lit once its message has arrived for the CURRENT proposal, so the
// ribbon reads left to right as an idea travels: it is the SPEC's sequence diagram, drawn live.
export const STAGES = ["state", "observe", "propose", "verdict", "applied", "evaluated", "active", "measured", "graded"] as const;
export type Stage = (typeof STAGES)[number];
const STAGE_TYPE: Record<Stage, string> = { state: "state", observe: "observation", propose: "proposal", verdict: "verdict", applied: "applied", evaluated: "evaluated", active: "active", measured: "comparison", graded: "outcome" };

export interface Ribbon { lit: Set<Stage>; current: Stage | null; fresh: Stage | null; proposal: Msg | null; skipped: boolean }

const retired = (m: Msg, recent: Msg[]) => m.type === "verdict" && m.decision === "skip"
  && recent.some((x) => x.type === "verdict" && x.decision === "take" && x.t <= m.t && m.t - x.t < 2000);

/**
 * Which stages the idea in flight has passed through. The idea in flight is the newest round's proposal until one
 * is taken; from then on it is the taken one, and the stages after the verdict are the receipts that followed the
 * take. Taking one idea retires the round's others with skip verdicts a moment later; those are not a skip of the
 * idea in flight. `fresh` is a stage whose message landed under a second ago.
 */
export function ribbon(recent: Msg[], now = Date.now()): Ribbon {
  const echoes = recent.filter((m) => m.type === "proposal" && m.id != null);
  const newest = echoes[echoes.length - 1] ?? null;
  const take = [...recent].reverse().find((m) => m.type === "verdict" && m.decision === "take") ?? null;
  // a verdict younger than eight seconds keeps its idea on the ribbon, so the room sees the loop close before the
  // next round takes the strip over
  const judged = take ? [...recent].reverse().find((m) => m.type === "outcome" && m.proposal === take.proposal && now - m.t < 8000) : null;
  const unjudged = take && !recent.some((m) => m.type === "outcome" && m.proposal === take.proposal) && now - take.t < 30000;
  const taken = take && newest && (take.t >= newest.t || judged || unjudged) ? ([...echoes].reverse().find((e) => e.id === take.proposal) ?? newest) : null;
  const proposal = taken ?? newest, since = taken ? take!.t : proposal?.t ?? 0;
  const lit = new Set<Stage>(), latest = new Map<Stage, number>();
  for (const m of recent) {
    const stage = (Object.keys(STAGE_TYPE) as Stage[]).find((k) => STAGE_TYPE[k] === m.type);
    if (!stage) continue;
    // state and observation are continuous; the rest belong to the idea in flight
    // receipts and checks carry the proposal they belong to; the base's own activations and old comparisons do not count
    const mine = m.proposal == null ? m.t >= since && (stage === "verdict" || stage === "propose") : proposal != null && m.proposal === proposal.id;
    if (stage === "state" || stage === "observe" || (stage === "propose" && m === proposal) || (stage !== "propose" && m.t >= since && mine && (stage !== "verdict" || !retired(m, recent)))) { lit.add(stage); latest.set(stage, m.t); }
  }
  // a skip of the idea on the table stops the ribbon at the verdict: nothing after it belongs to this idea
  const decision = proposal ? [...recent].reverse().find((m) => m.type === "verdict" && m.t >= proposal.t && !retired(m, recent) && m.by !== "host") : null;
  const skipped = !taken && decision?.decision === "skip";
  if (!taken) for (const stage of ["applied", "evaluated", "active", "measured", "graded"] as Stage[]) lit.delete(stage);
  if (!taken && !skipped) lit.delete("verdict");
  const current = [...STAGES].reverse().find((stage) => lit.has(stage) && stage !== "state" && stage !== "observe") ?? null;
  const fresh = [...latest.entries()].filter(([, t]) => now - t < 1000).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { lit, current, fresh, proposal, skipped };
}

/** Taking one idea retires the round's others with skip verdicts a moment later; those are the take, not a decision. */
const discarded = (m: Msg, recent: Msg[]) => m.type === "verdict" && m.decision === "skip"
  && recent.some((x) => x.type === "verdict" && x.decision === "take" && x.t <= m.t && m.t - x.t < 2000);

export interface Tally { proposals: number; refused: number; taken: number; skipped: number; hit: number; graded: number; guests: number; receipts: number }

/** The protocol's own numbers: everything here happened on the wire and is in the JSONL. */
export function tally(recent: Msg[]): Tally {
  const t: Tally = { proposals: 0, refused: 0, taken: 0, skipped: 0, hit: 0, graded: 0, guests: 0, receipts: 0 };
  const guests = new Set<string>();
  for (const m of recent) {
    if (m.type === "proposal" && m.id != null) t.proposals++;
    if (m.type === "rejected") t.refused++;
    if (m.type === "verdict" && !discarded(m, recent)) (m.decision === "take" ? t.taken++ : t.skipped++);
    if (m.type === "outcome" && m.grade !== "ungraded") { t.graded++; if (m.grade === "hit") t.hit++; }
    if (m.type === "enter" && m.remote) guests.add(String(m.agent));
    if (["applied", "evaluated", "scheduled", "active", "comparison"].includes(m.type)) t.receipts++;
  }
  t.guests = guests.size;
  return t;
}

export type Target = "offers" | "booth" | "wire" | "room" | "field";
export interface Caption { text: string; at: Target; key: string }

const GUIDE_MS = 18000;
const s = (x: unknown) => String(x ?? "");

/**
 * One sentence about the newest thing that happened, pointed at the pane where it is visible. Each caption is the
 * plain-language reading of one protocol message, so what the guide says is always something the wire can back up.
 */
const HELD_TYPES = new Set(["enter", "leave", "unlock", "grant", "outcome", "note"]);
const HOLD_MS = 12000;

export function caption(recent: Msg[], now = Date.now(), opts: { manual?: boolean } = {}): Caption | null {
  // a listener walking in, a grade, a grant or your note is followed within a second by a round of ideas or a
  // refusal; the moment itself holds the line for a few seconds so it can be seen
  let heldMsg: Msg | null = null;
  const newest = [...recent].reverse().find((m) => !["state", "observation", "request", "curation", "learning", "round_start", "script"].includes(m.type));
  if (newest && (newest.type === "proposal" || newest.type === "rejected")) {
    const held = [...recent].reverse().find((m) => HELD_TYPES.has(m.type) && newest.t - m.t < HOLD_MS && (m.type !== "note" || m.from === "human"));
    if (held && now - held.t < GUIDE_MS + HOLD_MS) { recent = recent.slice(0, recent.indexOf(held) + 1); heldMsg = held; }
  }
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    // an ordinary caption fades after GUIDE_MS; a held moment gets its hold on top, and nothing more
    if (now - m.t > (m === heldMsg ? GUIDE_MS + HOLD_MS : GUIDE_MS)) break;
    const key = `${m.type}:${m.t}`;
    switch (m.type) {
      case "proposal": if (m.id == null) continue;
        return { key, at: "offers", text: `an idea arrived. It says what it will do to the sound (${s((m.expect as { metric?: string })?.metric ?? "…")} ${s((m.expect as { dir?: string })?.dir ?? "")}). After it plays, a meter checks whether it was right. 1 or 2 takes, n skips` };
      case "rejected":
        return { key, at: "wire", text: `the host refused an idea before you saw it: ${s(m.reason)}. Nothing reaches the speakers without passing validation` };
      case "verdict":
        if (discarded(m, recent) || m.by === "host") continue;
        return m.decision === "take"
          ? { key, at: "wire", text: `you took it${m.by !== "human" ? ` (${s(m.by)})` : ""}. Watch the wire: applied → evaluated → active in speakers, each a receipt on the protocol` }
          : { key, at: "wire", text: "skipped. The listener is told, nothing changed, and the next round answers what is still playing" };
      case "active":
        return { key, at: "wire", text: "in the speakers. Two bars from now the meter reports again and the host checks whether the idea did what it said" };
      case "comparison":
        return { key, at: "wire", text: "measured: the sound before the change against the sound after it" };
      case "outcome":
        return m.grade === "ungraded"
          ? { key, at: "wire", text: `? not checked: ${s(m.reason ?? "the meter had no clean before and after")}. Nothing is scored; the next idea gets a clean check` }
          : { key, at: "wire", text: `${m.grade === "hit" ? "✓ correct" : m.grade === "miss" ? "✗ wrong" : "○ no real change"}: ${s(m.agent)} predicted ${s((m.expected as { metric?: string })?.metric)} ${s((m.expected as { dir?: string })?.dir)}. That goes into the listener's next prompt` };
      case "unlock":
        return { key, at: "booth", text: `${s(m.agent)} earned ${s(m.skill).toUpperCase()} by having ideas taken. It stays off until you press k: a capability is a grant` };
      case "grant":
        return m.skill
          ? { key, at: "booth", text: `${s(m.skill).toUpperCase()} is live on ${s(m.agent)}: k performs it on the voice that is playing` }
          : m.level === "auto"
            ? { key, at: "booth", text: `takeover: the host now takes ideas on ${s(m.agent)}'s behalf inside a veto window. n vetoes, o takes control back. Every such take is logged as grant:auto` }
            : { key, at: "booth", text: `${s(m.agent)} is back to suggesting only` };
      case "enter":
        return m.remote
          ? { key, at: "booth", text: `a guest agent joined over the wire (localhost:57400). Its ideas pass the same validator and the same verdict as everyone's` }
          : { key, at: "booth", text: `${s(m.name || m.agent)} walks in with a calling card: it lands in two bars unless n vetoes it. Each listener has its own repertoire` };
      case "leave":
        return { key, at: "booth", text: `${s(m.name ?? m.agent)} left the booth: its layers keep playing, it stops proposing, and its open ideas are withdrawn` };
      case "note":
        if (m.from !== "human") continue;
        return { key, at: "offers", text: `your words outrank the report: the next ideas answer “${s(m.text)}”` };
      case "round_start":
        return opts.manual ? null : { key, at: "offers", text: "a round: option 1 is ready at once from the library; option 2 is Claude Code writing live. The music never waits" };
      case "transition":
        return { key, at: "field", text: `a ${s(m.kind)} rides the whole mix toward the bar line; the change lands under it` };
      default: continue;
    }
  }
  return null;
}

/** Before anything has happened, the one thing worth saying. */
export const OPENING_GUIDE = "the booth: listeners propose, you decide. 1 2 3 takes an idea, n skips, t directs in words, ? every key";
