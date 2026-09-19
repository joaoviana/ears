// Owns the sclang child process and the OSC socket. Everything the TUI knows about the sound arrives here.
import dgram from "dgram";
import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as osc from "osc-min";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCLANG = ["/Applications/SuperCollider.app/Contents/MacOS/sclang", path.join(ROOT, ".tools/SuperCollider.app/Contents/MacOS/sclang")].find((p) => fs.existsSync(p));

export interface Ears { rms: number; peak: number; centroid: number; flatness: number; bands: number[] }
export interface Hit { slot: string; inst: string; at: number; amp: number }

export class Engine extends EventEmitter {
  private sock = dgram.createSocket("udp4");
  private sc: ChildProcess | null = null;
  private lang = 0;
  ready = false;

  start(mute = false) {
    if (!SCLANG) throw new Error("SuperCollider not found. See offline/README.md");
    this.sock.on("message", (buf) => this.onMessage(buf));
    this.sock.bind(57200, "127.0.0.1");
    this.sc = spawn(SCLANG, [path.join(ROOT, "tui/engine.scd")], { env: { ...process.env, ...(mute ? { SOUNDCHECK_MUTE: "1" } : {}) } });
    this.sc.stdout?.on("data", (d) => {
      for (const line of String(d).split("\n")) if (/ERROR|WARNING|FAILURE/.test(line) && !/n_set|Node \d+ not found/.test(line)) this.emit("log", line.trim());
    });
    this.sc.on("exit", () => this.emit("log", "engine exited"));
  }

  private onMessage(buf: Buffer) {
    let m: any;
    try { m = osc.fromBuffer(buf); } catch { return; }
    const a = (m.args || []).map((x: any) => x.value);
    switch (m.address) {
      case "/ready": this.lang = a[0]; this.ready = true; this.emit("ready"); break;
      case "/ears": this.emit("ears", { rms: a[0], peak: a[1], centroid: a[2], flatness: a[3], bands: a.slice(4, 9) } as Ears); break;
      case "/onset": this.emit("onset"); break;
      case "/hit": this.emit("hit", { slot: a[0], inst: a[1], at: Date.now() + a[2] * 1000, amp: a[3] } as Hit); break;
      case "/bar": this.emit("bar", { n: a[0], at: Date.now() + a[1] * 1000, bpm: a[2] }); break;
      case "/evald": this.emit("evald", { id: a[0], ok: a[1] === 1, msg: a[2] }); break;
    }
  }

  private send(address: string, args: (string | number)[]) {
    if (this.lang) this.sock.send(osc.toBuffer({ address, args: args.map((v) => (typeof v === "number" ? { type: "float", value: v } : v)) } as any), this.lang, "127.0.0.1");
  }
  eval(code: string, id: string) { this.send("/eval", [code, id]); }
  volume(v: number) { this.send("/vol", [v]); }

  stop() {
    try { this.sc?.kill(); } catch {}
    try { spawn("pkill", ["-f", "scsynth"]); } catch {}
    try { this.sock.close(); } catch {}
  }
}
