/**
 * Four ways to sort the same bars, recorded as the steps a computer takes: comparing two bars, swapping two, or (merge
 * sort) copying a bar into place. Played back side by side, one step each at the same pace, it is a fair race.
 */
import { rng } from "../../kit/rng";

export type Algo = "bubble" | "insertion" | "selection" | "merge";
export const ALGOS: Algo[] = ["bubble", "insertion", "selection", "merge"];
export type Op = { t: "cmp"; i: number; j: number } | { t: "swap"; i: number; j: number } | { t: "set"; i: number; v: number };
export type Order = "random" | "nearly" | "reversed";

/** n bars of heights 1…n in the chosen starting order. */
export function makeBars(n: number, order: Order, seed = 7): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  if (order === "reversed") return a.reverse();
  const r = rng(seed);
  if (order === "nearly") {
    // About one neighbour swap per 8 bars, at distinct places that don't touch: two swaps of the same pair cancelled
    // out, and with 16 bars the "nearly sorted" list came out fully sorted (a tie, not a win for insertion sort).
    if (n < 2) return a;
    const want = Math.max(1, Math.round(n / 8)), at = new Set<number>();
    while (at.size < want) { const i = Math.floor(r() * (n - 1)); if (!at.has(i) && !at.has(i - 1) && !at.has(i + 1)) at.add(i); }
    for (const i of at) [a[i], a[i + 1]] = [a[i + 1], a[i]];
    return a;
  }
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Every step the algorithm takes to sort a copy of `input`. */
export function ops(algo: Algo, input: number[]): Op[] {
  const a = [...input], out: Op[] = [], n = a.length;
  const less = (i: number, j: number) => { out.push({ t: "cmp", i, j }); return a[i] < a[j]; };
  const swap = (i: number, j: number) => { out.push({ t: "swap", i, j }); [a[i], a[j]] = [a[j], a[i]]; };
  if (algo === "bubble") {
    // Pass after pass, neighbours out of order swap; it stops after a pass with no swaps.
    for (let end = n - 1; end > 0; end--) {
      let swapped = false;
      for (let i = 0; i < end; i++) if (less(i + 1, i)) { swap(i, i + 1); swapped = true; }
      if (!swapped) break;
    }
  } else if (algo === "insertion") {
    // Each new bar slides left past the bigger ones before it.
    for (let i = 1; i < n; i++) for (let j = i; j > 0 && less(j, j - 1); j--) swap(j, j - 1);
  } else if (algo === "selection") {
    // Find the smallest of the rest, then one swap puts it in place.
    for (let i = 0; i < n - 1; i++) {
      let m = i;
      for (let j = i + 1; j < n; j++) if (less(j, m)) m = j;
      if (m !== i) swap(i, m);
    }
  } else {
    // Sort each half, then merge them, copying the smaller front bar into place each time.
    const sort = (lo: number, hi: number) => {
      if (hi - lo < 1) return;
      const mid = (lo + hi) >> 1;
      sort(lo, mid); sort(mid + 1, hi);
      const left = a.slice(lo, mid + 1), right = a.slice(mid + 1, hi + 1);
      let i = 0, j = 0;
      for (let k = lo; k <= hi; k++) {
        let take: number;
        if (i < left.length && j < right.length) { out.push({ t: "cmp", i: lo + i, j: mid + 1 + j }); take = left[i] <= right[j] ? left[i++] : right[j++]; }
        else take = i < left.length ? left[i++] : right[j++];
        a[k] = take; out.push({ t: "set", i: k, v: take });
      }
    };
    sort(0, n - 1);
  }
  return out;
}

/** The bars and the counts after the first k steps. Merge sort's comparisons point at where the two halves started. */
export function replay(input: number[], steps: Op[], k: number) {
  const a = [...input];
  let cmps = 0, moves = 0;
  for (let s = 0; s < Math.min(k, steps.length); s++) {
    const o = steps[s];
    if (o.t === "cmp") cmps++;
    else if (o.t === "swap") { [a[o.i], a[o.j]] = [a[o.j], a[o.i]]; moves++; }
    else { a[o.i] = o.v; moves++; }
  }
  return { bars: a, cmps, moves, last: k > 0 ? steps[Math.min(k, steps.length) - 1] : undefined, done: k >= steps.length };
}
export const isSorted = (a: number[]) => a.every((x, i) => !i || a[i - 1] <= x);

/** The race's pace: steps per second, so the slowest finishes in about 20 seconds (and no faster than 4 a second). */
export const pace = (most: number) => Math.max(4, most / 20);
