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
import { DEVELOP, developmentStatus, type Development } from "./inspiration.ts";

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
const BOOTH_H = 18, BOOTH_H_TIGHT = 6;
const BOOTH_COL_W = 26;           // one DJ column: 16-pixel face plus its name and counters
const EARS_COL_W = 41;            // the band rows; whatever is left of the "ears" pane is the trend chart
const LEFT_FRACTION = 0.56;       // "live layers" against "ears"
const CHROME_ROWS = 3;            // header, the A/B + favourite line, and the key hints
const LANE_PREFIX = 21;        // "d1 " plus the 16-step lane plus the gap before the code
const GLOW_BARS = 8;              // how long a change's new tokens stay lit
const HELP_KEY_W = 8, HELP_GAP = 4;
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
  const { trend, build, muted, log, stdout, st, pulse, stacking, inspiration, busy, requestState, base, baseStartedAt, bpmRef, barAt, logs, banner, full, ramp, overlay, t0, authors, applications, lanes, amps, status, ref, lines, diagnosis, shotCard, greet, typing, thinking, question, say, marks, all, setOverlay, enter, grantSkill, selectedMoment, setSelectedMoment, savedMoments, playMoments, developFavorite, moments, momentStatus, bus, submit, active } = usePerformance();
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
  // Stage mode: the six lanes, the line-up and one line per option. The strip is measured rather than assumed, so the
  // field stops one row above it instead of pushing the footer off the bottom of the projector.
  const stageOptionRows = question ? 1 + question.answers.length : Math.max(1, s.options?.length ?? 0);
  const stripH = SLOTS.length + 2 + stageOptionRows;
  const fieldH = full ? Math.max(6, H - CHROME_ROWS - stripH) : Math.max(4, H - CHROME_ROWS - paneH - boothH);
  const bodyH = Math.max(6, H - CHROME_ROWS);   // an overlay that needs the room takes the panes' rows too
  const bn = banner.current && now - banner.current.from < banner.current.ms ? ({ lines: banner.current.lines, rgb: banner.current.rgb, t: (now - banner.current.from) / banner.current.ms } as Banner) : null;
  const logW = logs ? Math.min(96, Math.floor(W * 0.5)) : 0;
  const rows = overlay ? [] : field(s.scene, s.next, wipe, RAMP_NAMES[ramp], W - logW, fieldH, (now - t0) / 1000, p, { code: SLOTS.map((k) => s.slots[k]).join(" "), banner: bn });
  // Windowed, the code gets its own row under the lane; in stage mode it shares the row, so it loses the lane's width.
  const codeW = full ? W - 4 - LANE_PREFIX - 3 : leftW - 4;
  const beat = Math.floor(p.bar * 4), who = active(), step = Math.floor(p.bar * 16) % 16;
  const ambient = base.current?.style === "ambient";
  const openingAge = s.bar - baseStartedAt.current;
  const openingCue = ambient && openingAge >= 0 && openingAge < 4 ? ["touch + water", "rain + grain", "warm paper", "canopy"][openingAge] : "";
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
  const autoIn = s.options?.length && s.booth.find((g) => g.dj.id === s.options![0].agent)?.level === "auto" ? Math.max(0, s.autoAt - s.bar) : null;
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
    ["the screen / memory", [["f", "stage mode"], ["l / L", "next / previous look"], ["p", "palette"], ["c", "characters"], ["e", "live protocol log"], ["[ / ]", "capture last 4 s as A / B"], ["\\", "hear A then B; esc returns live"], ["M / H", "keep moment / replay or develop"], ["J", "clear favourite direction"], ["esc", "close this, cancel typing or a stack"], ["?", "these keys"], ["q", "quit"]]],
  ];

  // Dead air is the worst thing on a projector. A bare spinner says "something is happening"; this says how long it has
  // been happening and that the wait is bounded, which is the difference between suspense and a hang.
  const waiting = (
    <Box flexDirection="column">
      <Spinner label={thinkingLabel} />
      {!tight && <Text wrap="truncate">{"  "}{meter(thinkingFor / thinkingCeiling, 18)} <Text color={DIM}>of up to {Math.round(thinkingCeiling / 1000)}s{W - boothW >= 78 ? " · the music never waits" : ""}</Text></Text>}
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
      {!full && overlay !== "help" && <Box>
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
      {!full && overlay !== "help" && <Box>
        <Pane grad={grad} title="booth" note={tight ? undefined : `${s.booth.length}/3`} width={boothW} height={boothH} row>
          {s.booth.map((g) => {
            const on = g.dj.id === who.id, rise = Math.min(12, Math.floor((now - g.since) / 75)), art = tight ? [] : avatar(g.dj, p, on);
            const shown = g.since && !tight ? [...Array(12 - rise).fill(""), ...art.slice(0, rise)] : art, mine = SLOTS.filter((k) => authors.current[k]?.name === g.dj.name);
            return (
              <Box key={g.dj.id} flexDirection="column" width={tight ? undefined : 26} marginRight={tight ? 2 : 0}>
                {shown.map((r, i) => <Text key={i} wrap="truncate">{r || " "}</Text>)}
                <Text wrap="truncate">{fgc(accent(g.dj.palette), on ? 1 : 0.55)}{on ? "▸ " : "  "}{on ? "\x1b[1m" : ""}{g.dj.name}{"\x1b[22m"}{RESET}{g.level === "auto" ? <Text color={B} bold> AUTO</Text> : null}{g.remote ? <Text color={DIM}> wire</Text> : null}</Text>
                <Text color={DIM} wrap="truncate">  {g.taken}/{g.offered} taken{mine.length ? " · " + mine.join(" ") : ""}{g.calls ? <Text color={TEXT}>  calls {g.calls.hit}/{g.calls.hit + g.calls.miss + g.calls.flat}</Text> : null}</Text>
                {!tight && <Text wrap="truncate">  {SKILLS.map((k) => { const has = (g.dj.skills || []).includes(k.id), wait = g.pending.includes(k.id); return <Text key={k.id} color={has ? TEXT : wait ? B : FAINT} bold={wait && Math.floor(now / 400) % 2 === 0}>{k.glyph}{wait ? " k! " : " "}</Text>; })}<Text color={FAINT}>  k perform · K choose</Text></Text>}
              </Box>
            );
          })}
        </Pane>
        <Pane grad={grad} title={typing ? (typing === "tell" ? `you → ${who.name.toLowerCase()}` : "summon a dj") : question ? `${who.name.toLowerCase()} asks` : ((st.current.booth.filter((x) => !x.remote).length > 1 ? `the booth offers` : `${who.name.toLowerCase()} offers`) + (stacking ? " · STACK" : ""))} note={typing ? "enter to send · esc to cancel" : question ? "1 2 answer · t your own words · n skip" : s.options?.length ? (autoIn !== null ? `n vetoes · o takes control back` : (stacking ? "1 2 3 mark · enter lands them on one bar · 0 cancels" : "1 2 3 take · 0 stacks · lands next bar · n skip · t direct")) : ambient ? "a ask · t direct · k power · K choose · ? keys" : "a ask · t tell · s summon · ? keys"} width={W - boothW} height={boothH}>
          {shotCard.current && s.bar < shotCard.current.until && !typing ? <Text wrap="truncate">{fgc(shotCard.current.rgb)}{"\x1b[1m"}{shotCard.current.who}{"\x1b[22m"}{RESET} <Text color={DIM}>called</Text> <Text color={TEXT}>{shotCard.current.call}</Text> <Text color={DIM}>· measured</Text> <Text color={TEXT}>{shotCard.current.text}</Text>  <Text bold color={shotCard.current.grade === "hit" ? A : shotCard.current.grade === "miss" ? B : DIM}>{shotCard.current.grade === "hit" ? "● HIT" : shotCard.current.grade === "miss" ? "✗ MISS" : shotCard.current.grade === "flat" ? "○ FLAT" : "· ungraded"}</Text></Text> : null}
          {greet.current && s.bar < greet.current.until && !typing ? <Text wrap="truncate">{fgc(greet.current.rgb)}{"\x1b[1m"}{greet.current.who}{"\x1b[22m"}{RESET} <Text color={TEXT}>“{greet.current.text}”</Text></Text> : null}
          {typing ? <Box><Text color={A}>{typing === "summon" ? "a DJ who " : "› "}</Text><TextInput key={typing} placeholder={typing === "summon" ? "plays acid, a bit unhinged…" : "more rhythm · carve the rain · thinner and stranger…"} onSubmit={submit} /></Box>
            : question ? <>
              <Text color={TEXT} bold>{question.text}</Text>
              {question.answers.map((answer, index) => <Text key={answer.label}><Text color={A} bold> {index + 1} </Text><Text color={TEXT}>{answer.label}</Text></Text>)}
              {!tight && <Text color={DIM}>Choose a direction, then review its proposed move. t gives your own brief.</Text>}
            </>
            : s.options?.length ? <>
              {autoIn !== null ? <Text wrap="truncate"><Text color={B} bold>AUTO </Text><Text color={B}>{"▮".repeat(Math.max(0, 4 - autoIn)).padEnd(4, "▯")}</Text><Text color={TEXT} bold>  takes one of these in {bars(autoIn)}</Text><Text color={DIM}> · n vetoes</Text></Text> : null}
              {s.options.map((o, i) => (
                <Box key={o.id} flexDirection="column" marginTop={i && !tight ? 1 : 0}>
                  <Text wrap="truncate"><Text color={A} bold>{marks.current.has(o.id) ? " ● " : ` ${i + 1} `}</Text>{(() => { const gg = s.booth.find((x) => x.dj.id === o.agent); return gg && s.booth.filter((x) => !x.remote).length > 1 ? <Text>{fgc(accent(gg.dj.palette))}{gg.dj.name.toLowerCase()}{RESET} </Text> : null; })()}<Text color={B} bold>{moveVerb(o)} </Text><Text color={B}>{(o.parts?.length ? o.parts.map((x) => x.slot) : [o.slot]).join("+")}</Text>  <Text color={TEXT}>{o.why}</Text>{o.expect ? <Text color={A}>  calls {describeExpect(o.expect)}</Text> : null}{SKILLS.filter((k) => k.uses(o.code, o)).map((k) => <Text key={k.id} color={B} bold>  {k.glyph} {k.name.toLowerCase()}</Text>)}<Text color={FAINT}>   {o.angle === "wire" ? "guest proposal" : "composed"}{o.ms ? ` · ${(o.ms / 1000).toFixed(1)}s` : ""}{o.agent !== who.id ? ` · ${o.agent}` : ""}</Text></Text>
                  {!tight && <Text wrap="truncate-end"><Text color={DIM}>      {o.diff}</Text></Text>}
                  {!tight && <Text wrap="truncate"><Text color={FAINT}>      ↳ {o.evidence}</Text></Text>}
                </Box>
              ))}
              {thinking && s.options.length < 3 ? <Box marginTop={1}>{waiting}</Box> : null}
            </> : thinking ? waiting
            : <Text color={say.includes("“") ? TEXT : DIM} wrap="wrap">{say || "…"}</Text>}
          <Box flexGrow={1} />
          {paneBusy && say ? <Text wrap="truncate"><Text color={B} bold>› </Text><Text color={TEXT}>{say}</Text></Text> : null}
          {!tight && <Text wrap="truncate"><Text color={FAINT}>{s.history.slice(-24).map((h) => (h.verdict === "y" ? "●" : h.verdict === "x" ? "×" : "·")).join(" ")}</Text>{s.note ? <Text color={DIM}>   note: “{s.note}”</Text> : null}</Text>}
        </Pane>
      </Box>}

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
      {!overlay && <Box>
        <Box flexDirection="column" width={W - logW}>{rows.map((r, i) => <Text key={i} wrap="truncate">{r}</Text>)}</Box>
        {logs && <Box flexDirection="column" width={logW} height={fieldH} paddingLeft={2} overflow="hidden">
          <Text wrap="truncate"><Text bold>{grad("the wire")}</Text><Text color={DIM}>  every message between host, agents and you · also in tui/logs/latest.jsonl</Text></Text>
          {bus.recent.filter((m) => !m.same && m.type !== "state" && (m.type !== "request" || m.angle === "fix")).slice(-(fieldH - 1)).map((m, i) => { const l = pretty(m), c = ({ proposal: Argb, grant: Argb, unlock: Argb, enter: Argb, verdict: Brgb, rejected: Brgb, error: Brgb, note: Trgb, applied: Trgb, active: Trgb, landed: Trgb } as Record<string, number[]>)[m.type] ?? Drgb; return <Text key={m.t + ":" + i} wrap="truncate">{fgc(Frgb, 1.6)}{l.time.slice(3)} {fgc(c)}{l.type.padEnd(12)}{fgc(Drgb)}{l.from.slice(0, 12).padEnd(13)}{fgc(m.type === "proposal" || m.type === "verdict" || m.type === "note" ? Trgb : Drgb)}{l.text}{RESET}</Text>; })}
        </Box>}
      </Box>}

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
        )) : <Text color={DIM} wrap="truncate">{thinkingLabel || say}</Text>}
        <Text wrap="truncate">{say && (s.options?.length || question) ? <><Text color={B} bold>› </Text><Text color={TEXT}>{say}</Text></> : " "}</Text>
      </Box>}
      <Text wrap="truncate" color={DIM}> {moments.current?.playing ? "REPLAY · meters track live" : `A ${moments.current?.A ? "●" : "○"}  B ${moments.current?.B ? "●" : "○"}`}  {inspiration.current ? `${favouriteStatus} · J clear | favourite: ${inspiration.current.intent} · ${inspiration.current.label} | ` : ""}{momentStatus}</Text>
      <Box justifyContent="space-between" paddingX={1}>
        {/* Stage mode drops the pane notes, which is where "1 2 3 take · n skip" lived. The round's own keys move here
            so the performer is never looking at options with no way to know what answers them. */}
        <Box flexGrow={1} flexShrink={1}><Text color={DIM} wrap="truncate">{full
          ? <><Text color={B}>1 2 3</Text> take   <Text color={B}>n</Text> skip   <Text color={B}>t</Text> direct   <Text color={B}>a</Text> ask   <Text color={B}>g</Text> new base   <Text color={B}>?</Text> keys   <Text color={B}>f</Text> window</>
          : <><Text color={B}>?</Text> keys   <Text color={B}>g</Text> new base   <Text color={B}>d</Text> dj   <Text color={B}>o</Text> takeover   <Text color={B}>e</Text> wire   <Text color={B}>f</Text> stage</>}</Text></Box>
        <Box flexShrink={0}><Text color={DIM} wrap="truncate">{s.scene.look} · {s.scene.palette} · {RAMP_NAMES[ramp]}</Text></Box>
      </Box>
    </Box>
    </ThemeProvider>
  );
}

render(<App />);
