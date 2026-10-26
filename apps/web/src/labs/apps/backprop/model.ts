/**
 * A 2-2-1 network written out by hand (sigmoid neurons, error ½(y − t)²), so every value of backpropagation can be shown:
 * h1 = σ(w11·x1 + w12·x2 + b1), h2 = σ(w21·x1 + w22·x2 + b2), y = σ(v1·h1 + v2·h2 + c).
 */
export interface W { w11: number; w12: number; b1: number; w21: number; w22: number; b2: number; v1: number; v2: number; c: number }
export const START: W = { w11: 0.5, w12: -0.4, b1: 0.1, w21: -0.3, w22: 0.8, b2: 0, v1: 0.6, v2: -0.5, c: 0.2 };
const sig = (z: number) => 1 / (1 + Math.exp(-z));

export function forward(w: W, x: [number, number]) {
  const z1 = w.w11 * x[0] + w.w12 * x[1] + w.b1, z2 = w.w21 * x[0] + w.w22 * x[1] + w.b2;
  const h1 = sig(z1), h2 = sig(z2);
  const zo = w.v1 * h1 + w.v2 * h2 + w.c, y = sig(zo);
  return { z1, z2, h1, h2, zo, y };
}
export const error = (y: number, t: number) => 0.5 * (y - t) ** 2;

/** Blame for each weight (∂E/∂weight), by the chain rule, from the output back. */
export function backward(w: W, x: [number, number], t: number) {
  const f = forward(w, x);
  const dO = (f.y - t) * f.y * (1 - f.y);         // output neuron's blame
  const d1 = dO * w.v1 * f.h1 * (1 - f.h1);        // passed back through v1
  const d2 = dO * w.v2 * f.h2 * (1 - f.h2);        // passed back through v2
  const g: W = { v1: dO * f.h1, v2: dO * f.h2, c: dO, w11: d1 * x[0], w12: d1 * x[1], b1: d1, w21: d2 * x[0], w22: d2 * x[1], b2: d2 };
  return { f, dO, d1, d2, g };
}

export const update = (w: W, g: W, rate: number): W => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v - rate * g[k as keyof W]])) as unknown as W;

export function train(w: W, x: [number, number], t: number, rate: number, times: number) {
  let cur = w;
  for (let i = 0; i < times; i++) cur = update(cur, backward(cur, x, t).g, rate);
  return cur;
}
