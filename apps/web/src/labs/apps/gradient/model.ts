/**
 * Gradient descent on a straight line y = m·x + c: the error is the mean squared distance to the points, and each step
 * moves m and c a little against the slope of that error. Hours and scores are scaled to 0–1 so one learning rate fits.
 */
import { rng } from "../../kit/rng";

export interface P { x: number; y: number }
export interface Line { m: number; c: number }

/**
 * The lab's three step sizes. "Too big" is just past the edge of stability (about 0.79 for this data), so the line
 * visibly overshoots back and forth, further each time, for several steps before it flies off; a much bigger rate would
 * blow up in one step and show nothing.
 */
export const RATES = { small: 0.05, good: 0.6, big: 0.8 } as const;
/** Steps before the lab stops a run that is still crawling. */
export const MAX_STEPS = 200;

/** Hours studied (0–10, scaled to 0–1) and test score (scaled to 0–1). */
export function data(seed = 5, n = 18): P[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => { const h = r() * 10; return { x: h / 10, y: Math.min(1, Math.max(0, (32 + 6 * h + r.normal() * 7) / 100)) }; });
}

export const loss = (l: Line, pts: P[]) => pts.reduce((s, p) => s + (l.m * p.x + l.c - p.y) ** 2, 0) / pts.length;
export function grad(l: Line, pts: P[]) {
  let dm = 0, dc = 0;
  for (const p of pts) { const e = l.m * p.x + l.c - p.y; dm += 2 * e * p.x; dc += 2 * e; }
  return { dm: dm / pts.length, dc: dc / pts.length };
}
export const step = (l: Line, pts: P[], rate: number): Line => { const g = grad(l, pts); return { m: l.m - rate * g.dm, c: l.c - rate * g.dc }; };

/** The exact best line (least squares), to compare with what descent finds. */
export function best(pts: P[]): Line {
  const n = pts.length, sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
  const sxx = pts.reduce((a, p) => a + p.x * p.x, 0), sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { m, c: (sy - m * sx) / n };
}
