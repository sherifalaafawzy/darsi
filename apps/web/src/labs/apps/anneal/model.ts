/**
 * A seating plan by local search. Twelve pupils, twelve desks in three rows of four. Pupils who work together should
 * sit close (each pair costs the steps between their desks); chatty pairs shouldn't sit side by side (a penalty each). A move
 * swaps two pupils. Hill climbing keeps only swaps that help, so it stops at the first plan no single swap improves:
 * a local minimum, often not the best. Simulated annealing also accepts some swaps that make things worse, more often
 * while the "temperature" is high, then cools down; early on it can climb out of a valley and find a deeper one.
 */
import { rng, type Rng } from "../../kit/rng";

export const ROWS = 3, COLS = 4, SEATS = ROWS * COLS;
export const PUPILS = ["ali", "sara", "omar", "lina", "musa", "nour", "adam", "hiba", "yara", "zaid", "rami", "dana"] as const;
/**
 * Pairs who work together, and how many lessons a week (1–3): each costs that many times the steps between their
 * desks. Chatty pairs cost PENALTY if they sit side by side. A rugged plan: from a random start, hill climbing ends
 * anywhere from 37 (the best long runs find) to 47 and finds 37 about one time in four; annealing about two in three.
 */
export const PAIRS: [number, number, number][] = [
  [0, 2, 2], [0, 4, 1], [0, 9, 3], [2, 4, 2], [2, 5, 1], [2, 8, 2], [3, 8, 1], [3, 11, 1],
  [4, 7, 2], [4, 10, 3], [5, 8, 3], [5, 9, 1], [6, 9, 1], [9, 10, 3], [9, 11, 3], [10, 11, 1],
];
export const CHATTY: [number, number][] = [[2, 11], [3, 5], [4, 6], [1, 8], [6, 11]];
export const PENALTY = 4;
export const BEST = 37;
export const ITERS = 40_000;

/** plan[seat] = pupil. */
export type Plan = number[];
const rowOf = (s: number) => Math.floor(s / COLS), colOf = (s: number) => s % COLS;
export const steps = (a: number, b: number) => Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));
/** Side by side: the same row, next desks. */
export const sideBySide = (a: number, b: number) => rowOf(a) === rowOf(b) && Math.abs(colOf(a) - colOf(b)) === 1;

export const seatsOf = (plan: Plan) => { const s = new Array<number>(SEATS); plan.forEach((p, i) => { s[p] = i; }); return s; };
export function cost(plan: Plan) {
  const at = seatsOf(plan);
  let c = 0;
  for (const [a, b, w] of PAIRS) c += w * steps(at[a], at[b]);
  for (const [a, b] of CHATTY) if (sideBySide(at[a], at[b])) c += PENALTY;
  return c;
}

export function shuffled(seed: number): Plan {
  const r = rng(seed), p = Array.from({ length: SEATS }, (_, i) => i);
  for (let i = p.length - 1; i > 0; i--) { const j = r.int(i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

/** True if no swap of two pupils lowers the cost. */
export function stuck(plan: Plan) {
  const c = cost(plan);
  for (let i = 0; i < SEATS; i++) for (let j = i + 1; j < SEATS; j++) {
    const q = plan.slice(); [q[i], q[j]] = [q[j], q[i]];
    if (cost(q) < c) return false;
  }
  return true;
}

export interface Search { plan: Plan; cost: number; best: Plan; bestCost: number; t: number; iter: number; worse: number; r: Rng }
export interface Schedule { t0: number; iters: number }
/** The temperature after `iter` of `iters` swaps: geometric cooling from t0 down to a hundredth of it. */
export const temperature = (s: Schedule, iter: number) => (s.t0 <= 0 ? 0 : s.t0 * Math.pow(0.01, Math.min(1, iter / s.iters)));

export function begin(plan: Plan, seed: number, sch: Schedule): Search {
  const c = cost(plan);
  return { plan: plan.slice(), cost: c, best: plan.slice(), bestCost: c, t: temperature(sch, 0), iter: 0, worse: 0, r: rng(seed) };
}

/**
 * One proposed swap. Better or equal: keep it. Worse by Δ: keep it with chance e^(−Δ/T) (never when T is 0, which is
 * hill climbing). Mutates and returns the search state.
 */
export function step(s: Search, sch: Schedule): Search {
  const i = s.r.int(SEATS); let j = s.r.int(SEATS - 1); if (j >= i) j++;
  const q = s.plan.slice(); [q[i], q[j]] = [q[j], q[i]];
  const c = cost(q), d = c - s.cost;
  s.t = temperature(sch, s.iter);
  if (d <= 0 || (s.t > 0 && s.r() < Math.exp(-d / s.t))) {
    if (d > 0) s.worse++;
    s.plan = q; s.cost = c;
    if (c < s.bestCost) { s.bestCost = c; s.best = q.slice(); }
  }
  s.iter++;
  return s;
}

/** A whole run, for the tests: the best cost found. */
export function solve(plan: Plan, seed: number, sch: Schedule) {
  const s = begin(plan, seed, sch);
  while (s.iter < sch.iters) step(s, sch);
  return s;
}
