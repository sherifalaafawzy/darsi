/**
 * Learning by reward (Q-learning): a robot in a 6×6 school yard learns, by trial and error, how valuable each move is
 * in each square. Reaching the charger pays +10, a puddle costs 5, every step costs a little battery. Nobody shows it
 * the way; the values spread back from the charger as it practises.
 */
import type { Rng } from "../../kit/rng";

export const N = 6;
export type Cell = "free" | "wall" | "puddle" | "goal";
export const ACTIONS = [[-1, 0], [0, 1], [1, 0], [0, -1]] as const; // up, right, down, left (on screen)
export const START = (N - 1) * N; // bottom-left
export const R = { goal: 10, puddle: -5, step: -0.1, bump: -0.5 };

export function yard(): Cell[] {
  const g: Cell[] = Array(N * N).fill("free");
  for (const i of [7, 8, 9, 20, 26, 27]) g[i] = "wall";
  for (const i of [15, 32]) g[i] = "puddle";
  g[5] = "goal"; // top-right
  return g;
}

export type Q = Float64Array; // Q[state * 4 + action]
export const newQ = (): Q => new Float64Array(N * N * 4);
export const bestA = (q: Q, s: number) => { let b = 0; for (let a = 1; a < 4; a++) if (q[s * 4 + a] > q[s * 4 + b]) b = a; return b; };
export const value = (q: Q, s: number) => q[s * 4 + bestA(q, s)];

/** One move: where it ends up, the reward, and whether the trip is over. */
export function move(g: Cell[], s: number, a: number) {
  const r = Math.floor(s / N), c = s % N, [dr, dc] = ACTIONS[a], rr = r + dr, cc = c + dc;
  if (rr < 0 || rr >= N || cc < 0 || cc >= N || g[rr * N + cc] === "wall") return { s, reward: R.bump, end: false };
  const t = rr * N + cc;
  if (g[t] === "goal") return { s: t, reward: R.goal, end: true };
  return { s: t, reward: g[t] === "puddle" ? R.puddle : R.step, end: false };
}

/** One practice trip from the start. With chance `explore` it tries a random move; otherwise its best one so far. */
export function episode(g: Cell[], q: Q, r: Rng, { rate = 0.5, explore = 0.2, gamma = 0.9, max = 200 } = {}) {
  let s = START, steps = 0, total = 0;
  for (; steps < max; steps++) {
    const a = r() < explore ? r.int(4) : bestA(q, s);
    const m = move(g, s, a);
    const target = m.reward + (m.end ? 0 : gamma * value(q, m.s));
    q[s * 4 + a] += rate * (target - q[s * 4 + a]);
    total += m.reward; s = m.s;
    if (m.end) return { steps: steps + 1, total, reached: true };
  }
  return { steps, total, reached: false };
}

/** The path it takes when it only uses what it has learned (no exploring). */
export function greedyPath(g: Cell[], q: Q, max = N * N * 2) {
  const path = [START];
  let s = START;
  for (let i = 0; i < max; i++) { const m = move(g, s, bestA(q, s)); s = m.s; path.push(s); if (m.end) return { path, reached: true }; }
  return { path, reached: false };
}
