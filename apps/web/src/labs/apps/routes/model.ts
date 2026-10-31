/**
 * The school bus route: start at the school, visit every village once, come back (the travelling salesperson problem).
 * Nearest neighbour builds a route fast by always driving to the closest village not yet visited; it is usually good,
 * but its last legs can be long. 2-opt then improves it: take out two roads, put the stretch between them back the
 * other way round, keep the change if the route got shorter, and repeat until no swap helps. For a few villages the
 * true best route can be found exactly (Held–Karp), to see how close the quick methods get.
 */
import { rng } from "../../kit/rng";

export interface V { x: number; y: number }
/** Map units are kilometres. Village 0 is the school. */
export const MAP = 10;
/** Nearest neighbour drives 34.6 km here; three 2-opt swaps bring it down to 28.6 km, the best route. */
export const VILLAGES: V[] = [
  { x: 5, y: 5 }, // the school
  { x: 8.6, y: 3.6 }, { x: 2.7, y: 1.5 }, { x: 2.8, y: 5.1 }, { x: 1.5, y: 9 }, { x: 6, y: 6.6 },
  { x: 7, y: 8.2 }, { x: 3.7, y: 7.4 }, { x: 4.6, y: 0.9 }, { x: 7.2, y: 1.6 },
];
export const MAX_VILLAGES = 11; // plus the school

export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
/** A route is a list of village indexes starting at the school (0); the bus drives back to the school at the end. */
export const length = (vs: readonly V[], route: readonly number[]) => route.reduce((s, v, i) => s + dist(vs[v], vs[route[(i + 1) % route.length]]), 0);

/** Nearest neighbour, one village at a time: every partial route on the way. */
export function nearest(vs: readonly V[]): number[][] {
  const route = [0], left = new Set(vs.map((_, i) => i).slice(1)), out = [route.slice()];
  while (left.size) {
    const here = vs[route[route.length - 1]];
    let next = -1;
    for (const v of left) if (next < 0 || dist(here, vs[v]) < dist(here, vs[next]) - 1e-12) next = v;
    route.push(next); left.delete(next); out.push(route.slice());
  }
  return out;
}

export interface Swap { route: number[]; length: number; gain: number; out: [number, number][]; in: [number, number][] }
/**
 * 2-opt, best swap first: each step takes out the two roads whose swap shortens the route most. Stops when no swap
 * helps (a "2-opt optimum": often the best route, not always).
 */
export function twoOpt(vs: readonly V[], start: readonly number[], maxSteps = 100): Swap[] {
  let route = start.slice();
  const n = route.length, out: Swap[] = [];
  for (let step = 0; step < maxSteps && n > 3; step++) {
    let bi = -1, bk = -1, bg = 1e-9;
    for (let i = 0; i < n - 1; i++) for (let k = i + 2; k < n; k++) {
      if (i === 0 && k === n - 1) continue; // the same two roads
      const a = vs[route[i]], b = vs[route[i + 1]], c = vs[route[k]], d = vs[route[(k + 1) % n]];
      const g = dist(a, b) + dist(c, d) - dist(a, c) - dist(b, d);
      if (g > bg) { bg = g; bi = i; bk = k; }
    }
    if (bi < 0) break;
    const r = route;
    const removed: [number, number][] = [[r[bi], r[bi + 1]], [r[bk], r[(bk + 1) % n]]], added: [number, number][] = [[r[bi], r[bk]], [r[bi + 1], r[(bk + 1) % n]]];
    route = [...r.slice(0, bi + 1), ...r.slice(bi + 1, bk + 1).reverse(), ...r.slice(bk + 1)];
    out.push({ route: route.slice(), length: length(vs, route), gain: bg, out: removed, in: added });
  }
  return out;
}

/** The shortest route of all, by dynamic programming over sets of villages (Held–Karp); fine up to about 12 places. */
export function bestRoute(vs: readonly V[]): { route: number[]; length: number } {
  const n = vs.length;
  if (n <= 3) { const route = vs.map((_, i) => i); return { route, length: length(vs, route) }; }
  const m = n - 1, full = (1 << m) - 1, D = vs.map((a) => vs.map((b) => dist(a, b)));
  // cost[set][j]: shortest path from the school through `set` (villages 1..m as bits), ending at village j+1.
  const cost = new Float64Array((full + 1) * m).fill(Infinity), from = new Int8Array((full + 1) * m).fill(-1);
  for (let j = 0; j < m; j++) cost[(1 << j) * m + j] = D[0][j + 1];
  for (let set = 1; set <= full; set++) for (let j = 0; j < m; j++) {
    if (!(set & (1 << j))) continue;
    const cur = cost[set * m + j];
    if (cur === Infinity) continue;
    for (let k = 0; k < m; k++) {
      if (set & (1 << k)) continue;
      const nxt = set | (1 << k), c = cur + D[j + 1][k + 1];
      if (c < cost[nxt * m + k]) { cost[nxt * m + k] = c; from[nxt * m + k] = j; }
    }
  }
  let end = 0, bestLen = Infinity;
  for (let j = 0; j < m; j++) { const c = cost[full * m + j] + D[j + 1][0]; if (c < bestLen) { bestLen = c; end = j; } }
  const back: number[] = [];
  for (let set = full, j = end; j >= 0;) { back.push(j + 1); const p = from[set * m + j]; set &= ~(1 << j); j = p; }
  return { route: [0, ...back.reverse()], length: bestLen };
}

/** New villages for "New map", the same on every phone for the same seed. */
export function randomVillages(seed: number, count = 9): V[] {
  const r = rng(seed), out: V[] = [{ x: 5, y: 5 }];
  while (out.length <= count) {
    const p = { x: 0.8 + r() * 8.4, y: 0.8 + r() * 8.4 };
    if (out.every((q) => dist(p, q) > 1.4)) out.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  }
  return out;
}
