// @vitest-environment node
// Fine-tuning the top blocks: the hand-written backpropagation gives PyTorch's gradients, and Adam the same losses.
import { applySaved, exampleFrom, FineTuner, type Example } from "../../src/tinylm/finetune";
import { buildPrompt, openedBy, readStep, TOOLS, type Conversation } from "../../src/tinylm/format";
import { generate } from "../../src/tinylm/generate";
import { TinyModel } from "../../src/tinylm/model";
import { f32, fixture, loadTokenizer, loadWeights } from "./load";

interface Grad { name: string; size: number; norm: number; idx: number[]; values: string }
interface Run { blocks: number; loss: number; grads: Grad[]; adamLosses: number[]; finalLoss: number }
const fx = fixture<{ examples: Example[]; runs: Run[] }>("finetune.json");
const w = loadWeights();
const tok = loadTokenizer();
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

describe("Darsi Tiny fine-tuning", () => {
  it.each(fx.runs.map((r) => [r.blocks, r] as const))("matches PyTorch's gradients with %i trainable block(s)", (blocks, run) => {
    const ft = new FineTuner(w, { blocks });
    ft.add(fx.examples);
    const { loss, grads } = ft.gradients();
    expect(rel(loss, run.loss)).toBeLessThan(1e-5);
    expect(grads).toHaveLength(run.grads.length);
    run.grads.forEach((g, k) => {
      expect(grads[k].length, g.name).toBe(g.size);
      let sq = 0;
      for (const v of grads[k]) sq += v * v;
      expect(rel(Math.sqrt(sq), g.norm), g.name).toBeLessThan(1e-3);
      const want = f32(g.values);
      let d = 0, n = 0;
      g.idx.forEach((i, j) => { d += (grads[k][i] - want[j]) ** 2; n += want[j] ** 2; });
      expect(Math.sqrt(d / Math.max(n, 1e-30)), g.name).toBeLessThan(1e-3);
    });
  }, 60_000);

  it.each(fx.runs.map((r) => [r.blocks, r] as const))("takes the same Adam steps as torch.optim.Adam with %i block(s)", (blocks, run) => {
    const ft = new FineTuner(w, { blocks, lr: 1e-3, clip: 1 });
    ft.add(fx.examples);
    const losses = run.adamLosses.map(() => ft.step().loss);
    losses.forEach((l, i) => expect(rel(l, run.adamLosses[i])).toBeLessThan(2e-4));
    expect(rel(ft.loss(), run.finalLoss)).toBeLessThan(2e-4);
  }, 60_000);

  it("learns something new and keeps it after saving", () => {
    // Teach a new tool: "bus" with the stop to leave from. Base Darsi Tiny has never seen it.
    const ex = (place: string, q: string): Conversation => ({
      tools: [...TOOLS, "bus"],
      turns: [{ role: "user", text: q.replace("{p}", place) }, { role: "plan", text: "I'll check the bus times." },
        { role: "call", call: { tool: "bus", args: { from: place } } }, { role: "result", result: { next: "07:40", every: 30 } },
        { role: "answer", text: `The next bus from ${place} leaves at 07:40, then every 30 minutes.` }],
    });
    const places = ["Kafi", "Dala", "Tanko", "Sabo", "Kuru", "Bara"];
    const examples = places.map((p) => exampleFrom(tok, ex(p, "When is the next bus from {p}?")));
    const ft = new FineTuner(w, { blocks: 2, lr: 2e-3 });
    ft.add(examples);
    const first = ft.step().loss;
    let last = first;
    for (let s = 0; s < 19; s++) last = ft.step().loss;
    expect(last).toBeLessThan(first / 10);

    const tuned = new TinyModel(applySaved(w, ft.save()));
    const p = buildPrompt(tok, { tools: [...TOOLS, "bus"], turns: [{ role: "user", text: "When is the next bus from Sabo?" }] });
    const step = readStep(tok, generate(tuned, tok, p).ids, openedBy(p));
    expect(step.call).toEqual({ tool: "bus", args: { from: "Sabo" } });
  }, 120_000);

  it("refuses saved blocks of another shape", () => {
    const ft = new FineTuner(w, { blocks: 1 });
    expect(() => new FineTuner(w, { blocks: 2 }).load(ft.save())).toThrow(/do not match/);
  });
});
