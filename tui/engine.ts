// Owns the sclang child process and the OSC socket. Everything the TUI knows about the sound arrives here.
import dgram from "dgram";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as osc from "osc-min";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCLANG = ["/Applications/SuperCollider.app/Contents/MacOS/sclang", path.join(ROOT, ".tools/SuperCollider.app/Contents/MacOS/sclang")].find((p) => fs.existsSync(p));

export interface Ears { rms: number; peak: number; centroid: number; flatness: number; bands: number[]; side: number; headroomPeak: number }
export interface Hit { slot: string; inst: string; at: number; amp: number; step: number; offGrid: number }

export class Engine extends EventEmitter {
  private sock = dgram.createSocket("udp4");
  private sc: ChildProcess | null = null;
  private lang = 0;
  ready = false;
  /** what the audio device is really running at; 24000 means a Bluetooth headset with its microphone on */
  sampleRate = 0;
  private headPeak = 0;
  private clock = new EngineClock();
  private toLocal(scSeconds: number, latency: number, observedSeconds = scSeconds) {
    return this.clock.map(scSeconds, latency, observedSeconds);
  }

  start(mute = false) {
    if (!SCLANG) throw new Error("SuperCollider not found. See offline/README.md");
    this.sock.on("message", (buf) => this.onMessage(buf));
    this.sock.bind(Number(process.env.EARS_PORT || 57200), "127.0.0.1");
    this.sc = spawn(SCLANG, [path.join(ROOT, "tui/engine.scd")], { env: { ...process.env, ...(mute ? { SOUNDCHECK_MUTE: "1" } : {}) } });
    this.sc.stdout?.on("data", (d) => {
      for (const line of String(d).split("\n")) if (line.trim() && (process.env.EARS_ENGINE_DEBUG || /ERROR|WARNING|FAILURE/.test(line)) && !/n_set|Node \d+ not found/.test(line)) this.emit("log", line.trim());
    });
    this.sc.stderr?.on("data", (d) => this.emit("log", String(d).trim()));
    this.sc.on("error", (error) => this.emit("log", `engine process error: ${error.message}`));
    this.sc.on("exit", () => this.emit("log", "engine exited"));
  }

  private onMessage(buf: Buffer) {
    let m: any;
    try { m = osc.fromBuffer(buf); } catch { return; }
    const a = (m.args || []).map((x: any) => x.value);
    switch (m.address) {
      case "/ready": this.lang = a[0]; this.ready = true; this.sampleRate = Number(a[1]) || 0; this.emit("ready"); break;
      case "/ears": this.emit("ears", { rms: a[0], peak: a[1], centroid: a[2], flatness: a[3], bands: a.slice(4, 9), side: a[9] ?? 0, headroomPeak: this.headPeak } as Ears); break;
      case "/onset": this.emit("onset"); break;
      case "/scope": this.emit("scope", a as number[]); break;   // 512 stereo frames, interleaved L R
      case "/hit": this.emit("hit", { slot: a[0], inst: a[1], at: this.toLocal(a[4], a[2]), amp: a[3], step: Math.floor(((a[5] % 4) + 4) % 4 * 4 + 0.001) % 16, offGrid: a[6] ?? 0 } as Hit); break;
      case "/bar": this.emit("bar", { n: a[0], at: this.toLocal(a[3], a[1]), bpm: a[2] }); break;
      case "/head": this.headPeak = Math.max(this.headPeak * 0.92, Number(a[0]) || 0); break;   // pre-limiter peak, decaying so one transient does not stick
      case "/slotears": this.emit("slotears", { slot: "d" + a[0], rms: a[1], centroid: a[2], bands: a.slice(3, 8), side: a[8] ?? 0, slow: a[9] ?? 0, fast: a[10] ?? 0 }); break;
      case "/voxd": this.emit("voxd", String(a[0])); break;
      case "/dropped": this.emit("dropped", a[0]); break;
      case "/evald": this.emit("evald", { id: a[0], ok: a[1] === 1, msg: a[2], execution_id: a[3], scheduled_at_ms: a[4] > 0 ? this.toLocal(a[4], a[5], a[6]) : undefined }); break;
      case "/active": this.emit("active", { slot: a[0], execution_id: a[1], at: this.toLocal(a[3], a[2], a[5]), basis: a[4] }); break;
    }
  }

  private send(address: string, args: (string | number)[]) {
    if (this.lang) this.sock.send(osc.toBuffer({ address, args: args.map((v) => (typeof v === "number" ? { type: "float", value: v } : v)) } as any), this.lang, "127.0.0.1");
  }
  eval(code: string, id: string, executionId = "") { this.send("/eval", [code, id, executionId]); }
  volume(v: number) { this.send("/vol", [v]); }
  vox(phrase: string, file: string) { this.send("/vox", [phrase, file]); }
  tempo(bpm: number) { this.send("/tempo", [bpm]); }
  transition(kind: "build" | "wash" | "riser", bars: number) { this.send("/transition", [kind, bars]); }

  /** Quits this engine's own server, then its sclang. Never touches another engine that may be running. */
  stop() {
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
