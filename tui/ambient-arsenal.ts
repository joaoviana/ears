import { validate, type AskInput, type Suggestion } from "./agent.ts";
import { applyPatch, describe, parseSlot } from "./patch.ts";

export interface AmbientSeed {
  id: string; label: string; slot: string; code: string; why: string; expect: Suggestion["expect"];
  transform?: { key: string; value: string }[];
}

// A growing set of composed gestures for the fixed D-lydian environment. The library provides the foreground material;
// ambientArsenal pairs it with a second change so an option behaves like an arrangement move rather than a preset.
export const AMBIENT_ARSENAL: AmbientSeed[] = [
  { id: "fingertips", label: "close fingertips", slot: "d6", why: "Slowed fingertips land close, woody and tactile without becoming a drum loop.", expect: { metric: "density", dir: "up" },
    code: '~d.(\\d6, \\instrument, \\texture, \\buf, ~t.(\\fingertips), \\delta, Pseq([0.75, 0.5, 2.5, 1.25, 4, 0.5, 6], inf), \\dur, 4, \\len, Pwhite(3.2, 5.4), \\att, 0.012, \\rel, 0.65, \\start, Pwhite(0, 0.18), \\rate, Pwrand([0.52, 0.63, 0.74], [0.25, 0.5, 0.25], inf), \\hp, 55, \\lp, 6200, \\sub, Pwhite(0.18, 0.32), \\subfreq, Pwhite(42, 58), \\amp, Pwhite(0.14, 0.21), \\pan, Pbrown(-0.55, 0.55, 0.12), \\send, 0.48)' },
  { id: "marbles", label: "slow marbles", slot: "d4", why: "Pitch-darkened marbles roll across wood, then leave ten seconds of space.", expect: { metric: "low", dir: "up" },
    code: '~d.(\\d4, \\instrument, \\texture, \\buf, ~t.(\\marbles), \\delta, Pseq([1.5, 0.6, 2.8, 1, 6, 0.75, 9], inf), \\dur, 5, \\len, Pwhite(4.2, 6), \\att, 0.018, \\rel, 0.9, \\start, Pwhite(0, 0.18), \\rate, Pwrand([0.38, 0.48, 0.62], [0.2, 0.55, 0.25], inf), \\hp, 45, \\lp, 5200, \\sub, Pwhite(0.24, 0.4), \\subfreq, Pwhite(38, 54), \\amp, Pwhite(0.16, 0.24), \\pan, Pbrown(-0.65, 0.65, 0.16), \\send, 0.56)' },
  { id: "paper-aurora", label: "paper aurora", slot: "d6", why: "Granulated paper opens into a bright synthetic veil, then folds back into touch.", expect: { metric: "brightness", dir: "up" },
    code: '~d.(\\d6, \\instrument, \\cloud, \\buf, ~g.(\\paper), \\delta, Pseq([4, 1.5, 7, 2.25, 11, 3, 14], inf), \\dur, 13, \\rate, Pwrand([0.5, 0.75, 1.01], [0.25, 0.5, 0.25], inf), \\pos, Pbrown(0.08, 0.82, 0.07), \\wander, 0.16, \\grain, Pwhite(0.07, 0.32), \\density, Pwhite(13, 27), \\jitter, 0.12, \\att, 2.5, \\sus, 7, \\rel, 4, \\hp, 170, \\lp, Pseg([2400, 9800, 3600], 72, repeats: inf), \\spread, 0.95, \\shimmer, 0.14, \\amp, 0.11, \\send, 0.72)' },
  { id: "brush-current", label: "forest brush current", slot: "d4", why: "A slowed forest brush becomes an uneven wooden current with breathing stereo depth.", expect: { metric: "low", dir: "up" },
    code: '~d.(\\d4, \\instrument, \\cloud, \\buf, ~g.(\\brush), \\delta, Pseq([3, 1.25, 5.5, 2.25, 8, 1.5, 12], inf), \\dur, 12, \\rate, Pwrand([0.31, 0.42, 0.56], [0.18, 0.55, 0.27], inf), \\pos, Pbrown(0.04, 0.88, 0.045), \\wander, 0.1, \\grain, Pwhite(0.16, 0.55), \\density, Pwhite(7, 16), \\jitter, 0.07, \\att, 1.4, \\sus, 8, \\rel, 4.5, \\hp, 48, \\lp, Pseg([900, 4200, 1300], 64, repeats: inf), \\spread, 0.78, \\shimmer, 0.025, \\amp, 0.14, \\send, 0.66)' },
  { id: "rain-prism", label: "rhythmic rain prism", slot: "d2", why: "The current voice breaks into bright, irregular rain-sized openings.", expect: { metric: "high", dir: "up" },
    transform: [{ key: "delta", value: "Pseq([1.25, 0.5, 2.25, 4, 0.75, 6], inf)" }, { key: "fxhp", value: "520" }, { key: "fxlp", value: "7600" }, { key: "fxmotion", value: "0.9" }, { key: "fxrate", value: "0.18" }, { key: "fxspace", value: "0.24" }],
    code: '~d.(\\d2, \\instrument, \\cloud, \\buf, ~g.(\\rain), \\delta, Pexprand(15, 27, inf), \\dur, 20, \\rate, Pwrand([0.49, 0.74, 1], [0.18, 0.52, 0.3], inf), \\pos, Pbrown(0.02, 0.9, 0.06), \\wander, 0.2, \\grain, Pwhite(0.08, 0.28), \\density, Pwhite(30, 55), \\jitter, 0.16, \\att, 4, \\sus, 13, \\rel, 7, \\hp, 380, \\lp, 9200, \\spread, 1, \\shimmer, 0.1, \\amp, 0.22, \\send, 0.86)' },
  { id: "wave-memory", label: "wave breathing cycle", slot: "d1", why: "The current voice breathes in a five-part low-pass tide.", expect: { metric: "width", dir: "up" },
    transform: [{ key: "delta", value: "Pseq([6, 2, 10, 3.5, 14], inf)" }, { key: "fxhp", value: "45" }, { key: "fxlp", value: "3600" }, { key: "fxmotion", value: "0.78" }, { key: "fxrate", value: "0.055" }, { key: "fxspace", value: "0.42" }],
    code: '~d.(\\d1, \\instrument, \\cloud, \\buf, ~g.(\\waves), \\delta, Pexprand(18, 31, inf), \\dur, 24, \\rate, Pwrand([0.37, 0.5, 0.67], [0.2, 0.55, 0.25], inf), \\pos, Pbrown(0.03, 0.92, 0.035), \\wander, 0.08, \\grain, Pwhite(0.45, 1.1), \\density, Pwhite(5, 11), \\jitter, 0.045, \\att, 7, \\sus, 14, \\rel, 9, \\hp, 38, \\lp, 5200, \\spread, 0.9, \\shimmer, 0.018, \\amp, 0.13, \\send, 0.74)' },
  { id: "paper-bloom", label: "paper bloom", slot: "d5", why: "Warm paper fibres fold close to the listener, then leave a generous gap.", expect: { metric: "mid", dir: "up" },
    code: '~d.(\\d5, \\instrument, \\texture, \\buf, ~t.(\\paper), \\delta, Pseq([1.25, 0.6, 4.5, 2, 7.5, 0.8, 11], inf), \\dur, 5, \\len, Pwhite(3.2, 5.8), \\att, 0.025, \\rel, Pwhite(0.7, 1.2), \\start, Pbrown(0.03, 0.86, 0.06), \\rate, Pwrand([0.46, 0.58, 0.71], [0.2, 0.58, 0.22], inf), \\hp, 80, \\lp, Pseg([2200, 6500, 3000], 56, repeats: inf), \\amp, Pwhite(0.18, 0.27), \\pan, Pbrown(-0.68, 0.68, 0.15), \\send, 0.46)' },
  { id: "droplets", label: "submerged droplets", slot: "d6", why: "Close water taps carry a soft sub pulse and grainy skin.", expect: { metric: "low", dir: "up" },
    code: '~d.(\\d6, \\instrument, \\droplet, \\delta, Pseq([0.45, 0.3, 1.4, 0.7, 2.8, 0.35, 4.5], inf), \\dur, 1.2, \\midinote, Pwrand([50, 54, 57, 61, 62, \\r], [0.19, 0.17, 0.17, 0.12, 0.1, 0.25], inf), \\sub, Pwhite(42, 68), \\dec, Pexprand(0.35, 1.25, inf), \\tone, Pwhite(0.12, 0.5), \\splash, Pwhite(0.28, 0.72), \\amp, Pwhite(0.06, 0.1), \\pan, Pbrown(-0.72, 0.72, 0.16), \\send, 0.68)' },
  { id: "twig-cycle", label: "twig cycle", slot: "d6", why: "Dry branch taps trace a five-part cycle with one deliberate hole.", expect: { metric: "density", dir: "up" },
    code: '~d.(\\d6, \\instrument, \\twig, \\delta, Pseq([1.25, 0.75, 3.5, 2, 5.5], inf), \\dur, 0.3, \\midinote, Pseq([62, 69, \\r, 66, 74], inf), \\dec, Pwhite(0.12, 0.34), \\tone, Pwhite(0.18, 0.58), \\hollow, Pwhite(0.35, 0.78), \\amp, Pwhite(0.065, 0.105), \\pan, Pbrown(-0.65, 0.65, 0.18), \\send, 0.7)' },
  { id: "pebble-pairs", label: "pebble pairs", slot: "d6", why: "Two close pebbles answer, followed by an unpredictable stretch of water.", expect: { metric: "low", dir: "up" },
    code: '~d.(\\d6, \\instrument, \\droplet, \\delta, Pseq([0.42, Pexprand(3.8, 7.5, 1)], inf), \\dur, 0.8, \\midinote, Pseq([50, 57, 54, 61], inf), \\sub, Pwhite(40, 64), \\dec, Pwhite(0.28, 0.85), \\tone, Pwhite(0.08, 0.38), \\splash, Pwhite(0.35, 0.8), \\amp, Pwhite(0.055, 0.09), \\pan, Pseq([-0.35, 0.28, -0.1, 0.5], inf), \\send, 0.58)' },
  { id: "leaf-shuffle", label: "leaf shuffle", slot: "d4", why: "Close leaves make an uneven soft shuffle under the field recordings.", expect: { metric: "density", dir: "up" },
    code: '~d.(\\d4, \\instrument, \\rustle, \\delta, Pseq([0.75, 1.5, 0.5, 2.25, 1, 3.5, 0.5, 5], inf), \\dur, 1.5, \\freq, Pbrown(1100, 4200, 320), \\dec, Pwhite(0.45, 1.4), \\grain, Pwhite(8, 38), \\bw, Pwhite(0.25, 0.75), \\amp, Pwhite(0.065, 0.105), \\pan, Pbrown(-0.68, 0.68, 0.14), \\send, 0.74)' },
  { id: "reed-answer", label: "hollow reed answers", slot: "d5", why: "Hollow reeds answer the water in a spacious, asymmetric phrase.", expect: { metric: "density", dir: "up" },
    code: '~d.(\\d5, \\instrument, \\twig, \\delta, Pseq([2, 1, 4.5, 3, 6.5], inf), \\dur, 0.4, \\midinote, Pseq([57, \\r, 64, 61, 68], inf), \\dec, Pwhite(0.22, 0.48), \\tone, Pwhite(0.08, 0.32), \\hollow, Pwhite(0.68, 0.95), \\amp, Pwhite(0.055, 0.09), \\pan, Pseq([-0.45, 0.2, 0.55, -0.1, 0.35], inf), \\send, 0.82)' },
  { id: "halo", label: "breathing harmonic halo", slot: "d5", why: "The current harmony pulses through a warm, moving halo.", expect: { metric: "mid", dir: "up" },
    transform: [{ key: "delta", value: "Pseq([3, 1, 5, 2, 8], inf)" }, { key: "fxhp", value: "110" }, { key: "fxlp", value: "4400" }, { key: "fxdrive", value: "0.2" }, { key: "fxspace", value: "0.5" }, { key: "fxmotion", value: "0.62" }, { key: "fxrate", value: "0.075" }],
    code: '~d.(\\d5, \\instrument, \\pad, \\dur, 24, \\midinote, Pseq([[62, 69, 76, 80], [64, 71, 78, 81], [66, 73, 80, 85]], inf), \\att, 9, \\sus, 14, \\rel, 12, \\cutoff, Pseg([800, 1900, 1050], 72, repeats: inf), \\duck, 0, \\amp, 0.058, \\send, 0.95)' },
  { id: "clearing", label: "rhythmic clearing", slot: "d4", why: "The current floor opens into irregular filtered windows and real silence.", expect: { metric: "sub", dir: "down" },
    transform: [{ key: "delta", value: "Pseq([4, 1.5, 7, 2.25, 11], inf)" }, { key: "fxhp", value: "240" }, { key: "fxlp", value: "4800" }, { key: "fxmotion", value: "0.72" }, { key: "fxrate", value: "0.11" }, { key: "fxspace", value: "0.18" }],
    code: '~d.(\\d4, \\instrument, \\gendy, \\delta, Pexprand(6, 16, inf), \\dur, 3, \\midinote, Pwrand([62, 68, 74, 80, \\r, \\r], [0.14, 0.14, 0.11, 0.08, 0.28, 0.25], inf), \\knum, 32, \\chaos, 0.04, \\scale, 0.07, \\att, 2.5, \\dec, Pexprand(3.5, 7, inf), \\cutoff, Pwhite(900, 2400), \\amp, Pwhite(0.035, 0.075), \\pan, Pwhite(-0.65, 0.65), \\send, 0.94)' },
  { id: "canopy", label: "canopy shutters", slot: "d3", why: "The current voice flickers through distant, slowly moving canopy bands.", expect: { metric: "air", dir: "up" },
    transform: [{ key: "delta", value: "Pseq([8, 3, 5, 13, 2], inf)" }, { key: "fxhp", value: "900" }, { key: "fxlp", value: "6800" }, { key: "fxmotion", value: "0.82" }, { key: "fxrate", value: "0.045" }, { key: "fxspace", value: "0.48" }],
    code: '~d.(\\d3, \\instrument, \\nature, \\buf, ~n.(\\birds), \\dur, 48, \\len, 40, \\att, 12, \\rel, 14, \\start, Pwhite(0.08, 0.78), \\rate, Pwhite(0.72, 0.96), \\hp, 1200, \\lp, 8500, \\amp, 0.055, \\pan, Pbrown(-0.7, 0.7, 0.16), \\send, 0.88)' },
  { id: "mist", label: "tactile mist pulse", slot: "d6", why: "The current detail smears into soft pulses, then snaps back into focus.", expect: { metric: "density", dir: "up" },
    transform: [{ key: "delta", value: "Pseq([0.75, 0.5, 2, 1.25, 4.5, 0.5, 7], inf)" }, { key: "fxhp", value: "160" }, { key: "fxlp", value: "5200" }, { key: "fxdrive", value: "0.16" }, { key: "fxspace", value: "0.34" }, { key: "fxmotion", value: "0.68" }, { key: "fxrate", value: "0.14" }],
    code: '~d.(\\d6, \\instrument, \\texture, \\buf, ~t.(\\fingertips), \\delta, Pseq([0.75, 0.5, 2, 1.25, 4.5, 0.5, 7], inf), \\dur, 3, \\len, Pwhite(2.2, 4.6), \\att, 0.02, \\rel, 0.8, \\start, Pwhite(0, 0.5), \\rate, Pwrand([0.48, 0.63, 0.82], [0.2, 0.55, 0.25], inf), \\hp, 160, \\lp, 5200, \\amp, Pwhite(0.08, 0.14), \\pan, Pbrown(-0.6, 0.6, 0.12), \\send, 0.72)' },
  { id: "air-flutter", label: "air flutter", slot: "d3", why: "Unpitched leaf air flickers high, bunches briefly, then vanishes.", expect: { metric: "air", dir: "up" },
    code: '~d.(\\d3, \\instrument, \\rustle, \\delta, Pseq([0.22, 0.35, 0.18, Pexprand(5, 12, 1)], inf), \\dur, 1.2, \\freq, Pbrown(3800, 7200, 540), \\dec, Pwhite(0.25, 0.75), \\grain, Pwhite(32, 68), \\bw, Pwhite(0.32, 0.7), \\amp, Pwhite(0.055, 0.09), \\pan, Pbrown(-0.85, 0.85, 0.24), \\send, 0.68)' },
  { id: "understone", label: "understone pulse", slot: "d5", why: "Soft earth pressure arrives in uneven low pairs with long empty valleys.", expect: { metric: "sub", dir: "up" },
    code: '~d.(\\d5, \\instrument, \\droplet, \\delta, Pseq([0.7, 0.38, Pexprand(5, 11, 1), 1.3, Pexprand(8, 15, 1)], inf), \\dur, 1.4, \\midinote, Pwrand([38, 45, 50, \\r], [0.25, 0.25, 0.2, 0.3], inf), \\sub, Pwhite(38, 52), \\dec, Pwhite(0.65, 1.4), \\tone, Pwhite(0.04, 0.18), \\splash, Pwhite(0.08, 0.24), \\amp, Pwhite(0.065, 0.1), \\pan, Pbrown(-0.45, 0.45, 0.12), \\send, 0.52)' },
  { id: "brush-burst", label: "brush burst", slot: "d4", why: "Close brush fibres make short asymmetric flurries, then leave the field bare.", expect: { metric: "density", dir: "up" },
    code: '~d.(\\d4, \\instrument, \\texture, \\buf, ~t.(\\brush), \\delta, Pseq([0.2, 0.28, 0.46, Pexprand(4.5, 10, 1), 0.3, Pexprand(7, 14, 1)], inf), \\dur, 2.4, \\len, Pwhite(1.8, 3.5), \\att, 0.01, \\rel, Pwhite(0.35, 0.8), \\start, Pbrown(0.04, 0.88, 0.09), \\rate, Pwrand([0.5, 0.68, 0.9], [0.25, 0.5, 0.25], inf), \\hp, 90, \\lp, 7600, \\amp, Pwhite(0.19, 0.28), \\pan, Pbrown(-0.82, 0.82, 0.2), \\send, 0.5)' },
  { id: "bird-grain", label: "bird grain eddies", slot: "d3", why: "Bird fragments gather into granular eddies, rise, and scatter back into canopy.", expect: { metric: "high", dir: "up" },
    code: '~d.(\\d3, \\instrument, \\cloud, \\buf, ~g.(\\birds), \\delta, Pseq([3, Pexprand(8, 18, 1), 1.5, Pexprand(12, 24, 1)], inf), \\dur, 11, \\rate, Pwrand([0.48, 0.7, 0.94], [0.25, 0.5, 0.25], inf), \\pos, Pbrown(0.08, 0.9, 0.08), \\wander, 0.15, \\grain, Pwhite(0.06, 0.28), \\density, Pwhite(10, 24), \\jitter, 0.14, \\att, 2, \\sus, 6, \\rel, 4, \\hp, 1250, \\lp, Pseg([4200, 9800, 5200], 52, repeats: inf), \\spread, 1, \\shimmer, 0.02, \\amp, 0.095, \\send, 0.7)' },
  { id: "paper-fall", label: "paper fall", slot: "d6", why: "Paper grains tumble in changing clusters across the stereo field, never repeating.", expect: { metric: "brightness", dir: "up" },
    code: '~d.(\\d6, \\instrument, \\texture, \\buf, ~t.(\\paper), \\delta, Pseq([0.32, 0.7, 0.24, 1.6, Pexprand(4, 10, 1)], inf), \\dur, 2.8, \\len, Pwhite(1.8, 4.2), \\att, 0.012, \\rel, Pwhite(0.4, 0.9), \\start, Pwhite(0.02, 0.9), \\rate, Pwhite(0.42, 0.92), \\hp, Pwhite(140, 480), \\lp, Pwhite(4800, 9800), \\amp, Pwhite(0.17, 0.26), \\pan, Pwhite(-0.9, 0.9), \\send, 0.58)' },
  { id: "wave-shutters", label: "wave shutters", slot: "d1", why: "The waves alternate between deep body and bright spray in irregular openings.", expect: { metric: "brightness", dir: "up" },
    transform: [{ key: "delta", value: "Pseq([9, 2.5, 15, 1.25, 6], inf)" }, { key: "fxhp", value: "Pseg([35, 780, 80], 48, repeats: inf)" }, { key: "fxlp", value: "Pseg([1800, 9200, 2600], 56, repeats: inf)" }, { key: "fxmotion", value: "0.94" }, { key: "fxrate", value: "0.12" }, { key: "fxspace", value: "0.34" }],
    code: '~d.(\\d1, \\instrument, \\cloud, \\buf, ~g.(\\waves), \\delta, Pexprand(12, 26, inf), \\dur, 20, \\rate, Pwhite(0.4, 0.82), \\pos, Pbrown(0.05, 0.9, 0.06), \\wander, 0.12, \\grain, Pwhite(0.2, 0.8), \\density, Pwhite(7, 18), \\jitter, 0.08, \\att, 4, \\sus, 11, \\rel, 7, \\hp, 35, \\lp, 7200, \\spread, 0.92, \\shimmer, 0.02, \\amp, 0.14, \\send, 0.72)' },
  { id: "rain-polyrhythm", label: "rain cross-cycle", slot: "d2", why: "Rain answers itself in short threes against a slower five-gap current.", expect: { metric: "density", dir: "up" },
    transform: [{ key: "delta", value: "Pseq([0.5, 0.75, 1.25, 3.5, 0.5, 2.25, 6.5], inf)" }, { key: "fxhp", value: "Pwhite(260, 880)" }, { key: "fxlp", value: "Pwhite(4200, 9600)" }, { key: "fxmotion", value: "0.96" }, { key: "fxrate", value: "0.2" }, { key: "fxspace", value: "0.22" }],
    code: '~d.(\\d2, \\instrument, \\cloud, \\buf, ~g.(\\rain), \\delta, Pseq([0.5, 0.75, 1.25, 3.5, 0.5, 2.25, 6.5], inf), \\dur, 10, \\rate, Pwhite(0.58, 0.96), \\pos, Pwhite(0.05, 0.9), \\wander, 0.18, \\grain, Pwhite(0.05, 0.24), \\density, Pwhite(18, 36), \\jitter, 0.16, \\att, 2, \\sus, 6, \\rel, 4, \\hp, 260, \\lp, 9400, \\spread, 1, \\shimmer, 0.04, \\amp, 0.14, \\send, 0.76)' },
  { id: "open-horizon", label: "open horizon", slot: "d5", why: "The middle falls away, then returns as a wide moving band.", expect: { metric: "mid", dir: "down" },
    transform: [{ key: "delta", value: "Pseq([13, 2, 21, 3.5, 8], inf)" }, { key: "fxhp", value: "Pseg([120, 950, 180], 64, repeats: inf)" }, { key: "fxlp", value: "Pseg([1900, 8400, 2800], 72, repeats: inf)" }, { key: "fxmotion", value: "0.9" }, { key: "fxrate", value: "0.045" }, { key: "fxspace", value: "0.58" }],
    code: '~d.(\\d5, \\instrument, \\cloud, \\buf, ~g.(\\paper), \\delta, Pexprand(12, 28, inf), \\dur, 18, \\rate, Pwhite(0.45, 0.78), \\pos, Pbrown(0.05, 0.9, 0.05), \\wander, 0.12, \\grain, Pwhite(0.14, 0.5), \\density, Pwhite(8, 18), \\jitter, 0.1, \\att, 4, \\sus, 10, \\rel, 7, \\hp, 100, \\lp, 7000, \\spread, 0.95, \\shimmer, 0.02, \\amp, 0.13, \\send, 0.78)' },
  // ---- the extremes. The set was measurably well-behaved: every gesture added a comparable amount of material in a
  // comparable register, so nothing ever felt like a high or a low. These seven exist to break that. They are loud,
  // quiet, deep, bright, sudden or absent on purpose, and several of them do nothing at all for twenty seconds.
  { id: "tide-floor", label: "deep tide floor", slot: "d4", why: "A real low arrives from nowhere, holds the room for six seconds, and leaves it empty again.", expect: { metric: "sub", dir: "up" },
    code: '~d.(\\d4, \\instrument, \\sub, \\delta, Pseq([Pexprand(13, 24, 1), 2.5, Pexprand(21, 38, 1)], inf), \\dur, 8, \\midinote, Pwrand([26, 33, 38], [0.46, 0.3, 0.24], inf), \\dec, Pwhite(4.5, 8), \\drop, Pwhite(0.12, 0.55), \\duck, 0, \\amp, Pwhite(0.065, 0.105))' },
  { id: "spray", label: "bright spray", slot: "d2", why: "The waves are played back above their own pitch until only spray is left: the top of the room, briefly.", expect: { metric: "air", dir: "up" },
    code: '~d.(\\d2, \\instrument, \\cloud, \\buf, ~g.(\\waves), \\delta, Pseq([2, 0.75, 5, Pexprand(9, 19, 1)], inf), \\dur, 7, \\rate, Pwrand([1.45, 1.9, 2], [0.3, 0.45, 0.25], inf), \\pos, Pwhite(0.05, 0.92), \\wander, 0.24, \\grain, Pwhite(0.03, 0.14), \\density, Pwhite(26, 54), \\jitter, 0.22, \\att, 1.2, \\sus, 3.5, \\rel, 2.5, \\hp, 2600, \\lp, 13000, \\spread, 1, \\shimmer, 0.18, \\amp, 0.17, \\send, 0.6)' },
  { id: "swarm", label: "twig swarm", slot: "d6", why: "Five or six dry impacts in under a beat, then twenty seconds of nothing. The gap is the gesture.", expect: { metric: "density", dir: "up" },
    code: '~d.(\\d6, \\instrument, \\twig, \\delta, Pwrand([0.125, 0.1875, 0.25, Pexprand(16, 34, 1)], [0.3, 0.26, 0.26, 0.18], inf), \\dur, 0.25, \\midinote, Pwhite(58, 82), \\dec, Pexprand(0.06, 0.22, inf), \\tone, Pwhite(0.3, 0.9), \\hollow, Pwhite(0.2, 0.85), \\amp, Pwhite(0.055, 0.13), \\pan, Pwhite(-0.9, 0.9), \\send, 0.62)' },
  { id: "thunder-stone", label: "thunder stone", slot: "d5", why: "A tactile low body rolls in twice a minute, touches the floor, then disappears.", expect: { metric: "low", dir: "up" },
    code: '~d.(\\d5, \\instrument, \\stone, \\delta, Pseq([Pexprand(18, 34, 1), 3.5], inf), \\dur, 7, \\tune, Pwrand([32, 38, 45], [0.42, 0.34, 0.24], inf), \\dec, Pwhite(3.5, 7), \\bend, Pwhite(0.25, 0.8), \\skin, Pwhite(0.18, 0.46), \\tone, Pwhite(0.12, 0.38), \\amp, Pwhite(0.055, 0.095), \\pan, Pwhite(-0.4, 0.4), \\send, 0.5)' },
  { id: "falling-air", label: "falling air", slot: "d3", why: "A band of air opens high and slides downward as it fades, like weather passing over the field.", expect: { metric: "air", dir: "up" },
    code: '~d.(\\d3, \\instrument, \\noise, \\delta, Pseq([Pexprand(11, 22, 1), 4.5, Pexprand(16, 30, 1)], inf), \\dur, 7, \\freq, Pwhite(5200, 9000), \\att, Pwhite(1.5, 3.5), \\dec, Pwhite(4, 8), \\bw, Pwhite(0.12, 0.45), \\sweep, Pwhite(0.14, 0.38), \\amp, Pwhite(0.05, 0.09), \\pan, Pbrown(-0.8, 0.8, 0.3), \\send, 0.8)' },
  { id: "glint", label: "rare glint", slot: "d3", why: "One unpitched leaf-air event appears every ten to forty-five seconds.", expect: { metric: "air", dir: "up" },
    code: '~d.(\\d3, \\instrument, \\rustle, \\delta, Pexprand(14, 46, inf), \\dur, 2.5, \\freq, Pwhite(5200, 9200), \\dec, Pwhite(0.7, 1.8), \\grain, Pwhite(38, 76), \\bw, Pwhite(0.28, 0.7), \\sweep, Pwhite(0.7, 1.5), \\air, Pwhite(0.65, 1), \\amp, Pwhite(0.11, 0.18), \\pan, Pwhite(-0.95, 0.95), \\send, 0.72)' },
  { id: "hollow-out", label: "hollow out", slot: "d2", why: "The chosen voice stops being a layer and becomes an event every thirty seconds, behind a closed filter.", expect: { metric: "loudness", dir: "down" },
    transform: [{ key: "delta", value: "Pexprand(24, 48, inf)" }, { key: "fxhp", value: "40" }, { key: "fxlp", value: "Pseg([700, 1600, 620], 40, repeats: inf)" }, { key: "fxmotion", value: "0.55" }, { key: "fxrate", value: "0.03" }, { key: "fxspace", value: "0.66" }],
    code: '~d.(\\d2, \\instrument, \\cloud, \\buf, ~g.(\\rain), \\delta, Pexprand(24, 48, inf), \\dur, 16, \\rate, Pwhite(0.3, 0.5), \\pos, Pbrown(0.05, 0.9, 0.04), \\wander, 0.08, \\grain, Pwhite(0.4, 1.2), \\density, Pwhite(4, 9), \\jitter, 0.05, \\att, 5, \\sus, 7, \\rel, 6, \\hp, 40, \\lp, 1600, \\spread, 0.9, \\shimmer, 0.01, \\amp, 0.09, \\send, 0.8)' },
];

