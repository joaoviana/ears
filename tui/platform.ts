import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const PREFERRED_VOICES = ["Daniel", "Samantha", "Fred", "Zarvox", "Trinoids", "Whisper", "Karen", "Moira", "Ralph", "Rishi", "Tessa", "Albert"];

/** Resolve at startup, not import time. An explicit override must never silently fall back. */
export async function findSclang(root: string, env = process.env, platform = process.platform): Promise<string> {
  const executable = platform === "win32" ? "sclang.exe" : "sclang";
  const candidates = env.EARS_SCLANG ? [env.EARS_SCLANG] : [
    ...(env.PATH ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean).map(dir => path.join(dir, executable)),
    ...(platform === "darwin" ? ["/Applications/SuperCollider.app/Contents/MacOS/sclang", path.join(root, ".tools/SuperCollider.app/Contents/MacOS/sclang")] : []),
    ...(platform === "win32" && env.ProgramFiles ? [path.join(env.ProgramFiles, "SuperCollider", executable)] : []),
  ];
  for (const file of candidates) {
    try { await access(file, constants.X_OK); return file; } catch { /* Try the next installation. */ }
  }
  throw new Error(env.EARS_SCLANG
    ? `EARS_SCLANG is not executable: ${env.EARS_SCLANG}`
    : "SuperCollider not found. Install sclang on PATH or set EARS_SCLANG to its executable.");
}

/** Optional macOS speech never delays rendering or audio startup. */
export class Speech {
  private voices: string[] = [];
  private closed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private children = new Set<ReturnType<typeof spawn>>();
  get available() { return this.voices.length > 0; }

  async load(platform = process.platform) {
    if (platform !== "darwin" || this.closed) return;
    try {
      const { stdout } = await exec("say", ["-v", "?"], { timeout: 3000 });
      if (this.closed) return;
      const names = stdout.split("\n").map(line => line.split(/\s{2,}/)[0].trim());
      this.voices = PREFERRED_VOICES.filter(voice => names.includes(voice));
    } catch { this.voices = []; }
  }

  voiceFor(id: string) {
    const hash = [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
    return this.voices[hash % Math.max(1, this.voices.length)];
  }

  greet(id: string, text: string, delay: number) {
    if (!this.available || this.closed) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const voice = this.voiceFor(id);
      if (!voice || this.closed) return;
      const child = spawn("say", ["-v", voice, "-r", "165", text], { stdio: "ignore" });
      this.children.add(child);
      child.once("error", () => this.children.delete(child));
      child.once("exit", () => this.children.delete(child));
    }, delay);
    this.timers.add(timer);
  }

  close() {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    for (const child of this.children) child.kill();
    this.timers.clear(); this.children.clear();
  }
}
