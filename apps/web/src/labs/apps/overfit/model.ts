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
