/**
 * A tiny dense neural network, written out so the labs can show every number: forward pass, backpropagation and
 * plain gradient descent. Sizes stay small (a few hundred weights), so it trains in milliseconds on an old phone.
 */
import { rng } from "./rng";

export type Act = "tanh" | "relu" | "sigmoid" | "linear";
export type Out = "sigmoid" | "softmax" | "linear";
const ACT: Record<Act, (z: number) => number> = { tanh: Math.tanh, relu: (z) => (z > 0 ? z : 0), sigmoid: (z) => 1 / (1 + Math.exp(-z)), linear: (z) => z };
/** Derivative written in terms of the activation's output (tanh: 1 - y²; sigmoid: y(1 - y)). */
const DACT: Record<Act, (y: number) => number> = { tanh: (y) => 1 - y * y, relu: (y) => (y > 0 ? 1 : 0), sigmoid: (y) => y * (1 - y), linear: () => 1 };

export interface NetSpec { sizes: number[]; hidden?: Act; output?: Out; seed?: number }
export interface Grads { gW: Float64Array[]; gb: Float64Array[]; loss: number }

export class Net {
  readonly sizes: number[];
  readonly hidden: Act;
  readonly output: Out;
  /** W[l][j * inputs + i]: from neuron i of layer l to neuron j of layer l + 1. */
  W: Float64Array[] = [];
  b: Float64Array[] = [];

  constructor({ sizes, hidden = "tanh", output = "sigmoid", seed = 1 }: NetSpec) {
    this.sizes = sizes; this.hidden = hidden; this.output = output;
    const r = rng(seed);
    for (let l = 0; l < sizes.length - 1; l++) {
      const n = sizes[l], m = sizes[l + 1], scale = Math.sqrt((hidden === "relu" ? 2 : 1) / n); // He / Xavier
      this.W.push(Float64Array.from({ length: n * m }, () => r.normal() * scale));
      this.b.push(new Float64Array(m));
    }
  }

  get weightCount() { return this.W.reduce((a, w) => a + w.length, 0) + this.b.reduce((a, b) => a + b.length, 0); }

  /** Every layer's activations, input first. */
  forward(x: ArrayLike<number>): Float64Array[] {
    const acts: Float64Array[] = [Float64Array.from(x)];
    const last = this.W.length - 1;
    for (let l = 0; l <= last; l++) {
      const a = acts[l], n = this.sizes[l], m = this.sizes[l + 1], W = this.W[l], z = new Float64Array(m);
      for (let j = 0; j < m; j++) { let s = this.b[l][j]; for (let i = 0; i < n; i++) s += W[j * n + i] * a[i]; z[j] = s; }
      if (l < last) for (let j = 0; j < m; j++) z[j] = ACT[this.hidden](z[j]);
      else if (this.output === "sigmoid") for (let j = 0; j < m; j++) z[j] = ACT.sigmoid(z[j]);
      else if (this.output === "softmax") { let mx = -Infinity; for (const v of z) mx = Math.max(mx, v); let s = 0; for (let j = 0; j < m; j++) { z[j] = Math.exp(z[j] - mx); s += z[j]; } for (let j = 0; j < m; j++) z[j] /= s; }
      acts.push(z);
    }
    return acts;
  }

  predict(x: ArrayLike<number>) { return this.forward(x)[this.W.length]; }

  /** Loss of one example: cross-entropy for sigmoid/softmax outputs, half squared error for linear ones. */
  lossOf(y: Float64Array, t: ArrayLike<number>) {
    let l = 0;
    for (let j = 0; j < y.length; j++) {
      const p = Math.min(1 - 1e-12, Math.max(1e-12, y[j]));
      if (this.output === "sigmoid") l -= t[j] * Math.log(p) + (1 - t[j]) * Math.log(1 - p);
      else if (this.output === "softmax") l -= t[j] * Math.log(p);
      else l += 0.5 * (y[j] - t[j]) ** 2;
    }
    return l;
  }

  /** Average gradients over a batch, by backpropagation. With these output/loss pairs the output error is simply y - t. */
  grads(X: ArrayLike<number>[], T: ArrayLike<number>[]): Grads {
    const L = this.W.length;
    const gW = this.W.map((w) => new Float64Array(w.length)), gb = this.b.map((b) => new Float64Array(b.length));
    let loss = 0;
    for (let k = 0; k < X.length; k++) {
      const acts = this.forward(X[k]), t = T[k];
      loss += this.lossOf(acts[L], t);
      let delta = Float64Array.from(acts[L], (y, j) => y - t[j]);
      for (let l = L - 1; l >= 0; l--) {
        const a = acts[l], n = this.sizes[l], m = this.sizes[l + 1], W = this.W[l];
        for (let j = 0; j < m; j++) { gb[l][j] += delta[j]; for (let i = 0; i < n; i++) gW[l][j * n + i] += delta[j] * a[i]; }
        if (l > 0) {
          const prev = new Float64Array(n);
          for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < m; j++) s += W[j * n + i] * delta[j]; prev[i] = s * DACT[this.hidden](a[i]); }
          delta = prev;
        }
      }
    }
    const k = Math.max(1, X.length);
    for (const g of [...gW, ...gb]) for (let i = 0; i < g.length; i++) g[i] /= k;
    return { gW, gb, loss: loss / k };
  }

  step({ gW, gb }: Grads, lr: number) {
    for (let l = 0; l < this.W.length; l++) {
      for (let i = 0; i < this.W[l].length; i++) this.W[l][i] -= lr * gW[l][i];
      for (let j = 0; j < this.b[l].length; j++) this.b[l][j] -= lr * gb[l][j];
    }
  }

  /** One gradient-descent step on a batch; returns the batch loss before the step. */
  train(X: ArrayLike<number>[], T: ArrayLike<number>[], lr: number) { const g = this.grads(X, T); this.step(g, lr); return g.loss; }

  /** Mean loss over a dataset, without learning. */
  loss(X: ArrayLike<number>[], T: ArrayLike<number>[]) { let s = 0; for (let k = 0; k < X.length; k++) s += this.lossOf(this.predict(X[k]), T[k]); return s / Math.max(1, X.length); }
}
