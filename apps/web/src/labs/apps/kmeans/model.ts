/**
 * k-means, as "where should the k bus stops go?": every house walks to its nearest stop, then every stop moves to the
 * middle of its houses; repeat until nothing changes. It finds groups without being told any answers.
 */
import { rng } from "../../kit/rng";

export interface P { x: number; y: number }

/** Houses in four neighbourhoods on a 10×10 map. */
export function houses(seed = 8): P[] {
  const r = rng(seed), centres = [[2.5, 7.5], [7.5, 7.8], [3, 2.5], [7.8, 3]];
  return centres.flatMap(([cx, cy], i) => Array.from({ length: 9 + i }, () => ({ x: Math.min(9.8, Math.max(0.2, cx + r.normal() * 1.1)), y: Math.min(9.8, Math.max(0.2, cy + r.normal() * 1.1)) })));
}

/** k stops placed on k different random houses. */
export function startStops(pts: P[], k: number, seed: number): P[] {
  const r = rng(seed), pool = pts.map((_, i) => i);
  return Array.from({ length: Math.min(k, pts.length) }, () => { const j = pool.splice(r.int(pool.length), 1)[0]; return { ...pts[j] }; });
}

const d2 = (a: P, b: P) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
/** Each house's nearest stop. */
export const assign = (pts: P[], stops: P[]) => pts.map((p) => { let best = 0; stops.forEach((s, i) => { if (d2(p, s) < d2(p, stops[best])) best = i; }); return best; });
/** Each stop moves to the middle of its houses (a stop with no houses stays put). */
export const move = (pts: P[], stops: P[], a: number[]) => stops.map((s, i) => {
  const mine = pts.filter((_, j) => a[j] === i);
  return mine.length ? { x: mine.reduce((t, p) => t + p.x, 0) / mine.length, y: mine.reduce((t, p) => t + p.y, 0) / mine.length } : s;
});
/** Average walk from each house to its stop. */
export const walk = (pts: P[], stops: P[], a: number[]) => pts.reduce((t, p, j) => t + Math.sqrt(d2(p, stops[a[j]])), 0) / Math.max(1, pts.length);
export const same = (a: P[], b: P[]) => a.every((p, i) => d2(p, b[i]) < 1e-12);

/** Runs to the end: returns the final stops, assignment and number of rounds. */
export function run(pts: P[], stops: P[], max = 100) {
  let cur = stops, a = assign(pts, cur), rounds = 0;
  while (rounds < max) {
    const next = move(pts, cur, a);
    rounds++;
    if (same(next, cur)) break;
    cur = next; a = assign(pts, cur);
  }
  return { stops: cur, a, rounds };
}
