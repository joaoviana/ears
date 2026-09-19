// Every message that passes between the host, the agents and the human goes through here, in the wire format of the
// protocol (see ../ears-protocol). The screen's log pane, the JSONL file and any outside agent all read the same stream.
import fs from "fs";
import path from "path";
import net from "net";
import { EventEmitter } from "events";
import { ROOT } from "./engine.ts";

export interface Msg { v: 0; t: number; bar: number; type: string; from: string; [k: string]: unknown }

export class Bus extends EventEmitter {
  recent: Msg[] = [];
  bar = 0;
  private file: fs.WriteStream | null = null;
  private peers = new Set<net.Socket>();
  path = "";

  open(port = Number(process.env.EARS_BUS_PORT || 57400)) {
    const dir = path.join(ROOT, "tui/logs"); fs.mkdirSync(dir, { recursive: true });
    this.path = path.join(dir, new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".jsonl");
    this.file = fs.createWriteStream(this.path, { flags: "a" });
    try { fs.rmSync(path.join(dir, "latest.jsonl"), { force: true }); fs.symlinkSync(this.path, path.join(dir, "latest.jsonl")); } catch {}
    // outside agents connect here: they receive every message as a JSON line and may send `proposal` and `note` lines back
    const server = net.createServer((sock) => {
      this.peers.add(sock); sock.on("close", () => this.peers.delete(sock)); sock.on("error", () => this.peers.delete(sock));
      // a newcomer hears the room as it is now: the latest code and the latest report
      for (const type of ["hello", "state", "observation"]) { const m = [...this.recent].reverse().find((x) => x.type === type); if (m) sock.write(JSON.stringify(m) + "\n"); }
      let buf = "";
      sock.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line); if (m && typeof m.type === "string") this.emit("inbound", m); } catch {} } });
    });
    server.on("error", () => {});   // port taken (a second instance): carry on without the socket
    server.listen(port, "127.0.0.1");
    return this;
  }

  send(type: string, from: string, body: Record<string, unknown> = {}) {
    const m: Msg = { v: 0, t: Date.now(), bar: this.bar, type, from, ...body };
    this.recent.push(m);
    if (this.recent.length > 400) { const i = this.recent.findIndex((x) => x.type !== "state" && x.type !== "hello"); this.recent.splice(i < 0 ? 0 : i, 1); }   // keep the last state around for newcomers
    const line = JSON.stringify(m) + "\n";
    this.file?.write(line);
    for (const p of this.peers) p.write(line);
    this.emit("msg", m);
    return m;
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
    : m.type === "applied" ? `${s(m.slot)} written · lands bar ${s(m.lands)}`
    : m.type === "landed" ? `${s(m.slot)} playing`
    : m.type === "error" ? `${s(m.slot)} refused by the engine: ${s(m.reason)} · last good version keeps playing`
    : m.type === "grant" ? `${s(m.agent)} → ${s(m.level)}`
    : m.type === "state" ? `${s(m.tempo)} bpm · ${s(m.key)} · ${Object.keys((m.slots as object) || {}).length} slots`
    : m.type === "note" ? `“${s(m.text)}”`
    : m.type === "transition" ? `${s(m.kind)} · ${s(m.bars)} bars`
    : m.type === "enter" || m.type === "leave" ? s(m.agent)
    : m.type === "hello" ? s(m.host)
    : JSON.stringify(m).slice(0, 120);
  return { time, type: m.type, from: m.from, text };
}
