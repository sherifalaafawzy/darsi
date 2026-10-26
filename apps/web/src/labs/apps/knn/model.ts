/**
 * k nearest neighbours: to judge a new mango, find the k mangoes most like it (closest on softness and colour) and
 * go with the majority. No training at all: the examples are the model.
 */
import { rng } from "../../kit/rng";

export interface Pt { x: number; y: number; ripe: boolean }

/** Mangoes by softness (x) and colour from green to yellow (y), both 0–10. `messy` adds a few odd, mislabelled ones. */
export function mangoes(messy = false, seed = 21): Pt[] {
  const r = rng(seed), pts: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    const ripe = i % 2 === 0;
    const x = Math.min(10, Math.max(0, (ripe ? 6.5 : 3.5) + r.normal() * 1.6)), y = Math.min(10, Math.max(0, (ripe ? 6.8 : 3.2) + r.normal() * 1.6));
    pts.push({ x, y, ripe });
  }
  if (messy) for (let i = 0; i < 6; i++) pts.push({ x: 2 + r() * 6, y: 2 + r() * 6, ripe: r() < 0.5 });
  return pts;
}

const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** The k closest examples, the share of them that are ripe, and the verdict (a tie goes to the closest one). */
export function knn(pts: Pt[], q: { x: number; y: number }, k: number, skip = -1) {
  const near = pts.map((p, i) => ({ p, i, d: d2(p, q) })).filter((n) => n.i !== skip).sort((a, b) => a.d - b.d).slice(0, Math.max(1, k));
  const ripe = near.filter((n) => n.p.ripe).length;
  const share = ripe / near.length;
  return { near, share, ripe: share === 0.5 ? near[0].p.ripe : share > 0.5 };
}

/** Accuracy when each example is judged by the others (leave one out): a fair test without new data. */
export const looAccuracy = (pts: Pt[], k: number) => pts.filter((p, i) => knn(pts, p, k, i).ripe === p.ripe).length / Math.max(1, pts.length);

/** The share of ripe neighbours at every spot of an n×n grid over 0–10 (row 0 at the top), for the background. */
export function field(pts: Pt[], k: number, n = 32) {
  const v = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) v[r * n + c] = knn(pts, { x: ((c + 0.5) / n) * 10, y: 10 - ((r + 0.5) / n) * 10 }, k).share;
  return v;
}
