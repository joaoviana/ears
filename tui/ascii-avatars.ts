// Hand-authored terminal portraits. Geometry rasterisation made faces technically detailed but emotionally noisy;
// these keep a deliberate silhouette and a small, controlled character vocabulary at the exact booth footprint.
type RGB = number[];

export interface AsciiFaceState {
  active: boolean; blink: boolean; hat: number; snare: number; eyes?: string;
}

const ART: Record<string, string[]> = {
  cat: [
    "      ╱╲    ╱╲      ",
    "   ╭──╯ ╲──╱ ╰──╮   ",
    " ╭─╯  22222222  ╰─╮ ",
    "╭╯g  2111111112  g╰╮",
    "│    21e1111e12    │",
    "╰╮g  2111m1112  g╭╯",
    " ╰─╮  222222  ╭─╯ ",
    "   ╰────┬┬────╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  dog: [
    "                      ",
    "  ╭╮  ╭──────╮  ╭╮  ",
    " ╭╯╰─╯ 222222 ╰─╯╰╮ ",
    "╭╯g  2111111112  g╰╮",
    "│    21e1111e12    │",
    "╰╮g  2112m2112  g╭╯",
    " ╰─╮   2222   ╭─╯ ",
    "   ╰────┬┬────╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  fox: [
    "     ╱╲      ╱╲     ",
    "   ╱  ╲────╱  ╲   ",
    " ╭─╯  22222222  ╰─╮ ",
    "╭╯g  2111111112  g╰╮",
    "│    21e1111e12    │",
    "╰╮g   ╲  1m1  ╱   g╭╯",
    " ╰─╮   ╲▄▄╱   ╭─╯ ",
    "   ╰────┬┬────╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  wolf: [
    "     ╱╲      ╱╲     ",
    "   ╱  ╲────╱  ╲   ",
    " ╭─╯  32222223  ╰─╮ ",
    "╭╯g  2111111112  g╰╮",
    "│    21e1111e12    │",
    "╰╮g    ╲ 11 ╱    g╭╯",
    " ╰─╮    ╲m╱    ╭─╯ ",
    "   ╰────┬┬────╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  owl: [
    "      ╱╲    ╱╲      ",
    "    ╭──╯╰────╯╰──╮    ",
    " ╭─╯  ╭──h──╮  ╰─╮ ",
    "╭╯g  │21111112│  g╰╮",
    "│    │21e11e12│    │",
    "╰╮g  │2111m112│  g╭╯",
    " ╰─╮  ╰322223╯  ╭─╯ ",
    "   ╰────┬┬────╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  bear: [
    "   ╭─╮          ╭─╮   ",
    "  ╭╯3╰╮──────╭╯3╰╮  ",
    " ╭─╯  22222222  ╰─╮ ",
    "╭╯g  2111111112  g╰╮",
    "│    21e1111e12    │",
    "╰╮g  2112m2112  g╭╯",
    " ╰─╮   2222   ╭─╯ ",
    "   ╰────┬┬────╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  rabbit: [
    "    ╭╮        ╭╮    ",
    "    │3│        │3│    ",
    "    │2╰──────╯2│    ",
    " ╭──╯ 21111112 ╰──╮ ",
    "╭╯g  21e11e12  g╰╮",
    "│     211m112     │",
    "╰╮g   2222   g╭╯",
    " ╰─────┬┬─────╯ ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  bat: [
    " ╱╲                ╱╲ ",
    "╱  ╲╭╮          ╭╮╱  ╲",
    "╲   ╯╰────────╯╰   ╱",
    " ╭─╯g  2111112  g╰─╮ ",
    " │     2e11e2     │ ",
    " ╰─╮g  21m12  g╭─╯ ",
    "    ╰╮ 2222 ╭╯    ",
    "      ╰─┬┬─╯      ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  moth: [
    "   ╲·╲          ╱·╱   ",
    "    ╲·╲╭────╮╱·╱    ",
    " ╭────╯g 2222 g╰────╮ ",
    "╭╯      2112      ╰╮",
    "│       2e e2       │",
    "╰╮      21m12      ╭╯",
    " ╰────╮ 2222 ╭────╯ ",
    "      ╰─┬┬─╯      ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  frog: [
    "    ╭─╮      ╭─╮    ",
    "   ╭╯1e╰────╰e1╰╮   ",
    " ╭─╯  22222222  ╰─╮ ",
    "╭╯g  2111111112  g╰╮",
    "│    2111111112    │",
    "╰╮g  21╰─m─╯12  g╭╯",
    " ╰─╮   2222   ╭─╯ ",
    "   ╰────┬┬────╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  axolotl: [
    "  ╱╲              ╱╲  ",
    " ╱╱╲╲ ╭──────╮ ╱╱╲╲ ",
    "╱╱ g╲╭╯ 222222 ╰╮╱g ╲╲",
    "╲╲  ╱│21111112│╲  ╱╱",
    "     │21e11e12│     ",
    "╱╱  ╲│211m112│╱  ╲╲",
    "╲╲ g╱╰╮ 2222 ╭╯╲g ╱╱",
    " ╲╲╱╱ ╰──┬┬──╯ ╲╲╱╱ ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  robot: [
    "          h           ",
    "          │           ",
    "    ╭────┴────╮     ",
    " ╭─╯g│32222223│g╰─╮  ",
    " │    │3e33e33│    │  ",
    " ╰─╮g│3──m──3│g╭─╯  ",
    "    ╰────┬┬────╯     ",
    "       ╭─┴┴─╮        ",
    "     ╭─┴────┴─╮      ",
    "     ╰────────╯      ",
  ],
  alien: [
    "       ╭──────╮       ",
    "    ╭─╯  2222  ╰─╮    ",
    "  ╭─╯  21111112  ╰─╮  ",
    "╭─╯g   2e11e2   g╰─╮",
    "│       211112       │",
    "╰╮g     21m12     g╭╯",
    " ╰─╮     22     ╭─╯ ",
    "   ╰────┬┬────╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
  skull: [
    "       ╭──────╮       ",
    "    ╭─╯  1111  ╰─╮    ",
    "  ╭─╯  11111111  ╰─╮  ",
    "╭─╯g   1e11e1   g╰─╮",
    "│       11m11       │",
    "╰╮g    ╭────╮    g╭╯",
    " ╰─╮   │┬┬┬┬│   ╭─╯ ",
    "   ╰───╯╰┴┴╯╰───╯   ",
    "      ╭─┴┴─╮      ",
    "    ╭─┴────┴─╮    ",
  ],
};

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const tint = (rgb: RGB, k: number) => rgb.map((v) => clamp(v * k));
const mix = (a: RGB, b: RGB, k: number) => a.map((v, i) => clamp(v + (b[i] - v) * k));
const ansi = (rgb: RGB) => `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
const WHITE = [246, 244, 250], INK = [22, 20, 30];
const LINE = new Set([...`─│┌┐└┘├┤┬┴┼╭╮╯╰╱╲▄`]);

const eye = (s: AsciiFaceState) => {
  if (s.blink || s.eyes === "closed") return "─";
  if (s.eyes === "stars") return "✦";
  if (s.eyes === "wide") return "◉";
  if (s.eyes === "shades" || s.eyes === "visor") return "■";
  return s.eyes === "dots" ? "•" : "●";
};

const mouth: Record<string, string> = { owl: "◆", robot: "═", skull: "┼", frog: "‿", fox: "▾", wolf: "▼", rabbit: "◇" };

/** A fixed 22 x 10 ANSI portrait. Markers select palette roles; visible linework is authored above. */
export function asciiFace(species: string, body: RGB, second: RGB, s: AsciiFaceState): string[] {
  const art = ART[species] ?? ART.skull, dim = s.active ? 1 : 0.42;
  const light = tint(mix(body, WHITE, 0.58), dim), base = tint(body, dim), dark = tint(mix(body, INK, 0.52), dim);
  const accent = tint(mix(second, WHITE, 0.2 + s.hat * 0.3), dim), outline = tint(mix(second, INK, 0.62), dim);
  const eyeGlyph = eye(s), mouthGlyph = s.snare > 0.55 ? "◇" : (mouth[species] ?? "▾");
  return art.map((source) => {
    const chars = [...source].slice(0, 22); while (chars.length < 22) chars.push(" ");
    let row = "", current = "";
    for (const char of chars) {
      let glyph = char, rgb = outline;
      if (char === "1") { glyph = "█"; rgb = light; }
      else if (char === "2") { glyph = "▓"; rgb = base; }
      else if (char === "3") { glyph = "▒"; rgb = dark; }
      else if (char === "4") { glyph = "░"; rgb = accent; }
      else if (char === "e") { glyph = eyeGlyph; rgb = s.eyes === "shades" || s.eyes === "visor" ? dark : WHITE; }
      else if (char === "m") { glyph = mouthGlyph; rgb = accent; }
      else if (char === "g") { glyph = "◉"; rgb = accent; }
      else if (char === "h") { glyph = "◆"; rgb = accent; }
      else if (!LINE.has(char) && char !== " ") rgb = accent;
      const next = char === " " ? "" : ansi(rgb);
      if (next !== current) { row += next || "\x1b[39m"; current = next; }
      row += glyph;
    }
    return row + "\x1b[39m";
  });
}
