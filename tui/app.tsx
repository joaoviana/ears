// Terminal presentation. Session I/O and performer actions live outside the render function.
import React from "react";
import { render, Box, Text } from "ink";
import { TextInput, Select, Spinner, ThemeProvider, extendTheme, defaultTheme } from "@inkjs/ui";
import asciichart from "asciichart";
import gradient from "gradient-string";
import { usePerformance, RAMP_NAMES, TEXT, DIM, FAINT, hex, fgc, RESET, tokens } from "./use-performance.ts";
import { SLOTS } from "./session.ts";
import { render as field, UI, type Banner } from "./ascii.ts";
import { avatar, accent, isAmbientDJ } from "./djs.ts";
import { SKILLS } from "./skills.ts";
import { describeExpect } from "./shots.ts";
import { pretty } from "./bus.ts";
import { instrumentOf, pair } from "./patch.ts";
import { DEVELOP, developmentStatus, type Development } from "./inspiration.ts";
import { reveals, ribbon, tally, caption, STAGES, OPENING_GUIDE } from "./guide.ts";
import { script as demoScript, live, sections, ICON, BEATS, PART_LABEL } from "./script.ts";

// Defined at module level on purpose: a component created inside App would be a new type on every frame (the screen
// redraws 15 times a second), and React would remount everything inside it, including the text input mid-keystroke.
const Pane = (props: { title: string; note?: string; width: number; height: number; children?: React.ReactNode; row?: boolean; grad: (s: string) => string }) => (
  <Box flexDirection="column" width={props.width} height={props.height} borderStyle="round" borderColor={FAINT} paddingX={1} overflow="hidden">
    <Text wrap="truncate"><Text bold>{props.grad(props.title)}</Text>{props.note ? <Text color={DIM}>  {props.note}</Text> : null}</Text>
    <Box flexDirection={props.row ? "row" : "column"} flexGrow={1}>{props.children}</Box>
  </Box>
);

// Layout. The projector is the audience's only view, so every size here is about legibility at distance, not density.
const MIN_W = 90;                 // the width check-ambient-demo-ui.py drives; anything narrower is not supported
const FALLBACK_W = 120, FALLBACK_H = 48;
const TIGHT_ROWS = 42;            // below this the booth loses its faces and the cards lose their second and third lines
const PANE_H = 15;                // "live layers" and "ears" are a fixed height so the field never jumps between rounds
const BOOTH_H = 16, BOOTH_H_TIGHT = 6;   // ten rows of portrait plus name, tally and powers
const MIN_FIELD_H = 4;            // the band takes its rows from the field, and never the footer's
const BAND_CHROME = 3;            // the band's border and its title row
const BOOTH_COL_W = 24;           // one DJ column: a 22-pixel portrait plus its name and counters
const EARS_COL_W = 41;            // the band rows; whatever is left of the "ears" pane is the trend chart
const LEFT_FRACTION = 0.56;       // "live layers" against "ears"
const CHROME_ROWS = 3;            // header, the A/B + favourite line, and the key hints
const LANE_PREFIX = 21;        // "d1 " plus the 16-step lane plus the gap before the code
const GLOW_BARS = 8;              // how long a change's new tokens stay lit
const HELP_KEY_W = 8, HELP_GAP = 4;
// When this process started, in the footer: a screenshot then says whether it predates the code on disk.
const STARTED = new Date().toTimeString().slice(0, 5);
// Composition is bounded; the spinner shows progress against this so a long think never reads as a hang.
const COMPOSE_CEILING_MS = Number(process.env.EARS_DEADLINE || 45000);
const FAVOURITE_CEILING_MS = Number(process.env.EARS_DEADLINE || 60000);
// The report's own labels are written for the agent; these are the ones that read from the back of the room.
const SHORT_LABEL: Record<string, string> = { "onsets/beat": "onsets", centroid: "bright", loudness: "loud" };

/** Pack the help groups into as many rows as the terminal is wide enough for, so nothing is silently truncated. */
function packHelp(groups: [string, [string, string][]][], width: number) {
  const size = (g: [string, [string, string][]]) => Math.max(g[0].length, ...g[1].map(([k, what]) => HELP_KEY_W + what.length)) + HELP_GAP;
  const rows: { group: [string, [string, string][]]; w: number }[][] = [];
  for (const g of groups) {
    const w = size(g), row = rows[rows.length - 1];
    if (row && row.reduce((a, c) => a + c.w, 0) + w <= width) row.push({ group: g, w });
    else rows.push([{ group: g, w }]);
  }
  return rows;
}

