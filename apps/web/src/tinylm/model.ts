/**
 * Darsi Tiny's network on the phone: a small decoder-only transformer with int8 weights (one float32 scale per row) and
 * float32 activations, run one token at a time with a KV cache. Plain TypeScript, no libraries, no WebGPU.
 *
 * Architecture (tools/tinylm/model.py is the reference and must match it exactly): token embedding tied to the output
 * head, `layers` pre-norm blocks (RMSNorm → attention with rotary positions → residual; RMSNorm → GELU (tanh) MLP →
 * residual), a final RMSNorm. No biases. Rotary positions rotate interleaved pairs (x[2i], x[2i+1]).
 */

export interface TinyConfig {
  vocab: number;
  dim: number;
  layers: number;
  heads: number;
  ffn: number;
  ctx: number;
  ropeBase: number;
  eps: number;
}

/** A weight matrix [rows × cols], row-major, stored as int8 with one scale per row: w[r][c] = q[r*cols+c] * scale[r]. */
export interface QMatrix {
  rows: number;
  cols: number;
  q: Int8Array;
  scale: Float32Array;
}

export interface Block {
  attnNorm: Float32Array;
  /** Query, key and value projections stacked: rows 0..dim-1 are q, then k, then v. */
  wqkv: QMatrix;
  wo: QMatrix;
  ffnNorm: Float32Array;
  w1: QMatrix;
  w2: QMatrix;
}

export interface TinyWeights {
  config: TinyConfig;
  /** Token embedding [vocab × dim], also the output head. */
  tok: QMatrix;
  blocks: Block[];
  norm: Float32Array;
}

const MAGIC = 0x4d4c5444; // "DTLM", little-endian

interface TensorEntry { dtype: "i8" | "f32"; shape: number[]; offset: number; scale?: number }

/**
 * Reads model.bin: "DTLM", u32 version (1), u32 header length, the header (UTF-8 JSON: {config, tensors}), then the
 * tensors, each 4-byte aligned, at offsets counted from the end of the header. Views share the buffer (no copies).
 */
export function parseModel(buf: ArrayBuffer): TinyWeights {
  const dv = new DataView(buf);
  if (buf.byteLength < 12 || dv.getUint32(0, true) !== MAGIC) throw new Error("tinylm: not a Darsi Tiny model file");
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`tinylm: unsupported model version ${version}`);
  const headerLen = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, headerLen))) as { config: TinyConfig; tensors: Record<string, TensorEntry> };
  const base = 12 + headerLen;
  const { config, tensors } = header;
  const entry = (name: string) => {
    const t = tensors[name];
    if (!t) throw new Error(`tinylm: missing tensor ${name}`);
    return t;
  };
  const size = (shape: number[]) => shape.reduce((a, b) => a * b, 1);
  const f32 = (name: string) => { const t = entry(name); return new Float32Array(buf, base + t.offset, size(t.shape)); };
  const q8 = (name: string): QMatrix => {
    const t = entry(name);
    const [rows, cols] = t.shape;
    if (cols % 4) throw new Error(`tinylm: ${name} needs a multiple of 4 columns`);
    return { rows, cols, q: new Int8Array(buf, base + t.offset, rows * cols), scale: new Float32Array(buf, base + (t.scale as number), rows) };
  };
  const blocks: Block[] = [];
  for (let l = 0; l < config.layers; l++) {
    blocks.push({ attnNorm: f32(`l${l}.attn_norm`), wqkv: q8(`l${l}.wqkv`), wo: q8(`l${l}.wo`), ffnNorm: f32(`l${l}.ffn_norm`), w1: q8(`l${l}.w1`), w2: q8(`l${l}.w2`) });
  }
  return { config, tok: q8("tok"), blocks, norm: f32("norm") };
}

/** y[r] (+)= Σ_c w[r][c]·x[c]. The hot loop: four accumulators, columns a multiple of 4. */
export function matvec(m: QMatrix, x: Float32Array, y: Float32Array, accumulate = false): void {
  const { rows, cols, q, scale } = m;
  for (let r = 0, p = 0; r < rows; r++) {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let c = 0; c < cols; c += 4, p += 4) {
      s0 += q[p] * x[c];
      s1 += q[p + 1] * x[c + 1];
      s2 += q[p + 2] * x[c + 2];
      s3 += q[p + 3] * x[c + 3];
    }
    const v = (s0 + s1 + s2 + s3) * scale[r];
    if (accumulate) y[r] += v;
    else y[r] = v;
  }
}

export function rmsnorm(x: Float32Array, g: Float32Array, out: Float32Array, eps: number): void {
  let ss = 0;
  for (let i = 0; i < x.length; i++) ss += x[i] * x[i];
  const r = 1 / Math.sqrt(ss / x.length + eps);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * r * g[i];
}

const GELU_C = Math.sqrt(2 / Math.PI);
export const gelu = (u: number) => 0.5 * u * (1 + Math.tanh(GELU_C * (u + 0.044715 * u * u * u)));

/** cos/sin of every (position, pair) for rotary positions: [ctx × headDim/2]. */
export function ropeTables(cfg: TinyConfig): { cos: Float32Array; sin: Float32Array } {
  const hd = cfg.dim / cfg.heads, half = hd / 2;
  const cos = new Float32Array(cfg.ctx * half), sin = new Float32Array(cfg.ctx * half);
  for (let p = 0; p < cfg.ctx; p++) {
    for (let i = 0; i < half; i++) {
      const a = p * Math.pow(cfg.ropeBase, (-2 * i) / hd);
      cos[p * half + i] = Math.cos(a);
      sin[p * half + i] = Math.sin(a);
    }
  }
  return { cos, sin };
}

