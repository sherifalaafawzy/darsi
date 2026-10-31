/**
 * Adversarial examples on a small shapes network. The model sorts 10×10 drawings into circle, cross or line. An attacker
 * who can read the model works out, for each pixel, which way to nudge it to raise the model's error (the sign of the
 * gradient at the input), then changes only the few pixels that matter most. The picture barely changes; the answer
 * flips. Training on such examples makes the model harder to fool. Pure and seeded for the tests.
 */
import { argmax } from "../../kit/math";
import { Net } from "../../kit/nn";
import { blank, circle, line, type Img } from "../../kit/raster";
import { rng } from "../../kit/rng";

export const N = 10;
export const SHAPES = ["circle", "cross", "line"] as const;
export type Shape = (typeof SHAPES)[number];
export interface Example { img: Img; label: number }

export function drawShape(shape: Shape, seed: number): Img {
  const r = rng(seed), img = blank(N);
  const cx = 4.5 + (r() - 0.5) * 1.2, cy = 4.5 + (r() - 0.5) * 1.2;
  if (shape === "circle") circle(img, N, cx, cy, 2.4 + r() * 0.8);
  else if (shape === "cross") { const t = 2 + r() * 1; line(img, N, cx - t, cy - t, cx + t, cy + t); line(img, N, cx - t, cy + t, cx + t, cy - t); }
  else { const a = r() * Math.PI, h = 2.6 + r(); line(img, N, cx - h * Math.cos(a), cy - h * Math.sin(a), cx + h * Math.cos(a), cy + h * Math.sin(a)); }
  // soften a little, so pixels are not all 0 or 1 and small nudges are visible
  const out = Float32Array.from(img);
  for (let i = 0; i < N * N; i++) if (img[i] >= 1) { const rr = Math.floor(i / N), c = i % N; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = rr + dr, b = c + dc; if (a >= 0 && a < N && b >= 0 && b < N) out[a * N + b] = Math.max(out[a * N + b], 0.4); } }
  return out;
}

export const trainingSet = (per = 6, seed = 1): Example[] => SHAPES.flatMap((sh, k) => Array.from({ length: per }, (_, i) => ({ img: drawShape(sh, seed * 1000 + k * 100 + i), label: k })));
export const makeNet = (seed = 3) => new Net({ sizes: [N * N, 12, SHAPES.length], hidden: "tanh", output: "softmax", seed });
export const target = (label: number) => SHAPES.map((_, i) => (i === label ? 1 : 0));
export const probs = (net: Net, img: Img) => Array.from(net.predict(img));
export const RATE = 0.2;

export function fit(net: Net, data: Example[], epochs = 300) {
  const X = data.map((e) => e.img), T = data.map((e) => target(e.label));
  for (let e = 0; e < epochs; e++) net.train(X, T, RATE);
}
export function accuracy(net: Net, data: Example[]) {
  return data.length ? data.filter((e) => argmax(probs(net, e.img)) === e.label).length / data.length : 0;
}

/** The gradient of the true-class loss with respect to each input pixel (back-propagation carried one layer further,
 *  down to the image). A positive value means raising that pixel raises the error. */
export function inputGrad(net: Net, img: Img, label: number): Float64Array {
  const acts = net.forward(img), L = net.W.length;
  let delta = Float64Array.from(acts[L], (y, j) => y - target(label)[j]); // softmax + cross-entropy
  for (let l = L - 1; l >= 0; l--) {
    const n = net.sizes[l], m = net.sizes[l + 1], W = net.W[l], a = acts[l];
    const prev = new Float64Array(n);
    for (let i = 0; i < n; i++) { let sdot = 0; for (let j = 0; j < m; j++) sdot += W[j * n + i] * delta[j]; prev[i] = sdot; }
    if (l > 0) for (let i = 0; i < n; i++) prev[i] *= 1 - a[i] * a[i]; // tanh'
    delta = prev;
  }
  return delta; // length N*N: d loss / d pixel
}

/**
 * One fast-gradient-sign step, but only on the `pixels` pixels whose gradient is largest. Each chosen pixel is pushed
 * by `eps` in the direction that raises the error, clamped to [0, 1]. Returns the new image and which pixels changed.
 */
export function attack(net: Net, img: Img, label: number, eps: number, pixels: number): { img: Img; changed: number[] } {
  const g = inputGrad(net, img, label);
  const order = Array.from({ length: N * N }, (_, i) => i).sort((a, b) => Math.abs(g[b]) - Math.abs(g[a]));
  const chosen = order.slice(0, Math.max(0, Math.min(pixels, N * N))).filter((i) => Math.abs(g[i]) > 1e-6);
  const out = Float32Array.from(img);
  for (const i of chosen) out[i] = Math.min(1, Math.max(0, out[i] + eps * Math.sign(g[i])));
  return { img: out, changed: chosen };
}

/** The fewest top-gradient pixels (at strength `eps`) that change the model's answer, or 0 if `max` isn't enough. */
export function pixelsToFool(net: Net, img: Img, label: number, eps: number, max = N * N): number {
  for (let k = 1; k <= max; k++) if (argmax(probs(net, attack(net, img, label, eps, k).img)) !== label) return k;
  return 0;
}

/** How often an attack at this budget flips a test image the model gets right (0 to 1). */
export function attackSuccessRate(net: Net, test: Example[], eps: number, pixels: number): number {
  const right = test.filter((e) => argmax(probs(net, e.img)) === e.label);
  if (!right.length) return 0;
  return right.filter((e) => argmax(probs(net, attack(net, e.img, e.label, eps, pixels).img)) !== e.label).length / right.length;
}

/**
 * Robust (adversarial) training: a few rounds of fitting on the clean set plus one-step attacks of it at a spread of
 * pixel budgets, re-made from the current model each round. On a model this small it does not make the model unfoolable,
 * but it reliably raises how many pixels an attack needs. `onRound` lets the UI train a round per animation frame.
 */
export function robustFit(net: Net, data: Example[], onRound?: (r: number, rounds: number) => void, rounds = 4) {
  fit(net, data, 250);
  for (let r = 0; r < rounds; r++) {
    const aug = data.flatMap((e) => [2, 4, 8].map((px) => ({ img: attack(net, e.img, e.label, 1, px).img, label: e.label })));
    fit(net, [...data, ...aug], 120);
    onRound?.(r + 1, rounds);
  }
}
