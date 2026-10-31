/**
 * Fine-tuning Darsi Tiny on the phone: the embedding, the output head and the bottom blocks stay frozen (int8); only the
 * top `blocks` blocks and the final norm learn, in float32, with backpropagation written out by hand and Adam.
 *
 * Each example runs once through the frozen blocks (the int8 inference code) and its hidden states are kept, so a
 * training step only runs the top blocks and the head, and only up to the last position that has a target. The loss is
 * the one the model was trained with: cross-entropy on what the model writes (plans, calls, answers and their end
 * markers). tools/tinylm/finetune.py is the PyTorch reference; tests/tinylm/finetune.test.ts compares the gradients.
 */
import { buildPrompt, type Conversation } from "./format";
import { gelu, matvec, ropeTables, TinyModel, type Block, type QMatrix, type TinyConfig, type TinyWeights } from "./model";
import { MARK, type Tokenizer } from "./tokenizer";

/** A training sequence: `mask[t]` is 1 where the model should predict `ids[t]` (from position t − 1). */
export interface Example { ids: number[]; mask: number[] }

/**
 * A finished conversation as a training example, with train.py's rules: targets are the plans, calls and answers, and
 * the markers <|plan|>, <|call|>, <|result|>, <|answer|> and <|end|>; the tool list, requests and results are context.
 */
export function exampleFrom(tok: Tokenizer, c: Conversation): Example {
  const ids = buildPrompt(tok, c);
  const mask = new Array<number>(ids.length).fill(0);
  let writing = false;
  for (let t = 0; t < ids.length; t++) {
    const id = ids[t];
    if (id < 8) {
      mask[t] = id === MARK.plan || id === MARK.call || id === MARK.result || id === MARK.answer || id === MARK.end ? 1 : 0;
      writing = id === MARK.plan || id === MARK.call || id === MARK.answer;
    } else mask[t] = writing ? 1 : 0;
  }
  // buildPrompt opens a plan after a final user message; a training example ends with an answer, so drop a dangling one.
  if (ids[ids.length - 1] === MARK.plan && c.turns[c.turns.length - 1]?.role === "user") { ids.pop(); mask.pop(); }
  return { ids, mask };
}

type F32 = Float32Array;
interface FBlock { attnNorm: F32; wqkv: F32; wo: F32; ffnNorm: F32; w1: F32; w2: F32 }
const KEYS = ["attnNorm", "wqkv", "wo", "ffnNorm", "w1", "w2"] as const;

export interface FineTuneOptions {
  /** How many top blocks learn (default 1; the rest stay frozen). */
  blocks?: number;
  lr?: number;
  betas?: [number, number];
  eps?: number;
  /** Clip the gradient's total norm to this (default 1; 0 turns it off). */
  clip?: number;
}

export interface StepResult { loss: number; targets: number; gradNorm: number; ms: number }

const deq = (m: QMatrix): F32 => {
  const out = new Float32Array(m.rows * m.cols);
  for (let r = 0; r < m.rows; r++) { const s = m.scale[r]; for (let c = 0, o = r * m.cols; c < m.cols; c++) out[o + c] = m.q[o + c] * s; }
  return out;
};

/** Symmetric int8 per row, as model.py quantize_rows (ties round away from zero here, to even there). */
export function quantizeRows(w: F32, rows: number, cols: number): QMatrix {
  const q = new Int8Array(rows * cols), scale = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let amax = 0;
    for (let c = 0; c < cols; c++) amax = Math.max(amax, Math.abs(w[r * cols + c]));
    const s = amax > 0 ? amax / 127 : 1;
    scale[r] = s;
    for (let c = 0; c < cols; c++) q[r * cols + c] = Math.max(-127, Math.min(127, Math.round(w[r * cols + c] / s)));
  }
  return { rows, cols, q, scale };
}

