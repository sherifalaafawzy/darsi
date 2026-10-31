/**
 * The shortest way to school, by Dijkstra's method. Every village keeps a number: the shortest way found so far from
 * home. Each turn, the waiting village with the smallest number is settled (no shorter way to it can exist, since every
 * other way is already longer), and the roads from it may lower its neighbours' numbers. When the school is settled,
 * following the roads back gives the shortest route. Roads can be closed (a flooded bridge) to see the route change.
 */
export interface Village { id: string; x: number; y: number }
export interface Road { a: number; b: number; km: number }

/** Map units are for drawing only; a road's length is its `km` (roads wind). Village 0 is home, the last is the school. */
export const VILLAGES: Village[] = [
  { id: "home", x: 1, y: 5 },
  { id: "tala", x: 3, y: 8.2 },
  { id: "bora", x: 4, y: 4.6 },
  { id: "kesi", x: 5.4, y: 8.6 },
  { id: "mina", x: 6.6, y: 6.4 },
  { id: "rubi", x: 3.8, y: 1.5 },
  { id: "sana", x: 7.2, y: 2.4 },
  { id: "school", x: 9, y: 5 },
];
export const HOME = 0, SCHOOL = VILLAGES.length - 1;
export const ROADS: Road[] = [
  { a: 0, b: 1, km: 4 }, { a: 0, b: 2, km: 5 }, { a: 0, b: 5, km: 6 },
  { a: 1, b: 3, km: 3 }, { a: 1, b: 2, km: 5 },
  { a: 2, b: 4, km: 6 }, { a: 2, b: 5, km: 4 }, { a: 2, b: 7, km: 10 },
  { a: 3, b: 4, km: 2 }, { a: 3, b: 7, km: 8 },
  { a: 4, b: 7, km: 4 }, { a: 4, b: 6, km: 5 },
  { a: 5, b: 6, km: 5 }, { a: 6, b: 7, km: 3 },
];
/** The bridge between Kesi and Mina: close it and the shortest way changes (13 km becomes 14 km, by Rubi and Sana). */
export const BRIDGE = 8;

export interface State { dist: number[]; prev: number[]; done: boolean[]; closed: ReadonlySet<number>; last: number }

export function start(n: number, closed: ReadonlySet<number> = new Set(), from = HOME): State {
  const dist = new Array<number>(n).fill(Infinity);
  dist[from] = 0;
  return { dist, prev: new Array<number>(n).fill(-1), done: new Array<boolean>(n).fill(false), closed, last: -1 };
}

/** Villages with a number that are not settled yet. */
export const waiting = (s: State) => s.dist.flatMap((d, i) => (d < Infinity && !s.done[i] ? [i] : []));
/** The waiting villages that may be settled next: those with the smallest number. */
export function smallest(s: State): number[] {
  const w = waiting(s);
  const lo = Math.min(...w.map((i) => s.dist[i]));
  return w.filter((i) => s.dist[i] === lo);
}

/** Settles village v and updates its neighbours. Returns the roads that gave a neighbour a smaller number. */
export function settle(s: State, v: number, roads: readonly Road[] = ROADS): { state: State; better: number[] } {
  const dist = s.dist.slice(), prev = s.prev.slice(), done = s.done.slice(), better: number[] = [];
  done[v] = true;
  roads.forEach((r, k) => {
    if (s.closed.has(k) || (r.a !== v && r.b !== v)) return;
    const u = r.a === v ? r.b : r.a;
    if (done[u]) return;
    if (dist[v] + r.km < dist[u]) { dist[u] = dist[v] + r.km; prev[u] = v; better.push(k); }
  });
  return { state: { dist, prev, done, closed: s.closed, last: v }, better };
}

/** The route from home to v, following each village's best road back. */
export function routeTo(s: State, v: number): number[] {
  if (s.dist[v] === Infinity) return [];
  const out = [v];
  while (s.prev[out[0]] >= 0) out.unshift(s.prev[out[0]]);
  return out;
}

/** Dijkstra until the school is settled (`to` null: until nothing is left waiting): every state on the way. */
export function run(closed: ReadonlySet<number> = new Set(), roads: readonly Road[] = ROADS, n = VILLAGES.length, to: number | null = SCHOOL): State[] {
  let s = start(n, closed);
  const out = [s];
  while ((to === null || !s.done[to]) && waiting(s).length) { s = settle(s, smallest(s)[0], roads).state; out.push(s); }
  return out;
}

/** The road between two villages, if any. */
export const roadOf = (a: number, b: number, roads: readonly Road[] = ROADS) => roads.findIndex((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
