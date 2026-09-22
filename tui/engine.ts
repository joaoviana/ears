// Owns the sclang child process and the OSC socket. Everything the TUI knows about the sound arrives here.
import dgram from "dgram";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { fileURLToPath } from "node:url";
import { findSclang } from "./platform.ts";
import { readOsc } from "./osc-reader.ts";
import type { SlotFrame } from "./slotears.ts";
import { EventEmitter } from "events";
import * as osc from "osc-min";
import { randomUUID } from "node:crypto";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export interface Ears { rms: number; peak: number; centroid: number; flatness: number; bands: number[]; side: number; headroomPeak: number }
export interface Hit { slot: string; inst: string; at: number; amp: number; step: number; offGrid: number }
export interface ClipCapture { path: string; frames: number; sample_rate: number; start_ms: number; end_ms: number; ring_end_frame?: number; ring_frames?: number }

export interface EngineEvents {
  ready: [];
  log: [message: string];
  stopping: [];
  ears: [frame: Ears];
  onset: [];
  scope: [samples: number[]];
  hit: [hit: Hit];
  bar: [bar: { n: number; at: number; bpm: number }];
  slotears: [frame: SlotFrame & { side: number; slow: number; fast: number }];
  voxd: [phrase: string];
  clipd: [clip: ClipCapture & { id: string; error?: string }];
  audition: [event: { id: string; status: string; error?: string }];
  dropped: [kind: string];
  evald: [receipt: { id: string; ok: boolean; msg: string; execution_id: string; scheduled_at_ms?: number }];
  active: [receipt: { slot: string; execution_id: string; at: number; basis: string }];
}

export class Engine extends EventEmitter<EngineEvents> {
  private sock = dgram.createSocket("udp4");
  private sc: ChildProcess | null = null;
  private lang = 0;
  private stopped = false;
  private starting?: Promise<void>;
  ready = false;
  /** what the audio device is really running at; 24000 means a Bluetooth headset with its microphone on */
  sampleRate = 0;
  private headPeak = 0;
  private clock = new EngineClock();
  private toLocal(scSeconds: number, latency: number, observedSeconds = scSeconds) {
    return this.clock.map(scSeconds, latency, observedSeconds);
  }

  /** Async startup keeps the TUI responsive; stop() also cancels a pending boot. */
  start(mute = false): Promise<void> {
    return this.starting ??= this.boot(mute).catch(error => {
      if (!this.stopped) this.emit("log", `engine startup failed: ${error.message}`);
      this.stop();
    });
  }

  private async boot(mute: boolean) {
    const sclang = await findSclang(ROOT);
    if (this.stopped) return;
    const port = Number(process.env.EARS_SC_PORT || 57110);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid EARS_SC_PORT");
    // Never kill another performance just because its process name matches. An occupied port is actionable.
    const probe = dgram.createSocket("udp4");
    await new Promise<void>((resolve, reject) => {
      probe.once("error", error => { probe.close(); reject(new Error(`audio port ${port} unavailable (${error.message}); stop its owner or choose EARS_SC_PORT`)); });
      probe.bind(port, "127.0.0.1", () => probe.close(() => resolve()));
    });
    if (this.stopped) return;
    this.sock.on("message", buf => this.onMessage(buf));
    await new Promise<void>((resolve, reject) => {
      this.sock.once("error", reject);
      this.sock.bind(Number(process.env.EARS_PORT || 57200), "127.0.0.1", () => {
        this.sock.off("error", reject);
        resolve();
      });
    });
    if (this.stopped) return;
    this.sock.on("error", error => this.emit("log", `engine socket error: ${error.message}`));
    this.sc = spawn(sclang, [path.join(ROOT, "tui/engine.scd")], { env: { ...process.env, ...(mute ? { SOUNDCHECK_MUTE: "1" } : {}) } });
    this.sc.stdout?.on("data", (d: Buffer) => {
      for (const line of String(d).split("\n")) if (line.trim() && (process.env.EARS_ENGINE_DEBUG || /ERROR|WARNING|FAILURE/.test(line)) && !/n_set|Node \d+ not found/.test(line)) this.emit("log", line.trim());
    });
    this.sc.stderr?.on("data", (d: Buffer) => this.emit("log", String(d).trim()));
    this.sc.on("error", error => { this.emit("log", `engine process error: ${error.message}`); this.stop(); });
    this.sc.on("exit", () => { this.ready = false; this.emit("log", "engine exited"); this.stop(); });
  }

