// @vitest-environment node
// The committed v2 teaching model guards the GQA + SwiGLU path: PyTorch parity and handwritten fine-tune gradients.
import fs from "node:fs";
import path from "node:path";
import { FineTuner, type Example } from "../../src/tinylm/finetune";
import { prefill } from "../../src/tinylm/generate";
import { parseModel, TinyModel } from "../../src/tinylm/model";

const root = path.join(__dirname, "../../");
const lib = path.join(root, "public/lib/tinylm/scene/en/v2");
const fix = path.join(__dirname, "fixtures-v2");
const buf = fs.readFileSync(path.join(lib, "model.bin"));
const w = parseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
const f32 = (s: string) => {
  const b = Buffer.from(s, "base64");
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

interface RefCase { name: string; prompt: number[]; generated: number[]; logitsFirst: string }
interface Grad { name: string; size: number; norm: number; idx: number[]; values: string }
interface FtRun { blocks: number; loss: number; grads: Grad[] }
const refs = (JSON.parse(fs.readFileSync(path.join(fix, "reference.json"), "utf8")) as { cases: RefCase[] }).cases;
const ft = JSON.parse(fs.readFileSync(path.join(fix, "finetune.json"), "utf8")) as { examples: Example[]; runs: FtRun[] };

describe("Darsi Tiny v2 architecture", () => {
  it("is the fixed 3M GQA + SwiGLU shape with a 1.125 MiB KV cache", () => {
    expect(w.config).toMatchObject({ dim: 192, layers: 6, heads: 6, kvHeads: 2, ffn: 512, activation: "swiglu", ctx: 384 });
    const kv = w.config.layers * w.config.ctx * 64 * 2 * 4;
    expect(kv).toBe(1_179_648);
  });

  it.each(refs.map((r) => [r.name, r] as const))("matches int8 PyTorch logits on %s", (_, r) => {
    const model = new TinyModel(w);
    prefill(model, r.prompt);
    const want = f32(r.logitsFirst);
    let worst = 0;
    for (let i = 0; i < want.length; i++) worst = Math.max(worst, Math.abs(model.logits[i] - want[i]));
    expect(worst).toBeLessThan(1e-4);
  });

  it("matches PyTorch's one-block SwiGLU/GQA fine-tuning gradients", () => {
    const run = ft.runs.find((r) => r.blocks === 1)!;
    const tune = new FineTuner(w, { blocks: 1 });
    tune.add(ft.examples);
    const got = tune.gradients();
    expect(rel(got.loss, run.loss)).toBeLessThan(1e-5);
    expect(got.grads).toHaveLength(run.grads.length);
    run.grads.forEach((g, k) => {
      const want = f32(g.values);
      let d = 0, n = 0;
      g.idx.forEach((i, j) => { d += (got.grads[k][i] - want[j]) ** 2; n += want[j] ** 2; });
      expect(Math.sqrt(d / Math.max(n, 1e-30)), g.name).toBeLessThan(1e-3);
    });
  }, 60_000);
});
