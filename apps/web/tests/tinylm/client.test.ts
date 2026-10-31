// @vitest-environment node
// The page-side client: one request at a time, progress and tokens passed on, and a worker that ends when idle and comes
// back with the same fine-tune. The worker here is a stand-in that speaks the protocol (the real one runs in the
// browser check, tools/tinylm/web/speed.mjs).
import { TinyLM } from "../../src/tinylm/index";
import type { Request, Response } from "../../src/tinylm/protocol";

class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<Response>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  received: Request[] = [];
  terminated = false;
  constructor() { FakeWorker.made.push(this); }
  private send(m: Response) { setTimeout(() => this.onmessage?.({ data: m } as MessageEvent<Response>), 1); }
  postMessage(m: Request) {
    this.received.push(m);
    if (m.type === "load") { this.send({ type: "progress", id: m.id, loaded: 5, total: 10 }); this.send({ type: "ready", id: m.id, config: { vocab: 3000 } as never, vocab: 3000 }); }
    if (m.type === "generate") {
      this.send({ type: "tokens", id: m.id, tokens: [{ id: 9, text: "a" }, { id: 7, text: "", marker: "end" }] });
      this.send({ type: "done", id: m.id, result: { ids: [9], text: "a", stoppedBy: "end", promptTokens: 1, reused: 0, prefillMs: 0, decodeMs: 1, step: { turns: [] } } });
    }
    if (m.type === "finetune") {
      this.send({ type: "ft-ready", id: m.id, examples: 1, targets: 4, trainable: 10, ms: 1 });
      this.send({ type: "ft-step", id: m.id, step: 0, loss: 2, targets: 4, gradNorm: 1, ms: 1 });
      this.send({ type: "ft-done", id: m.id, saved: new Float32Array([1, 2, 3]).buffer, stopped: false });
    }
    if (m.type === "tokenize" && m.text === "boom") this.send({ type: "error", id: m.id, message: "tinylm: boom" });
  }
  terminate() { this.terminated = true; }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("TinyLM client", () => {
  beforeEach(() => {
    FakeWorker.made = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ files: {} }), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads once, streams tokens and runs requests one at a time", async () => {
    const lm = new TinyLM({ idleMs: 1000, createWorker: () => new FakeWorker() as unknown as Worker });
    const progress: number[] = [];
    await lm.load((n) => progress.push(n));
    expect(progress).toEqual([5]);
    const tokens: string[] = [];
    const [a, b] = await Promise.all([lm.generate([1, 2], { onToken: (t) => tokens.push(t.text) }), lm.generate([3])]);
    expect(a.text).toBe("a");
    expect(b.stoppedBy).toBe("end");
    expect(tokens).toEqual(["a", ""]);
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0].received.map((r) => r.type)).toEqual(["load", "generate", "generate"]);
    lm.dispose();
  });

  it("ends the worker when idle and starts a new one with the same fine-tune", async () => {
    const lm = new TinyLM({ idleMs: 30, createWorker: () => new FakeWorker() as unknown as Worker });
    const steps: number[] = [];
    const saved = await lm.finetune([], { steps: 1, onStep: (s) => steps.push(s.loss) });
    expect(steps).toEqual([2]);
    expect(new Float32Array(saved)).toEqual(new Float32Array([1, 2, 3]));
    expect(lm.running).toBe(true);
    await wait(80);
    expect(lm.running).toBe(false);
    expect(FakeWorker.made[0].terminated).toBe(true);
    await lm.generate([1]);
    const load = FakeWorker.made[1].received[0] as Extract<Request, { type: "load" }>;
    expect(load.type).toBe("load");
    expect(new Float32Array(load.saved!)).toEqual(new Float32Array([1, 2, 3]));
    lm.dispose();
  });

  it("passes errors on and keeps working", async () => {
    const lm = new TinyLM({ idleMs: 1000, createWorker: () => new FakeWorker() as unknown as Worker });
    await expect(lm.tokenize("boom")).rejects.toThrow("tinylm: boom");
    await expect(lm.generate([1])).resolves.toMatchObject({ text: "a" });
    lm.stop();
    expect(FakeWorker.made[0].received.at(-1)?.type).toBe("stop");
    lm.dispose();
  });
});
