/**
 * From signal to numbers (analog-to-digital conversion): measure a smooth wave a number of times per second (the
 * sample rate) and round each measurement to one of 2^bits levels. Too few samples and a fast wave looks slow
 * (aliasing); too few bits and the wave turns into steps.
 */
export const wave = (t: number, f: number) => 0.9 * Math.sin(2 * Math.PI * f * t);

/** Rounds a value in [-1, 1] to the nearest of 2^bits evenly spaced levels. */
export function quantize(v: number, bits: number) {
  const top = 2 ** bits - 1;
  return (Math.round(((Math.max(-1, Math.min(1, v)) + 1) / 2) * top) / top) * 2 - 1;
}
export const levels = (bits: number) => Array.from({ length: 2 ** bits }, (_, i) => (i / (2 ** bits - 1)) * 2 - 1);

export interface Sample { t: number; v: number; q: number }
/** Samples over one second. */
export const sample = (f: number, rate: number, bits: number): Sample[] =>
  Array.from({ length: Math.floor(rate) + 1 }, (_, k) => { const t = k / rate, v = wave(t, f); return { t, v, q: quantize(v, bits) }; });

/** The frequency the samples seem to show: a wave faster than half the sample rate folds back to a slower one. */
export const apparent = (f: number, rate: number) => Math.abs(f - rate * Math.round(f / rate));
/** Nyquist: you need more than two samples per wiggle. */
export const enough = (f: number, rate: number) => rate > 2 * f;
/** Typical gap between a sample's true and rounded value. */
export const roundingError = (ss: Sample[]) => Math.sqrt(ss.reduce((s, x) => s + (x.v - x.q) ** 2, 0) / Math.max(1, ss.length));
export const bitsPerSecond = (rate: number, bits: number) => rate * bits;