// Interleave foreground, foundation, harmony and field recordings. Adjacent rounds should never feel like a menu
// of three versions of the same synth.
// The extremes are interleaved, not appended: rotation position is itself a weak preference, so a gesture parked
// at the end of the list would never be reached in a set of a dozen rounds.
const ROTATION = ["fingertips", "marbles", "air-flutter", "tide-floor", "understone", "paper-aurora", "swarm",
  "brush-burst", "rain-prism", "spray", "bird-grain", "wave-shutters", "hollow-out", "paper-bloom", "twig-cycle",
  "thunder-stone", "rain-polyrhythm", "leaf-shuffle", "canopy", "glint", "droplets", "open-horizon", "clearing",
  "wave-memory", "falling-air", "paper-fall", "mist", "pebble-pairs", "brush-current", "reed-answer", "halo"];

// ---- THE TIDE ----------------------------------------------------------------------------------------------
// The real complaint about this set was not that any one gesture was wrong: it was that every round sounded like
// the last one, because each round chose in isolation and every gesture added a similar amount of similar material.
// So the arsenal now has a memory of shape. Each gesture declares how much it ADDS (energy, -2 removes .. +2 is an
// event) and where it lives (band). A slow cycle runs underneath the set and asks for a different amount, in a
// different register, than the round before. Swell, break, hollow, rest: the arc exists whether or not anybody
// takes an option, and the performer can read where they are in it on the option card.
export type Band = "sub" | "low" | "mid" | "high" | "air" | "wide";
export interface Contour { energy: number; band: Band }
const CONTOUR: Record<string, Contour> = {
  fingertips: { energy: 0.5, band: "mid" }, marbles: { energy: 1, band: "low" },
  "paper-aurora": { energy: 1, band: "high" }, "brush-current": { energy: 1, band: "low" },
  "rain-prism": { energy: 1, band: "high" }, "wave-memory": { energy: 0, band: "wide" },
  "paper-bloom": { energy: 0.5, band: "mid" }, droplets: { energy: 0.5, band: "low" },
  "twig-cycle": { energy: 0.5, band: "mid" }, "pebble-pairs": { energy: 0, band: "low" },
  "leaf-shuffle": { energy: 0.5, band: "mid" }, "reed-answer": { energy: 0, band: "mid" },
  halo: { energy: 1, band: "mid" }, clearing: { energy: -2, band: "sub" },
  canopy: { energy: 0.5, band: "air" }, mist: { energy: 0.5, band: "mid" },
  "air-flutter": { energy: 1, band: "air" }, understone: { energy: 1, band: "sub" },
  "brush-burst": { energy: 1.5, band: "high" }, "bird-grain": { energy: 1, band: "high" },
  "paper-fall": { energy: 1, band: "high" }, "wave-shutters": { energy: 1.5, band: "wide" },
  "rain-polyrhythm": { energy: 1.5, band: "high" }, "open-horizon": { energy: -1.5, band: "wide" },
  "tide-floor": { energy: 2, band: "sub" }, spray: { energy: 1.5, band: "air" },
  swarm: { energy: 2, band: "high" }, "thunder-stone": { energy: 2, band: "low" },
  "falling-air": { energy: 1, band: "air" }, glint: { energy: 0.5, band: "air" },
  "hollow-out": { energy: -2, band: "wide" },
};
const contour = (id: string): Contour => CONTOUR[id] ?? { energy: 0.5, band: "mid" };

