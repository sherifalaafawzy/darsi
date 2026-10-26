/**
 * Bias from skewed data. A leaf-disease spotter looks at two numbers per photo: how dark the leaf's spots look, and
 * how bright the photo is. In the cloudy hills (region B) photos are darker, so sick spots look lighter than in the
 * sunny valley (region A). Trained mostly on region A, the model learns region A's rule and misses sick leaves in B.
 * Logistic regression, trained by gradient descent.
 */
import { sigmoid } from "../../kit/math";
import { rng } from "../../kit/rng";

export type Region = "A" | "B";
export interface Leaf { dark: number; light: number; region: Region; sick: boolean }

const LIGHT = { A: 0.8, B: 0.45 }, FADE = { A: 0.9, B: 0.55 };

/** `n` photos, a share `shareB` of them from region B. A leaf is sick when its real spot darkness is over 0.5. */
export function leaves(n: number, shareB: number, seed: number): Leaf[] {
  const r = rng(seed), out: Leaf[] = [];
  const nb = Math.round(n * shareB);
  for (let i = 0; i < n; i++) {
    const region: Region = i < nb ? "B" : "A", real = r();
    out.push({ region, sick: real > 0.5, dark: Math.min(1, Math.max(0, real * FADE[region] + r.normal() * 0.03)), light: Math.min(1, Math.max(0, LIGHT[region] + r.normal() * 0.06)) });
  }
  return out;
}

export interface Model { w1: number; w2: number; b: number }
export const prob = (m: Model, l: { dark: number; light: number }) => sigmoid(m.w1 * l.dark + m.w2 * l.light + m.b);
export const predict = (m: Model, l: Leaf) => prob(m, l) >= 0.5;

/** Logistic regression by full-batch gradient descent (the log-loss gradient is simply (p − y) × feature). */
export function train(data: Leaf[], epochs = 1500, rate = 3): Model {
  const m = { w1: 0, w2: 0, b: 0 };
  for (let e = 0; e < epochs; e++) {
    let g1 = 0, g2 = 0, gb = 0;
    for (const l of data) { const d = prob(m, l) - (l.sick ? 1 : 0); g1 += d * l.dark; g2 += d * l.light; gb += d; }
    m.w1 -= (rate * g1) / data.length; m.w2 -= (rate * g2) / data.length; m.b -= (rate * gb) / data.length;
  }
  return m;
}

export const errorRate = (m: Model, data: Leaf[]) => (data.length ? data.filter((l) => predict(m, l) !== l.sick).length / data.length : 0);
/** Share of sick leaves the model calls healthy: the mistake that costs a farmer the crop. */
export const missRate = (m: Model, data: Leaf[]) => { const sick = data.filter((l) => l.sick); return sick.length ? sick.filter((l) => !predict(m, l)).length / sick.length : 0; };
