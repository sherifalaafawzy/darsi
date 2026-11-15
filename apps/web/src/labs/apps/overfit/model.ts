/**
 * Polynomial curve fitting by least squares, on a Chebyshev basis (numerically steady even at degree 12 on [-1, 1]).
 * A model's freedom is its degree: too little misses the pattern, too much memorises the noise.
 */
import { rng } from "../../kit/rng";

export interface P { x: number; y: number }
export const truth = (x: number) => 0.8 * Math.sin(Math.PI * x) + 0.2 * x;

export function sample(n: number, noise: number, seed: number): P[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => { const x = r() * 2 - 1; return { x, y: truth(x) + r.normal() * noise }; });
}

/**
 * The lab's own data (the same examples on every phone): 10 or 40 training examples and 30 new ones. TRAIN_SEED is
 * chosen so the error on new examples makes the U the lessons ask about (ai-u1-4 "decide where to stop", ds-u1-2 "where
 * test error turns back up"): high for a stiff curve, lowest in the middle, then climbing. Seed 21 zigzagged: it rose at
 * freedom 2 and 4, then fell back to "About right" at 5 and 6.
 */
export const TRAIN_SEED = 247, TEST_SEED = 99;
export const trainingExamples = (many: boolean, noise: number) => sample(many ? 40 : 10, noise, TRAIN_SEED);
export const newExamples = (noise: number) => sample(30, noise, TEST_SEED);

/** T0..Td at x (Chebyshev polynomials of the first kind). */
export function basis(x: number, d: number) {
  const t = [1, x];
  for (let k = 2; k <= d; k++) t.push(2 * x * t[k - 1] - t[k - 2]);
  return t.slice(0, d + 1);
}

/** Solves A·β = b (Gaussian elimination with partial pivoting). */
function solve(A: number[][], b: number[]) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

/** The degree-d polynomial closest (least squares) to the points; a tiny ridge keeps it solvable with few points. */
export function fit(pts: P[], d: number, ridge = 1e-9) {
  const A = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0)), b = new Array(d + 1).fill(0);
  for (const p of pts) { const t = basis(p.x, d); for (let i = 0; i <= d; i++) { b[i] += t[i] * p.y; for (let j = 0; j <= d; j++) A[i][j] += t[i] * t[j]; } }
  for (let i = 0; i <= d; i++) A[i][i] += ridge;
  const beta = solve(A, b);
  return (x: number) => basis(x, d).reduce((s, t, i) => s + t * beta[i], 0);
}

export const mse = (f: (x: number) => number, pts: P[]) => pts.reduce((s, p) => s + (f(p.x) - p.y) ** 2, 0) / Math.max(1, pts.length);

export type Verdict = "under" | "good" | "over" | "calm";
/**
 * What the lab says about a fit, judged from its two errors against the noise in the data (noise² is the best error any
 * curve can hope for). Missing the training examples by more than the noise explains is underfitting; doing much worse
 * on new examples than on its own, and than the noise explains, is overfitting.
 */
export function verdict(eTrain: number, eTest: number, noise: number, degree: number, many: boolean): Verdict {
  const floor = noise * noise;
  if (eTrain > floor + 0.04) return "under";
  if (eTest > 2 * floor + 0.05 && eTest > 2 * eTrain) return "over";
  return many && degree >= 7 ? "calm" : "good";
}
