// Shell: lazy-loads each engine so one broken engine can't take the page down,
// enforces "only one thing is playing", and meters whatever is.
const ENGINES = [
  { id: "strudel", load: () => import("./engines/strudel.js"), score: { sound: 3, "llm-writable": 5, "sync hooks": 5, "venue safety": 4 } },
  { id: "tone",    load: () => import("./engines/tone.js"),    score: { sound: 4, "llm-writable": 3, "sync hooks": 4, "venue safety": 5 } },
  { id: "faust",   load: () => import("./engines/faust.js"),   score: { sound: 5, "llm-writable": 2, "sync hooks": 2, "venue safety": 4 } },
  { id: "glicol",  load: () => import("./engines/glicol.js"),  score: { sound: 2, "llm-writable": 5, "sync hooks": 1, "venue safety": 3 } },
];
const NAMES = { strudel: "Strudel", tone: "Tone.js", faust: "Faust", glicol: "Glicol" };
const OFFLINE = [
  { name: "TidalCycles + SuperDirt", body: "Strudel's parent. Same mini-notation, SuperCollider doing the audio: the biggest jump in sound for the least new syntax.", file: "offline/tidal/detroit.tidal" },
  { name: "SuperCollider", body: "The ceiling. Every synthesis technique, proper dynamics, renders to WAV headless so it can be A/B'd here later.", file: "offline/supercollider/detroit.scd" },
  { name: "Sonic Pi", body: "One app, Ruby-ish, threads instead of patterns. Its synths are SuperCollider underneath, so it sounds good for free.", file: "offline/sonic-pi/detroit.rb" },
  { name: "Orca", body: "A 2D grid of single characters that emits MIDI/OSC. No sound of its own: a sequencer you point at any engine above.", file: "offline/orca/README.md" },
];

const $ = (id) => document.getElementById(id);
const loaded = {};
let current = null, track = null, playing = null;
const edits = {};

async function engine(id) {
  if (!loaded[id]) loaded[id] = (await ENGINES.find((e) => e.id === id).load()).default;
  return loaded[id];
}

function status(msg, err = false) { $("status").textContent = msg; $("status").className = "status" + (err ? " err" : ""); }

async function select(id, trackId) {
  const e = await engine(id);
  current = e;
  track = e.tracks.find((t) => t.id === trackId) || e.tracks[0];
  [...$("engines").children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  $("eName").textContent = e.name;
  $("eBlurb").textContent = e.blurb;
  $("tracks").replaceChildren(...e.tracks.map((t) => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = t.name; b.setAttribute("aria-pressed", String(t === track));
    b.onclick = async () => { await select(id, t.id); if (playing) play(); };
    return b;
  }));
  $("tNote").textContent = track.note;
  $("code").value = edits[id + "/" + track.id] ?? track.code;
}

async function play() {
  const e = current, t = track;
  edits[e.id + "/" + t.id] = $("code").value;
  status("loading " + e.name + "…");
  try {
    if (playing && playing !== e) playing.stop();
    await e.play($("code").value, t);
    playing = e;
    status("playing · " + e.name + " · " + t.name);
    $("now").textContent = e.name + " · " + t.name;
  } catch (err) {
    status(String(err?.message || err), true);
  }
  [...$("engines").children].forEach((b) => b.classList.toggle("playing", playing?.id === b.dataset.id));
}

function stop() {
  Object.values(loaded).forEach((e) => { try { e.stop(); } catch {} });
  playing = null;
  $("now").textContent = "stopped"; status("");
  [...$("engines").children].forEach((b) => b.classList.remove("playing"));
}

// ---------- ui ----------
ENGINES.forEach((e, i) => {
  const b = document.createElement("button");
  b.className = "engine"; b.dataset.id = e.id; b.setAttribute("aria-pressed", "false");
  b.innerHTML = `<div class="top"><span class="key">${i + 1}</span><h3>${NAMES[e.id]}</h3></div>
    <div class="score">${Object.entries(e.score).map(([k, v]) => `<span>${k}</span><i><b style="width:${v * 20}%"></b></i>`).join("")}</div>`;
  b.onclick = () => select(e.id);
  $("engines").appendChild(b);
});
$("offline").replaceChildren(...OFFLINE.map((o) => {
  const d = document.createElement("div"); d.className = "card";
  d.innerHTML = `<h3>${o.name}</h3><p>${o.body}</p><code>${o.file}</code>`;
  return d;
}));
$("run").onclick = play;
$("stop").onclick = stop;
$("code").addEventListener("keydown", (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") { ev.preventDefault(); play(); } });
addEventListener("keydown", async (ev) => {
  if (ev.target === $("code")) return;
  const n = Number(ev.key);
  if (n >= 1 && n <= ENGINES.length) { await select(ENGINES[n - 1].id, "reference"); play(); }
  if (ev.key === " ") { ev.preventDefault(); stop(); }
});

// ---------- meter ----------
const cv = $("scope"), g = cv.getContext("2d");
let buf = null, freq = null, peakHold = 0, rmsSmooth = 0;
const db = (x) => (x > 1e-5 ? (20 * Math.log10(x)).toFixed(1) : "-inf");
function measure() {
  const an = playing?.analyser?.();
  if (!an) return null;
  if (!buf || buf.length !== an.fftSize) { buf = new Float32Array(an.fftSize); freq = new Uint8Array(an.frequencyBinCount); }
  an.getFloatTimeDomainData(buf); an.getByteFrequencyData(freq);
  let s = 0, p = 0;
  for (const v of buf) { s += v * v; p = Math.max(p, Math.abs(v)); }
  return { rms: Math.sqrt(s / buf.length), peak: p };
}
(function draw() {
  const m = measure();
  g.clearRect(0, 0, cv.width, cv.height);
  if (m) {
    rmsSmooth += (m.rms - rmsSmooth) * 0.05; peakHold = Math.max(m.peak, peakHold * 0.995);
    $("rms").textContent = db(rmsSmooth); $("peak").textContent = db(peakHold);
    const n = 96, w = cv.width / n;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.pow(i / n, 2.2) * (freq.length * 0.7));
      const h = (freq[idx] / 255) * cv.height;
      g.fillStyle = i < 12 ? "#FF6A98" : i < 56 ? "#A093FF" : "#5FD6BC";
      g.fillRect(i * w, cv.height - h, w - 1.5, h);
    }
  }
  requestAnimationFrame(draw);
})();

window.__soundcheck = { select, play, stop, measure, engines: ENGINES.map((e) => e.id) };
select("strudel");
