/** Small maths helpers shared by the labs. */
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sum = (xs: ArrayLike<number>) => { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i]; return s; };
export const mean = (xs: ArrayLike<number>) => (xs.length ? sum(xs) / xs.length : 0);
export const argmax = (xs: ArrayLike<number>) => { let k = 0; for (let i = 1; i < xs.length; i++) if (xs[i] > xs[k]) k = i; return k; };
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Softmax with a temperature: low temperature sharpens the choice, high temperature flattens it. */
export function softmax(xs: ArrayLike<number>, temperature = 1): number[] {
  const t = Math.max(temperature, 1e-6);
  let m = -Infinity; for (let i = 0; i < xs.length; i++) m = Math.max(m, xs[i] / t);
  const e = Array.from(xs, (x) => Math.exp(x / t - m));
  const s = sum(e);
  return e.map((x) => x / s);
}

/** Index drawn from a probability list (`r` in [0, 1)). */
export function sample(ps: ArrayLike<number>, r: number): number {
  let acc = 0;
  for (let i = 0; i < ps.length; i++) { acc += ps[i]; if (r < acc) return i; }
  return ps.length - 1;
}

/** Rounds for display without long tails: 0.30000000000000004 → 0.3. */
export const round = (x: number, digits = 2) => { const f = 10 ** digits; return Math.round(x * f) / f; };
