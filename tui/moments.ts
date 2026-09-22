import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import type { Engine, ClipCapture } from "./engine.ts";
import type { Bus, Msg } from "./bus.ts";

export interface Moment {
  version: 1;
  id: string;
  session_id: string;
  saved_at: number;
  label: string;
  favorite: boolean;
  clip: ClipCapture & { uri: string; sha256: string; channels: 2; tap: "post-master/pre-volume" };
  context_at_request: Record<string, unknown>;
  state_at_window_start: Msg | null;
  events: Msg[];
  observation_ids: string[];
  execution_ids: string[];
  timing_basis: "engine_clock_estimate";
  timing_uncertainty_ms: null;
  attribution: "unverified";
}

/** Retain the state preceding the audio window AND changes inside it; never label a mixed clip with one revision. */
export function windowEvidence(events: Msg[], start: number, end: number) {
  const inside = events.filter(e => e.t >= start && e.t <= end);
  const observations = events.filter(e => e.type === "observation" && e.window &&
    Number((e.window as any).start_ms) <= end && Number((e.window as any).end_ms) >= start);
  return {
    state_at_window_start: events.filter(e => e.type === "state" && e.t <= start).at(-1) ?? null,
    events: inside,
    observation_ids: observations.map(e => String(e.id)),
    execution_ids: [...new Set(inside.flatMap(e => typeof e.execution_id === "string" ? [e.execution_id] : []))],
  };
}