export interface Tide { phase: string; wants: number; avoid: Band | null; says: string }
const PHASES: { phase: string; wants: number; says: string }[] = [
  { phase: "gather", wants: 0.4, says: "the room is gathering" },
  { phase: "swell", wants: 1.2, says: "the room is swelling" },
  { phase: "break", wants: 2, says: "the room breaks open" },
  { phase: "hollow", wants: -2, says: "the room hollows out" },
  { phase: "rest", wants: -0.5, says: "the room is resting" },
  { phase: "glint", wants: 1, says: "one rare thing is allowed to happen" },
];
/**
 * Where the set is in its own arc. It advances with the rounds AND with what the performer took, so a set where
 * every idea lands moves through the cycle faster than one where nothing does. The band last taken is the one the
 * tide steers away from, because two consecutive moves in the same register is exactly what "no variance" means.
 */
export function ambientTide(input: Pick<AskInput, "round" | "history">): Tide {
  const taken = input.history.filter(item => item.verdict === "y").length;
  const phase = PHASES[(Math.max(0, Math.floor(input.round ?? 0)) + taken) % PHASES.length];
  const last = [...input.history].reverse().find(item => item.recipe_id?.startsWith("ambient-"));
  const avoid = last ? contour(last.recipe_id!.replace(/^ambient-/, "")).band : null;
  return { ...phase, avoid };
}

