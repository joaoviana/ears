import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import chokidar, { type FSWatcher } from "chokidar";
import { Bus } from "./bus.ts";
import { Engine } from "./engine.ts";
import { Evidence, type Context } from "./evidence.ts";
import { Speech } from "./platform.ts";
import { RemoteProposals, type Inbound, type RemoteResult } from "./remote.ts";
import { LiveGrading } from "./live-grading.ts";
import { ensureVox, phrasesIn } from "./skills.ts";

export const SLOTS = ["d1", "d2", "d3", "d4", "d5", "d6"];
type SessionEvents = {
  edit: [edit: { slot: string; code: string }];
  status: [status: { slot: string; text: string; phase: "queued" | "active" | "failed"; code?: string }];
  active: [slot: string];
  remote: [message: Exclude<RemoteResult, { kind: "rejected" }>];
  log: [message: string];
};

/** Owns source files, transport admission and execution receipts. Presentation stays with its caller. */
export class Session extends EventEmitter<SessionEvents> {
  readonly bus = new Bus();
  readonly engine = new Engine();
  readonly speech = new Speech();
  readonly evidence = new Evidence(this.bus.session, (type, from, body) => this.bus.send(type, from, body));
  readonly grading = new LiveGrading(this.evidence, this.bus, SLOTS);
  /** ambient gestures take seconds to arrive: the check's after-window waits this long past activation */
  settle(ms: number) { this.evidence.settleMs = ms; }
  private remote = new RemoteProposals(this.evidence, SLOTS);
  private hostWrites = new Map<string, string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private watcher?: FSWatcher;
  private closing?: Promise<void>;
  private closed = false;
  private opened = false;
  private context: Record<string, unknown> = {};

  constructor(readonly directory: string, readonly demo = false) { super(); }

  read(slot: string) {
    if (!SLOTS.includes(slot)) throw new Error("unknown slot");
    try { return fs.readFileSync(path.join(this.directory, slot + ".scd"), "utf8"); } catch { return ""; }
  }
  refresh(context = this.context) {
    this.context = context;
    return this.evidence.sync(Object.fromEntries(SLOTS.map(slot => [slot, this.read(slot)])), context);
  }
  syncContext(context: Record<string, unknown>) {
    this.context = context;
    return this.evidence.sync(this.evidence.slots, context);
  }
  write(slot: string, code: string) {
    if (!SLOTS.includes(slot)) throw new Error("unknown slot");
    fs.writeFileSync(path.join(this.directory, slot + ".scd"), code + "\n");
    this.hostWrites.set(slot, code.trim());
  }
  evaluate(slot: string, code: string, author: string, context: Context = {}) {
    if (this.closed) return;
    if (!SLOTS.includes(slot)) throw new Error("unknown slot");
    if (!this.demo && !this.engine.ready) { this.refresh(); return; }
    const execution = this.evidence.begin(slot, code.trim(), author, context);
    const run = () => {
      if (!this.closed && this.evidence.current(execution)) this.engine.eval(code.trim() || `~hush.(\\${slot})`, slot, execution);
    };
    if (this.demo) this.evidence.evaluated(execution, false, "demo mode has no audio engine");
    else if (phrasesIn(code).length) ensureVox(this.engine, code, this.speech.voiceFor(author)).then(run,
      error => { if (!this.closed) this.evidence.evaluated(execution, false, String(error)); });
    else run();
  }

  open(context: Record<string, unknown>, port?: number, logDirectory?: string) {
    if (this.opened || this.closed) throw new Error("session already opened or closed");
    this.opened = true;
    this.bus.on("fault", error => this.emit("log", error.message));
    this.bus.on("inbound", this.receive);
    this.bus.open(port, logDirectory);
    this.bus.send("hello", "host", { host: "ears-tui", protocol: 0, profile: "ears/music", capabilities: ["evidence-v1", "revision-guard", "execution-receipts", "live-comparison", "audio-artifacts-v1", "human-preference-v1"], log: this.bus.path });
    this.refresh(context);
    this.engine.on("evald", ({ id, ok, msg, execution_id, scheduled_at_ms }) => {
      if (this.closed || !this.evidence.current(execution_id)) return;
      const previous = this.evidence.activeSlots[id];
      this.evidence.evaluated(execution_id, ok, msg, scheduled_at_ms);
      if (ok) this.emit("status", { slot: id, text: "queued for the next phrase", phase: "queued" });
      else {
        // Invalid source must never remain on disk or become the basis for the next suggestion. The speakers kept
        // playing the last good Pdef; make the source and UI tell the same truth immediately.
        if (previous !== undefined) {
          this.write(id, previous);
          this.evidence.sync({ ...this.evidence.slots, [id]: previous }, this.context);
        }
        this.emit("status", { slot: id, text: msg, phase: "failed", code: previous });
      }
    });
    this.engine.on("active", ({ slot, execution_id, at, basis }) => {
      if (this.closed) return;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (!this.evidence.active(execution_id, at, basis)) return;
        this.emit("status", { slot, text: "active in the speakers", phase: "active" });
        this.emit("active", slot);
      }, Math.max(0, at - Date.now()));
      this.timers.add(timer);
    });
    this.engine.on("log", message => {
      if (this.closed) return;
      this.bus.send("engine_log", "engine", { reason: message });
      this.emit("log", message);
    });
    this.watcher = chokidar.watch(this.directory, { ignoreInitial: true }).on("all", (_event, file) => {
      const slot = path.basename(file, ".scd");
      if (this.closed || !file.endsWith(".scd") || !SLOTS.includes(slot)) return;
      const code = this.read(slot), ownWrite = this.hostWrites.get(slot);
      this.hostWrites.delete(slot);
      if (ownWrite !== code.trim()) this.emit("edit", { slot, code });
    }).on("error", error => this.emit("log", String(error)));
    void this.speech.load();
  }

  private receive = (message: Inbound) => {
    if (this.closed) return;
    this.refresh();
    const result = this.remote.receive(message);
    if (result.kind === "rejected") this.bus.send("rejected", result.agent, { request_id: result.request_id, reason: result.reason, angle: "wire" });
    else this.emit("remote", result);
  };

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear(); this.speech.close();
    this.evidence.close(); this.grading.close();
    if (this.opened) this.bus.send("session_end", "host");
    this.bus.off("inbound", this.receive);
    this.engine.stop();
    return this.closing = Promise.all([this.watcher?.close(), this.bus.close()]).then(() => { this.removeAllListeners(); });
  }
}
