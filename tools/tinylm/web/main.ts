// The test page for speed.mjs: runs Darsi Tiny on this page's main thread and through the real worker client, and
// times it. Imports only apps/web/src/tinylm, as a Lab would.
import { exampleFrom, FineTuner } from "../../../apps/web/src/tinylm/finetune";
import { buildPrompt, TOOLS, type Conversation } from "../../../apps/web/src/tinylm/format";
import { generate } from "../../../apps/web/src/tinylm/generate";
import { TinyLM } from "../../../apps/web/src/tinylm/index";
import { parseModel, TinyModel, type TinyWeights } from "../../../apps/web/src/tinylm/model";
import { Tokenizer, type TokenizerFile } from "../../../apps/web/src/tinylm/tokenizer";

const BASE = "/lib/tinylm/v1/";
const log = (s: string) => { document.getElementById("log")!.textContent += s + "\n"; };

let w: TinyWeights | null = null;
let tok: Tokenizer | null = null;

async function loadInline() {
  if (w && tok) return { w, tok };
  const [bin, tj] = await Promise.all([fetch(BASE + "model.bin").then((r) => r.arrayBuffer()), fetch(BASE + "tokenizer.json").then((r) => r.json())]);
  w = parseModel(bin);
  tok = new Tokenizer(tj as TokenizerFile);
  return { w, tok };
}

const REQUESTS = [
  "What's the weather in Palm Hill tomorrow?", "كيف سيكون الطقس في تل النخيل غدًا؟", "Remind me on Monday at 3:30 pm to collect the homework.",
  "ما الطريق من كافي إلى دالا؟", "Send a message to Mr Okafor: The staff meeting is at 3:00 tomorrow.", "ما معنى التشفير؟",
];
const conv = (text: string): Conversation => ({ tools: TOOLS, turns: [{ role: "user", text }] });

interface Run { prompt: number; tokens: number; prefillMs: number; decodeMs: number; tokPerSec: number; prefillTokPerSec: number }
const summary = (r: { promptTokens: number; ids: number[]; prefillMs: number; decodeMs: number }): Run => ({
  prompt: r.promptTokens, tokens: r.ids.length, prefillMs: Math.round(r.prefillMs), decodeMs: Math.round(r.decodeMs),
  // The first token comes from the prefill; decode time covers the rest.
  tokPerSec: +(((r.ids.length - 1) / r.decodeMs) * 1000).toFixed(1), prefillTokPerSec: +((r.promptTokens / r.prefillMs) * 1000).toFixed(1),
});

/** Generation on this page's main thread, fresh model each time (no cache reuse between requests). */
async function main(n = REQUESTS.length) {
  const { w, tok } = await loadInline();
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const m = new TinyModel(w);
    const r = generate(m, tok, buildPrompt(tok, conv(REQUESTS[i % REQUESTS.length])), { maxTokens: 120 });
    runs.push(summary(r));
    log(`main ${i}: ${JSON.stringify(runs[runs.length - 1])}`);
  }
  return runs;
}

/** The same through the worker client (a Lab's path). */
let lm: TinyLM | null = null;
async function worker(n = REQUESTS.length, idleMs = 1500) {
  lm ??= new TinyLM({ idleMs });
  const t0 = performance.now();
  await lm.load();
  const loadMs = performance.now() - t0;
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    let streamed = 0;
    const r = await lm.generate(conv(REQUESTS[i % REQUESTS.length]), { maxTokens: 120, onToken: () => streamed++ });
    runs.push({ ...summary(r), streamed } as Run);
    log(`worker ${i}: ${JSON.stringify(runs[runs.length - 1])} ${JSON.stringify(r.step.call ?? r.step.answer)}`);
  }
  return { loadMs: Math.round(loadMs), runs };
}

const running = () => !!lm?.running;

/** Stop in the middle of a generation: it must end within a token or two. */
async function stopTest() {
  lm ??= new TinyLM({ idleMs: 1500 });
  let n = 0;
  const p = lm.generate(conv("I'm going from Kafi to Dala tomorrow. How far is it, and what's the weather there?"), { maxTokens: 120, onToken: () => { if (++n === 3) lm!.stop(); } });
  const r = await p;
  return { stoppedBy: r.stoppedBy, tokens: r.ids.length, streamed: n };
}

/** The reference prompts must give PyTorch's tokens here too. */
async function parity(cases: { prompt: number[]; generated: number[] }[]) {
  const { w, tok } = await loadInline();
  return cases.map((c) => generate(new TinyModel(w), tok, c.prompt, { maxTokens: c.generated.length, stop: [] }).ids.join() === c.generated.join());
}

/** Fine-tuning on this page: ms per example per Adam step, with 1 and 2 trainable blocks. */
async function finetune(blocks: number, steps = 2) {
  const { w, tok } = await loadInline();
  const ex = (place: string): Conversation => ({
    tools: [...TOOLS, "bus"],
    turns: [{ role: "user", text: `When is the next bus from ${place}?` }, { role: "plan", text: "I'll check the bus times." },
      { role: "call", call: { tool: "bus", args: { from: place } } }, { role: "result", result: { next: "07:40", every: 30 } },
      { role: "answer", text: `The next bus from ${place} leaves at 07:40, then every 30 minutes.` }],
  });
  const examples = ["Kafi", "Dala", "Tanko", "Sabo", "Kuru", "Bara", "تل النخيل", "كافي"].map((p) => exampleFrom(tok, ex(p)));
  const t0 = performance.now();
  const ft = new FineTuner(w, { blocks });
  ft.add(examples);
  const addMs = performance.now() - t0;
  const out = [];
  for (let s = 0; s < steps; s++) out.push(ft.step());
  const tokens = examples.reduce((a, e) => a + e.ids.length, 0);
  return { blocks, examples: examples.length, tokens, trainable: ft.trainable, addMs: Math.round(addMs), stepMs: out.map((r) => Math.round(r.ms)), msPerExample: Math.round(out[out.length - 1].ms / examples.length), losses: out.map((r) => +r.loss.toFixed(4)) };
}

/** Fine-tuning through the worker (replay included), then generating with the result, then back to the base model. */
async function workerFinetune() {
  lm ??= new TinyLM({ idleMs: 1500 });
  const examples = ["Kafi", "Dala", "Tanko", "Sabo", "Kuru", "Bara"].map((p): Conversation => ({
    tools: [...TOOLS, "bus"],
    turns: [{ role: "user", text: `When is the next bus from ${p}?` }, { role: "plan", text: "I'll check the bus times." },
      { role: "call", call: { tool: "bus", args: { from: p } } }, { role: "result", result: { next: "07:40", every: 30 } },
      { role: "answer", text: `The next bus from ${p} leaves at 07:40, then every 30 minutes.` }],
  }));
  const losses: number[] = [];
  let ready: unknown = null;
  const saved = await lm.finetune(examples, { steps: 20, blocks: 2, lr: 2e-3, replay: 4, onReady: (r) => { ready = r; }, onStep: (s) => losses.push(+s.loss.toFixed(4)) });
  const q: Conversation = { tools: [...TOOLS, "bus"], turns: [{ role: "user", text: "When is the next bus from Sabo?" }] };
  const tuned = await lm.generate(q);
  await lm.useFineTune(null);
  const base = await lm.generate(q);
  return { savedBytes: saved.byteLength, ready, losses, tunedCall: tuned.step.call ?? null, baseCall: base.step.call ?? null };
}

Object.assign(window, { tinyBench: { main, worker, running, stopTest, parity, finetune, workerFinetune, ready: true } });
log("ready");
