"""From the measured effects (tui/dev/measure-expect.ts), choose each gesture's prediction: the metric it moves most
reliably against the grader's default floors, keeping the gesture's own intent when that clears the floor. Writes the
`expect` of every gesture and the MEASURED table in tui/ambient-arsenal.ts with --write."""
import json, re, sys, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = {"sub": 1.2, "low": 1.2, "mid": 1.2, "high": 1.5, "air": 2, "brightness": 220, "loudness": 0.8, "density": 0.3}
runs = [json.load(open(f)) for f in sys.argv[1:] if f.endswith(".json")]
if not runs: sys.exit("usage: derive-expect.py measured.json [more.json] [--write] [--detail id ...]")
def metrics(d, master):
    if not d: return {}
    out = {k: d["relative_bands_db"][k] for k in ["sub", "low", "mid", "high", "air"]}
    out["brightness"] = d["centroid_hz"]; out["loudness"] = d["envelope_db"]; out["density"] = master["onsets_per_beat"]
    return out
# Judged against the grader's own default floors (what it uses until calibrated). The wobble windows in these runs sat
# inside the base's opening ramp, so they overstate noise; density (onsets/beat) is noisy on the master and only
# counts when it moves by a lot.
floor = dict(BASE)
print("floor", {k: round(v, 2) for k, v in floor.items()})
chosen = {}
rows = []
for r in runs:
    for id_, m in r.items():
        if id_ == "wobble": continue
        own = m.get("slot_own") or m.get("slot_dry")
        d = metrics(own, m["master"]) if own else metrics(m["master"], m["master"])
        scored = sorted(((abs(v) / floor[k] / (3 if k == 'density' else 1), k, v) for k, v in d.items()), reverse=True)
        old = m["expect"]
        # the gesture's own intent wins when it clears the floor in the direction it claims; otherwise the strongest effect
        FAMILY = {"sub": "low", "low": "low", "high": "top", "air": "top", "brightness": "top"}
        fam = FAMILY.get(old["metric"], old["metric"])
        own = next(((r, k, v) for r, k, v in scored if FAMILY.get(k, k) == fam and r >= 1.2 and ((v > 0) == (old["dir"] == "up"))), None)
        best = own or scored[0]
        dir_ = "up" if best[2] > 0 else "down"
        ok = best[0] >= 1.5
        chosen[id_] = (best[1], dir_, ok, round(best[0], 2), old)
        rows.append((id_, m["slot"], "own" if m.get("slot_own") else "dry" if m["slot_dry"] else "master", f"{old['metric']} {old['dir']}", f"{best[1]} {dir_}", round(best[0], 2), "" if ok else "WEAK"))
for row in sorted(rows): print("%-16s %-3s %-6s old %-16s new %-16s x%-5s %s" % row)
if "--detail" in sys.argv:
    for r in runs:
        for id_, m in r.items():
            if id_ in sys.argv: print(id_, {k: round(v, 2) for k, v in metrics(m["slot_dry"], m["master"]).items()})
if "--write" in sys.argv:
    p = os.path.join(ROOT, "tui/ambient-arsenal.ts"); s = open(p).read(); n = 0
    for id_, (metric, dir_, ok, ratio, old) in chosen.items():
        pat = re.compile(r'(\{ id: "%s", label: "[^"]*", slot: "d\d", why: "[^"]*", expect: )\{ metric: "\w+", dir: "\w+" \}' % re.escape(id_))
        s, k = pat.subn(r'\1{ metric: "%s", dir: "%s" }' % (metric, dir_), s); n += k
    # a measured strength table the rotation can read: strong gestures make checkable rounds
    block = "// Measured over the base with a muted engine (dev/measure-expect): the metric each gesture moves most, and how\n// many default floors it clears. Below 1.5 the effect is real but too small or too rare for a 16-second check.\nexport const MEASURED: Record<string, { metric: string; dir: string; strength: number }> = {\n" + "".join(
        '  "%s": { metric: "%s", dir: "%s", strength: %s },\n' % (id_, m, d, r) for id_, (m, d, ok, r, old) in sorted(chosen.items())) + "};\n"
    marker = "// Interleave foreground, foundation, harmony and field recordings."
    if "export const MEASURED" in s:
        import re as _re; s = _re.sub(r"// Measured over the base.*?\n};\n", block, s, flags=_re.S)
    else: s = s.replace(marker, block + "\n" + marker)
    open(p, "w").write(s); print("rewrote", n)
