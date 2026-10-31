// @vitest-environment node
// Generation: the KV cache reuse, streaming, stops and seeded sampling, on the shipped model.
import { generate, stream } from "../../src/tinylm/generate";
import { buildPrompt, readStep, openedBy, TOOLS, type Conversation } from "../../src/tinylm/format";
import { TinyModel } from "../../src/tinylm/model";
import { MARK } from "../../src/tinylm/tokenizer";
import { loadTokenizer, loadWeights, loadWorld } from "./load";
import { runTool } from "../../src/tinylm/tools";

const tok = loadTokenizer();
const w = loadWeights();
const world = loadWorld();
const conv = (text: string): Conversation => ({ tools: TOOLS, turns: [{ role: "user", text }] });

describe("Darsi Tiny generation", () => {
  it("runs a whole agent loop: plan, call, result, answer", () => {
    const m = new TinyModel(w);
    const c = conv(`What's the weather in ${world.villages[0].en} tomorrow?`);
    const p1 = buildPrompt(tok, c);
    const g1 = generate(m, tok, p1);
    expect(g1.stoppedBy).toBe("result");
    const s1 = readStep(tok, g1.ids, openedBy(p1));
    expect(s1.plan).toBeTruthy();
    expect(s1.call).toEqual({ tool: "weather", args: { place: world.villages[0].en, day: "tomorrow" } });
    const result = runTool(world, s1.call!.tool, s1.call!.args, "en");
    const c2: Conversation = { tools: c.tools, turns: [...c.turns, ...s1.turns, { role: "result", result }] };
    const p2 = buildPrompt(tok, c2);
    const g2 = generate(m, tok, p2);
    expect(g2.stoppedBy).toBe("end");
    // The second prompt extends the first, so the cache is reused for everything but the new part.
    expect(g2.reused).toBeGreaterThan(p1.length);
    const s2 = readStep(tok, g2.ids, openedBy(p2));
    expect(s2.answer).toContain(String(result.high));
  });

  it("gives the same tokens with a reused cache as from scratch", () => {
    const m = new TinyModel(w);
    const a = buildPrompt(tok, conv("كم يساوي 17 × 23؟"));
    generate(m, tok, a);
    const b = buildPrompt(tok, conv("Convert 5 km to miles."));
    const warm = generate(m, tok, b);
    const cold = generate(new TinyModel(w), tok, b);
    expect(warm.ids).toEqual(cold.ids);
    // The same prompt again reuses all but its last token.
    expect(generate(m, tok, b).reused).toBe(b.length - 1);
  });

  it("streams text that adds up to the final text, whole characters only", () => {
    const m = new TinyModel(w);
    let streamed = "";
    const markers: string[] = [];
    const g = generate(m, tok, buildPrompt(tok, conv("ما معنى التشفير؟")), {}, (t) => { streamed += t.text; if (t.marker) markers.push(t.marker); });
    expect(markers).toContain("call");
    expect(g.text.replace(/<\|\w+\|>/g, "")).toBe(streamed);
    expect(streamed).not.toContain("�");
  });

  it("stops at the token limit and at chosen markers", () => {
    const m = new TinyModel(w);
    const p = buildPrompt(tok, conv("Who are you?"));
    expect(generate(m, tok, p, { maxTokens: 3 })).toMatchObject({ stoppedBy: "max" });
    expect(generate(m, tok, p, { maxTokens: 3 }).ids).toHaveLength(3);
    const g = generate(m, tok, p, { stop: [MARK.answer] });
    expect(g.stoppedBy).toBe("answer");
    expect(g.ids[g.ids.length - 1]).toBe(MARK.answer);
  });

  it("samples the same text for the same seed, and a different one otherwise", () => {
    const p = buildPrompt(tok, conv("Hello!"));
    // The model is very sure of its answers; a hot temperature flattens the choice enough to see different seeds differ.
    const run = (seed: number, temperature = 4) => generate(new TinyModel(w), tok, p, { temperature, topK: 200, seed, maxTokens: 12 }).ids.join();
    expect(run(3)).toBe(run(3));
    const outs = new Set([1, 2, 3, 4, 5, 6].map((s) => run(s)));
    expect(outs.size).toBeGreaterThan(1);
    // A tiny temperature is as good as greedy here.
    expect(run(9, 1e-3)).toBe(generate(new TinyModel(w), tok, p, { maxTokens: 12 }).ids.join());
  });

  it("ends at the context limit instead of failing", () => {
    const m = new TinyModel(w);
    const filler = Array.from({ length: 380 }, (_, i) => 8 + (i % 200));
    const it = stream(m, tok, filler, { maxTokens: 50 });
    let r = it.next();
    while (!r.done) r = it.next();
    expect(r.value.stoppedBy === "context" || r.value.ids.length < 50).toBe(true);
    expect(m.tokens.length).toBeLessThanOrEqual(w.config.ctx);
  });
});
