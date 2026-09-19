// Every message that passes between the host, the agents and the human goes through here, in the wire format of the
// protocol (see ../ears-protocol). The screen's log pane, the JSONL file and any outside agent all read the same stream.
import fs from "fs";
import path from "path";
import net from "net";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "events";
import { ROOT } from "./engine.ts";

export interface Msg { v: 0; t: number; bar: number; type: string; from: string; [k: string]: unknown }

export class Bus extends EventEmitter {
  recent: Msg[] = [];
  bar = 0;
  readonly session = randomUUID();
  private seq = 0;
  private snapshots = new Map<string, Msg>();
  private server: net.Server | null = null;
  private file: fs.WriteStream | null = null;
  private peers = new Set<net.Socket>();
  path = "";

  open(port = Number(process.env.EARS_BUS_PORT || 57400), dir = process.env.EARS_LOG_DIR || path.join(ROOT, "tui/logs")) { fs.mkdirSync(dir, { recursive: true });
    this.path = path.join(dir, new Date().toISOString().replace(/[:T]/g, "-") + "-" + this.session.slice(0, 8) + ".jsonl");
    this.file = fs.createWriteStream(this.path, { flags: "wx" });
    this.file.on("error", (error) => { process.stderr.write(`EARS log error: ${error.message}\n`); this.emit("fault", error); });
    try { fs.rmSync(path.join(dir, "latest.jsonl"), { force: true }); fs.symlinkSync(this.path, path.join(dir, "latest.jsonl")); } catch {}
    // outside agents connect here: they receive every message as a JSON line and may send `proposal` and `note` lines back
    const server = this.server = net.createServer((sock) => {
      sock.setEncoding("utf8");
      this.peers.add(sock); sock.on("close", () => this.peers.delete(sock)); sock.on("error", () => this.peers.delete(sock));
      // a newcomer hears the room as it is now: the latest code and the latest report
      for (const type of ["hello", "state", "observation"]) { const m = this.snapshots.get(type); if (m) sock.write(JSON.stringify(m) + "\n"); }
      let buf = "";
      sock.on("data", (d) => { buf += d; if (buf.length > 1024 * 1024) { sock.destroy(); return; } let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line); if (m && m.v === 0 && ["proposal", "note"].includes(m.type)) this.emit("inbound", m); } catch {} } });
    });
    server.on("error", (error) => { this.send("transport_error", "host", { reason: error.message }); process.stderr.write(`EARS socket error: ${error.message}\n`); this.emit("fault", error); });
    server.on("listening", () => this.emit("listening", server.address()));
    server.listen(port, "127.0.0.1");
    return this;
  }

  send(type: string, from: string, body: Record<string, unknown> = {}) {
    const m: Msg = { ...body, v: 0, t: Date.now(), bar: this.bar, type, from, session_id: this.session, seq: ++this.seq };
    this.recent.push(m);
    if (this.recent.length > 400) this.recent.shift();
    if (["hello", "state", "observation"].includes(type)) this.snapshots.set(type, m);
    const line = JSON.stringify(m) + "\n";
    this.file?.write(line);
    for (const p of this.peers) p.write(line);
    this.emit("msg", m);
    return m;
  }
  async close() {
    for (const peer of this.peers) peer.destroy();
    if (this.server?.listening) await new Promise<void>(resolve => this.server!.close(() => resolve()));
    const file = this.file; this.file = null;
    if (file && !file.destroyed) await new Promise<void>(resolve => file.end(resolve));
  }
}

/** One line per message, for the log pane and `npm run ears:tail`. Colour is left to the caller. */
export function pretty(m: Msg): { time: string; type: string; from: string; text: string } {
  const d = new Date(m.t), time = d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
  const s = (x: unknown) => String(x ?? ""), ms = m.ms ? `  ${(Number(m.ms) / 1000).toFixed(1)}s` : "";
  const text =
    m.type === "observation" ? s(m.summary)
    : m.type === "request" ? `${s(m.angle)} · ${s(m.model)}`
    : m.type === "proposal" ? `#${s(m.id)} ${s(m.slot)} ${s(m.diff)} — ${s(m.why)}${ms}`
    : m.type === "rejected" ? `${s(m.angle)} refused: ${s(m.reason)}${ms}`
    : m.type === "verdict" ? `${s(m.decision)} #${s(m.proposal)}${m.by !== "human" ? ` (${s(m.by)})` : ""}`
    : m.type === "applied" ? `${s(m.slot)} written · ${s(m.execution_id)}`
    : m.type === "evaluated" ? `${s(m.slot)} evaluated; awaiting activation`
    : m.type === "scheduled" ? `${s(m.slot)} queued by engine`
    : m.type === "active" ? `${s(m.slot)} pattern active; audio effect unverified`
    : m.type === "superseded" ? `${s(m.slot)} replaced by a newer edit`
    : m.type === "comparison" ? `${s(m.status)} · ${s(m.before)} → ${s(m.after)}`
    : m.type === "landed" ? `${s(m.slot)} legacy acknowledgement`
    : m.type === "error" ? `${s(m.slot)} refused by the engine: ${s(m.reason)}`
    : m.type === "grant" ? `${s(m.agent)} → ${m.skill ? "skill " + s(m.skill) : s(m.level)}`
    : m.type === "outcome" ? `${s(m.agent)} called ${s((m.expected as any)?.metric)} ${s((m.expected as any)?.dir)} → ${String(m.grade).toUpperCase()}${m.delta != null ? ` (${Number(m.delta) >= 0 ? "+" : ""}${Number(m.delta).toFixed(1)} ${s(m.unit)}, floor ±${Number(m.noise_floor).toFixed(1)})` : ""}`
    : m.type === "unlock" ? `${s(m.agent)} earned ${s(m.skill)} · waiting for the human to activate it`
    : m.type === "state" ? `${s(m.tempo)} bpm · ${s(m.key)} · ${Object.keys((m.slots as object) || {}).length} slots`
    : m.type === "note" ? `“${s(m.text)}”`
    : m.type === "transition" ? `${s(m.kind)} · ${s(m.bars)} bars`
    : m.type === "enter" || m.type === "leave" ? s(m.agent)
    : m.type === "hello" ? s(m.host)
    : JSON.stringify(m).slice(0, 120);
  return { time, type: m.type, from: m.from, text };
}
