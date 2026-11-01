/**
 * Darsi Tiny's network on the phone: a small decoder-only transformer with int8 weights (one float32 scale per row) and
 * float32 activations, run one token at a time with a KV cache. Plain TypeScript, no libraries, no WebGPU.
 *
 * Architecture (tools/tinylm/model.py is the reference and must match it exactly): token embedding tied to the output
 * head, `layers` pre-norm blocks, a final RMSNorm, RoPE and no biases. V1 uses MHA + GELU. V2 uses GQA + SwiGLU;
 * optional config fields keep old model.bin files byte-compatible.
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
  /** K/V heads for GQA. Missing or 0 means one per query head (v1 MHA). */
  kvHeads?: number;
  /** Missing means v1 GELU. */
  activation?: "gelu" | "swiglu";
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
  /** SwiGLU's gate projection; absent in a v1 GELU block. */
  w3?: QMatrix;
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
    blocks.push({
      attnNorm: f32(`l${l}.attn_norm`), wqkv: q8(`l${l}.wqkv`), wo: q8(`l${l}.wo`),
      ffnNorm: f32(`l${l}.ffn_norm`), w1: q8(`l${l}.w1`),
      ...(config.activation === "swiglu" ? { w3: q8(`l${l}.w3`) } : {}),
      w2: q8(`l${l}.w2`),
    });
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

/** Two same-shaped projections over one input, used by SwiGLU. Sharing the input walk is faster than two calls. */
export function matvecPair(a: QMatrix, b: QMatrix, x: Float32Array, ya: Float32Array, yb: Float32Array): void {
  const { rows, cols } = a;
  const aq = a.q, bq = b.q, as = a.scale, bs = b.scale;
  for (let r = 0, p = 0; r < rows; r++) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0;
    for (let c = 0; c < cols; c += 4, p += 4) {
      const x0 = x[c], x1 = x[c + 1], x2 = x[c + 2], x3 = x[c + 3];
      a0 += aq[p] * x0; a1 += aq[p + 1] * x1; a2 += aq[p + 2] * x2; a3 += aq[p + 3] * x3;
      b0 += bq[p] * x0; b1 += bq[p + 1] * x1; b2 += bq[p + 2] * x2; b3 += bq[p + 3] * x3;
    }
    ya[r] = (a0 + a1 + a2 + a3) * as[r];
    yb[r] = (b0 + b1 + b2 + b3) * bs[r];
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
export const silu = (u: number) => u / (1 + Math.exp(-u));

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

/** Rotates the interleaved pairs of `heads` heads in x for position p. */
export function rope(
  x: Float32Array, off: number, p: number, cfg: TinyConfig, cos: Float32Array, sin: Float32Array,
  heads = cfg.heads,
): void {
  const hd = cfg.dim / cfg.heads, half = hd / 2;
  for (let h = 0; h < heads; h++) {
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
  private readonly gate: Float32Array;
  private readonly scores: Float32Array;
  readonly logits: Float32Array;

  constructor(w: TinyWeights) {
    this.w = w;
    const c = (this.cfg = w.config);
    const kvHeads = c.kvHeads || c.heads;
    if (c.dim % c.heads || c.heads % kvHeads) throw new Error("tinylm: invalid GQA configuration");
    const kvDim = kvHeads * (c.dim / c.heads);
    this.k = new Float32Array(c.layers * c.ctx * kvDim);
    this.v = new Float32Array(c.layers * c.ctx * kvDim);
    ({ cos: this.cos, sin: this.sin } = ropeTables(c));
    this.x = new Float32Array(c.dim);
    this.h = new Float32Array(c.dim);
    this.qkv = new Float32Array(c.dim + 2 * kvDim);
    this.att = new Float32Array(c.dim);
    this.u = new Float32Array(c.ffn);
    this.gate = new Float32Array(c.ffn);
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
    const { cfg, w, x, h, qkv, att, u, gate, scores, cos, sin } = this;
    const { dim, heads, ctx, eps } = cfg;
    const kvHeads = cfg.kvHeads || heads;
    const p = this.tokens.length;
    if (p >= ctx) throw new Error("tinylm: context is full");
    if (id < 0 || id >= cfg.vocab) throw new Error(`tinylm: token ${id} out of range`);
    const hd = dim / heads, kvDim = kvHeads * hd, group = heads / kvHeads, inv = 1 / Math.sqrt(hd);
    // Embedding row, dequantized.
    const e = w.tok, s = e.scale[id];
    for (let i = 0, o = id * dim; i < dim; i++) x[i] = e.q[o + i] * s;
    const nBlocks = stopAfter ?? w.blocks.length;
    for (let l = 0; l < nBlocks; l++) {
      const b = w.blocks[l];
      rmsnorm(x, b.attnNorm, h, eps);
      matvec(b.wqkv, h, qkv);
      rope(qkv, 0, p, cfg, cos, sin);
      rope(qkv, dim, p, cfg, cos, sin, kvHeads);
      const base = l * ctx * kvDim;
      this.k.set(qkv.subarray(dim, dim + kvDim), base + p * kvDim);
      this.v.set(qkv.subarray(dim + kvDim, dim + 2 * kvDim), base + p * kvDim);
      const K = this.k, V = this.v;
      for (let hh = 0; hh < heads; hh++) {
        const qo = hh * hd, kvh = Math.floor(hh / group), kho = kvh * hd;
        let max = -Infinity;
        for (let t = 0; t <= p; t++) {
          let sum = 0;
          const ko = base + t * kvDim + kho;
          for (let j = 0; j < hd; j++) sum += qkv[qo + j] * K[ko + j];
          sum *= inv;
          scores[t] = sum;
          if (sum > max) max = sum;
        }
        let z = 0;
        for (let t = 0; t <= p; t++) { const ev = Math.exp(scores[t] - max); scores[t] = ev; z += ev; }
        for (let j = 0; j < hd; j++) att[qo + j] = 0;
        for (let t = 0; t <= p; t++) {
          const a = scores[t] / z, vo = base + t * kvDim + kho;
          for (let j = 0; j < hd; j++) att[qo + j] += a * V[vo + j];
        }
      }
      matvec(b.wo, att, x, true);
      rmsnorm(x, b.ffnNorm, h, eps);
      if (b.w3) {
        matvecPair(b.w1, b.w3, h, u, gate);
        for (let i = 0; i < u.length; i++) u[i] = silu(u[i]) * gate[i];
      } else {
        matvec(b.w1, h, u);
        for (let i = 0; i < u.length; i++) u[i] = gelu(u[i]);
      }
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