const MATERIAL_ADDITIONS = ["air-flutter", "understone", "paper-fall", "brush-burst", "fingertips", "swarm", "paper-bloom", "leaf-shuffle", "falling-air", "brush-current", "twig-cycle", "tide-floor", "marbles", "glint", "paper-aurora", "spray", "canopy", "thunder-stone"];
const COUNTER_SLOTS: Record<string, string[]> = {
  d1: ["d6", "d4", "d5", "d3", "d2"], d2: ["d6", "d5", "d4", "d3", "d1"],
  d3: ["d5", "d4", "d6", "d2", "d1"], d4: ["d2", "d1", "d5", "d3", "d6"],
  d5: ["d3", "d1", "d4", "d2", "d6"], d6: ["d2", "d1", "d4", "d3", "d5"],
};
const FILTER_MOVES = [
  { phrase: "dives from air into shadow", set: [{ key: "fxhp", value: "Pseg([80, 1100, 140], 48, repeats: inf)" }, { key: "fxlp", value: "Pseg([2600, 9800, 1900], 56, repeats: inf)" }, { key: "fxmotion", value: "0.94" }, { key: "fxrate", value: "0.11" }, { key: "fxspace", value: "0.32" }] },
  { phrase: "opens from low body into bright air", set: [{ key: "fxhp", value: "Pseg([35, 620, 70], 56, repeats: inf)" }, { key: "fxlp", value: "Pseg([1400, 9200, 2400], 64, repeats: inf)" }, { key: "fxmotion", value: "0.9" }, { key: "fxrate", value: "0.07" }, { key: "fxspace", value: "0.4" }] },
  { phrase: "flickers through stochastic spectral windows", set: [{ key: "fxhp", value: "Pwhite(90, 900)" }, { key: "fxlp", value: "Pwhite(2400, 9600)" }, { key: "fxmotion", value: "0.98" }, { key: "fxrate", value: "Pexprand(0.08, 0.24)" }, { key: "fxspace", value: "0.26" }] },
  { phrase: "surges close, then falls behind the field", set: [{ key: "fxhp", value: "Pseg([50, 340, 70], 40, repeats: inf)" }, { key: "fxlp", value: "Pseg([1800, 6200, 1200], 48, repeats: inf)" }, { key: "fxmotion", value: "0.88" }, { key: "fxrate", value: "0.18" }, { key: "fxdrive", value: "0.12" }, { key: "fxspace", value: "0.34" }] },
  // The four above all move within a comfortable middle. These two are allowed to reach the ends of the room:
  // one takes a voice down to a rumour behind a closed filter, the other opens the whole spectrum at once.
  { phrase: "sinks to a rumour behind a closed door", set: [{ key: "fxhp", value: "30" }, { key: "fxlp", value: "Pseg([420, 980, 380], 44, repeats: inf)" }, { key: "fxmotion", value: "0.52" }, { key: "fxrate", value: "0.03" }, { key: "fxspace", value: "0.68" }] },
  { phrase: "throws the whole spectrum open at once", set: [{ key: "fxhp", value: "Pseg([28, 45, 30], 36, repeats: inf)" }, { key: "fxlp", value: "Pseg([14000, 3200, 15000], 30, repeats: inf)" }, { key: "fxmotion", value: "0.3" }, { key: "fxrate", value: "0.26" }, { key: "fxdrive", value: "0.22" }, { key: "fxspace", value: "0.14" }] },
];

