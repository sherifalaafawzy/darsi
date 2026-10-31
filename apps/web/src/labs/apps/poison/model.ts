/**
 * Data poisoning on a tiny 2-D dataset. Two kinds of fruit are sorted by size and sweetness; a model learns the line
 * between them. Flip some labels (an attacker slips wrong examples into the training set) and the model learns a worse
 * line. The poisoned points sit among the wrong crowd, so their neighbours disagree with their label — that is how we
 * find them. Pure and seeded, so a phone and the tests get the same data and the same network.
 */
import { Net } from "../../kit/nn";
import { rng } from "../../kit/rng";

export interface Point { x: number; y: number; label: 0 | 1 }

/** Two clusters: label 0 low-left, label 1 high-right, with a little spread. Features are kept in roughly [0, 1]. */
export function makeData(n: number, seed: number): Point[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const label: 0 | 1 = i % 2 === 0 ? 0 : 1;
    const cx = label ? 0.66 : 0.34, cy = label ? 0.64 : 0.36;
    return { x: clamp01(cx + r.normal() * 0.13), y: clamp01(cy + r.normal() * 0.13), label };
  });
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Flip the labels of `k` points chosen by seed; returns the poisoned copy and which indices were flipped. */
export function poison(data: Point[], k: number, seed: number): { data: Point[]; flipped: Set<number> } {
  const r = rng(seed), idx = data.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = r.int(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const flipped = new Set(idx.slice(0, Math.min(k, data.length)));
  return { data: data.map((p, i) => (flipped.has(i) ? { ...p, label: (1 - p.label) as 0 | 1 } : p)), flipped };
}

export const makeNet = (seed = 5) => new Net({ sizes: [2, 6, 1], hidden: "tanh", output: "sigmoid", seed });
export const feat = (p: Point): number[] => [p.x * 2 - 1, p.y * 2 - 1];
export const batchOf = (pts: Point[]) => ({ X: pts.map(feat), T: pts.map((p) => [p.label]) });
export const predict = (net: Net, p: Point) => net.predict(feat(p))[0];

/** Accuracy on a clean test set (true labels), which is what poisoning quietly spoils. */
export function accuracy(net: Net, test: Point[]): number {
  if (!test.length) return 0;
  return test.filter((p) => (predict(net, p) >= 0.5 ? 1 : 0) === p.label).length / test.length;
}
export const RATE = 0.5;

/**
 * Find the odd ones out: for each point, look at its k nearest neighbours and see if its label disagrees with most of
 * them. A flipped point sits in the other cluster, so its neighbours vote against it. Returns the suspect indices.
 */
export function suspects(data: Point[], k = 5): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const near = data.map((p, j) => ({ j, d: (p.x - data[i].x) ** 2 + (p.y - data[i].y) ** 2 })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, k);
    const agree = near.filter((o) => data[o.j].label === data[i].label).length;
    if (agree < near.length / 2) out.push(i);
  }
  return out;
}
