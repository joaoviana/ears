import type { Moment } from "./moments.ts";
import { parseSlot } from "./patch.ts";

export const DEVELOP = {
  rhythm: "Mutate its rhythm",
  answer: "Answer its melody",
  transform: "Bring it back transformed",
} as const;
export type Development = keyof typeof DEVELOP;
/** A selected reference is persistent state; it must never masquerade as a running request. */
export function developmentStatus(state: {
  busy: boolean; startedAt: number; now: number; options: number;
  hasReport: boolean; localDjs: number; error: string; autoTake: boolean;
}): string {
  if (state.options) return `${state.options} idea${state.options === 1 ? "" : "s"} ready · ${state.autoTake ? "auto armed · n veto" : `${Array.from({ length: state.options }, (_, i) => i + 1).join("/")} take`}`;
  if (state.busy) return `DJs working · ${Math.max(0, Math.floor((state.now - state.startedAt) / 1000))}s`;
  if (!state.localDjs) return "no local DJ · d brings one in";
  if (!state.hasReport) return "waiting for listening report";
  if (state.error) return `no ideas: ${state.error} · a retry`;
  return "reference selected · a asks for ideas";
}
export interface Inspiration {
  artifact_id: string;
  label: string;
  intent: Development;
  context: string;
  source_basis: string;
  slots: Record<string, string>;
  mixed_window: boolean;
}

function source(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([slot, code]) =>
    /^d[1-6]$/.test(slot) && typeof code === "string" && code.length <= 1200 &&
    code.trim().startsWith(`~d.(\\${slot},`) && parseSlot(code).length ? [[slot, code.trim()]] : []));
}

/** Saved source is inspiration, not a reconstruction of the captured waveform. Never merge different snapshots. */
export function developMoment(moment: Moment, intent: Development): Inspiration {
  const ctx = moment.context_at_request ?? {}, preceding = moment.state_at_window_start;
  const candidates = [
    { value: ctx.active_slots, basis: "active source at capture request", context: ctx },
    { value: preceding?.active_slots, basis: "active source before the estimated clip window", context: preceding },
    { value: ctx.slots, basis: "submitted source at capture request; activation unverified", context: ctx },
    { value: preceding?.slots, basis: "submitted source before the estimated clip window; activation unverified", context: preceding },
  ];
  for (const candidate of candidates) {
    const slots = source(candidate.value);
    if (!Object.keys(slots).length) continue;
    return {
      artifact_id: moment.id, label: moment.label, intent, slots, source_basis: candidate.basis,
      context: `tempo ${candidate.context?.tempo ?? "unknown"}; key ${candidate.context?.key ?? "unknown"}`,
      mixed_window: (moment.events ?? []).some(e => ["active", "transition"].includes(e.type)),
    };
  }
  throw new Error("This moment has no saved pattern source to develop. Replay it or keep a new moment with M.");
}

const INTENT: Record<Development, string> = {
  rhythm: "Preserve a recognisable accent/rest pattern from the favourite; mutate its displacement, subdivision or phrase ending. Map it onto a suitable CURRENT voice.",
  answer: "Take a recognisable motif or contour from the favourite and write an answering phrase in its gaps. Adapt its pitches to the CURRENT harmony. If the source has no pitched motif, answer its rhythmic contour with an in-key melody.",
  transform: "Bring back a recognisable motif from the favourite in a different register, instrument or rhythmic setting. Keep one clear feature and name what survives.",
};

export function inspirationPrompt(inspiration?: Inspiration | null): string {
  if (!inspiration) return "";
  return [
    "FAVOURITE CHOSEN BY THE PERFORMER — SOURCE REFERENCE, NOT LIVE CODE",
    `Artifact: ${inspiration.artifact_id}; ${inspiration.label}`,
    `Saved context: ${inspiration.context}. Source basis: ${inspiration.source_basis}.`,
    "You have NOT heard this clip. Source-to-audio attribution is unverified; do not claim you heard or extracted a motif.",
    ...(inspiration.mixed_window ? ["The clip overlaps a change/transition; this snapshot does not describe every sound in it."] : []),
    ...Object.entries(inspiration.slots).map(([slot, code]) => `SAVED ${slot}: ${code}`),
    `DEVELOPMENT REQUEST: ${INTENT[inspiration.intent]}`,
    "Every angle develops this reference in its own way. This request takes priority over the round's generic challenge; an explicit performer note takes priority over this request.",
    "Propose a PATCH TO THE CURRENT CODE, using the current tempo/key and currently unlocked skills. Never restore the whole old set, change the global tempo, or use unavailable samples. Borrow rhythm/notes and adapt to current instruments when needed.",
    "WHY names the recognisable feature and your transformation. EVIDENCE identifies the saved slot/pattern that inspired it. Choosing this reference is not permission to execute or replay anything.",
  ].join("\n");
}
