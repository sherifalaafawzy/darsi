/**
 * Generation on top of TinyModel: reuse the KV cache for the part of the prompt seen last time, then sample one token
 * at a time (greedy, or temperature with top-k and a seed) until a stop marker, the token limit or the context end.
 * Synchronous and dependency-free, so the worker, the tests and a plain page all run the same code.
 */
import type { TinyModel } from "./model";
import { MARK, SPECIALS, type Marker, type Tokenizer } from "./tokenizer";

export interface SampleOptions {
  /** 0 (the default) is greedy: always the most likely token. */
  temperature?: number;
  /** With a temperature, sample only from the k most likely tokens (default 40). */
  topK?: number;
  /** Seed for sampling, so a lesson can replay the same "random" answer. */
  seed?: number;
}

export interface GenerateOptions extends SampleOptions {
  /** Tokens to write at most (default 160). */
  maxTokens?: number;
  /** Marker ids that end generation (default: <|result|> after a call, <|end|> after an answer). */
  stop?: number[];
}

/** One streamed token: its text (may be "" while a multi-byte character is incomplete) or the marker it is. */
export interface StreamToken { id: number; text: string; marker?: Marker }

/** The stop marker that ended generation ("result" after a call, "end" after an answer), or why it ended without one. */
export type StopReason = Marker | "max" | "context" | "stopped";

export interface Generation {
  ids: number[];
  text: string;
  stoppedBy: StopReason;
  promptTokens: number;
  /** Prompt tokens taken from the cache instead of being run again. */
  reused: number;
  prefillMs: number;
  decodeMs: number;
}

/** mulberry32, as in labs/kit/rng.ts. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Index of the largest logit; the lowest index wins a tie (as torch.argmax does). */
export function argmax(x: Float32Array): number {
  let best = 0;
  for (let i = 1; i < x.length; i++) if (x[i] > x[best]) best = i;
  return best;
}

function sample(logits: Float32Array, temperature: number, topK: number, rand: () => number): number {
  if (!(temperature > 0)) return argmax(logits);
  const k = Math.max(1, Math.min(topK, logits.length));
  const idx: number[] = [];
  for (let i = 0; i < logits.length; i++) {
    if (idx.length < k) { idx.push(i); if (idx.length === k) idx.sort((a, b) => logits[a] - logits[b]); continue; }
    if (logits[i] > logits[idx[0]]) {
      idx[0] = i;
      for (let j = 0; j < k - 1 && logits[idx[j]] > logits[idx[j + 1]]; j++) [idx[j], idx[j + 1]] = [idx[j + 1], idx[j]];
    }
  }
  const max = Math.max(...idx.map((i) => logits[i]));
  const w = idx.map((i) => Math.exp((logits[i] - max) / temperature));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let j = 0; j < idx.length; j++) { r -= w[j]; if (r <= 0) return idx[j]; }
  return idx[idx.length - 1];
}

/** Fills the cache with `prompt` (reusing the shared prefix) and returns how many tokens were reused. */
export function prefill(model: TinyModel, prompt: readonly number[]): number {
  if (!prompt.length) throw new Error("tinylm: empty prompt");
  if (prompt.length >= model.cfg.ctx) throw new Error("tinylm: prompt longer than the context");
  let same = 0;
  while (same < model.tokens.length && same < prompt.length && model.tokens[same] === prompt[same]) same++;
  // The last prompt token must run again: its logits are the first prediction.
  same = Math.min(same, prompt.length - 1);
  model.truncate(same);
  for (let i = same; i < prompt.length; i++) model.step(prompt[i], i === prompt.length - 1);
  return same;
}

/**
 * Streams the continuation of `prompt`. Yields each token; the return value is the whole generation. The caller can
 * stop early by not asking for the next token (the worker checks for a stop message between tokens).
 */
export function* stream(model: TinyModel, tok: Tokenizer, prompt: readonly number[], opts: GenerateOptions = {}): Generator<StreamToken, Generation> {
  const stop = opts.stop ?? [MARK.result, MARK.end];
  const maxTokens = opts.maxTokens ?? 160;
  const rand = rng(opts.seed ?? 1);
  const t0 = performance.now();
  const reused = prefill(model, prompt);
  const t1 = performance.now();
  const ids: number[] = [];
  const dec = new TextDecoder();
  let text = "", stoppedBy: StopReason = "max";
  let logits = model.logits;
  for (let n = 0; n < maxTokens; n++) {
    const id = sample(logits, opts.temperature ?? 0, opts.topK ?? 40, rand);
    ids.push(id);
    if (id < SPECIALS.length) {
      text += dec.decode() + SPECIALS[id];
      const marker = SPECIALS[id].slice(2, -2) as Marker;
      yield { id, text: "", marker };
      if (stop.includes(id)) { stoppedBy = marker; break; }
    } else {
      const piece = dec.decode(tok.bytes[id], { stream: true });
      text += piece;
      yield { id, text: piece };
    }
    if (n + 1 >= maxTokens) break;
    if (model.tokens.length >= model.cfg.ctx) { stoppedBy = "context"; break; }
    logits = model.step(id);
  }
  text += dec.decode();
  // The last token is not in the cache yet; the next prompt reuses everything up to it.
  return { ids, text, stoppedBy, promptTokens: prompt.length, reused, prefillMs: t1 - t0, decodeMs: performance.now() - t1 };
}

/** Runs `stream` to the end. */
export function generate(model: TinyModel, tok: Tokenizer, prompt: readonly number[], opts: GenerateOptions = {}, onToken?: (t: StreamToken) => void): Generation {
  const it = stream(model, tok, prompt, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    onToken?.(r.value);
  }
}
