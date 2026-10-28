/**
 * The perceptron learning rule (Rosenblatt, 1958): look at one example; if the neuron got it wrong, nudge the weights
 * towards the right answer. With points a straight line can separate it always finishes; with XOR it never does.
 */
import { rng } from "../../kit/rng";

export interface Pt { x: number; y: number; label: 0 | 1 }
export interface Neuron { w1: number; w2: number; b: number }

/** Where the lab starts: a nearly flat line that gets most points of every preset wrong, so there is something to learn. */
export const START: Neuron = { w1: 0.1, w2: 0.9, b: -0.2 };
export const RATE = 0.2;
/** The lab gives up after this many passes; every preset a line can separate finishes well within it. */
export const MAX_PASSES = 12;

export const predict = (n: Neuron, p: { x: number; y: number }) => (n.w1 * p.x + n.w2 * p.y + n.b >= 0 ? 1 : 0);
export const mistakes = (n: Neuron, pts: Pt[]) => pts.filter((p) => predict(n, p) !== p.label).length;

/** One look at one point; returns the updated neuron and whether it changed. */
export function learn(n: Neuron, p: Pt, rate: number): { n: Neuron; changed: boolean } {
  const err = p.label - predict(n, p); // +1, 0 or -1
  if (!err) return { n, changed: false };
  return { n: { w1: n.w1 + rate * err * p.x, w2: n.w2 + rate * err * p.y, b: n.b + rate * err }, changed: true };
}

/** Where the line w1·x + w2·y + b = 0 crosses the square [-1, 1]², for drawing. */
export function boundary(n: Neuron): [number, number][] {
  const out: [number, number][] = [];
  if (Math.abs(n.w2) > 1e-9) for (const x of [-1, 1]) out.push([x, -(n.w1 * x + n.b) / n.w2]);
  else if (Math.abs(n.w1) > 1e-9) for (const y of [-1, 1]) out.push([-n.b / n.w1, y]);
  return out;
}

export type Preset = "easy" | "close" | "xor";
export function preset(kind: Preset, seed = 4): Pt[] {
  const r = rng(seed), pts: Pt[] = [];
  for (let i = 0; i < 24; i++) {
    const label = (i % 2) as 0 | 1;
    if (kind === "xor") { const qx = r() < 0.5 ? -1 : 1, qy = label ? -qx : qx; pts.push({ x: qx * (0.2 + r() * 0.7), y: qy * (0.2 + r() * 0.7), label }); }
    else { const gap = kind === "easy" ? 0.45 : 0.2, c = label ? gap : -gap, sd = kind === "easy" ? 0.18 : 0.2;
      pts.push({ x: Math.max(-0.95, Math.min(0.95, c + r.normal() * sd)), y: Math.max(-0.95, Math.min(0.95, -c * 0.6 + r.normal() * sd)), label }); }
  }
  // "Close" must still be separable by a line, so drop the few points that cross the middle.
  return kind === "close" ? pts.filter((p) => (p.label ? p.x - 0.6 * p.y > 0.05 : p.x - 0.6 * p.y < -0.05)) : pts;
}

/** Trains until a full pass makes no mistake, or gives up after `maxPasses`. */
export function trainAll(pts: Pt[], rate = 0.2, maxPasses = 100, start: Neuron = { w1: 0, w2: 0, b: 0 }) {
  let n = start;
  for (let pass = 1; pass <= maxPasses; pass++) {
    let changed = false;
    for (const p of pts) { const r = learn(n, p, rate); n = r.n; changed ||= r.changed; }
    if (!changed) return { n, passes: pass, converged: true };
  }
  return { n, passes: maxPasses, converged: false };
}
