/** Histograms: counting values into equal bins, and reading a distribution's shape. */
import { rng } from "../../kit/rng";

/** Heights of 60 pupils in cm (seeded, so every phone shows the same class). */
export function heights(seed = 7) {
  const r = rng(seed);
  return Array.from({ length: 60 }, () => Math.round(150 + r.normal() * 8));
}
/** Minutes 60 pupils take to get to school: most are near, a few live far away (skewed right). */
export function journeys(seed = 11) {
  const r = rng(seed);
  return Array.from({ length: 60 }, () => Math.round(5 + -Math.log(1 - r() * 0.98) * 12));
}
export interface Bin { from: number; to: number; count: number }
/** Equal-width bins starting at `start`; each bin includes its lower edge and excludes its upper edge. */
export function bins(xs: readonly number[], width: number, start = Math.floor(Math.min(...xs) / width) * width): Bin[] {
  const n = Math.max(1, Math.floor((Math.max(...xs) - start) / width) + 1);
  const out = Array.from({ length: n }, (_, i) => ({ from: start + i * width, to: start + (i + 1) * width, count: 0 }));
  for (const x of xs) out[Math.min(n - 1, Math.floor((x - start) / width))].count++;
  return out;
}
export type Shape = "symmetric" | "right" | "left";
/** A rough reading of shape from how far the mean sits from the median, relative to the spread. */
export function shape(xs: readonly number[]): Shape {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, m = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, x) => a + (x - m) ** 2, 0) / n) || 1;
  const k = (m - med) / sd;
  return k > 0.1 ? "right" : k < -0.1 ? "left" : "symmetric";
}
