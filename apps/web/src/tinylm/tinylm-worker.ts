/**
 * Darsi Tiny's Web Worker: loads the model, generates (streaming tokens), fine-tunes the top blocks. index.ts starts
 * it on demand and ends it when idle, so nothing runs in the background. Work is cut into small pieces (one token, one
 * training step) with a yield in between, so a stop message is seen at once.
 */
import { applySaved, exampleFrom, FineTuner } from "./finetune";
import { buildPrompt, openedBy, readStep, type Conversation } from "./format";
import { stream, type StreamToken } from "./generate";
import { parseModel, TinyModel, type TinyWeights } from "./model";
import type { Request, Response } from "./protocol";
import { Tokenizer, type TokenizerFile } from "./tokenizer";

// The worker's global scope, typed locally so the app keeps the DOM lib only.
const scope = globalThis as unknown as { postMessage(m: unknown, transfer: Transferable[]): void; onmessage: ((e: MessageEvent<Request>) => void) | null };

let tok: Tokenizer | null = null;
let base: TinyWeights | null = null;
let model: TinyModel | null = null;
let stopping = false;
let baseUrl = "";

const post = (m: Response, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

// A yield to the event loop without setTimeout's 4 ms clamp, so "stop" messages get through between tokens.
const ch = new MessageChannel();
let wake: (() => void) | null = null;
ch.port1.onmessage = () => { const w = wake; wake = null; w?.(); };
const tick = () => new Promise<void>((r) => { wake = r; ch.port2.postMessage(0); });

async function download(url: string, expect: { bytes: number; sha256: string } | undefined, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const get = async () => {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`tinylm: ${url} answered ${res.status}`);
    const reader = res.body.getReader(), parts: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      n += value.length;
      onBytes(value.length);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out.buffer;
  };
  let buf = await get();
  if (expect && !(await matches(buf, expect))) {
    // A bad copy in the cache (or Hosting's index.html for a missing file): drop it and fetch once more.
    try { await (await caches.open("darsi-lib")).delete(url); } catch { /* no Cache API here */ }
    buf = await get();
    if (!(await matches(buf, expect))) throw new Error(`tinylm: ${url} is not the expected file`);
  }
  return buf;
}

async function matches(buf: ArrayBuffer, expect: { bytes: number; sha256: string }): Promise<boolean> {
  if (buf.byteLength !== expect.bytes) return false;
  if (!crypto?.subtle) return true;
  const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)), (b) => b.toString(16).padStart(2, "0")).join("");
  return hex === expect.sha256;
}

async function handle(m: Request) {
  switch (m.type) {
    case "load": {
      baseUrl = m.base;
      if (!model) {
        const man = m.manifest;
        let loaded = 0;
        const total = man ? man.files["model.bin"].bytes + man.files["tokenizer.json"].bytes : 0;
        const progress = (n: number) => { loaded += n; post({ type: "progress", id: m.id, loaded, total }); };
        const [bin, tj] = await Promise.all([
          download(m.base + "model.bin", man?.files["model.bin"], progress),
          download(m.base + "tokenizer.json", man?.files["tokenizer.json"], progress),
        ]);
        tok = new Tokenizer(JSON.parse(new TextDecoder().decode(tj)) as TokenizerFile);
        base = parseModel(bin);
        model = new TinyModel(m.saved ? applySaved(base, m.saved) : base);
      }
      const c = model.cfg;
      post({ type: "ready", id: m.id, config: c, vocab: tok!.vocab });
      return;
    }
    case "generate": {
      if (!model || !tok) throw new Error("tinylm: not loaded");
      const prompt = Array.isArray(m.input) ? m.input : buildPrompt(tok, m.input as Conversation);
      stopping = false;
      const it = stream(model, tok, prompt, m.opts);
      // Tokens go out in batches, about one per screen frame: a message per token cost a third of the speed. Between
      // batches the worker yields, so a stop message gets through.
      let batch: StreamToken[] = [], sent = performance.now();
      const flush = () => { if (batch.length) post({ type: "tokens", id: m.id, tokens: batch }); batch = []; sent = performance.now(); };
      for (;;) {
        const r = it.next();
        if (r.done) {
          flush();
          const step = readStep(tok, r.value.ids, openedBy(prompt));
          post({ type: "done", id: m.id, result: { ...r.value, step } });
          return;
        }
        batch.push(r.value);
        if (performance.now() - sent < 16) continue;
        flush();
        await tick();
        if (stopping) {
          // Everything up to the last token is in the cache, so the next prompt can still reuse it.
          const ids = [];
          for (let i = prompt.length; i < model.tokens.length; i++) ids.push(model.tokens[i]);
          ids.push(r.value.id);
          post({ type: "done", id: m.id, result: { ids, text: tok.decode(ids), stoppedBy: "stopped", promptTokens: prompt.length, reused: 0, prefillMs: 0, decodeMs: 0, step: readStep(tok, ids, openedBy(prompt)) } });
          return;
        }
      }
    }
    case "tokenize": {
      if (!tok) throw new Error("tinylm: not loaded");
      const ids = tok.encode(m.text);
      post({ type: "pieces", id: m.id, ids, pieces: ids.map((i) => new TextDecoder().decode(tok!.bytes[i])) });
      return;
    }
    case "finetune": {
      if (!base || !tok) throw new Error("tinylm: not loaded");
      const ft = new FineTuner(base, m.opts);
      if (m.resume) ft.load(m.resume);
      let convs = m.examples;
      if (m.replay) {
        const res = await fetch(baseUrl + "replay.json");
        if (!res.ok) throw new Error(`tinylm: replay.json answered ${res.status}`);
        convs = [...convs, ...((await res.json()) as Conversation[]).slice(0, m.replay)];
      }
      const examples = convs.map((c) => exampleFrom(tok!, c));
      const t0 = performance.now();
      const targets = ft.add(examples);
      post({ type: "ft-ready", id: m.id, examples: ft.size, targets, trainable: ft.trainable, ms: performance.now() - t0 });
      stopping = false;
      for (let s = 0; s < m.steps && !stopping; s++) {
        const r = ft.step();
        post({ type: "ft-step", id: m.id, step: s, ...r });
        await tick();
      }
      const saved = ft.save();
      model = new TinyModel(ft.weights());
      post({ type: "ft-done", id: m.id, saved, stopped: stopping }, [saved]);
      return;
    }
    case "use": {
      if (!base) throw new Error("tinylm: not loaded");
      model = new TinyModel(m.saved ? applySaved(base, m.saved) : base);
      post({ type: "ok", id: m.id });
      return;
    }
  }
}

scope.onmessage = (e: MessageEvent<Request>) => {
  const m = e.data;
  if (m.type === "stop") { stopping = true; return; }
  handle(m).catch((err: unknown) => post({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) }));
};
