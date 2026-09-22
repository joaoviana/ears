import { applyPatch, describe, type Patch } from "./patch.ts";
import { validate, type Suggestion } from "./agent.ts";
import { missing } from "./skills.ts";
import { METRICS, parseExpect, type Expect } from "./shots.ts";
import type { Context, Evidence } from "./evidence.ts";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(x => typeof x === "string");
const edits = (value: unknown): value is Patch["set"] => Array.isArray(value) && value.every(x => isRecord(x) && typeof x.key === "string" && typeof x.value === "string");

export type Inbound = { v: 0; type: "proposal" | "note" } & Record<string, unknown>;
export const isInbound = (value: unknown): value is Inbound => isRecord(value) && value.v === 0 && (value.type === "proposal" || value.type === "note");

export type RemoteResult = { agent: string; greeting?: string } & (
  | { kind: "note"; text: string }
  | { kind: "proposal"; suggestion: Suggestion; context: Context }
  | { kind: "rejected"; reason: string; request_id?: string }
);

/** Untrusted wire data becomes a checked suggestion here, never inside a React effect. */
export class RemoteProposals {
  private seen = new Set<string>();
  constructor(private evidence: Evidence, private slots: readonly string[]) {}

  receive(m: Inbound): RemoteResult {
    const agent = (typeof m.from === "string" ? m.from : "guest").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 24) || "guest";
    const greeting = typeof m.greeting === "string" ? m.greeting.slice(0, 200) : undefined;
    const context: Context = {
      request_id: typeof m.request_id === "string" ? m.request_id : undefined,
      based_on_revision: typeof m.based_on_revision === "string" ? m.based_on_revision : undefined,
      evidence_ids: strings(m.evidence_ids) ? m.evidence_ids : [],
      expected_change: typeof m.expected_change === "string" ? m.expected_change : undefined,
    };
    const reject = (reason: string): RemoteResult => ({ kind: "rejected", agent, request_id: context.request_id, reason });
    if (m.type === "note") return typeof m.text === "string"
      ? { kind: "note", agent, greeting, text: m.text.slice(0, 200) }
      : reject("text must be a string");

    if (context.request_id && this.seen.has(context.request_id)) return reject("duplicate request_id; inspect the original outcome");
    if (context.request_id) this.seen.add(context.request_id);
    const stale = this.evidence.check(context);
    if (stale) return reject(stale);
    if (!context.request_id) return reject("request_id is required");
    if (typeof m.why !== "string" || !m.why.trim() || typeof m.evidence !== "string" || !m.evidence.trim()) return reject("why and evidence are required");
    if (m.code != null && typeof m.code !== "string") return reject("code must be a string");
    if (m.evidence_ids != null && !strings(m.evidence_ids)) return reject("evidence_ids must be an array of strings");
    if (m.code == null && !edits(m.set)) return reject("set must be an array of key/value strings");
    if (m.remove != null && !strings(m.remove)) return reject("remove must be an array of strings");
    if (m.replace != null && typeof m.replace !== "boolean") return reject("replace must be a boolean");
    if (typeof m.slot !== "string" || !this.slots.includes(m.slot)) return reject("unknown slot");

    const slot = m.slot, before = this.evidence.slots[slot] || "";
    const patch: Patch = { slot, set: edits(m.set) ? m.set : [], remove: strings(m.remove) ? m.remove : [], replace: m.replace === true };
    const code = typeof m.code === "string" ? m.code.trim() : applyPatch(before, patch);
    const bad = validate({ slot, code }) || (missing(code, {}, []) ? `uses ${missing(code, {}, [])}, which this agent hasn't been granted` : null);
    if (bad) return reject(bad);

    let expect: Expect | null = null;
    if (m.expect != null) {
      const prediction = m.expect;
      if (!isRecord(prediction) || typeof prediction.metric !== "string" || !METRICS.some(metric => metric === prediction.metric)
        || typeof prediction.dir !== "string" || !["up", "down", "same"].includes(prediction.dir)) return reject("expect must contain a known metric and dir up, down or same");
      // Both discriminants were checked against the host's vocabulary.
      expect = { metric: prediction.metric as Expect["metric"], dir: prediction.dir as Expect["dir"] };
    } else expect = parseExpect(`EXPECT ${context.expected_change ?? ""}`);
    if (!expect) return reject('a proposal must predict a measurable effect: expect {metric, dir} or expected_change "<metric> <up|down|same>"');

    const diff = typeof m.code === "string" ? "rewrite" : describe(before, patch);
    return { kind: "proposal", agent, greeting, context, suggestion: {
      slot, code, parts: [{ slot, code, diff }], diff, expect,
      why: m.why.slice(0, 140), evidence: m.evidence.slice(0, 140), angle: "wire", ms: 0,
    } };
  }
}
