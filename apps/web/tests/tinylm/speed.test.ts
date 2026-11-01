// @vitest-environment node
// Opt-in microbenchmark for architecture candidates:
//   TINYLM_SPEED=1 TINYLM_LIB=<candidate folder> npx vitest run tests/tinylm/speed.test.ts
// Uses a fixed 96-token prompt and 128-token continuation, so different stopping behavior cannot skew the result.
import { generate } from "../../src/tinylm/generate";
import { TinyModel } from "../../src/tinylm/model";
import { loadTokenizer, loadWeights } from "./load";

const run = process.env.TINYLM_SPEED ? describe : describe.skip;

run("Darsi Tiny architecture speed", () => {
  it("reports fixed-work prefill/decode speed and KV-cache memory", () => {
    const w = loadWeights();
    const tok = loadTokenizer();
    const seed = tok.encode("Explain how a small neural network learns from examples and uses a tool. ");
    const prompt = Array.from({ length: 96 }, (_, i) => seed[i % seed.length]);

    // Warm V8's hot loops without including compilation in the measured runs.
    generate(new TinyModel(w), tok, prompt, { maxTokens: 24, stop: [] });
    const runs: { prefill: number; decode: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const out = generate(new TinyModel(w), tok, prompt, { maxTokens: 128, stop: [] });
      runs.push({
        prefill: (out.promptTokens / out.prefillMs) * 1000,
        decode: ((out.ids.length - 1) / out.decodeMs) * 1000,
      });
    }
    const med = (key: "prefill" | "decode") => [...runs].sort((a, b) => a[key] - b[key])[runs.length >> 1][key];
    const c = w.config;
    const kvHeads = c.kvHeads || c.heads;
    const kvDim = kvHeads * (c.dim / c.heads);
    const kvBytes = c.layers * c.ctx * kvDim * 2 * 4;
    console.info(JSON.stringify({
      config: c,
      paramsShape: `${c.layers}x${c.dim}`,
      kvMiB: +(kvBytes / 2 ** 20).toFixed(3),
      prefillTokPerSec: +med("prefill").toFixed(1),
      decodeTokPerSec: +med("decode").toFixed(1),
    }));
    expect(med("decode")).toBeGreaterThan(0);
  });
});
