/**
 * Indexes: a table of pupils stored in the order they joined, and an index (their numbers sorted, each with a pointer
 * to its row). Without the index, finding one pupil means reading rows until it turns up: n/2 looks on average.
 * With it, binary search halves the candidates at every look: about log2(n). Every look here is really made.
 */
import { rng } from "../../kit/rng";

export const SIZES = [100, 1_000, 10_000, 100_000, 1_000_000];
/** Bytes per index entry: a 4-byte pupil number and a 4-byte row pointer. */
export const ENTRY_BYTES = 8;

/** Pupil numbers (from `first`) in a shuffled order, as rows are stored. */
export function table(n: number, seed = 1, first = 1): Int32Array {
  const r = rng(seed), ids = new Int32Array(n);
  for (let i = 0; i < n; i++) ids[i] = first + i;
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
  return ids;
}
export const sorted = (ids: Int32Array) => Int32Array.from(ids).sort();

/** Looks needed reading row by row until the pupil turns up. */
export function scan(ids: Int32Array, key: number) {
  for (let i = 0; i < ids.length; i++) if (ids[i] === key) return i + 1;
  return ids.length;
}
/** Binary search in the sorted numbers: each step is one look, then half the rest is ruled out. */
export function seekSteps(keys: Int32Array, key: number) {
  const steps: { lo: number; hi: number; mid: number }[] = [];
  let lo = 0, hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    steps.push({ lo, hi, mid });
    if (keys[mid] === key) break;
    if (keys[mid] < key) lo = mid + 1; else hi = mid - 1;
  }
  return steps;
}
export const seek = (keys: Int32Array, key: number) => seekSteps(keys, key).length;

/** Average looks over k random lookups in a table of n rows, both ways, and the time they took on this phone. */
export function trial(n: number, k = 20, seed = 3) {
  const ids = table(n, seed), keys = sorted(ids), r = rng(seed + 1);
  const want = Array.from({ length: k }, () => ids[Math.floor(r() * n)]);
  let a = 0, b = 0;
  const t0 = performance.now();
  for (const key of want) a += scan(ids, key);
  const t1 = performance.now();
  for (const key of want) b += seek(keys, key);
  const t2 = performance.now();
  return { n, scan: a / k, seek: b / k, scanMs: t1 - t0, seekMs: t2 - t1 };
}

/** What to expect on average: half the rows, against about log2 of them. */
export const expectScan = (n: number) => (n + 1) / 2;
export const expectSeek = (n: number) => Math.max(1, Math.log2(n + 1) - 1);

/** A small table to watch: 32 three-digit pupil numbers. */
export function small(seed: number) {
  const r = rng(seed), pool = new Set<number>();
  while (pool.size < 32) pool.add(100 + Math.floor(r() * 900));
  const ids = Int32Array.from(pool);
  return { ids, keys: sorted(ids), key: ids[8 + Math.floor(r() * 24)] };
}