type MovePart = Suggestion["parts"][number];

/** Every instant choice does two audible jobs: material enters while another voice changes relationship to it. */
function companion(seed: AmbientSeed, input: AskInput, transformed: boolean, excluded: Set<string>, blocked = new Set<string>()): { part: MovePart; phrase: string; evidence: string } | null {
  if (transformed) {
    const candidates = MATERIAL_ADDITIONS.map(id => AMBIENT_ARSENAL.find(item => item.id === id)!)
      .filter(item => item.slot !== seed.slot && !blocked.has(item.slot) && !excluded.has(item.id));
    const start = ((input.round ?? 0) + seed.id.length) % Math.max(1, candidates.length);
    for (let offset = 0; offset < candidates.length; offset++) {
      const addition = candidates[(start + offset) % candidates.length], before = input.slots[addition.slot] || "";
      if (before.trim() === addition.code.trim() || validate({ slot: addition.slot, code: addition.code })) continue;
      return { part: { slot: addition.slot, code: addition.code, diff: `new texture · ${addition.label}` },
        phrase: `${addition.label} answers in ${addition.slot}`, evidence: `${seed.slot} changes rhythm as ${addition.slot} gains new material` };
    }
    return null;
  }

  const slots = COUNTER_SLOTS[seed.slot] || Object.keys(input.slots).filter(slot => slot !== seed.slot);
  const start = ((input.round ?? 0) + seed.id.length) % Math.max(1, slots.length);
  for (let offset = 0; offset < slots.length; offset++) {
    const slot = slots[(start + offset) % slots.length], before = input.slots[slot] || "";
    if (blocked.has(slot) || !before.trim()) continue;
    const profile = FILTER_MOVES[((input.round ?? 0) + seed.id.length + offset) % FILTER_MOVES.length], set = profile.set;
    const code = applyPatch(before, { slot, set });
    if (before.trim() === code.trim() || validate({ slot, code })) continue;
    return { part: { slot, code, diff: describe(before, { slot, set }) }, phrase: `${slot} ${profile.phrase}`,
      evidence: `${seed.slot} gains new material as ${slot} is reshaped` };
  }
  return null;
}