// y[t] = W x[t] for T rows: W [out × inn], x [T × inn], y [T × out].
function mm(W: F32, out: number, inn: number, x: F32, T: number, y: F32) {
  for (let t = 0; t < T; t++) {
    const xo = t * inn;
    for (let o = 0; o < out; o++) {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      const wo = o * inn;
      for (let i = 0; i < inn; i += 4) {
        s0 += W[wo + i] * x[xo + i]; s1 += W[wo + i + 1] * x[xo + i + 1];
        s2 += W[wo + i + 2] * x[xo + i + 2]; s3 += W[wo + i + 3] * x[xo + i + 3];
      }
      y[t * out + o] = s0 + s1 + s2 + s3;
    }
  }
}

// dx[t] (+)= Wᵀ dy[t]; dW += dy[t] ⊗ x[t]. Skips the dx part when dx is null.
function mmBack(W: F32, out: number, inn: number, x: F32, dy: F32, T: number, dW: F32, dx: F32 | null) {
  for (let t = 0; t < T; t++) {
    const xo = t * inn, yo = t * out;
    for (let o = 0; o < out; o++) {
      const g = dy[yo + o];
      if (g === 0) continue;
      const wo = o * inn;
      for (let i = 0; i < inn; i++) dW[wo + i] += g * x[xo + i];
      if (dx) for (let i = 0; i < inn; i++) dx[xo + i] += g * W[wo + i];
    }
  }
}

const GELU_C = Math.sqrt(2 / Math.PI);
function geluGrad(u: number): number {
  const t = Math.tanh(GELU_C * (u + 0.044715 * u * u * u));
  return 0.5 * (1 + t) + 0.5 * u * (1 - t * t) * GELU_C * (1 + 3 * 0.044715 * u * u);
}

interface Saved { T: number; x: F32; r1: F32; h1: F32; qkv: F32; P: F32; att: F32; x2: F32; r2: F32; h2: F32; u: F32; a: F32; out: F32 }

export class FineTuner {
  readonly cfg: TinyConfig;
  /** Blocks [first, layers) learn. */
  readonly first: number;
  readonly trainable: number;
  private readonly base: TinyWeights;
  private readonly blocks: FBlock[];
  private readonly norm: F32;
  private readonly grads: { blocks: FBlock[]; norm: F32 };
  private readonly m: F32[];
  private readonly v: F32[];
  private t = 0;
  private readonly opts: Required<FineTuneOptions>;
  private readonly cos: F32;
  private readonly sin: F32;
  /** Examples and their hidden states after the frozen blocks (positions up to the last target). */
  private readonly data: { ex: Example; T: number; hidden: F32 }[] = [];

  constructor(w: TinyWeights, opts: FineTuneOptions = {}) {
    this.base = w;
    this.cfg = w.config;
    this.opts = { blocks: 1, lr: 1e-3, betas: [0.9, 0.999], eps: 1e-8, clip: 1, ...opts };
    const k = Math.max(1, Math.min(this.opts.blocks, this.cfg.layers));
    this.first = this.cfg.layers - k;
    const fb = (b: Block): FBlock => ({ attnNorm: Float32Array.from(b.attnNorm), wqkv: deq(b.wqkv), wo: deq(b.wo), ffnNorm: Float32Array.from(b.ffnNorm), w1: deq(b.w1), w2: deq(b.w2) });
    this.blocks = w.blocks.slice(this.first).map(fb);
    this.norm = Float32Array.from(w.norm);
    const zero = (b: FBlock): FBlock => ({ attnNorm: new Float32Array(b.attnNorm.length), wqkv: new Float32Array(b.wqkv.length), wo: new Float32Array(b.wo.length), ffnNorm: new Float32Array(b.ffnNorm.length), w1: new Float32Array(b.w1.length), w2: new Float32Array(b.w2.length) });
    this.grads = { blocks: this.blocks.map(zero), norm: new Float32Array(this.norm.length) };
    this.m = this.params(this.grads).map((p) => new Float32Array(p.length));
    this.v = this.params(this.grads).map((p) => new Float32Array(p.length));
    this.trainable = this.params().reduce((a, p) => a + p.length, 0);
    ({ cos: this.cos, sin: this.sin } = ropeTables(this.cfg));
  }