function App() {
  const { trend, build, muted, log, stdout, st, pulse, stacking, inspiration, busy, requestState, base, baseStartedAt, bpmRef, barAt, logs, banner, full, layout, guide, script, ramp, overlay, t0, authors, applications, lanes, amps, status, ref, lines, diagnosis, shotCard, lastChange, tideNow, manual, greet, typing, thinking, question, say, marks, all, setOverlay, enter, grantSkill, selectedMoment, setSelectedMoment, savedMoments, playMoments, developFavorite, moments, momentStatus, bus, submit, active } = usePerformance();
  const bandFloor = React.useRef(0);
  const W = Math.max(MIN_W, stdout.columns || FALLBACK_W), H = stdout.rows || FALLBACK_H, s = st.current, p = pulse.current, now = Date.now();
  const thinkingFor = thinking ? Math.max(0, now - requestState.current.startedAt) : 0;
  const thinkingCeiling = inspiration.current ? FAVOURITE_CEILING_MS : COMPOSE_CEILING_MS;
  const thinkingLabel = thinking ? `${thinking} · ${Math.floor(thinkingFor / 1000)}s` : "";
  const favouriteStatus = inspiration.current ? developmentStatus({ busy: busy.current, ...requestState.current, now,
    options: s.options?.length ?? 0, hasReport: !!s.report, localDjs: s.booth.filter(g => !g.remote).length,
    autoTake: s.booth.find(g => g.dj.id === s.options?.[0]?.agent)?.level === "auto",
  }) : "";
  const wipe = s.next ? Math.min(1, Math.max(0, (now - s.wipeAt) / barAt.current.len)) : 0;
  const th = UI[(s.next && wipe > 0.5 ? s.next : s.scene).palette] ?? UI.ember, A = th.a, B = th.b, Argb = hex(A), Brgb = hex(B), Trgb = hex(TEXT), Drgb = hex(DIM), Frgb = hex(FAINT);
  const tight = H < TIGHT_ROWS, paneH = PANE_H, boothH = tight ? BOOTH_H_TIGHT : BOOTH_H;
  const leftW = Math.floor(W * LEFT_FRACTION), boothW = tight ? Math.min(44, Math.floor(W * 0.4)) : Math.min(s.booth.length, 3) * BOOTH_COL_W + 4;
  const ambient = base.current?.style === "ambient";

  // ── the booth band ─────────────────────────────────────────────────────────────────────────────────────────────
  // The demo's hardest question was "what is changing, and how is that making it better?". The answer used to be
  // spread across a card that expired, a dim diff line under an option, and a masking note in the ears pane. This is
  // all four halves of it in one place, and it is persistent rather than transient: on a projector, somebody looking
  // up at any moment must see the current state, not the ghost of a card they missed.
  //
  // Every row is composed out of state that was really measured or really written. A row with nothing true to say is
  // not rendered at all — no filler, because filler on a projector is indistinguishable from a lie.
  const tide = ambient ? tideNow() : null;
  // Six slots named one by one do not fit and do not read; a run of the same instrument is one thing musically
  // ("d1 d2 d3 nature") and one thing on the row.
  const held = SLOTS.filter((k) => (s.slots[k] || "").trim()).reduce((groups: { slots: string[]; inst: string }[], k) => {
    const inst = instrumentOf(s.slots[k] || ""), last = groups[groups.length - 1];
    if (last && last.inst === inst) last.slots.push(k); else groups.push({ slots: [k], inst });
    return groups;
  }, []);
  const change = lastChange.current;
  const changePhase = change ? applications.current[change.parts[0].slot]?.phase : undefined;
  // How long the room has been standing still: the newest authored bar across the six slots.
  const authored = SLOTS.map((k) => authors.current[k]?.bar).filter((b): b is number => typeof b === "number");
  const idleBars = authored.length ? Math.max(0, s.bar - Math.max(...authored)) : 0;
  const masked = diagnosis.masking.map((m) => m.match(/(d\d) and (d\d) are both filling (\w+)/)).filter((m): m is RegExpMatchArray => !!m)
    .slice(0, 1).map((m) => `${m[1]}+${m[2]} both fill ${m[3]}`);
  const drifted = diagnosis.drift.filter((d) => Math.abs(d.db) > 6).slice(0, 1).map((d) => `${d.slot} is ${d.db > 0 ? "+" : ""}${d.db.toFixed(0)} dB against the base`);
  // The DJ's own stated evidence, minus the tide it already ends with (NOW says that), then the measured facts.
  const because = [
    ...(change?.evidence ? [change.evidence.replace(/\s*·\s*tide\s+\S+\s*$/, "").trim()] : []),
    ...masked, ...drifted,
    ...(idleBars >= 8 ? [`nothing has moved for ${idleBars} bars`] : []),
  ].filter(Boolean);
  // The keys the edit really moved, from the same per-key diff the `applied` receipt carries. One key per row, in
  // the windowed form `pair` uses, because two long patterns that differ late read as identical when cut from the
  // left. A slot `parseSlot` cannot read has no keys, and falls back to the patch's own sentence.
  const short = (v: string) => (v.length > 26 ? v.slice(0, 25) + "…" : v);
  const keyLines = (change?.parts ?? []).flatMap((part) => part.keys.map((k) => {
    const lead = (change!.parts.length > 1 ? `${part.slot} ` : "");
    if (k.before == null) return `${lead}+ ${k.key} ${short(k.after ?? "")}`;
    if (k.after == null) return `${lead}− ${k.key}`;
    const [was, now2] = pair(k.before.trim(), k.after.trim(), 24);
    return `${lead}${k.key} ${was} → ${now2}`;
  }));
  // A whole-slot rewrite moves twenty-odd keys, and "+26 more" under two of them is not a reading of anything. Past
  // a handful, the patch's own sentence ("rewrite · instrument \texture · …") is the honest summary of the edit.
  const keyRows = keyLines.length && keyLines.length <= 6
    ? [keyLines[0], ...(keyLines.length > 1 ? [keyLines[1] + (keyLines.length > 2 ? `   +${keyLines.length - 2} more` : "")] : [])]
    : change && change.parts.some((x) => x.diff) ? [change.parts.map((x) => (change.parts.length > 1 ? `${x.slot} ` : "") + x.diff).join("  |  ")] : [];
  const said = (change?.why ?? "").replace(/^(the room [^:]{0,24}|one rare thing is allowed to happen): /, "");
  const shot = shotCard.current;
  const label = (t: string) => <Text color={DIM}>{t.padEnd(9)}</Text>;
  const phaseMark = changePhase === "failed" ? <Text color={B} bold>  ✗ refused</Text>
    : changePhase === "submitted" ? <Text color={DIM}>  ○ submitted</Text>
    : changePhase === "queued" ? <Text color={A}>  ◌ next phrase</Text>
    : changePhase === "active" ? <Text color={A}>  ● in speakers</Text> : null;
  // keep: lower survives longer when the terminal is short. CHANGED is the question being asked, so it goes last.
  const bandRows: { key: string; keep: number; node: React.ReactNode }[] = [
    { key: "now", keep: 1, node: <Text key="now" wrap="truncate">{label("NOW")}{tide ? <><Text color={A} bold>tide: {tide.phase}</Text><Text color={FAINT}>  ·  </Text></> : null}{held.length
        ? held.map((h, i) => <Text key={h.slots[0]}>{i ? <Text color={FAINT}>  ·  </Text> : null}<Text color={B}>{h.slots.join(" ")}</Text> <Text color={TEXT}>{h.inst || "no voice"}</Text></Text>)
        : <Text color={DIM}>six empty slots</Text>}</Text> },
    ...(because.length ? [{ key: "because", keep: 2, node: <Text key="because" wrap="truncate">{label("BECAUSE")}<Text color={TEXT}>{because.join(", and ")}</Text></Text> }] : []),
    ...(change ? [{ key: "changed", keep: 0, node: <Text key="changed" wrap="truncate">{label("CHANGED")}<Text color={B} bold>{change.parts.map((x) => x.slot).join("+")}</Text>  <Text color={TEXT}>{said}</Text>{phaseMark}</Text> }] : []),
    ...keyRows.map((line, i) => ({ key: `keys${i}`, keep: 4 + i, node: <Text key={`keys${i}`} wrap="truncate">{label("")}<Text color={DIM}>{line}</Text></Text> })),
    ...(shot ? [{ key: "called", keep: 3, node: <Text key="called" wrap="truncate">{label("CALLED")}{fgc(shot.rgb)}{s.bar < shot.until ? "\x1b[1m" : ""}{shot.who}{"\x1b[22m"}{RESET} <Text color={TEXT}>{shot.call}</Text> <Text color={DIM}>· measured</Text> <Text color={TEXT}>{shot.text}</Text>  <Text bold={s.bar < shot.until} color={shot.grade === "hit" ? A : shot.grade === "miss" ? B : DIM}>{shot.grade === "hit" ? "● HIT" : shot.grade === "miss" ? "✗ MISS" : shot.grade === "flat" ? "○ FLAT" : "· ungraded"}</Text><Text color={FAINT}>   {shot.perSlot ? "judged on that layer's own meter" : "observed on the master mix"}</Text></Text> }] : []),
  ];
  // The band's rows come out of the field, never out of the footer: the cap is what is left after the panes, the
  // booth and a minimum field, so the rows on screen always sum to H. Short terminals drop the changed-keys line
  // first, then CALLED, then BECAUSE, then NOW; CHANGED is the last row standing. `tight` keeps at most two.
  // ── the show layout ────────────────────────────────────────────────────────────────────────────────────────────
  // The audience's view. Parts appear as the protocol produces them (guide.ts), so the screen is never denser than
  // what has actually happened; a guide line points at the newest thing and says what it means.
  const show = layout === "show", revealed = show ? reveals(bus.recent) : new Set<string>();
  const loop = show && revealed.has("wire") && !script ? ribbon(bus.recent, now) : null, counts = loop ? tally(bus.recent) : null;   // the sidebar's strip is this pane's LOOP line
  const said2 = show && guide ? caption(bus.recent, now, { manual }) : null;
  const roomH = show && revealed.has("room") ? 1 : 0;
  const protoRows = loop ? 3 + (revealed.has("graded") && shotCard.current ? 1 : 0) : 0;
  const protoH = protoRows ? protoRows + BAND_CHROME : 0;
  const guideH = show && guide && !script ? 1 : 0;   // the sidebar says it better while it is open
  const bandRoom = full || show ? 0 : Math.max(0, H - CHROME_ROWS - paneH - boothH - MIN_FIELD_H);
  // Too short for a box and its title? Keep the rows and lose the box: the words are the thing, the border is not.
  const bandBox = bandRoom >= BAND_CHROME + 1;
  const bandCap = bandBox ? bandRoom - BAND_CHROME : bandRoom;
  // The band reserves the most rows it has ever needed since this base started, so a masking note that comes and
  // goes with a report cannot resize the field underneath it every two bars. It grows once and then holds still.
  if (!change) bandFloor.current = 0;
  bandFloor.current = Math.max(bandFloor.current, bandRows.length);
  const bandLimit = tight ? Math.min(2, bandCap) : bandCap;
  const bandShown = Math.min(bandRows.length, bandLimit), bandReserved = Math.min(bandFloor.current, bandLimit);
  const bandH = bandReserved > 0 ? bandReserved + (bandBox ? BAND_CHROME : 0) : 0;
  const keptBand = new Set([...bandRows].sort((a, b) => a.keep - b.keep).slice(0, bandShown).map((r) => r.key));
  const band = bandRows.filter((r) => keptBand.has(r.key));
  // Stage mode: the six lanes, the line-up and one line per option. The strip is measured rather than assumed, so the
  // field stops one row above it instead of pushing the footer off the bottom of the projector.
  const stageOptionRows = question ? 1 + question.answers.length : Math.max(1, s.options?.length ?? 0);
  // Stage mode keeps the three most important rows, in the same reading order as the windowed band.
  const stageKept = new Set([...bandRows].sort((a, b) => a.keep - b.keep).slice(0, 3).map((r) => r.key));
  const stageBand = full ? bandRows.filter((r) => stageKept.has(r.key)) : [];
  const stripH = SLOTS.length + 2 + stageOptionRows + stageBand.length;
  const fieldH = full ? Math.max(6, H - CHROME_ROWS - stripH) : show ? Math.max(MIN_FIELD_H, H - CHROME_ROWS - boothH - roomH - protoH - guideH) : Math.max(MIN_FIELD_H, H - CHROME_ROWS - paneH - boothH - bandH);
  const bodyH = Math.max(6, H - CHROME_ROWS);   // an overlay that needs the room takes the panes' rows too
  const bn = banner.current && now - banner.current.from < banner.current.ms ? ({ lines: banner.current.lines, rgb: banner.current.rgb, t: (now - banner.current.from) / banner.current.ms } as Banner) : null;
  // The script sidebar shares the field's row with the wire; with both open each takes a third and the field the rest.
  const scriptW = script ? Math.min(76, Math.floor(W * (logs ? 0.32 : 0.44))) : 0;
  const logW = logs ? Math.min(96, Math.floor(W * (script ? 0.3 : 0.5))) : 0;
  // Computed in every layout, because what the script would say is logged even when the sidebar is closed.
  const cue = demoScript(bus.recent, { wireOpen: logs });
  const scriptCtx = cue ? {
    options: (s.options ?? []).map((o, i) => ({ n: i + 1, parts: (o.parts?.length ? o.parts : [{ slot: o.slot, code: o.code }]).map((x) => ({ slot: x.slot, before: s.slots[x.slot] || "", after: x.code })), why: o.why, expect: o.expect ? describeExpect(o.expect) : undefined, origin: o.origin, agent: s.booth.find((g) => g.dj.id === o.agent)?.dj.name ?? o.agent, ms: o.ms })),
    change: lastChange.current ? { parts: lastChange.current.parts.map((x) => ({ slot: x.slot, after: s.slots[x.slot] || "", keys: x.keys })), why: lastChange.current.why, who: lastChange.current.who } : undefined,
    grade: shotCard.current ? { who: shotCard.current.who, call: shotCard.current.call, text: shotCard.current.text, grade: shotCard.current.grade } : undefined,
    booth: s.booth.map((g) => g.dj.name), active: active().name, note: s.note, thinking: thinkingLabel || undefined, ideas: s.options?.length ?? 0,
    look: s.scene.look, palette: s.scene.palette, playing: held,
    listeners: s.booth.map((g) => ({ name: g.dj.name, active: g.dj.id === active().id, taken: g.taken, offered: g.offered, right: g.calls?.hit ?? 0, wrong: g.calls?.miss ?? 0, flat: g.calls?.flat ?? 0,
      powers: SKILLS.filter((k) => (g.dj.skills || []).includes(k.id)).map((k) => k.glyph), auto: g.level === "auto", guest: !!g.remote })),
    // the newest check stays on its line until the next one: the result of the analysis is a component, not a moment
    lastCheck: (() => { const o = [...bus.recent].reverse().find((m) => m.type === "outcome"); if (!o) return undefined;
      const e = o.expected as { metric?: string; dir?: string } | undefined;
      return { who: s.booth.find((g) => g.dj.id === o.agent)?.dj.name ?? String(o.agent), call: `${e?.metric ?? ""} ${e?.dir ?? ""}`, text: typeof o.measured === "string" ? o.measured : undefined, grade: String(o.grade), reason: typeof o.reason === "string" ? o.reason : undefined, slot: (o.scope as { kind?: string })?.kind === "slot" && typeof o.slot === "string" ? o.slot : undefined, id: typeof o.proposal === "number" ? o.proposal : undefined }; })(),
    // the clock: a written change lands on the next bar; the meter reports on every even bar
    awaiting: s.awaiting,
    nextBarMs: Math.max(0, barAt.current.at + barAt.current.len - now), nextReportMs: Math.max(0, barAt.current.at + (s.bar % 2 === 0 ? 2 : 1) * barAt.current.len - now),
  } : null;
  // Pace the loop strip: the host vets and writes within a millisecond and measures and judges in the same report,
  // so a strip that showed the truth jumped from idea to play and from play to verdict. Each step is now shown for
  // at least 1.2 s before the next; a new idea resets the pace.
  const paced = React.useRef({ idea: "", step: -1, at: 0 });
  const truth = scriptCtx ? live(bus.recent, scriptCtx, now) : null;
  if (truth) {
    const ideaKey = String(ribbon(bus.recent, now).proposal?.id ?? ""), trueStep = truth.steps.reduce((k, x, i) => (x.state !== "todo" ? i : k), -1);
    const p = paced.current;
    if (p.idea !== ideaKey) { p.idea = ideaKey; p.step = Math.min(trueStep, 0); p.at = now; }
    else if (trueStep > p.step && now - p.at >= 1200) { p.step++; p.at = now; }
    else if (trueStep < p.step) { p.step = trueStep; p.at = now; }
  }
  const pulseLine = scriptCtx && truth ? live(bus.recent, { ...scriptCtx, showStep: paced.current.step }, now) : null;
  // The sidebar's words go to the log as a `script` message whenever the beat or the live sentence changes, so a
  // session's transcript reads back as the talk that went with it. Not shown on the wire panes: it is commentary
  // about the protocol, not part of it, and guests ignore unknown types.
  // keyed on the beat, the step reached and whether a model is composing, not on the composing clock, so a long
  // think does not write a line a second
  const scriptKey = `${cue.current.id}:${cue.message?.t ?? 0}:${pulseLine?.steps.filter((x) => x.state !== "todo").map((x) => x.step).join(",") ?? ""}:${!!scriptCtx?.thinking}:${scriptCtx?.ideas ?? 0}`;
  React.useEffect(() => {
    if (!scriptCtx || !pulseLine) return;
    const seen = bus.recent.some((m) => m.type === "script" && m.beat === cue.current.id);
    bus.send("script", "host", { beat: cue.current.id, title: cue.current.title, live: pulseLine.now, steps: pulseLine.steps.filter((x) => x.state !== "todo").map((x) => x.step), grade: cue.current.id === "graded" ? (cue.message?.grade ?? scriptCtx.lastCheck?.grade) : undefined,
      say: cue.current.say(cue.message, scriptCtx).filter((l) => !(l.once && seen)).map((l) => `[${PART_LABEL[l.part]}] ${l.text}`), then: cue.current.then, booth: scriptCtx.booth });
  }, [scriptKey]);
  const rows = overlay ? [] : field(s.scene, s.next, wipe, RAMP_NAMES[ramp], W - logW - scriptW, fieldH, (now - t0) / 1000, p, { code: SLOTS.map((k) => s.slots[k]).join(" "), banner: bn });
  // Windowed, the code gets its own row under the lane; in stage mode it shares the row, so it loses the lane's width.
  const codeW = full ? W - 4 - LANE_PREFIX - 3 : leftW - 4;
  const beat = Math.floor(p.bar * 4), who = active(), step = Math.floor(p.bar * 16) % 16;
  const openingAge = s.bar - baseStartedAt.current;
  const openingCue = ambient && openingAge >= 0 && openingAge < 4 ? ["touch + water", "rain + glow", "grain current", "canopy"][openingAge] : "";
  const moveVerb = (o: NonNullable<typeof s.options>[number]) => {
    const touched = o.parts?.map(part => part.slot) ?? [o.slot];
    if (touched.length > 1) return "ARRANGE";
    if (o.recipe_id?.endsWith("clearing")) return "CLEAR";
    if (/transforms the active|current voice|existing material/i.test(o.evidence) || /carve|fracture|reveal/.test(o.angle)) return "MUTATE";
    if (touched.every(slot => !(s.slots[slot] || "").trim())) return "ADD";
    return "REPLACE";
  };
  const availableDJs = ambient ? all.current.filter(isAmbientDJ) : all.current;
  // The veto window is the one thing on screen with a deadline attached to it, so it is stated in bars, not implied.
  const autoIn = s.options?.length && (s.booth.find((g) => g.dj.id === s.options![0].agent)?.level === "auto" || (s.entrance && s.entrance.agent === s.options![0].agent && s.options![0].recipe_id === `ambient-${s.entrance.gesture}`)) ? Math.max(0, s.autoAt - s.bar) : null;
  const bars = (n: number) => `${n} bar${n === 1 ? "" : "s"}`;
  // Everything the host says back to the performer arrives in `say`: refusals, confirmations, unlocks, the stack hint.
  // The options list used to cover it, so a refused stack or a blocked take was silently swallowed. It now has its own row.
  const paneBusy = !!(typing || question || s.options?.length || thinking);

  // The code pane is the live thing. Lane: the hits that actually sounded, in the colour of whoever wrote the slot.
  // Code: keys recede, values stand out, step rows are drawn as steps, and what a change brought in glows for 8 bars.
  const paint = (t: string, fresh: boolean) => {
    if (fresh) return "\x1b[1m" + fgc(Argb) + t + "\x1b[22m";
    const row = t.match(/^(.*?")([Xx\-. ]{4,})(".*)$/);
    if (row) return fgc(Drgb) + row[1] + [...row[2]].map((c) => (c === "X" ? fgc(Trgb) + "█" : c === "x" ? fgc(Drgb) + "▄" : fgc(Frgb) + "·")).join("") + fgc(Drgb) + row[3];
    return (t.startsWith("\\") || t.startsWith("~d.(") ? fgc(Drgb) : fgc(Trgb)) + t;
  };
  const slotView = (k: string) => {
    const a = authors.current[k], rgb = a?.rgb ?? Drgb, lane = lanes.current[k], hot = !!a && s.bar - a.bar < GLOW_BARS;
    const laneStr = lane.map((at, i) => { const age = (now - at) / barAt.current.len, lit = at > 0 && age < 0.97; return lit ? fgc(i === step ? [255, 255, 255] : rgb, (0.45 + amps.current[k][i] * 0.55) * (1 - age * 0.5)) + (age < 0.06 ? "█" : "■") : fgc(i === step ? Trgb : Frgb, i % 4 === 0 && i !== step ? 1.5 : 1) + (i === step ? "▁" : i % 4 === 0 ? "╷" : "·"); }).join("") + RESET;
    let code = "", len = 0;   // six slots: one line each, the file has the rest
    for (const t of tokens(s.slots[k] || "")) {
      if (len + t.length + 1 > codeW - 1) { code += fgc(Frgb) + "…"; break; }
      code += paint(t, hot && a!.fresh.has(t)) + " "; len += t.length + 1;
    }
    return { laneStr, code: code + RESET, by: a ? `${a.name} · bar ${a.bar}` : "", rgb };
  };
  const grad = gradient([A, B]);
  const uiTheme = extendTheme(defaultTheme, { components: {
    Spinner: { styles: { frame: () => ({ color: A }), label: () => ({ color: DIM }) } },
    Select: { styles: { focusIndicator: () => ({ color: A }), selectedIndicator: () => ({ color: B }), label: ({ isFocused }: { isFocused: boolean }) => ({ color: isFocused ? TEXT : DIM, bold: isFocused }) } },
  } });
  const meter = (v: number, n = 12) => { const k = Math.max(0, Math.min(1, v)) * n, fullN = Math.floor(k); return fgc(Brgb) + "━".repeat(fullN) + (k - fullN > 0.5 ? "╸" : "") + fgc(Frgb) + "─".repeat(Math.max(0, n - fullN - (k - fullN > 0.5 ? 1 : 0))) + RESET; };
  const chartW = W - leftW - 4 - (EARS_COL_W + 1) - 3, tr = trend.current;   // pane padding, the band column, the chart margin
  const chart = chartW >= 16 && tr.loud.length >= 2 ? (() => {
    const n = Math.min(tr.loud.length, chartW), cut = <T,>(xs: T[]) => xs.slice(-n);
    const plot = asciichart.plot([[0, 1], cut(tr.loud), cut(tr.bright)], { height: 8, colors: ["\x1b[30m", fgc(Argb), fgc(Brgb)], format: () => "", padding: "" });   // the invisible [0,1] series pins the axis
    return { rows: plot.split("\n").map((r) => fgc(Frgb) + r + RESET), marks: " " + cut(tr.marks).map((m) => (m ? fgc(m) + "▴" : fgc(Frgb) + "·")).join("") + RESET };
  })() : null;
  const riding = build.current && now < build.current.until ? build.current : null;
  const KEYS: [string, [string, string][]][] = [
    ["the booth", [["1 2 / 3", "answer a question / take an offered option"], ["0", "stack mode: mark with 1 2 3, enter lands them together"], ...(!ambient ? [["! @ #", "take it with a build"] as [string, string]] : []), ["n", "skip the round"], ["tab", "point t / k / x / o at the next listener"], ["t", "direct the music; two instant answers + one composed"], ["a", "ask for a musical direction now"]]],
    ["listeners", ambient ? [["d", "bring in an ambient listener"], ["D", "pick an ambient listener"], ["x", "retire the active listener"], ["k", "perform the next active ambient power"], ["K", "choose carve, fracture or reveal"], ["o / O", "takeover: this listener / everyone acts alone"]] : [["d", "bring in someone from the roster"], ["D", "pick who from a list"], ["s", "summon a new DJ from a description"], ["x", "retire the active DJ"], ["o / O", "takeover: this DJ / everyone acts alone"], ["k", "activate a skill a DJ has unlocked"], ["K", "give the active DJ any skill right now"], ["R", "record a 4 s voice note for the DJs to chop"]]],
    ["the set", ambient ? [["g", "renew the ambient system through a wash"], ["w", "slow wash by hand"], ["m", "mute"], ["r", "save what's playing as the reference"]] : [["g", "new random base, through a build"], ["b", "base mood: vibey / dark / any"], ["W", "how wild the booth is: tame / house / loose / unhinged"], ["u / w", "build / wash by hand"], ["m", "mute"], ["v", "DJs speak their greeting (macOS say)"], ["r", "save what's playing as the reference"]]],
    ["the screen / memory", [["f", "show / stage / window layout"], ["G", "hide the show guide line"], ["S", "the demo script sidebar"], ["l / L", "next / previous look"], ["p", "palette"], ["c", "characters"], ["e", "live protocol log"], ["[ / ]", "capture last 4 s as A / B"], ["\\", "hear A then B; esc returns live"], ["M / H", "keep moment / replay or develop"], ["J", "clear favourite direction"], ["esc", "close this, cancel typing or a stack"], ["?", "these keys"], ["q", "quit"]]],
  ];

  // Dead air is the worst thing on a projector. A bare spinner says "something is happening"; this says how long it has
  // been happening and that the wait is bounded, which is the difference between suspense and a hang.
  const waiting = (
    <Box flexDirection="column">
      <Spinner label={thinkingLabel} />
      {!tight && <Text wrap="truncate">{"  "}{meter(thinkingFor / thinkingCeiling, 18)} <Text color={DIM}>of up to {Math.round(thinkingCeiling / 1000)}s{W - boothW >= 78 ? " · the music never waits" : ""}</Text></Text>}
    </Box>
  );

  // The check, in the offers pane's right half (the cards never need the width). The loop this idea is on, what is
  // happening this second, the last result in words, and the record. Visible whether or not the sidebar is open.
  const checkW = show && W - boothW >= 110 ? Math.min(74, Math.floor((W - boothW) * 0.45)) : 0;
  const lastCheck = scriptCtx ? sections(scriptCtx).find((x) => x.label === "VERDICT") : null;
  // The flight. When an idea is taken, its line leaves the cards and crosses the pane to the LOOP panel over 0.7 s,
  // and the panel flashes as it lands: the audience sees the idea change hands, from offered to being judged.
  const flight = lastChange.current && now - lastChange.current.at < 700 ? (now - lastChange.current.at) / 700 : null;
  const landed = lastChange.current && now - lastChange.current.at >= 700 && now - lastChange.current.at < 1500;
  const flightLine = flight != null && lastChange.current ? (() => {
    const text = `▸ ${lastChange.current!.parts.map((x) => x.slot).join("+")}  ${lastChange.current!.why}`.slice(0, 60);
    const travel = Math.max(0, W - boothW - checkW - 6 - text.length), x = Math.floor(travel * flight);
    return <Text wrap="truncate">{" ".repeat(x)}<Text color={A} bold>{text}</Text></Text>;
  })() : null;
  const checkPanel = checkW > 0 && pulseLine ? (
    <Box flexDirection="column" width={checkW} paddingLeft={2} flexShrink={0}>
      <Text wrap="truncate"><Text color={landed ? "#ffffff" : DIM} bold={!!landed}>LOOP    </Text>{pulseLine.steps.map((x, i) => <Text key={x.step}>{i ? <Text color={FAINT}> › </Text> : null}<Text color={x.state === "now" ? "#ffffff" : x.state === "done" ? A : FAINT} bold={x.state === "now"}>{x.step === "verdict" && x.state === "done" && scriptCtx?.lastCheck ? `${ICON[scriptCtx.lastCheck.grade] ?? "○"} ` : x.state === "now" ? "● " : x.state === "done" ? "● " : "○ "}{x.step}</Text></Text>)}</Text>
      <Text wrap="wrap"><Text color={DIM}>        </Text><Text color={TEXT}>{pulseLine.now}</Text></Text>
      <Text wrap="wrap"><Text color={DIM}>VERDICT </Text><Text color={scriptCtx?.lastCheck ? (scriptCtx.lastCheck.grade === "hit" ? A : scriptCtx.lastCheck.grade === "miss" ? B : TEXT) : DIM}>{lastCheck?.status ?? ""}</Text></Text>
      {lastCheck && scriptCtx?.lastCheck ? <Text wrap="wrap"><Text color={DIM}>        </Text><Text color={FAINT}>{lastCheck.say}</Text></Text> : null}
    </Box>
  ) : null;
  // The booth row: faces and offers. Shared by the window and show layouts, which place it differently.
  const boothRow = (
    <Box>
      <Pane grad={grad} title="booth" note={tight ? undefined : `${s.booth.length}/3`} width={boothW} height={boothH} row>
          {s.booth.map((g) => {
            const on = g.dj.id === who.id, art = tight ? [] : avatar(g.dj, p, on), rise = Math.min(art.length, Math.floor((now - g.since) / 75));
            const shown = g.since && !tight ? [...Array(art.length - rise).fill(""), ...art.slice(0, rise)] : art, mine = SLOTS.filter((k) => authors.current[k]?.name === g.dj.name);
            return (
              <Box key={g.dj.id} flexDirection="column" width={tight ? undefined : BOOTH_COL_W} marginRight={tight ? 2 : 0}>
                {shown.map((r, i) => <Text key={i} wrap="truncate">{r || " "}</Text>)}
                <Text wrap="truncate">{fgc(accent(g.dj.palette), on ? 1 : 0.55)}{on ? "▸ " : "  "}{on ? "\x1b[1m" : ""}{g.dj.name}{"\x1b[22m"}{RESET}{g.level === "auto" ? <Text color={B} bold> AUTO</Text> : null}{g.remote ? <Text color={DIM}> wire</Text> : null}</Text>
                <Text color={DIM} wrap="truncate">  {g.taken}/{g.offered} taken{mine.length ? " · " + mine.join(" ") : ""}{g.calls ? <Text color={TEXT}>  calls {g.calls.hit}/{g.calls.hit + g.calls.miss + g.calls.flat}</Text> : null}</Text>
                {!tight && <Text wrap="truncate">  {SKILLS.map((k) => { const has = (g.dj.skills || []).includes(k.id), wait = g.pending.includes(k.id); return <Text key={k.id} color={has ? TEXT : wait ? B : FAINT} bold={wait && Math.floor(now / 400) % 2 === 0}>{k.glyph}{wait ? " k! " : " "}</Text>; })}<Text color={FAINT}>  k perform · K choose</Text></Text>}
              </Box>
            );
          })}
        </Pane>
        <Pane grad={grad} title={typing ? (typing === "tell" ? `you → ${who.name.toLowerCase()}` : "summon a dj") : question ? `${who.name.toLowerCase()} asks` : (s.note && (s.options?.length || thinking) ? `answers to “${s.note.length > 48 ? s.note.slice(0, 47) + "…" : s.note}”` : (st.current.booth.filter((x) => !x.remote).length > 1 ? `the booth offers` : `${who.name.toLowerCase()} offers`)) + (stacking ? " · STACK" : "")} note={typing ? "enter to send · esc to cancel" : question ? "1 2 answer · t your own words · n skip" : s.options?.length ? (autoIn !== null ? `n vetoes · o takes control back` : (stacking ? "1 2 3 mark · enter lands them on one bar · 0 cancels" : "1 2 3 take · 0 stacks · lands next bar · n skip · t direct")) : ambient ? "a ask · t direct · k power · K choose · ? keys" : "a ask · t tell · s summon · ? keys"} width={W - boothW} height={boothH}>
          <Box flexDirection="row" flexGrow={1}><Box flexDirection="column" flexGrow={1}>
          {flightLine}
          {greet.current && s.bar < greet.current.until && !typing ? <Text wrap="truncate">{fgc(greet.current.rgb)}{"\x1b[1m"}{greet.current.who}{"\x1b[22m"}{RESET} <Text color={TEXT}>“{greet.current.text}”</Text></Text> : null}
          {typing ? <Box><Text color={A}>{typing === "summon" ? "a DJ who " : "› "}</Text><TextInput key={typing} placeholder={typing === "summon" ? "plays acid, a bit unhinged…" : "more rhythm · carve the rain · thinner and stranger…"} onSubmit={submit} /></Box>
            : question ? <>
              <Text color={TEXT} bold>{question.text}</Text>
              {question.answers.map((answer, index) => <Text key={answer.label}><Text color={A} bold> {index + 1} </Text><Text color={TEXT}>{answer.label}</Text></Text>)}
              {!tight && <Text color={DIM}>Choose a direction, then review its proposed move. t gives your own brief.</Text>}
            </>
            : s.options?.length ? <>
              {autoIn !== null ? <Text wrap="truncate"><Text color={B} bold>{s.entrance && s.options?.[0]?.recipe_id === `ambient-${s.entrance.gesture}` ? "CALLING CARD " : "AUTO "}</Text><Text color={B}>{"▮".repeat(Math.max(0, 4 - autoIn)).padEnd(4, "▯")}</Text><Text color={TEXT} bold>  {s.entrance && s.options?.[0]?.recipe_id === `ambient-${s.entrance.gesture}` ? `lands in ${bars(autoIn)}` : `takes one of these in ${bars(autoIn)}`}</Text><Text color={DIM}> · n vetoes</Text></Text> : null}
              {s.options.map((o, i) => (
                <Box key={o.id} flexDirection="column" marginTop={i && !tight && layout === "window" ? 1 : 0}>
                  <Text wrap="truncate"><Text color={A} bold>{marks.current.has(o.id) ? " ● " : ` ${i + 1} `}</Text>{(() => { const gg = s.booth.find((x) => x.dj.id === o.agent); return gg && s.booth.filter((x) => !x.remote).length > 1 ? <Text>{fgc(accent(gg.dj.palette))}{gg.dj.name.toLowerCase()}{RESET} </Text> : null; })()}<Text color={B} bold>{moveVerb(o)} </Text><Text color={B}>{(o.parts?.length ? o.parts.map((x) => x.slot) : [o.slot]).join("+")}</Text>  <Text color={TEXT}>{o.why}</Text>{o.expect ? <Text color={A}>  calls {describeExpect(o.expect)}</Text> : null}{SKILLS.filter((k) => k.uses(o.code, o)).map((k) => <Text key={k.id} color={B} bold>  {k.glyph} {k.name.toLowerCase()}</Text>)}<Text color={FAINT}>   {o.angle === "wire" ? "guest proposal" : o.origin === "model" ? `Claude Code${s.note ? " · read your words" : ""}` : `instant${o.answers ? ` · matched ${o.answers}` : ""}`}{o.ms ? ` · ${(o.ms / 1000).toFixed(1)}s` : ""}{o.agent !== who.id ? ` · ${o.agent}` : ""}</Text></Text>
                  {!tight && layout === "window" && <Text wrap="truncate-end"><Text color={DIM}>      {o.diff}</Text></Text>}
                  {!tight && layout === "window" && <Text wrap="truncate"><Text color={FAINT}>      ↳ {o.evidence}</Text></Text>}
                </Box>
              ))}
              {thinking && s.options.length < 3 ? <Box marginTop={1}>{waiting}</Box> : null}
            </> : thinking ? <Box flexDirection="column">{s.note ? <Text color={TEXT}>Claude Code is answering your words. No library move matched them, so nothing is offered until it does.</Text> : null}{waiting}</Box>
            : <Text color={say.kind === "refused" ? B : say.kind === "dj" ? TEXT : DIM} bold={say.kind === "refused"} wrap="wrap">{say.text || (manual ? "waiting for you · a asks the booth for a move" : "…")}</Text>}
          <Box flexGrow={1} />
          {paneBusy && say.text ? <Text wrap="truncate"><Text color={B} bold>› </Text><Text color={say.kind === "refused" ? B : TEXT} bold={say.kind === "refused"}>{say.text}</Text></Text> : null}
          {!tight && <Text wrap="truncate"><Text color={FAINT}>{s.history.slice(-24).map((h) => (h.verdict === "y" ? "●" : h.verdict === "x" ? "×" : "·")).join(" ")}</Text>{s.note ? <Text color={DIM}>   note: “{s.note}”</Text> : null}</Text>}
          </Box>{checkPanel}</Box>
        </Pane>
      </Box>
  );

  return (
    <ThemeProvider theme={uiTheme}>
    <Box flexDirection="column" width={W}>
      <Box justifyContent="space-between" paddingX={1}>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate"><Text bold>{grad("E A R S")}</Text>  {[0, 1, 2, 3].map((i) => <Text key={i} color={i === beat ? (i === 0 ? A : TEXT) : FAINT}>{i === beat ? "● " : "○ "}</Text>)}{openingCue ? <Text color={A} bold> OPENING {openingAge + 1}/4 {openingCue}</Text> : null} <Text color={TEXT}>bar {s.bar}</Text><Text color={DIM}> · {bpmRef.current} bpm{base.current ? ` · ${base.current.style === "ambient" ? "ambient" : `seed ${base.current.seed}`} · ${base.current.key}` : " · set from disk"}</Text></Text>
        </Box>
        <Box width={Math.min(52, Math.floor(W * 0.35))} flexShrink={0} justifyContent="flex-end">
          <Text wrap="truncate">{riding ? <Text color={B} bold>{riding.kind} {"▁▂▃▄▅▆▇█".slice(0, 1 + Math.floor(((now - riding.from) / (riding.until - riding.from)) * 7.99)).padEnd(8, " ")} </Text> : null}{muted ? <Text color={B}>muted  </Text> : null}<Text color={DIM}>{log === "engine ready" ? "" : log.slice(0, 50)}</Text></Text>
        </Box>
      </Box>
      {layout === "window" && overlay !== "help" && <Box>
        <Pane grad={grad} title="live layers" note="proposal → queued → active in speakers" width={leftW} height={paneH}>
          {SLOTS.map((k) => {
            const v = slotView(k), receipt = status[k], application = applications.current[k];
            const recent = application && (application.phase !== "active" || now - application.at < barAt.current.len * 8);
            return (
              <Box key={k} flexDirection="column">
                <Text wrap="truncate">{fgc(v.rgb)}[1m{k}[22m{RESET} {v.laneStr}  {receipt?.phase === "failed" ? <Text color={B} bold>✗ refused · previous sound restored · {receipt.text}</Text>
                  : recent && application?.phase === "submitted" ? <Text color={DIM}>○ submitted · {application.why}</Text>
                  : recent && application?.phase === "queued" ? <Text color={A}>◌ queued for next phrase · {application.why}</Text>
                  : recent && application?.phase === "active" ? <Text color={A} bold>● active in speakers · {application.why}</Text>
                  : <Text color={DIM}>{s.slots[k].trim() ? v.by : "empty"}</Text>}{s.reverts.filter((r) => r.slot === k).map((r, i) => <Text key={i} color={B} bold>  ⟲ fracture · back in {Math.max(1, r.atBar - s.bar + 1)} bar{r.atBar - s.bar + 1 > 1 ? "s" : ""}</Text>)}</Text>
                <Text wrap="truncate">{v.code || " "}</Text>
              </Box>
            );
          })}
        </Pane>
        <Pane grad={grad} title="ears" note={ref ? "every 2 bars, against the reference" : "no reference yet · r saves what's playing"} width={W - leftW} height={paneH} row>
          <Box flexDirection="column" width={EARS_COL_W}>
            {lines.length === 0 ? <Spinner label="listening" /> : lines.map((l, li) => {
              const off = l.word && l.word !== "ok", d = l.delta ?? 0;
              return (
                <Text key={l.label} wrap="truncate"><Text color={off ? TEXT : DIM}>{(SHORT_LABEL[l.label] ?? l.label.replace(/\s+.*$/, "")).padEnd(9)}</Text>{li < 5 ? meter((20 * Math.log10(Math.max(p.bands[li], 1e-5)) + 56) / 56) : li === 7 ? meter((20 * Math.log10(Math.max(p.bands.reduce((x, y) => x + y, 0), 1e-5)) + 40) / 40) : " ".repeat(12)} <Text color={off ? B : FAINT}>{l.delta === null ? (l.label === "headroom" ? "  " + l.value.replace(" dB", "").padStart(4) : "     –") : `${Math.abs(d) < 0.05 ? "  " : d > 0 ? "▲ " : "▼ "}${Math.abs(d).toFixed(1).padStart(4)}`}</Text> {off ? <Text color={B} bold>{l.word}</Text> : <Text color={FAINT}>·</Text>}</Text>
              );
            })}
          </Box>
          <Box flexDirection="column" marginLeft={1} flexGrow={1} overflow="hidden">
            {chart ? <>
              {chart.rows.slice(0, Math.max(3, paneH - 6)).map((r, i) => <Text key={i} wrap="truncate">{r}</Text>)}
              <Text wrap="truncate">{chart.marks}</Text>
              <Text wrap="truncate"><Text color={A}>━ loud</Text> <Text color={B}>━ bright</Text> <Text color={DIM}>▴ change</Text></Text>
            </> : null}
            {diagnosis.drift.length ? <Text wrap="truncate"><Text color={DIM}>drift </Text>{diagnosis.drift.slice(0, 4).map((d) => <Text key={d.slot}><Text color={Math.abs(d.db) > 6 ? B : DIM} bold={Math.abs(d.db) > 6}>{d.slot} {d.db > 0 ? "+" : ""}{d.db.toFixed(0)}</Text><Text color={FAINT}>  </Text></Text>)}</Text> : null}
            {diagnosis.masking.slice(0, 2).map((m, i) => { const w = m.match(/(d\d) and (d\d) are both filling (\w+)/); return <Text key={i} wrap="truncate"><Text color={B} bold>{w ? `${w[1]}+${w[2]} fight ${w[3]}` : "masking"}</Text></Text>; })}
          </Box>
        </Pane>
      </Box>}
      {layout === "window" && overlay !== "help" && boothRow}

      {layout === "window" && overlay !== "help" && bandH > 0 && (bandBox
        ? <Box>
            <Pane grad={grad} title="the booth" note={manual && !thinking && !s.options?.length ? "manual · a asks for a move" : "what the room is, why it moved, what moved"} width={W} height={bandH}>
              {band.map((r) => r.node)}
            </Pane>
          </Box>
        : <Box flexDirection="column" width={W} height={bandH} paddingX={1} overflow="hidden">{band.map((r) => r.node)}</Box>)}

      {/* Four side-by-side groups need ~220 columns; no terminal has them, so Ink used to shrink and silently cut the
          descriptions in half. Pack into as many rows as fit, and take the panes' rows so there is somewhere to put them. */}
      {overlay === "help" && <Box flexDirection="column" paddingX={2} height={bodyH} overflow="hidden">
        <Text wrap="truncate"><Text bold>{grad("every key")}</Text><Text color={DIM}>   esc or ? closes</Text></Text>
        {packHelp(KEYS, W - 4).map((row, ri) => (
          <Box key={ri} flexDirection="row" marginTop={1}>
            {row.map(({ group: [group, keys], w }) => (
              <Box key={group} flexDirection="column" width={w} flexShrink={0}>
                <Text color={A} bold wrap="truncate">{group}</Text>
                {keys.map(([k, what]) => <Text key={k} wrap="truncate"><Text color={B}>{k.padEnd(HELP_KEY_W)}</Text><Text color={TEXT}>{what}</Text></Text>)}
              </Box>
            ))}
          </Box>
        ))}
      </Box>}
      {overlay === "roster" && <Box flexDirection="column" paddingX={2} paddingY={1} height={fieldH} overflow="hidden">
        <Text bold>{grad("who walks in?")}<Text color={DIM}>   ↑↓ choose · enter · esc closes</Text></Text>
        <Select visibleOptionCount={Math.max(3, fieldH - 4)} options={availableDJs.map((d) => ({ value: d.id, label: `${d.name.padEnd(18)} ${s.booth.some((g) => g.dj.id === d.id) ? "(in the booth) " : ""}${d.tagline}`.slice(0, W - 10) }))} onChange={(id) => { const dj = availableDJs.find((d) => d.id === id); setOverlay(null); if (dj) enter(dj); }} />
      </Box>}
      {overlay === "skills" && <Box flexDirection="column" paddingX={2} paddingY={1} height={fieldH} overflow="hidden">
        <Text bold>{grad(`perform an ambient power with ${who.name.toLowerCase()}`)}<Text color={DIM}>   ↑↓ choose · enter · esc closes</Text></Text>
        <Select options={SKILLS.map((k) => ({ value: k.id, label: `${k.glyph} ${k.name.padEnd(8)} ${(who.skills || []).includes(k.id) ? "(already active) " : ""}${k.blurb}` }))} onChange={(id) => { setOverlay(null); const g = s.booth[s.turn % s.booth.length]; if (g) grantSkill(g, id); }} />
      </Box>}
      {overlay === "moments" && <Box flexDirection="column" paddingX={2} paddingY={1} height={fieldH} overflow="hidden">
        <Text bold>{grad("kept moments")}<Text color={DIM}>   enter chooses replay / develop · esc closes</Text></Text>
        {savedMoments.length ? <Select visibleOptionCount={Math.max(3, fieldH - 4)} options={savedMoments.map(m => ({ value: m.id, label: `${new Date(m.saved_at).toLocaleString()} · ${m.label}` }))} onChange={id => { const m = savedMoments.find(m => m.id === id); if (m) { setSelectedMoment(m); setOverlay("moment-action"); } }} /> : <Text color={DIM}>M keeps the last four seconds, with its source and evidence.</Text>}
      </Box>}
      {overlay === "moment-action" && selectedMoment && <Box flexDirection="column" paddingX={2} paddingY={1} height={fieldH} overflow="hidden">
        <Text bold>{grad(selectedMoment.label)}<Text color={DIM}>   esc back</Text></Text>
        <Text color={DIM}>Develop uses saved patterns, adapted to the current set. DJs propose changes through the usual take / auto controls.</Text>
        <Select key={selectedMoment.id} visibleOptionCount={4} options={[
          { value: "replay", label: "Replay the captured audio" },
          ...Object.entries(DEVELOP).map(([value, label]) => ({ value, label })),
        ]} onChange={action => {
          if (action === "replay") { setOverlay(null); playMoments([selectedMoment]); }
          else developFavorite(selectedMoment, action as Development);
        }} />
      </Box>}
      {show && !overlay && roomH > 0 && <Text wrap="truncate"> <Text color={DIM}>ROOM  </Text>{tide ? <><Text color={A} bold>{tide.phase}</Text><Text color={FAINT}>  ·  </Text></> : null}{held.map((h, i) => <Text key={h.slots[0]}>{i ? <Text color={FAINT}> · </Text> : null}<Text color={B}>{h.slots.join(" ")}</Text> <Text color={TEXT}>{h.inst}</Text></Text>)}<Text color={FAINT}>   </Text>{["sub", "low", "mid", "high", "air"].map((b, i) => <Text key={b}><Text color={DIM}>{b}</Text>{fgc(Brgb)}{"▁▂▃▄▅▆▇█"[Math.max(0, Math.min(7, Math.floor(((20 * Math.log10(Math.max(p.bands[i], 1e-5)) + 56) / 56) * 8)))]}{RESET} </Text>)}{lines.filter((l) => l.label === "loudness" || l.label === "centroid").map((l) => <Text key={l.label}><Text color={DIM}>  {SHORT_LABEL[l.label]} </Text><Text color={l.word && l.word !== "ok" ? B : TEXT}>{l.value}{l.word && l.word !== "ok" ? ` ${l.word}` : ""}</Text></Text>)}</Text>}
      {!overlay && <Box>
        <Box flexDirection="column" width={W - logW - scriptW}>{rows.map((r, i) => <Text key={i} wrap="truncate">{r}</Text>)}</Box>
        {script && cue && <Box flexDirection="column" width={scriptW} height={fieldH} paddingLeft={2} paddingRight={1} overflow="hidden">
          {/* The teleprompter: the beat the wire is on, what to say about the mechanism, what to do next, what is left. */}
          <Text wrap="truncate"><Text bold>{grad("the script")}</Text><Text color={DIM}>  S closes</Text></Text>
          {/* the live strip: the six steps, the one happening now lit, and one sentence about this second. Not while
              the check panel in the offers pane shows the same thing. */}
          {checkW > 0 ? null : <Text wrap="truncate">{pulseLine!.steps.map((x, i) => <Text key={x.step}>{i ? <Text color={FAINT}> › </Text> : null}<Text color={x.state === "now" ? "#ffffff" : x.state === "done" ? A : FAINT} bold={x.state === "now"}>{x.step === "verdict" && x.state === "done" && scriptCtx?.lastCheck ? `${ICON[scriptCtx.lastCheck.grade] ?? "○"} ` : x.state === "now" ? "● " : x.state === "done" ? "● " : "○ "}{x.step}</Text></Text>)}</Text>}
          {checkW > 0 ? null : <Text wrap="wrap"><Text color={A} bold>LIVE </Text><Text color={TEXT}>{pulseLine!.now}</Text></Text>}
          <Text wrap="wrap"><Text color={A} bold>NEXT </Text><Text color={TEXT}>{cue.current.then}</Text></Text>
          <Text color={FAINT}>{"─".repeat(Math.max(8, scriptW - 3))}</Text>
          {/* the components, always on screen: live state on the first line, the thing to say on the second. The one the
              newest beat belongs to is lit, so the presenter's eye lands where the room's attention is. */}
          {(() => { const lit = ({ open: "visuals", proposal: "ideas", note: "ideas", refused: "ideas", take: "protocol", skip: "protocol", active: "protocol", graded: "protocol", enter: "listeners", leave: "listeners", unlock: "listeners", power: "listeners", takeover: "listeners", guest: "listeners", transition: "visuals", wire: "protocol" } as Record<string, string>)[cue.current.id];
            return sections(scriptCtx!).filter((sec) => !(checkW > 0 && sec.label === "VERDICT")).map((sec) => <Box key={sec.label} flexDirection="column">
              <Text wrap="wrap"><Text color={sec.id === lit ? A : B} bold={sec.id === lit}>{sec.label.padEnd(11)}</Text><Text color={TEXT}>{sec.status}</Text></Text>

            </Box>); })()}
          <Text color={FAINT}>{"─".repeat(Math.max(8, scriptW - 3))}</Text>
          {/* The stream: everything the script has said this session, newest at the bottom, nothing truncated. The
              top block is the state; this is the flow. Entries are the logged `script` messages, so it is the same
              record that the JSONL keeps. As many whole entries as fit, counted from the end. */}
          {(() => {
            const width = Math.max(20, scriptW - 4), lines = (t: string) => Math.max(1, Math.ceil(t.length / width));
            const entries = bus.recent.filter((m) => m.type === "script" && Array.isArray(m.say)).map((m) => ({ t: m.t, beat: String(m.beat), title: String(m.title), say: (m.say as string[]), then: String(m.then ?? ""), grade: typeof m.grade === "string" ? m.grade : undefined }))
              // a round logs IDEAS once per option that lands; on screen the latest version of a beat replaces the one before it
              .filter((e, i, all) => all[i + 1]?.beat !== e.beat);
            // the top block is the strip, a rule, one line per component (two for the lit one, plus a wrap or two), a rule, and NEXT
            const room = Math.max(4, fieldH - 5 - sections(scriptCtx!).length - 3);
            // newest entries in full, from the bottom up; once those stop fitting, older ones collapse to their title line
            const shown: (typeof entries[number] & { full: boolean })[] = []; let used = 0;
            for (let i = entries.length - 1; i >= 0; i--) {
              const e = entries[i], h = 1 + e.say.reduce((n, l) => n + lines(l), 0);
              if (used + h <= room && !shown.some((x) => !x.full)) { shown.unshift({ ...e, full: true }); used += h; }
              else if (used + 1 <= room) { shown.unshift({ ...e, full: false }); used += 1; }
              else break;
            }
            return shown.map((e, i) => <Box key={e.t} flexDirection="column">
              <Text wrap="truncate"><Text color={i === shown.length - 1 ? A : DIM} bold={i === shown.length - 1}>{new Date(e.t).toTimeString().slice(3, 8)} {e.grade ? `${ICON[e.grade] ?? "○"} ` : "◆ "}{e.title.toUpperCase()}</Text>{!e.full ? <Text color={FAINT}>  {e.say[0]?.replace(/^\[\w+\] /, "")}</Text> : null}</Text>
              {e.full ? e.say.map((l, k) => { const m = l.match(/^\[(\w+)\] (.*)$/); return <Text key={k} wrap="wrap"><Text color={i === shown.length - 1 ? TEXT : DIM}>{m ? m[2] : l}</Text></Text>; }) : null}
            </Box>);
          })()}
        </Box>}
        {logs && <Box flexDirection="column" width={logW} height={fieldH} paddingLeft={2} overflow="hidden">
          <Text wrap="truncate"><Text bold>{grad("the wire")}</Text><Text color={DIM}>  every message between host, agents and you · also in tui/logs/latest.jsonl</Text></Text>
          {bus.recent.filter((m) => !m.same && m.type !== "state" && m.type !== "script" && (m.type !== "request" || m.angle === "fix")).slice(-(fieldH - 1)).map((m, i) => { const l = pretty(m), c = ({ proposal: Argb, grant: Argb, unlock: Argb, enter: Argb, verdict: Brgb, rejected: Brgb, error: Brgb, note: Trgb, applied: Trgb, active: Trgb, landed: Trgb } as Record<string, number[]>)[m.type] ?? Drgb; return <Text key={m.t + ":" + i} wrap="truncate">{fgc(Frgb, 1.6)}{l.time.slice(3)} {fgc(c)}{l.type.padEnd(12)}{fgc(Drgb)}{l.from.slice(0, 12).padEnd(13)}{fgc(m.type === "proposal" || m.type === "verdict" || m.type === "note" ? Trgb : Drgb)}{l.text}{RESET}</Text>; })}
        </Box>}
      </Box>}

      {show && overlay !== "help" && boothRow}
      {show && !overlay && loop && counts && <Box>
        <Pane grad={grad} title="the protocol" note={`${counts.receipts} receipts on the wire · tui/logs/latest.jsonl · e opens the log`} width={W} height={protoH}>
          {/* The SPEC's loop, drawn live: each stage lights when its message arrives for the idea in flight. */}
          <Text wrap="truncate">{label("LOOP")}{STAGES.map((stage, i) => <Text key={stage}>{i ? <Text color={FAINT}> ▸ </Text> : null}<Text color={loop.fresh === stage ? "#ffffff" : loop.current === stage ? A : loop.lit.has(stage) ? TEXT : FAINT} bold={loop.current === stage || loop.fresh === stage}>{stage}</Text></Text>)}{loop.proposal ? <Text color={DIM}>   #{String(loop.proposal.id)} {String(loop.proposal.slot)} by {String(loop.proposal.from)}</Text> : null}</Text>
          <Text wrap="truncate">{label("SO FAR")}<Text color={TEXT}>{counts.proposals} proposed</Text><Text color={DIM}> · </Text><Text color={counts.refused ? B : TEXT}>{counts.refused} refused by validation</Text><Text color={DIM}> · </Text><Text color={TEXT}>{counts.taken} taken · {counts.skipped} skipped</Text>{counts.graded ? <><Text color={DIM}> · </Text><Text color={A}>calls {counts.hit}/{counts.graded} hit</Text></> : null}{counts.guests ? <><Text color={DIM}> · </Text><Text color={A}>{counts.guests} guest agent{counts.guests > 1 ? "s" : ""} on the wire</Text></> : null}<Text color={FAINT}>   nothing reaches the speakers without validation and a verdict</Text></Text>
          {revealed.has("graded") && shot ? bandRows.find((r) => r.key === "called")?.node : null}
          {bus.recent.filter((m) => !m.same && !["state", "request", "curation", "learning", "round_start", "script"].includes(m.type)).slice(-1).map((m, i) => { const l = pretty(m); return <Text key={m.t + ":" + i} wrap="truncate">{label("WIRE")}<Text color={DIM}>{l.time.slice(3)} </Text><Text color={A}>{l.type.padEnd(11)}</Text><Text color={DIM}>{l.from.slice(0, 12).padEnd(13)}</Text><Text color={TEXT}>{l.text}</Text></Text>; })}
        </Pane>
      </Box>}
      {show && !overlay && guideH > 0 && <Text wrap="truncate"> <Text color={A} bold>▸ </Text>{said2 ? <><Text color={FAINT}>[{said2.at}] </Text><Text color={TEXT}>{said2.text}</Text></> : <Text color={DIM}>{OPENING_GUIDE}</Text>}</Text>}
      {full && <Box flexDirection="column" paddingX={1} height={stripH} overflow="hidden">
        {SLOTS.map((k) => { const v = slotView(k); return <Text key={k} wrap="truncate">{fgc(v.rgb)}[1m{k}[22m{RESET} {v.laneStr}  {v.code}</Text>; })}
        <Text wrap="truncate">{s.booth.map((g) => fgc(accent(g.dj.palette), g.dj.id === who.id ? 1 : 0.5) + (g.dj.id === who.id ? "▸ " : "  ") + g.dj.name).join("   ")}{RESET}{autoIn !== null ? <Text color={B} bold>   AUTO takes one in {bars(autoIn)} · n vetoes</Text> : null}</Text>
        {/* One line per option, carrying the same move verb and called shot as the windowed layout: from the back of
            the room "REPLACE d4 · calls low ↑" is the whole story, and `why` on its own was not. */}
        {question ? <>
          <Text wrap="truncate" color={TEXT} bold>{question.text}</Text>
          {question.answers.map((answer, i) => <Text key={answer.label} wrap="truncate"><Text color={A} bold> {i + 1} </Text><Text color={TEXT}>{answer.label}</Text></Text>)}
        </> : s.options?.length ? s.options.map((o, i) => (
          <Text key={o.id} wrap="truncate"><Text color={A} bold>{marks.current.has(o.id) ? " ● " : ` ${i + 1} `}</Text><Text color={B} bold>{moveVerb(o)} </Text><Text color={B}>{(o.parts?.length ? o.parts.map((x) => x.slot) : [o.slot]).join("+")}</Text>  <Text color={TEXT}>{o.why}</Text>{o.expect ? <Text color={A}>  calls {describeExpect(o.expect)}</Text> : null}</Text>
        )) : <Text color={DIM} wrap="truncate">{thinkingLabel || say.text}</Text>}
        <Text wrap="truncate">{say.text && (s.options?.length || question) ? <><Text color={B} bold>› </Text><Text color={say.kind === "refused" ? B : TEXT} bold={say.kind === "refused"}>{say.text}</Text></> : " "}</Text>
        {/* Stage mode keeps the band too, measured into the strip: the projector layout is the one that most needs it. */}
        {stageBand.map((r) => r.node)}
      </Box>}
      <Text wrap="truncate" color={DIM}> {moments.current?.playing ? "REPLAY · meters track live" : `A ${moments.current?.A ? "●" : "○"}  B ${moments.current?.B ? "●" : "○"}`}  {inspiration.current ? `${favouriteStatus} · J clear | favourite: ${inspiration.current.intent} · ${inspiration.current.label} | ` : ""}{momentStatus}</Text>
      <Box justifyContent="space-between" paddingX={1}>
        {/* Stage mode drops the pane notes, which is where "1 2 3 take · n skip" lived. The round's own keys move here
            so the performer is never looking at options with no way to know what answers them. */}
        <Box flexGrow={1} flexShrink={1}><Text color={DIM} wrap="truncate">{full
          ? <><Text color={B}>1 2 3</Text> take   <Text color={B}>n</Text> skip   <Text color={B}>t</Text> direct   <Text color={B}>a</Text> ask   <Text color={B}>g</Text> new base   <Text color={B}>?</Text> keys   <Text color={B}>f</Text> window</>
          : show ? <><Text color={B}>1 2 3</Text> take   <Text color={B}>n</Text> skip   <Text color={B}>t</Text> direct   <Text color={B}>d</Text> listener   <Text color={B}>k</Text> power   <Text color={B}>o</Text> takeover   <Text color={B}>e</Text> wire   <Text color={B}>f</Text> view   <Text color={B}>G</Text> guide   <Text color={B}>S</Text> script   <Text color={B}>?</Text> keys</>
          : <><Text color={B}>?</Text> keys   <Text color={B}>g</Text> new base   <Text color={B}>d</Text> dj   <Text color={B}>o</Text> takeover   <Text color={B}>e</Text> wire   <Text color={B}>f</Text> show</>}</Text></Box>
        <Box flexShrink={0}><Text color={DIM} wrap="truncate">{s.scene.look} · {s.scene.palette} · {RAMP_NAMES[ramp]} · up since {STARTED}</Text></Box>
      </Box>
    </Box>
    </ThemeProvider>
  );
}

render(<App />);