const identity = (code: string) => {
  const values = Object.fromEntries(parseSlot(code).map(({ key, value }) => [key, value]));
  return `${values.instrument || ""}|${values.buf || ""}`;
};

/** A fast model may return one strong part. Complete its arrangement locally instead of waiting for another call. */
export function enrichAmbientSuggestion(input: AskInput, option: Suggestion, reserved = new Set<string>()): Suggestion {
  if (option.parts.length !== 1) return option;
  const primary = option.parts[0], before = input.slots[primary.slot] || "";
  const transformed = !!before.trim() && identity(before) === identity(primary.code);
  const seed: AmbientSeed = { id: option.angle || "wildcard", label: option.angle || "wildcard", slot: primary.slot,
    code: primary.code, why: option.why, expect: option.expect };
  const answer = companion(seed, input, transformed, new Set(), new Set([...reserved, primary.slot]));
  if (!answer) return option;
  const parts = [primary, answer.part];
  return { ...option, parts, diff: parts.map(part => `${part.slot} ${part.diff}`).join("  |  "),
    why: `${option.why.replace(/[.!?]+$/, "")}; ${answer.phrase}.`, evidence: `${option.evidence}; ${answer.evidence}` };
}

/** Ambient skills are deterministic and immediate; the model may add a third interpretation in the background. */
export function ambientSkillArsenal(input: AskInput, count = 2): Suggestion[] {
  const id = input.showcase;
  if (!id || !["carve", "fracture", "reveal"].includes(id)) return [];
  const occupied = Object.entries(input.slots).filter(([, code]) => code.trim());
  const profiles = id === "carve" ? [
    { set: [{ key: "fxhp", value: "180" }, { key: "fxlp", value: "2800" }, { key: "fxmotion", value: "0.92" }, { key: "fxrate", value: "0.12" }, { key: "fxdrive", value: "0.18" }], why: "A deep moving band carves rhythm from the voice already playing.", expect: { metric: "brightness", dir: "down" } as const },
    { set: [{ key: "fxhp", value: "720" }, { key: "fxlp", value: "8400" }, { key: "fxmotion", value: "0.76" }, { key: "fxrate", value: "0.21" }, { key: "fxspace", value: "0.28" }], why: "The existing layer opens into quick silver bands with air between them.", expect: { metric: "air", dir: "up" } as const },
  ] : id === "fracture" ? [
    { set: [{ key: "delta", value: "Pseq([0.5, 0.25, 1.75, 0.5, 3], inf)" }, { key: "fxdrive", value: "0.16" }, { key: "fxlp", value: "4800" }], why: "A close pair fractures the phrase, then a long gap restores its breath.", expect: { metric: "density", dir: "up" } as const },
    { set: [{ key: "delta", value: "Pseq([1.25, 0.5, 0.5, 2.75, 4], inf)" }, { key: "fxmotion", value: "0.8" }, { key: "fxrate", value: "0.24" }], why: "The current texture trips across an uneven five-step cycle for two bars.", expect: { metric: "density", dir: "up" } as const },
    // FRACTURE was two variations on "slightly uneven". This one is the actual gesture the name promises: a burst
    // packed into a beat and a half, then a hole longer than anything else in the set.
    { set: [{ key: "delta", value: "Pwrand([0.1875, 0.25, 0.375, Pexprand(9, 17, 1)], [0.3, 0.28, 0.24, 0.18], inf)" }, { key: "fxdrive", value: "0.24" }, { key: "fxmotion", value: "0.9" }, { key: "fxrate", value: "0.26" }], why: "A tight flurry, then a hole: the voice empties the room for ten seconds and returns.", expect: { metric: "density", dir: "up" } as const },
  ] : [
    { set: [{ key: "fxhp", value: "80" }, { key: "fxlp", value: "5200" }, { key: "fxmotion", value: "0.68" }, { key: "fxrate", value: "0.045" }, { key: "fxspace", value: "0.62" }], why: "The current voice spreads into a wide filtered field.", expect: { metric: "width", dir: "up" } as const },
    { set: [{ key: "fxhp", value: "320" }, { key: "fxlp", value: "7600" }, { key: "fxmotion", value: "0.88" }, { key: "fxrate", value: "0.07" }, { key: "fxdrive", value: "0.12" }, { key: "fxspace", value: "0.52" }], why: "A brighter halo emerges from the existing material through the wash.", expect: { metric: "brightness", dir: "up" } as const },
    // A reveal that goes somewhere: the wash closes almost completely, then the whole spectrum opens behind it.
    { set: [{ key: "fxhp", value: "Pseg([28, 900, 30], 36, repeats: inf)" }, { key: "fxlp", value: "Pseg([520, 14000, 620], 44, repeats: inf)" }, { key: "fxmotion", value: "0.4" }, { key: "fxrate", value: "0.05" }, { key: "fxspace", value: "0.62" }], why: "The room shuts almost to silence, then opens across its whole range and closes again.", expect: { metric: "brightness", dir: "up" } as const },
  ];
  const out: Suggestion[] = [];
  for (let n = 0; n < occupied.length && out.length < count; n++) {
    const [slot, current] = occupied[((input.round ?? 0) + n * 2) % occupied.length], profile = profiles[out.length % profiles.length];
    const code = applyPatch(current, { slot, set: profile.set });
    if (validate({ slot, code })) continue;
    const diff = describe(current, { slot, set: profile.set });
    out.push({ origin: "recipe", recipe_id: `ambient-skill-${id}-${slot}`, slot, code, parts: [{ slot, code, diff }], diff,
      why: profile.why, evidence: `${id} transforms the active ${slot} source`, angle: id, ms: 0, expect: profile.expect,
      ...(id === "fracture" ? { forBars: 2 } : {}), ...(id === "reveal" ? { transition: "wash" as const } : {}) });
  }
  return out;
}