  /** The learning tensors (or their gradients), in a fixed order: per block attnNorm, wqkv, wo, ffnNorm, w1, w2; then norm. */
  private params(src: { blocks: FBlock[]; norm: F32 } = { blocks: this.blocks, norm: this.norm }): F32[] {
    return [...src.blocks.flatMap((b) => KEYS.map((k) => b[k])), src.norm];
  }

  /** Adds examples: runs each once through the frozen blocks. Returns how many targets they hold. */
  add(examples: Example[]): number {
    const { dim, ctx } = this.cfg;
    const frozen = new TinyModel(this.base);
    const h = new Float32Array(dim);
    let targets = 0;
    for (const ex of examples) {
      if (ex.ids.length > ctx) throw new Error("tinylm: example longer than the context");
      let last = -1;
      for (let t = 1; t < ex.ids.length; t++) if (ex.mask[t]) { last = t; targets++; }
      if (last < 0) continue;
      const T = last; // positions 0..last-1 predict up to ids[last]
      const hidden = new Float32Array(T * dim);
      frozen.truncate(0);
      for (let t = 0; t < T; t++) {
        if (this.first === 0) {
          const e = this.base.tok, s = e.scale[ex.ids[t]];
          for (let i = 0; i < dim; i++) hidden[t * dim + i] = e.q[ex.ids[t] * dim + i] * s;
          continue;
        }
        frozen.step(ex.ids[t], false, this.first, h);
        hidden.set(h, t * dim);
      }
      this.data.push({ ex, T, hidden });
    }
    return targets;
  }

  get size(): number {
    return this.data.length;
  }

  private forwardBlock(b: FBlock, x: F32, T: number): Saved {
    const { dim, heads, ffn, eps } = this.cfg;
    const hd = dim / heads, half = hd / 2, inv = 1 / Math.sqrt(hd);
    const r1 = new Float32Array(T), h1 = new Float32Array(T * dim), qkv = new Float32Array(T * 3 * dim);
    const P = new Float32Array(heads * T * T), att = new Float32Array(T * dim), x2 = new Float32Array(T * dim);
    const r2 = new Float32Array(T), h2 = new Float32Array(T * dim), u = new Float32Array(T * ffn), a = new Float32Array(T * ffn);
    const out = new Float32Array(T * dim);
    const norm = (src: F32, g: F32, r: F32, dst: F32) => {
      for (let t = 0; t < T; t++) {
        let ss = 0;
        for (let i = 0; i < dim; i++) ss += src[t * dim + i] ** 2;
        r[t] = 1 / Math.sqrt(ss / dim + eps);
        for (let i = 0; i < dim; i++) dst[t * dim + i] = src[t * dim + i] * r[t] * g[i];
      }
    };
    norm(x, b.attnNorm, r1, h1);
    mm(b.wqkv, 3 * dim, dim, h1, T, qkv);
    for (let t = 0; t < T; t++) for (const off of [0, dim]) for (let hh = 0; hh < heads; hh++) for (let i = 0; i < half; i++) {
      const j = t * 3 * dim + off + hh * hd + 2 * i, c = this.cos[t * half + i], s = this.sin[t * half + i];
      const p = qkv[j], q = qkv[j + 1];
      qkv[j] = p * c - q * s;
      qkv[j + 1] = p * s + q * c;
    }
    for (let hh = 0; hh < heads; hh++) {
      for (let t = 0; t < T; t++) {
        const row = (hh * T + t) * T, qo = t * 3 * dim + hh * hd;
        let max = -Infinity;
        for (let s = 0; s <= t; s++) {
          let sum = 0;
          const ko = s * 3 * dim + dim + hh * hd;
          for (let j = 0; j < hd; j++) sum += qkv[qo + j] * qkv[ko + j];
          P[row + s] = sum * inv;
          if (P[row + s] > max) max = P[row + s];
        }
        let z = 0;
        for (let s = 0; s <= t; s++) { P[row + s] = Math.exp(P[row + s] - max); z += P[row + s]; }
        for (let s = 0; s <= t; s++) P[row + s] /= z;
        for (let s = 0; s <= t; s++) {
          const p = P[row + s], vo = s * 3 * dim + 2 * dim + hh * hd;
          for (let j = 0; j < hd; j++) att[t * dim + hh * hd + j] += p * qkv[vo + j];
        }
      }
    }
    mm(b.wo, dim, dim, att, T, x2);
    for (let i = 0; i < T * dim; i++) x2[i] += x[i];
    norm(x2, b.ffnNorm, r2, h2);
    mm(b.w1, ffn, dim, h2, T, u);
    for (let i = 0; i < T * ffn; i++) a[i] = gelu(u[i]);
    mm(b.w2, dim, ffn, a, T, out);
    for (let i = 0; i < T * dim; i++) out[i] += x2[i];
    return { T, x, r1, h1, qkv, P, att, x2, r2, h2, u, a, out };
  }