/** Rotates the interleaved pairs of every head of x (length dim) for position p. */
export function rope(x: Float32Array, off: number, p: number, cfg: TinyConfig, cos: Float32Array, sin: Float32Array): void {
  const hd = cfg.dim / cfg.heads, half = hd / 2;
  for (let h = 0; h < cfg.heads; h++) {
    for (let i = 0; i < half; i++) {
      const j = off + h * hd + 2 * i, c = cos[p * half + i], s = sin[p * half + i];
      const a = x[j], b = x[j + 1];
      x[j] = a * c - b * s;
      x[j + 1] = a * s + b * c;
    }
  }
}

/**
 * The running model: weights plus the KV cache of the tokens seen so far. `step(id)` adds one token and returns the
 * logits for the next one. `truncate(n)` forgets everything after the first n tokens, so a prompt that extends the
 * last one (an agent loop adding a tool result) reuses the cache.
 */
export class TinyModel {
  readonly cfg: TinyConfig;
  readonly w: TinyWeights;
  /** Tokens in the cache, in order. */
  readonly tokens: number[] = [];
  private readonly k: Float32Array;
  private readonly v: Float32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly x: Float32Array;
  private readonly h: Float32Array;
  private readonly qkv: Float32Array;
  private readonly att: Float32Array;
  private readonly u: Float32Array;
  private readonly scores: Float32Array;
  readonly logits: Float32Array;

  constructor(w: TinyWeights) {
    this.w = w;
    const c = (this.cfg = w.config);
    this.k = new Float32Array(c.layers * c.ctx * c.dim);
    this.v = new Float32Array(c.layers * c.ctx * c.dim);
    ({ cos: this.cos, sin: this.sin } = ropeTables(c));
    this.x = new Float32Array(c.dim);
    this.h = new Float32Array(c.dim);
    this.qkv = new Float32Array(3 * c.dim);
    this.att = new Float32Array(c.dim);
    this.u = new Float32Array(c.ffn);
    this.scores = new Float32Array(c.ctx);
    this.logits = new Float32Array(c.vocab);
  }

  truncate(n: number): void {
    this.tokens.length = Math.min(n, this.tokens.length);
  }

  /**
   * Adds one token. Without `logits`, only the cache is filled (prompt tokens before the last need no head). With
   * `stopAfter`, the hidden state after that many blocks is copied into `hidden` and the step ends there (the
   * fine-tuning cache of frozen blocks; such a step must be truncated away before generating again).
   */
  step(id: number, logits = true, stopAfter?: number, hidden?: Float32Array): Float32Array {
    const { cfg, w, x, h, qkv, att, u, scores, cos, sin } = this;
    const { dim, heads, ctx, eps } = cfg;
    const p = this.tokens.length;
    if (p >= ctx) throw new Error("tinylm: context is full");
    if (id < 0 || id >= cfg.vocab) throw new Error(`tinylm: token ${id} out of range`);
    const hd = dim / heads, inv = 1 / Math.sqrt(hd);
    // Embedding row, dequantized.
    const e = w.tok, s = e.scale[id];
    for (let i = 0, o = id * dim; i < dim; i++) x[i] = e.q[o + i] * s;
    const nBlocks = stopAfter ?? w.blocks.length;
    for (let l = 0; l < nBlocks; l++) {
      const b = w.blocks[l];
      rmsnorm(x, b.attnNorm, h, eps);
      matvec(b.wqkv, h, qkv);
      rope(qkv, 0, p, cfg, cos, sin);
      rope(qkv, dim, p, cfg, cos, sin);
      const base = l * ctx * dim;
      this.k.set(qkv.subarray(dim, 2 * dim), base + p * dim);
      this.v.set(qkv.subarray(2 * dim, 3 * dim), base + p * dim);
      const K = this.k, V = this.v;
      for (let hh = 0; hh < heads; hh++) {
        const qo = hh * hd;
        let max = -Infinity;
        for (let t = 0; t <= p; t++) {
          let sum = 0;
          const ko = base + t * dim + qo;
          for (let j = 0; j < hd; j++) sum += qkv[qo + j] * K[ko + j];
          sum *= inv;
          scores[t] = sum;
          if (sum > max) max = sum;
        }
        let z = 0;
        for (let t = 0; t <= p; t++) { const ev = Math.exp(scores[t] - max); scores[t] = ev; z += ev; }
        for (let j = 0; j < hd; j++) att[qo + j] = 0;
        for (let t = 0; t <= p; t++) {
          const a = scores[t] / z, vo = base + t * dim + qo;
          for (let j = 0; j < hd; j++) att[qo + j] += a * V[vo + j];
        }
      }
      matvec(b.wo, att, x, true);
      rmsnorm(x, b.ffnNorm, h, eps);
      matvec(b.w1, h, u);
      for (let i = 0; i < u.length; i++) u[i] = gelu(u[i]);
      matvec(b.w2, u, x, true);
    }
    this.tokens.push(id);
    if (stopAfter !== undefined) {
      hidden?.set(x);
      return this.logits;
    }
    if (logits) {
      rmsnorm(x, w.norm, h, eps);
      matvec(w.tok, h, this.logits);
    }
    return this.logits;
  }
}
