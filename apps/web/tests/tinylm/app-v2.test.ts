// @vitest-environment node
// Each language-specific v2 app model runs the complete plan → call → result → answer loop.
import fs from "node:fs";
import path from "node:path";
import { buildPrompt, openedBy, readStep, TOOLS, type Conversation } from "../../src/tinylm/format";
import { generate } from "../../src/tinylm/generate";
import { parseModel, TinyModel } from "../../src/tinylm/model";
import { Tokenizer, type TokenizerFile } from "../../src/tinylm/tokenizer";
import { runTool, type Lang, type World } from "../../src/tinylm/tools";

const root = path.join(__dirname, "../../public/lib/tinylm/app");

function files(lang: Lang) {
  const base = path.join(root, lang, "v2");
  const b = fs.readFileSync(path.join(base, "model.bin"));
  return {
    w: parseModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer),
    tok: new Tokenizer(JSON.parse(fs.readFileSync(path.join(base, "tokenizer.json"), "utf8")) as TokenizerFile),
    world: JSON.parse(fs.readFileSync(path.join(base, "world.json"), "utf8")) as World,
  };
}

describe.each(["en", "ar"] as const)("Darsi Tiny v2 app model: %s", (lang) => {
  it("calls the right tool and answers from its result", () => {
    const { w, tok, world } = files(lang);
    const place = world.villages[0][lang];
    const text = lang === "ar" ? `ما حالة الطقس في ${place} غدًا؟` : `What's the weather in ${place} tomorrow?`;
    const c: Conversation = { tools: TOOLS, turns: [{ role: "user", text }] };
    const p1 = buildPrompt(tok, c);
    const s1 = readStep(tok, generate(new TinyModel(w), tok, p1).ids, openedBy(p1));
    expect(s1.call).toEqual({ tool: "weather", args: { place, day: "tomorrow" } });

    const result = runTool(world, "weather", s1.call!.args, lang);
    const c2: Conversation = { tools: c.tools, turns: [...c.turns, ...s1.turns, { role: "result", result }] };
    const p2 = buildPrompt(tok, c2);
    const s2 = readStep(tok, generate(new TinyModel(w), tok, p2).ids, openedBy(p2));
    expect(s2.answer).toContain(String((result as { high: number }).high));
  });
});