  private onMessage(buf: Buffer) {
    if (this.stopped) return;
    let dispatch: (() => void) | undefined;
    const event = <K extends keyof EngineEvents>(type: K, ...args: EngineEvents[K]) => {
      // Node's EventEmitter adds reserved-event conditional types; the public map above owns these events.
      const emit = this.emit.bind(this) as <E extends keyof EngineEvents>(name: E, ...values: EngineEvents[E]) => boolean;
      dispatch = () => { emit(type, ...args); };
    };
    try {
      const m = readOsc(buf), n = m.number, s = m.string;
      switch (m.address) {
        case "/ready": {
          const port = n(0), sampleRate = n(1, 0);
          if (!Number.isInteger(port) || port < 1 || port > 65535) return;
          this.lang = port; this.sampleRate = sampleRate; this.ready = true; event("ready"); break;
        }
        case "/ears": event("ears", { rms: n(0), peak: n(1), centroid: n(2), flatness: n(3), bands: m.numbers(4, 9), side: n(9, 0), headroomPeak: this.headPeak }); break;
        case "/onset": event("onset"); break;
        case "/scope": event("scope", m.numbers()); break;
        case "/hit": event("hit", { slot: s(0), inst: s(1), at: this.toLocal(n(4), n(2)), amp: n(3), step: Math.floor(((n(5) % 4) + 4) % 4 * 4 + 0.001) % 16, offGrid: n(6, 0) }); break;
        case "/bar": event("bar", { n: n(0), at: this.toLocal(n(3), n(1)), bpm: n(2) }); break;
        case "/head": this.headPeak = Math.max(this.headPeak * 0.92, n(0)); break;
        case "/slotears": event("slotears", { slot: "d" + n(0), rms: n(1), centroid: n(2), bands: m.numbers(3, 8), side: n(8, 0), slow: n(9, 0), fast: n(10, 0) }); break;
        case "/voxd": event("voxd", s(0)); break;
        case "/clipd": {
          const end = this.toLocal(n(4), 0, n(5)), frames = n(2), rate = n(3);
          if (frames < 0 || rate <= 0) return;
          event("clipd", { id: s(0), path: s(1), frames, sample_rate: rate, start_ms: end - frames / rate * 1000, end_ms: end, error: s(6, ""), ring_end_frame: m.optionalNumber(7), ring_frames: m.optionalNumber(8) }); break;
        }
        case "/audition": event("audition", { id: s(0), status: s(1), error: s(2, "") }); break;
        case "/dropped": event("dropped", s(0)); break;
        case "/evald": event("evald", { id: s(0), ok: n(1) === 1, msg: s(2), execution_id: s(3), scheduled_at_ms: n(4) > 0 ? this.toLocal(n(4), n(5), n(6)) : undefined }); break;
        case "/active": event("active", { slot: s(0), execution_id: s(1), at: this.toLocal(n(3), n(2), n(5)), basis: s(4) }); break;
      }
    } catch { return; /* Malformed UDP packets cannot become engine events. */ }
    dispatch?.();
  }

  private send(address: string, args: (string | number)[]) {
    if (!this.lang) return;
    try { this.sock.send(osc.toBuffer({ address, args: args.map(v => typeof v === "number" ? { type: "float" as const, value: v } : v) }), this.lang, "127.0.0.1"); }
    catch (error) { if (!this.stopped) this.emit("log", `engine send failed: ${(error as Error).message}`); }
  }
  eval(code: string, id: string, executionId = "") { this.send("/eval", [code, id, executionId]); }
  volume(v: number) { this.send("/vol", [v]); }
  vox(phrase: string, file: string) { this.send("/vox", [phrase, file]); }
  tempo(bpm: number, bars = 0) { this.send("/tempo", [bpm, bars]); }
  transition(kind: "build" | "wash" | "riser", bars: number, releaseBars = 2) { this.send("/transition", [kind, bars, releaseBars]); }

  captureClip(file: string, seconds = 4): Promise<ClipCapture> {
    if (!this.ready) return Promise.reject(new Error("audio engine is not ready"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.off("clipd", done); this.off("stopping", stopped); };
      const stopped = () => { cleanup(); reject(new Error("engine stopped")); };
      const done = (clip: ClipCapture & { id: string; error?: string }) => {
        if (clip.id !== id) return;
        cleanup();
        if (clip.error) reject(new Error(clip.error));
        else if (!fs.existsSync(file) || fs.statSync(file).size < 44) reject(new Error("engine did not write an audio clip"));
        else resolve(clip);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error("audio capture timed out")); }, 10000);
      this.on("clipd", done); this.once("stopping", stopped);
      this.send("/clip", [id, file, Math.max(0.1, Math.min(24, seconds))]);
    });
  }
  audition(file: string, id: string) { this.send("/audition/play", [id, file]); }
  stopAudition() { this.send("/audition/stop", []); }

  /** Quits this engine's own server, then its sclang. Never touches another engine that may be running. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.ready = false; this.emit("stopping");
    try { this.send("/eval", ["s.quit; { 0.exit }.defer(0.2); 1", "bye"]); } catch {}
    const sc = this.sc, sock = this.sock;
    setTimeout(() => { try { sc?.kill(); } catch {} try { sock.close(); } catch {} }, 400).unref?.();
  }
}

// Calibrate with the engine's send-time clock, never with a planned future event.
// UDP delay/clock uncertainty remains unmeasured; the minimum observed delay is an estimate.
export class EngineClock {
  private offset = Infinity;
  map(eventSeconds: number, latency: number, sentSeconds: number, receivedMs = Date.now()) {
    this.offset = Math.min(this.offset + 0.0002, receivedMs / 1000 - sentSeconds);
    return (eventSeconds + this.offset + latency) * 1000;
  }
}
