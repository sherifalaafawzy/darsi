// @vitest-environment node
// Gate 3: the TypeScript engine (int8 weights, KV cache) writes the same tokens as the PyTorch reference (float32 on the
// CPU with the same int8 weights, no cache), with logits within LOGIT_TOL. Also the size gate: ≤ 3 MB gzipped.
import { gzipSync } from "node:zlib";
import { parseModel, TinyModel } from "../../src/tinylm/model";
import { prefill } from "../../src/tinylm/generate";
import { f32, fixture, loadWeights, readBin } from "./load";

/**
 * Largest allowed |TypeScript − PyTorch| for any logit. Logits span about ±30; the two sum in different orders (JS in
 * float64), so they differ in the last float32 bits: about 1e-5 measured, 1e-4 allowed.
 */
const LOGIT_TOL = 1e-4;

interface Case { name: string; prompt: number[]; generated: number[]; top5: { ids: number[]; logits: number[] }[]; logitsFirst: string }
const cases = fixture<{ cases: Case[] }>("reference.json").cases;
const w = loadWeights();

const maxDiff = (a: Float32Array, b: Float32Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

describe("Darsi Tiny model", () => {
  it("is 2–4 M parameters and at most 3 MB gzipped", () => {
    const c = w.config;
    const params = c.vocab * c.dim + c.layers * (4 * c.dim * c.dim + 2 * c.dim * c.ffn + 2 * c.dim) + c.dim;
    expect(params).toBeGreaterThan(2e6);
    expect(params).toBeLessThan(4e6);
    expect(c.ctx).toBe(384);
    expect(gzipSync(readBin(), { level: 9 }).length).toBeLessThanOrEqual(3_000_000);
  });

  it("refuses a file that is not a model (Hosting answers a missing file with index.html)", () => {
    expect(() => parseModel(new TextEncoder().encode("<!doctype html><html>").buffer as ArrayBuffer)).toThrow(/not a Darsi Tiny model/);
  });

  it.each(cases.map((c) => [c.name, c] as const))("matches PyTorch on %s", (_, c) => {
    const m = new TinyModel(w);
    prefill(m, c.prompt);
    let logits = m.logits;
    const first = f32(c.logitsFirst);
    expect(maxDiff(logits, first)).toBeLessThan(LOGIT_TOL);
    const got: number[] = [];
    for (let s = 0; s < c.generated.length; s++) {
      const top = c.top5[s];
      for (let k = 0; k < 5; k++) expect(Math.abs(logits[top.ids[k]] - top.logits[k])).toBeLessThan(LOGIT_TOL);
      let best = 0;
      for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
      got.push(best);
      if (s < c.generated.length - 1) logits = m.step(best);
    }
    expect(got).toEqual(c.generated);
  });

  it("reports the largest logit difference it saw", () => {
    let worst = 0;
    for (const c of cases) {
      const m = new TinyModel(w);
      prefill(m, c.prompt);
      worst = Math.max(worst, maxDiff(m.logits, f32(c.logitsFirst)));
    }
    console.info(`tinylm: largest |logit difference| vs PyTorch on first steps: ${worst.toExponential(2)}`);
    expect(worst).toBeLessThan(LOGIT_TOL);
  });
});
