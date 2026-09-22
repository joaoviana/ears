import { fromBuffer } from "osc-min";

/** Validate each value before it crosses from UDP into typed engine events. */
export function readOsc(buffer: Buffer) {
  const packet = fromBuffer(buffer);
  if (packet.oscType !== "message") throw new Error("expected an OSC message");
  const args = packet.args.map(arg => arg.value);
  const number = (index: number, fallback?: number): number => {
    const value = args[index] ?? fallback;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`invalid number at ${index}`);
    return value;
  };
  const string = (index: number, fallback?: string): string => {
    const value = args[index] ?? fallback;
    if (typeof value !== "string") throw new Error(`invalid string at ${index}`);
    return value;
  };
  return {
    address: packet.address, number, string,
    optionalNumber: (index: number) => args[index] === undefined ? undefined : number(index),
    numbers: (start = 0, end = args.length) => Array.from({ length: end - start }, (_, i) => number(start + i)),
  };
}