  /** RMSNorm backward: dy is the gradient of (x · r · g); adds to dg and (if given) dx. */
  private normBack(x: F32, r: F32, g: F32, dy: F32, T: number, dg: F32, dx: F32 | null) {
    const { dim } = this.cfg;
    for (let t = 0; t < T; t++) {
      let dot = 0;
      for (let i = 0; i < dim; i++) {
        const xi = x[t * dim + i], gy = dy[t * dim + i] * g[i];
        dg[i] += dy[t * dim + i] * xi * r[t];
        dot += gy * xi;
      }
      if (!dx) continue;
      const k = (r[t] ** 3 * dot) / dim;
      for (let i = 0; i < dim; i++) dx[t * dim + i] += r[t] * dy[t * dim + i] * g[i] - x[t * dim + i] * k;
    }
  }

  /** Backward through one block: dout is the gradient of its output; returns the gradient of its input (or null). */
  private backBlock(b: FBlock, g: FBlock, s: Saved, dout: F32, wantDx: boolean): F32 | null {
    const { dim, heads, ffn } = this.cfg;
    const { T } = s;
    const hd = dim / heads, half = hd / 2, inv = 1 / Math.sqrt(hd);
    const dx2 = Float32Array.from(dout);
    const da = new Float32Array(T * ffn);
    mmBack(b.w2, dim, ffn, s.a, dout, T, g.w2, da);
    for (let i = 0; i < T * ffn; i++) da[i] *= geluGrad(s.u[i]);
    const dh2 = new Float32Array(T * dim);
    mmBack(b.w1, ffn, dim, s.h2, da, T, g.w1, dh2);
    this.normBack(s.x2, s.r2, b.ffnNorm, dh2, T, g.ffnNorm, dx2);
    const datt = new Float32Array(T * dim);
    mmBack(b.wo, dim, dim, s.att, dx2, T, g.wo, datt);
    const dqkv = new Float32Array(T * 3 * dim);
    const dP = new Float32Array(T);
    for (let hh = 0; hh < heads; hh++) {
      for (let t = 0; t < T; t++) {
        const row = (hh * T + t) * T, ao = t * dim + hh * hd;
        let sum = 0;
        for (let u = 0; u <= t; u++) {
          const vo = u * 3 * dim + 2 * dim + hh * hd, p = s.P[row + u];
          let d = 0;
          for (let j = 0; j < hd; j++) { d += datt[ao + j] * s.qkv[vo + j]; dqkv[vo + j] += p * datt[ao + j]; }
          dP[u] = d;
          sum += p * d;
        }
        const qo = t * 3 * dim + hh * hd;
        for (let u = 0; u <= t; u++) {
          const dS = s.P[row + u] * (dP[u] - sum) * inv;
          if (dS === 0) continue;
          const ko = u * 3 * dim + dim + hh * hd;
          for (let j = 0; j < hd; j++) { dqkv[qo + j] += dS * s.qkv[ko + j]; dqkv[ko + j] += dS * s.qkv[qo + j]; }
        }
      }
    }
    // Undo the rotation: rotate the q and k gradients back by the same angle.
    for (let t = 0; t < T; t++) for (const off of [0, dim]) for (let hh = 0; hh < heads; hh++) for (let i = 0; i < half; i++) {
      const j = t * 3 * dim + off + hh * hd + 2 * i, c = this.cos[t * half + i], sn = this.sin[t * half + i];
      const p = dqkv[j], q = dqkv[j + 1];
      dqkv[j] = p * c + q * sn;
      dqkv[j + 1] = -p * sn + q * c;
    }
    const dh1 = new Float32Array(T * dim);
    mmBack(b.wqkv, 3 * dim, dim, s.h1, dqkv, T, g.wqkv, dh1);
    const dx = wantDx ? Float32Array.from(dx2) : null;
    this.normBack(s.x, s.r1, b.attnNorm, dh1, T, g.attnNorm, dx);
    return dx;
  }