/** Verify that the server closed a complete stereo WAV before publishing it as evidence. */
export function verifyWave(file: string, capture: ClipCapture) {
  const data = fs.readFileSync(file);
  if (data.length < 44 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WAVE") throw new Error("invalid WAV capture");
  let channels = 0, rate = 0, frameBytes = 0, audioBytes = 0;
  for (let at = 12; at + 8 <= data.length;) {
    const kind = data.toString("ascii", at, at + 4), size = data.readUInt32LE(at + 4), from = at + 8;
    if (from + size > data.length) throw new Error("incomplete WAV capture");
    if (kind === "fmt " && size >= 16) { channels = data.readUInt16LE(from + 2); rate = data.readUInt32LE(from + 4); frameBytes = data.readUInt16LE(from + 12); }
    if (kind === "data") audioBytes += size;
    at = from + size + (size % 2);
  }
  if (channels !== 2 || rate !== capture.sample_rate || !frameBytes || audioBytes / frameBytes !== capture.frames || capture.frames <= 0) throw new Error("WAV metadata does not match the capture receipt");
  return createHash("sha256").update(data).digest("hex");
}

// Small, testable transport boundary; the actual adapter is Engine.
type AudioEngine = Pick<Engine, "captureClip" | "audition" | "stopAudition"> & Pick<EventEmitter, "on" | "off">;
type Wire = { session: string } & Pick<Bus, "recent" | "send"> & Pick<EventEmitter, "on" | "off">;

export class Moments extends EventEmitter {
  A?: Moment;
  B?: Moment;
  capturing = false;
  playing = "";
  private history: Msg[];
  private queue: Moment[] = [];
  private playId = "";
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private remember = (m: Msg) => {
    if (!["state", "observation", "active", "applied", "scheduled", "error", "transition", "outcome"].includes(m.type)) return;
    this.history.push(m);
    const cutoff = Date.now() - 60000;
    const preceding = this.history.filter(e => e.type === "state" && e.t < cutoff).at(-1);
    this.history = [...(preceding ? [preceding] : []), ...this.history.filter(e => e.t >= cutoff)];
  };
  private heard = (event: { id: string; status: string; error?: string }) => {
    if (event.id !== this.playId) return;
    if (event.status === "error") { this.stop(event.error || "audition failed"); return; }
    if (event.status === "playing") { this.emit("change", `playing ${this.playing} · esc returns live`); return; }
    if (event.status === "ended") { clearTimeout(this.timer); this.next(); }
  };

  constructor(private engine: AudioEngine, private wire: Wire, readonly dir: string) {
    super(); this.history = wire.recent.slice();
    wire.on("msg", this.remember); engine.on("audition", this.heard);
  }

  async capture(kind: "A" | "B" | "favorite", context: Record<string, unknown>, seconds = 4): Promise<Moment> {
    if (this.closed) throw new Error("session closed");
    if (this.capturing) throw new Error("a capture is already being saved");
    if (this.playing) throw new Error("return live with esc before capturing");
    this.capturing = true;
    const id = randomUUID(), file = path.join(this.dir, id + ".wav");
    const contextCopy = structuredClone(context);
    this.emit("change", `saving ${kind === "favorite" ? "this moment" : kind}…`);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const clip = await this.engine.captureClip(file, seconds);
      if (this.closed) throw new Error("session closed during capture");
      const sha256 = verifyWave(file, clip);
      const moment: Moment = {
        version: 1, id, session_id: this.wire.session, saved_at: Date.now(),
        label: `${kind === "favorite" ? "kept" : kind} · bar ${contextCopy.bar ?? "?"} · ${contextCopy.tempo ?? "?"} bpm`,
        favorite: kind === "favorite", clip: { ...clip, path: file, uri: pathToFileURL(file).href, sha256, channels: 2, tap: "post-master/pre-volume" },
        context_at_request: contextCopy, ...windowEvidence(this.history, clip.start_ms, clip.end_ms),
        timing_basis: "engine_clock_estimate", timing_uncertainty_ms: null, attribution: "unverified",
      };
      // Publish the manifest only once the WAV is complete; an interrupted write is never a memory entry.
      const manifest = path.join(this.dir, id + ".json"), temp = manifest + ".tmp";
      fs.writeFileSync(temp, JSON.stringify(moment, null, 2) + "\n", { flag: "wx" });
      fs.renameSync(temp, manifest);
      if (kind !== "favorite") this[kind] = moment;
      this.wire.send("audio_artifact", "host", { id, role: kind, artifact: moment.clip, observation_ids: moment.observation_ids, execution_ids: moment.execution_ids, timing_basis: moment.timing_basis, timing_uncertainty_ms: null, attribution: "unverified", manifest });
      if (moment.favorite) this.wire.send("preference", "human", { artifact_id: id, decision: "keep", manifest });
      this.emit("change", `${moment.label} saved · ${(clip.frames / clip.sample_rate).toFixed(1)} s${moment.favorite ? " · H opens memories" : " · \\ plays A/B"}`);
      return moment;
    } catch (error) {
      this.emit("change", `couldn't save moment: ${(error as Error).message}`);
      if (!this.closed) this.wire.send("capture_error", "host", { reason: (error as Error).message });
      throw error;
    } finally { this.capturing = false; }
  }

  favorites(): Moment[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir).filter(f => f.endsWith(".json")).flatMap(f => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")) as Moment;
        if (m.version !== 1 || !m.favorite || typeof m.id !== "string" || !m.clip || path.resolve(m.clip.path) !== path.join(path.resolve(this.dir), m.id + ".wav") || !fs.existsSync(m.clip.path)) return [];
        return [m];
      } catch { return []; }
    }).sort((a, b) => b.saved_at - a.saved_at);
  }

  play(moments: Moment[]) {
    if (this.closed || this.capturing) throw new Error("wait for capture to finish");
    if (!moments.length) throw new Error("capture A and B first");
    // Check every clip before replacing live output. Missing/corrupt B must not leave half an A/B demonstration.
    for (const m of moments) if (verifyWave(m.clip.path, m.clip) !== m.clip.sha256) throw new Error("saved audio has changed since capture");
    this.stop(); this.queue = moments.slice(); this.next();
  }
  private next() {
    const moment = this.queue.shift();
    if (!moment) { this.stop(); return; }
    this.playId = randomUUID(); this.playing = moment.label;
    this.wire.send("audition", "human", { artifact_id: moment.id, status: "requested", mode: "live_observation", attribution: "unverified" });
    this.emit("change", `loading ${this.playing}…`);
    this.timer = setTimeout(() => this.stop("audition timed out; returned live"), moment.clip.frames / moment.clip.sample_rate * 1000 + 5000);
    this.engine.audition(moment.clip.path, this.playId);
  }
  stop(reason = "live · patterns kept running during replay") {
    const hadPlayback = !!this.playing;
    this.playId = ""; this.playing = ""; this.queue = []; clearTimeout(this.timer);
    this.engine.stopAudition();
    if (hadPlayback) { this.wire.send("audition", "host", { status: "stopped", reason }); this.emit("change", reason); }
  }
  close() {
    if (this.closed) return;
    this.stop(); this.closed = true;
    this.wire.off("msg", this.remember); this.engine.off("audition", this.heard);
  }
}
