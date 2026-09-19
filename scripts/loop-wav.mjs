// Cuts a seamless loop out of a longer render: skips the first pass so the reverb/delay tail from
// the previous bars is already ringing at the loop point, then normalises to a target RMS.
//   node scripts/loop-wav.mjs in.wav out.wav <bpm> <bars> [targetRms]
import fs from "fs";
const [inp, out, bpm, bars, target = "0.11"] = process.argv.slice(2);
const b = fs.readFileSync(inp);
let o = 12, fmt, data;
while (o < b.length - 8) { const id = b.toString("ascii", o, o + 4), sz = b.readUInt32LE(o + 4); if (id === "fmt ") fmt = o + 8; if (id === "data") { data = [o + 8, sz]; break; } o += 8 + sz + (sz % 2); }
const ch = b.readUInt16LE(fmt + 2), sr = b.readUInt32LE(fmt + 4);
const frames = Math.round((60 / bpm) * 4 * bars * sr), start = frames + Math.round(0.01 * sr);
const n = frames * ch, src = new Int16Array(n);
for (let i = 0; i < n; i++) src[i] = b.readInt16LE(data[0] + (start * ch + i) * 2);
let s = 0, p = 0; for (const v of src) { s += (v / 32768) ** 2; p = Math.max(p, Math.abs(v / 32768)); }
const rms = Math.sqrt(s / n), g = Math.min(Number(target) / rms, 0.98 / p);
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + n * 2, 4); hdr.write("WAVEfmt ", 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(ch, 22); hdr.writeUInt32LE(sr, 24); hdr.writeUInt32LE(sr * ch * 2, 28); hdr.writeUInt16LE(ch * 2, 32); hdr.writeUInt16LE(16, 34);
hdr.write("data", 36); hdr.writeUInt32LE(n * 2, 40);
const body = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) body.writeInt16LE(Math.round(src[i] * g), i * 2);
fs.writeFileSync(out, Buffer.concat([hdr, body]));
console.log(`in rms ${rms.toFixed(4)} peak ${p.toFixed(3)} -> gain ${g.toFixed(2)}, ${(frames / sr).toFixed(2)}s loop, ${ch}ch ${sr}Hz`);
