/**
 * Darsi Tiny for the Labs: a ~3 MB language model that plans, calls school tools and answers, in English and Arabic,
 * on the phone. This module is the page side; the model runs in a Web Worker (tinylm-worker.ts) that starts when needed and
 * ends after `idleMs` without work, so nothing runs in the background.
 *
 *   const lm = new TinyLM();
 *   const info = await fetchManifest();              // download size first (info.files["model.bin"].bytes)
 *   await lm.load((done, total) => …);               // model.bin + tokenizer.json, kept in the darsi-lib cache
 *   const conv = { tools: TOOLS, turns: [{ role: "user", text: "What's 17 times 23?" }] };
 *   const r = await lm.generate(conv, { onToken: (t) => … });
 *   if (r.step.call) { const result = runTool(world, r.step.call.tool, r.step.call.args, "en"); … }
 *
 * The files live under /lib/tinylm/v1/: not precached, cache-first in darsi-lib once used. Only a Lab chunk may import
 * this folder; nothing on the startup path does, and nothing here imports Firebase.
 */
import type { FineTuneOptions, StepResult } from "./finetune";
import type { Conversation } from "./format";
import type { GenerateOptions, StreamToken } from "./generate";
import type { TinyConfig } from "./model";
import type { Manifest, Request, Response, Result } from "./protocol";
import type { World } from "./tools";

export { TOOLS, renderPrompt, parseCall, type Conversation, type Turn, type ToolCall, type Step, type ToolName } from "./format";
export { runTool, langOf, type World, type Lang } from "./tools";
export { MARK } from "./tokenizer";
export type { Manifest, Result } from "./protocol";
export type { StreamToken, GenerateOptions } from "./generate";
export type { StepResult, FineTuneOptions } from "./finetune";

export const TINYLM_BASE = "/lib/tinylm/v1/";

/**
 * Four models, each the same size, each one job.
 * The two app models read a request, plan, call a school tool and answer. One is English, one is Arabic.
 * They live at `appBase(lang)` once that language passes its eval; until then the labs use the shipped
 * bilingual model at TINYLM_BASE.
 * The two teaching models only write a compact scene. The phone expands it into a Lesson Studio pack and
 * the player draws every frame from the clock. They live at `teachBase(lang)`.
 */
export const appBase = (lang: "en" | "ar") => `/lib/tinylm/app/${lang}/v1/`;
export const teachBase = (lang: "en" | "ar") => `/lib/tinylm/scene/${lang}/v1/`;
export const TEACH_FALLBACK = "/lib/tinylm/scene/v1/";

/** The manifest (sizes, hashes, config): small, so the Lab can show the download size before downloading. */
export async function fetchManifest(base = TINYLM_BASE): Promise<Manifest> {
  const res = await fetch(base + "manifest.json");
  if (!res.ok) throw new Error(`tinylm: manifest answered ${res.status}`);
  return (await res.json()) as Manifest;
}

/** The simulated school the tools read (~90 KB, ~15 KB gzipped). */
export async function fetchWorld(base = TINYLM_BASE): Promise<World> {
  const res = await fetch(base + "world.json");
  if (!res.ok) throw new Error(`tinylm: world answered ${res.status}`);
  return (await res.json()) as World;
}

/** Whether the model is already on this phone (the service worker's darsi-lib cache). */
export async function isDownloaded(base = TINYLM_BASE): Promise<boolean> {
  try {
    return !!(await (await caches.open("darsi-lib")).match(base + "model.bin"));
  } catch {
    return false;
  }
}

export interface TinyLMOptions {
  base?: string;
  /** Milliseconds without work before the worker ends (default 5000). */
  idleMs?: number;
  /** Makes the worker (tests pass their own). */
  createWorker?: () => Worker;
}

export interface GenerateCall extends GenerateOptions { onToken?: (t: StreamToken) => void }

export interface FineTuneCall extends FineTuneOptions {
  /** Adam steps over all the examples (each step sees every example once). */
  steps: number;
  onReady?: (info: { examples: number; targets: number; trainable: number; ms: number }) => void;
  onStep?: (s: StepResult & { step: number }) => void;
  /** A previous result of finetune(), to go on training from. */
  resume?: ArrayBuffer;
  /**
   * How many ordinary conversations (replay.json, up to 96) to mix in. Without them the model forgets what it knew:
   * taught a new tool from 24 examples, it learned it but fell from 97% to 14% on its usual requests; taught from 48
   * with 48 replayed, it kept 95% (tools/tinylm/MODEL_CARD.md).
   */
  replay?: number;
}

export class TinyLM {
  private readonly base: string;
  private readonly idleMs: number;
  private readonly make: () => Worker;
  private worker: Worker | null = null;
  private ready: Promise<{ config: TinyConfig; vocab: number }> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private busy = 0;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private nextId = 1;
  private readonly waiting = new Map<number, { on: (m: Response) => void; fail: (e: Error) => void }>();
  /** The fine-tune in use: given to every new worker, so the model stays the same after an idle restart. */
  private saved: ArrayBuffer | null = null;
  private manifest: Manifest | undefined;
  private onProgress: ((loaded: number, total: number) => void) | undefined;

  constructor(opts: TinyLMOptions = {}) {
    this.base = opts.base ?? TINYLM_BASE;
    this.idleMs = opts.idleMs ?? 5000;
    this.make = opts.createWorker ?? (() => new Worker(new URL("./tinylm-worker.ts", import.meta.url), { type: "module", name: "tinylm" }));
  }

