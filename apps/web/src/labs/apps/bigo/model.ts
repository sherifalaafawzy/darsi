/**
 * How work grows with the size of the job. Each kind of job is really run here, counting its comparisons:
 * finding a name in a sorted register (log n), finding the tallest pupil (n), sorting the register with merge sort
 * (n log n), and checking every pair of pupils for a shared birthday (n²).
 */
import { rng } from "../../kit/rng";

export type Growth = "log" | "n" | "nlogn" | "n2";
export const GROWTHS: Growth[] = ["log", "n", "nlogn", "n2"];

const data = (n: number, seed = 5) => { const r = rng(seed); return Array.from({ length: n }, () => Math.floor(r() * 1e6)); };

/** Comparisons the job really makes for n items. */
export function count(g: Growth, n: number): number {
  let c = 0;
  if (n < 1) return 0;
  if (g === "log") {
    // Binary search for a name that comes after every other one: the most halvings it can need.
    let lo = 0, hi = n - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; c++; lo = mid + 1; }
  } else if (g === "n") {
    const a = data(n);
    let top = a[0];
    for (let i = 1; i < n; i++) { c++; if (a[i] > top) top = a[i]; }
  } else if (g === "nlogn") {
    const a = data(n);
    const sort = (x: number[]): number[] => {
      if (x.length < 2) return x;
      const l = sort(x.slice(0, x.length >> 1)), r = sort(x.slice(x.length >> 1)), out: number[] = [];
      let i = 0, j = 0;
      while (i < l.length && j < r.length) { c++; out.push(l[i] <= r[j] ? l[i++] : r[j++]); }
      return out.concat(l.slice(i), r.slice(j));
    };
    sort(a);
  } else {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) c++;
  }
  return c;
}

/** The same, worked out instead of counted (for sizes too big to count on a phone). */
export function estimate(g: Growth, n: number): number {
  if (n < 1) return 0;
  return g === "log" ? Math.floor(Math.log2(n)) + 1 : g === "n" ? n - 1 : g === "nlogn" ? Math.round(n * Math.log2(n)) : (n * (n - 1)) / 2;
}

/** A phone does roughly ten million simple steps a second. */
export const PER_SECOND = 1e7;
export const seconds = (ops: number) => ops / PER_SECOND;

export type Unit = "instant" | "ms" | "s" | "min" | "h" | "d";
/** A time in seconds, in the unit people would use for it (rounded to 2 significant figures). */
export function duration(sec: number): { n: number; unit: Unit } {
  const r = (v: number) => Number(v.toPrecision(2));
  if (sec < 1e-3) return { n: 0, unit: "instant" };
  if (sec < 1) return { n: r(sec * 1e3), unit: "ms" };
  if (sec < 60) return { n: r(sec), unit: "s" };
  if (sec < 3600) return { n: r(sec / 60), unit: "min" };
  if (sec < 86400) return { n: r(sec / 3600), unit: "h" };
  return { n: r(sec / 86400), unit: "d" };
}

/** How the work changes when the job doubles in size. */
export const ratio = (g: Growth, n: number) => count(g, 2 * n) / Math.max(1, count(g, n));

/** Sizes for the slider, and the points of the curves up to n. */
export const SIZES = [10, 20, 50, 100, 200, 500, 1000];
export const curve = (g: Growth, n: number, points = 20) =>
  Array.from({ length: points + 1 }, (_, i) => { const x = Math.round((n * i) / points); return [x, count(g, x)] as [number, number]; });
