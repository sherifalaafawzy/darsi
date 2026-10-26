/** Datasets and training for the network playground. Points live in [-1, 1]²; labels are 0 or 1. */
import { Net, type Act } from "../../kit/nn";
import { rng, type Rng } from "../../kit/rng";

export type Dataset = "blobs" | "circle" | "xor" | "spiral";
export interface Point { x: number; y: number; label: 0 | 1 }

export function makeData(kind: Dataset, n = 160, noise = 0, seed = 7): Point[] {
  const r = rng(seed), out: Point[] = [], jitter = () => r.normal() * noise * 0.15;
  const clip = (v: number) => Math.max(-1, Math.min(1, v));
  for (let i = 0; i < n; i++) {
    const label = (i % 2) as 0 | 1;
    let x = 0, y = 0;
    if (kind === "blobs") { const c = label ? 0.45 : -0.45; x = c + r.normal() * 0.22; y = c + r.normal() * 0.22; }
    else if (kind === "circle") { const rad = label ? 0.65 + r() * 0.3 : r() * 0.45, a = r() * Math.PI * 2; x = rad * Math.cos(a); y = rad * Math.sin(a); }
    else if (kind === "xor") { do { x = r() * 2 - 1; y = r() * 2 - 1; } while (Math.abs(x) < 0.08 || Math.abs(y) < 0.08 || ((x * y > 0 ? 0 : 1) !== label)); }
    else { const k = Math.floor(i / 2) / (n / 2), rad = 0.1 + k * 0.85, a = k * 3.2 * Math.PI + (label ? Math.PI : 0); x = rad * Math.cos(a); y = rad * Math.sin(a); }
    out.push({ x: clip(x + jitter()), y: clip(y + jitter()), label });
  }
  return out;
}

export interface Shape { layers: number; neurons: number; act: Act; seed?: number }
export const makeNet = ({ layers, neurons, act, seed = 1 }: Shape) => new Net({ sizes: [2, ...Array(layers).fill(neurons), 1], hidden: act, output: "sigmoid", seed });

/** One pass over the data in shuffled mini-batches; returns the mean error afterwards. */
export function epoch(net: Net, data: Point[], lr: number, r: Rng, batch = 16) {
  const idx = data.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = r.int(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (let s = 0; s < idx.length; s += batch) {
    const part = idx.slice(s, s + batch);
    net.train(part.map((k) => [data[k].x, data[k].y]), part.map((k) => [data[k].label]), lr);
  }
  return net.loss(data.map((p) => [p.x, p.y]), data.map((p) => [p.label]));
}

export const accuracy = (net: Net, data: Point[]) => data.filter((p) => (net.predict([p.x, p.y])[0] >= 0.5 ? 1 : 0) === p.label).length / Math.max(1, data.length);

/** The network's answer at every spot of an n×n grid, top row first (for the heatmap). */
export function field(net: Net, n = 24) {
  const out = new Float32Array(n * n);
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const x = -1 + (2 * (col + 0.5)) / n, y = 1 - (2 * (row + 0.5)) / n;
    out[row * n + col] = net.predict([x, y])[0];
  }
  return out;
}