  /** Whether the worker is running now (it ends by itself when idle). */
  get running(): boolean {
    return !!this.worker;
  }

  /** Downloads (or reads from the cache) and starts the model. Safe to call again. */
  load(onProgress?: (loaded: number, total: number) => void): Promise<{ config: TinyConfig; vocab: number }> {
    this.onProgress = onProgress;
    return this.run(() => this.ensure());
  }

  /** The model's next move in a conversation (or after raw prompt ids): plan, then a call or an answer. */
  generate(input: Conversation | number[], opts: GenerateCall = {}): Promise<Result> {
    const { onToken, ...o } = opts;
    return this.run(async () => {
      await this.ensure();
      return this.ask<Result>({ type: "generate", id: 0, input, opts: o }, (m, done) => {
        if (m.type === "tokens") for (const t of m.tokens) onToken?.(t);
        else if (m.type === "done") done(m.result);
      });
    });
  }

  /** Stops the generation or fine-tuning in progress (it ends after the current token or step). */
  stop(): void {
    this.worker?.postMessage({ type: "stop", id: 0 } satisfies Request);
  }

  /** How the tokenizer splits text: ids and the bytes of each, as text. */
  tokenize(text: string): Promise<{ ids: number[]; pieces: string[] }> {
    return this.run(async () => {
      await this.ensure();
      return this.ask<{ ids: number[]; pieces: string[] }>({ type: "tokenize", id: 0, text }, (m, done) => {
        if (m.type === "pieces") done({ ids: m.ids, pieces: m.pieces });
      });
    });
  }

  /**
   * Trains the top `blocks` blocks (default 1) on finished conversations, everything else frozen, and switches this
   * model to the result. Returns the learned tensors: keep them (IndexedDB) and pass them to useFineTune() later.
   */
  finetune(examples: Conversation[], opts: FineTuneCall): Promise<ArrayBuffer> {
    const { steps, onReady, onStep, resume, replay, ...o } = opts;
    return this.run(async () => {
      await this.ensure();
      const saved = await this.ask<ArrayBuffer>({ type: "finetune", id: 0, examples, steps, opts: o, resume, replay }, (m, done) => {
        if (m.type === "ft-ready") onReady?.({ examples: m.examples, targets: m.targets, trainable: m.trainable, ms: m.ms });
        else if (m.type === "ft-step") onStep?.({ step: m.step, loss: m.loss, targets: m.targets, gradNorm: m.gradNorm, ms: m.ms });
        else if (m.type === "ft-done") done(m.saved);
      });
      this.saved = saved.slice(0);
      return saved;
    });
  }

  /** Uses a saved fine-tune (or the original model with null). */
  useFineTune(saved: ArrayBuffer | null): Promise<void> {
    return this.run(async () => {
      this.saved = saved ? saved.slice(0) : null;
      if (!this.worker) return; // the next worker starts with it
      await this.ensure();
      await this.ask<void>({ type: "use", id: 0, saved: this.saved ? this.saved.slice(0) : null }, (m, done) => { if (m.type === "ok") done(); });
    });
  }

  /** Ends the worker now. The next call starts a new one. */
  dispose(): void {
    clearTimeout(this.idle);
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    for (const w of this.waiting.values()) w.fail(new Error("tinylm: stopped"));
    this.waiting.clear();
  }

  // One request at a time: the worker has one model and one cache.
  private run<T>(fn: () => Promise<T>): Promise<T> {
    clearTimeout(this.idle);
    this.busy++;
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined).finally(() => {
      if (--this.busy === 0) this.idle = setTimeout(() => this.dispose(), this.idleMs);
    });
    return p;
  }

  private ensure(): Promise<{ config: TinyConfig; vocab: number }> {
    if (this.worker && this.ready) return this.ready;
    const w = (this.worker = this.make());
    w.onmessage = (e: MessageEvent<Response>) => this.waiting.get(e.data.id)?.on(e.data);
    w.onerror = (e) => {
      e.preventDefault?.();
      const err = new Error(`tinylm: worker failed${e.message ? `: ${e.message}` : ""}`);
      for (const x of this.waiting.values()) x.fail(err);
      this.waiting.clear();
      this.worker?.terminate();
      this.worker = null;
      this.ready = null;
    };
    this.ready = (async () => {
      this.manifest ??= await fetchManifest(this.base).catch(() => undefined);
      return this.ask<{ config: TinyConfig; vocab: number }>(
        { type: "load", id: 0, base: this.base, manifest: this.manifest, saved: this.saved ? this.saved.slice(0) : null },
        (m, done) => {
          if (m.type === "progress") this.onProgress?.(m.loaded, m.total);
          else if (m.type === "ready") done({ config: m.config, vocab: m.vocab });
        },
      );
    })();
    this.ready.catch(() => this.dispose());
    return this.ready;
  }

  private ask<T>(req: Request, on: (m: Response, done: (v: T) => void) => void): Promise<T> {
    const id = this.nextId++;
    const w = this.worker;
    if (!w) return Promise.reject(new Error("tinylm: not running"));
    return new Promise<T>((resolve, reject) => {
      const finish = (f: () => void) => { this.waiting.delete(id); f(); };
      this.waiting.set(id, {
        on: (m) => (m.type === "error" ? finish(() => reject(new Error(m.message))) : on(m, (v) => finish(() => resolve(v)))),
        fail: reject,
      });
      w.postMessage({ ...req, id });
    });
  }
}