  /** Loss and gradients of one example (added to this.grads, scaled by 1/total); returns its summed loss. */
  private exampleGrad(d: { ex: Example; T: number; hidden: F32 }, total: number, backward: boolean): number {
    const { dim, eps, vocab } = this.cfg;
    const { T, ex } = d;
    let x = d.hidden;
    const saved: Saved[] = [];
    for (const b of this.blocks) { const s = this.forwardBlock(b, x, T); saved.push(s); x = s.out; }
    const dx = new Float32Array(T * dim);
    const hn = new Float32Array(dim), logits = new Float32Array(vocab), dh = new Float32Array(dim), tok = this.base.tok;
    let loss = 0;
    for (let p = 0; p < T; p++) {
      if (!ex.mask[p + 1]) continue;
      let ss = 0;
      for (let i = 0; i < dim; i++) ss += x[p * dim + i] ** 2;
      const r = 1 / Math.sqrt(ss / dim + eps);
      for (let i = 0; i < dim; i++) hn[i] = x[p * dim + i] * r * this.norm[i];
      matvec(tok, hn, logits);
      let max = -Infinity;
      for (let v = 0; v < vocab; v++) if (logits[v] > max) max = logits[v];
      let z = 0;
      for (let v = 0; v < vocab; v++) z += Math.exp(logits[v] - max);
      const target = ex.ids[p + 1];
      loss += Math.log(z) - (logits[target] - max);
      if (!backward) continue;
      // dlogits = (softmax − onehot)/total; dhn = Eᵀ dlogits, with E the dequantized int8 embedding.
      dh.fill(0);
      for (let v = 0; v < vocab; v++) {
        const gv = ((Math.exp(logits[v] - max) / z) - (v === target ? 1 : 0)) / total;
        if (Math.abs(gv) < 1e-12) continue;
        const sc = gv * tok.scale[v], o = v * dim;
        for (let i = 0; i < dim; i++) dh[i] += sc * tok.q[o + i];
      }
      let dot = 0;
      for (let i = 0; i < dim; i++) {
        const xi = x[p * dim + i];
        this.grads.norm[i] += dh[i] * xi * r;
        dot += dh[i] * this.norm[i] * xi;
      }
      const k = (r ** 3 * dot) / dim;
      for (let i = 0; i < dim; i++) dx[p * dim + i] += r * dh[i] * this.norm[i] - x[p * dim + i] * k;
    }
    if (backward) {
      let g: F32 | null = dx;
      for (let l = this.blocks.length - 1; l >= 0 && g; l--) g = this.backBlock(this.blocks[l], this.grads.blocks[l], saved[l], g, l > 0);
    }
    return loss;
  }

  /** Mean loss over examples (all by default), without learning. */
  loss(which?: number[]): number {
    const idx = which ?? this.data.map((_, i) => i);
    let sum = 0, n = 0;
    for (const i of idx) { n += this.targets(i); sum += this.exampleGrad(this.data[i], 1, false); }
    return n ? sum / n : NaN;
  }