export function ambientArsenal(input: AskInput, count = 2): Suggestion[] {
  if (!/ambient|nature/i.test(input.context) || input.inspiration || input.signal?.aborted) return [];
  if (input.showcase) return ambientSkillArsenal(input, count);
  const ordered = ROTATION.map(id => AMBIENT_ARSENAL.find(seed => seed.id === id)!), start = (input.round ?? 0) % ordered.length, chosen: AmbientSeed[] = [];
  const recent = new Set(input.history.slice(-5).map(item => item.recipe_id?.replace(/^ambient-/, "")).filter(Boolean));
  // A listener's discipline is read from its own markdown, and it biases which family of gestures it reaches for.
  // "contrast" is the fifth: a listener whose subject is dynamics rather than material gets handed the extremes.
  const discipline = /contrast|extreme|rupture|dynamics|squall|storm/i.test(input.dj.style) ? "contrast"
    : /paper|material|mineral|tactile|wood/i.test(input.dj.style) ? "material"
    : /rain|water|weather|field|canopy/i.test(input.dj.style) ? "weather"
    : /harmon|light|pitch|constellation/i.test(input.dj.style) ? "light" : "space";
  const family = (id: string) => Math.abs(contour(id).energy) >= 1.5 ? "contrast"
    : /finger|marble|twig|pebble|leaf|reed|brush|stone/.test(id) ? "material"
    : /rain|wave|canopy|mist|bird/.test(id) ? "weather" : /paper|halo|air/.test(id) ? "light" : "space";
  const note = input.note.toLowerCase();
  const opening = input.history.length === 0 && (input.round ?? 0) <= 1 && !note.trim();
  const rhythmic = /rhyth|beat|pulse|move|faster|variation|change/.test(note);
  const filtering = /filter|current|existing|morph|mutat|darker|brighter|open|close|thin|space/.test(note);
  const tactile = /texture|asmr|finger|marble|paper|wood|close|tactile/.test(note);
  const stochastic = /random|stoch|surprise|appear|unpredict|rare/.test(note);
  // The set's own arc. It is deliberately weaker than an explicit performer request and than the scored opening,
  // but strong enough that, left alone, the rounds stop being a flat sequence of equally-sized additions.
  const tide = ambientTide(input);
  const wantsHigh = /high|air|bright|spark|flutter/.test(note), wantsLow = /low|sub|deep|body|weight/.test(note);
  const pool = Array.from({ length: ordered.length }, (_, offset) => {
    const seed = ordered[(start + offset) % ordered.length], learned = input.recipeScores?.[`ambient-${seed.id}`] ?? 0;
    const isRhythmic = /finger|marble|droplet|twig|pebble|leaf|reed|mist|rain|clearing|halo|flutter|stone|burst|fall|shutter/.test(seed.id);
    const isStochastic = /flutter|stone|burst|grain|fall|shutter|polyrhythm|horizon/.test(seed.id);
    const isHigh = /air|bird|paper|rain/.test(seed.id), isLow = /stone|marble|droplet|wave/.test(seed.id);
    return { seed, score: learned - offset * 0.035 + (family(seed.id) === discipline ? (discipline === "contrast" ? 0.7 : 0.13) : 0)
      + (opening && seed.id === "marbles" ? 2.2 : 0) + (opening && seed.id === "rain-prism" ? 2.1 : 0)
      + (rhythmic && isRhythmic ? 1.1 : 0) + (filtering && seed.transform ? 1.3 : 0)
      + (tactile && family(seed.id) === "material" ? 1 : 0) + (stochastic && isStochastic ? 1.4 : 0)
      + (wantsHigh && isHigh ? 1.1 : 0) + (wantsLow && isLow ? 1.1 : 0) - (recent.has(seed.id) ? 0.8 : 0)
      - Math.abs(contour(seed.id).energy - tide.wants) * 0.2
      + (tide.avoid && contour(seed.id).band !== tide.avoid ? 0.12 : 0) };
  }).sort((a, b) => b.score - a.score);
  // Two passes: the first refuses a second gesture in the register the first one already occupies, so a round is
  // a real choice between two places in the room. The second pass fills the seat anyway rather than offering one.
  const bands = new Set<Band>();
  for (const pass of [0, 1]) for (const { seed } of pool) {
    if (chosen.length >= count) break;
    const current = input.slots[seed.slot] || "";
    const code = seed.transform && current.trim() ? applyPatch(current, { slot: seed.slot, set: seed.transform }) : seed.code;
    if (chosen.some(item => item.id === seed.id || item.slot === seed.slot) || current.trim() === code.trim()) continue;
    if (pass === 0 && bands.has(contour(seed.id).band)) continue;
    if (!validate({ slot: seed.slot, code })) { chosen.push({ ...seed, code }); bands.add(contour(seed.id).band); }
  }
  const excluded = new Set(chosen.map(seed => seed.id));
  return chosen.map((seed, index) => {
    // Name the arc on the leading card when the gesture really is what this phase asked for. The performer can
    // then see WHY a huge low or a hole is being offered now, instead of reading it as another random texture.
    const onTide = index === 0 && Math.abs(contour(seed.id).energy - tide.wants) <= 0.6;
    const current = input.slots[seed.slot] || "", transformed = !!seed.transform && !!current.trim();
    const primaryDiff = transformed ? describe(current, { slot: seed.slot, set: seed.transform! }) : `new texture · ${seed.label}`;
    const primary: MovePart = { slot: seed.slot, code: seed.code, diff: primaryDiff };
    const answer = companion(seed, input, transformed, excluded), parts = answer ? [primary, answer.part] : [primary];
    const diff = parts.map(part => `${part.slot} ${part.diff}`).join("  |  ");
    return { origin: "recipe", recipe_id: `ambient-${seed.id}`, slot: seed.slot, code: seed.code,
      parts, diff,
      why: `${onTide ? `${tide.says}: ` : ""}${answer ? `${transformed ? `${seed.label} reshapes the room` : `Bring in ${seed.label}`}; ${answer.phrase}.` : seed.why}`,
      evidence: `${answer?.evidence ?? (transformed ? `transforms the active ${seed.slot} voice` : `replaces ${seed.slot} · ${seed.label}`)} · tide ${tide.phase}`,
      angle: seed.id, ms: 0, expect: seed.expect };
  });
}