  private targets(i: number): number {
    const d = this.data[i];
    let n = 0;
    for (let p = 0; p < d.T; p++) if (d.ex.mask[p + 1]) n++;
    return n;
  }

  /** The gradients of the mean loss over `which` (all examples by default), without an update: for tests and charts. */
  gradients(which?: number[]): { loss: number; grads: F32[] } {
    const idx = which ?? this.data.map((_, i) => i);
    for (const p of this.params(this.grads)) p.fill(0);
    const total = idx.reduce((a, i) => a + this.targets(i), 0);
    let loss = 0;
    for (const i of idx) loss += this.exampleGrad(this.data[i], total, true);
    return { loss: loss / total, grads: this.params(this.grads) };
  }

  /** One Adam step on the mean loss over `which` (all examples by default). The loss is the one before the update. */
  step(which?: number[]): StepResult {
    const t0 = performance.now();
    const { loss, grads } = this.gradients(which);
    const total = (which ?? this.data.map((_, i) => i)).reduce((a, i) => a + this.targets(i), 0);
    let sq = 0;
    for (const g of grads) for (let i = 0; i < g.length; i++) sq += g[i] * g[i];
    const gradNorm = Math.sqrt(sq);
    const scale = this.opts.clip > 0 ? Math.min(1, this.opts.clip / (gradNorm + 1e-6)) : 1;
    const { lr, eps } = this.opts, [b1, b2] = this.opts.betas;
    this.t++;
    const bc1 = 1 - b1 ** this.t, bc2s = Math.sqrt(1 - b2 ** this.t), stepSize = lr / bc1;
    this.params().forEach((p, k) => {
      const g = grads[k], m = this.m[k], v = this.v[k];
      for (let i = 0; i < p.length; i++) {
        const gi = g[i] * scale;
        m[i] = b1 * m[i] + (1 - b1) * gi;
        v[i] = b2 * v[i] + (1 - b2) * gi * gi;
        p[i] -= (stepSize * m[i]) / (Math.sqrt(v[i]) / bc2s + eps);
      }
    });
    return { loss, targets: total, gradNorm, ms: performance.now() - t0 };
  }

  /** The model with the learned blocks quantized back to int8, ready for TinyModel and generation. */
  weights(): TinyWeights {
    const { dim, ffn } = this.cfg;
    const blocks = this.base.blocks.map((b, l) => {
      if (l < this.first) return b;
      const f = this.blocks[l - this.first];
      return { attnNorm: Float32Array.from(f.attnNorm), wqkv: quantizeRows(f.wqkv, 3 * dim, dim), wo: quantizeRows(f.wo, dim, dim), ffnNorm: Float32Array.from(f.ffnNorm), w1: quantizeRows(f.w1, ffn, dim), w2: quantizeRows(f.w2, dim, ffn) };
    });
    return { config: this.cfg, tok: this.base.tok, blocks, norm: Float32Array.from(this.norm) };
  }

  /** The learned tensors as one buffer (float32, the params() order), to keep in IndexedDB and load again later. */
  save(): ArrayBuffer {
    const ps = this.params();
    const out = new Float32Array(1 + ps.reduce((a, p) => a + p.length, 0));
    out[0] = this.blocks.length;
    let o = 1;
    for (const p of ps) { out.set(p, o); o += p.length; }
    return out.buffer;
  }

  load(buf: ArrayBuffer): void {
    const src = new Float32Array(buf);
    if (src[0] !== this.blocks.length || src.length !== 1 + this.trainable) throw new Error("tinylm: saved blocks do not match");
    let o = 1;
    for (const p of this.params()) { p.set(src.subarray(o, o + p.length)); o += p.length; }
  }
}

/** The tensors save() writes, applied to a model without a FineTuner (the worker loading a saved fine-tune). */
export function applySaved(w: TinyWeights, buf: ArrayBuffer): TinyWeights {
  const ft = new FineTuner(w, { blocks: new Float32Array(buf, 0, 1)[0] });
  ft.load(buf);
  return ft.weights();
}
