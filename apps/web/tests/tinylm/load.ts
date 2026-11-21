// Shared by the Darsi Tiny tests: the shipped model files and the fixtures tools/tinylm/export.py writes.
// TINYLM_LIB and TINYLM_FIXTURES point the tests at a candidate model exported elsewhere (export.py --public --fixtures).
import fs from "node:fs";
import path from "node:path";
import { parseModel, type TinyWeights } from "../../src/tinylm/model";
import { Tokenizer, type TokenizerFile } from "../../src/tinylm/tokenizer";
import type { World } from "../../src/tinylm/tools";
import type { Conversation, Turn } from "../../src/tinylm/format";

export const LIB = process.env.TINYLM_LIB ?? path.join(__dirname, "../../public/lib/tinylm/v1");
const FIX = process.env.TINYLM_FIXTURES ?? path.join(__dirname, "fixtures");

export const readBin = (): Buffer => fs.readFileSync(path.join(LIB, "model.bin"));
export const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(FIX, name), "utf8")) as T;

let weights: TinyWeights | undefined;
let tok: Tokenizer | undefined;
let world: World | undefined;

export function loadWeights(): TinyWeights {
  if (!weights) {
    const b = readBin();
    weights = parseModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  }
  return weights;
}

export function loadTokenizer(): Tokenizer {
  tok ??= new Tokenizer(JSON.parse(fs.readFileSync(path.join(LIB, "tokenizer.json"), "utf8")) as TokenizerFile);
  return tok;
}

export function loadWorld(): World {
  world ??= JSON.parse(fs.readFileSync(path.join(LIB, "world.json"), "utf8")) as World;
  return world;
}

/** Another model folder than LIB, read whole (the one a lab runs: tests/labs/aisec.test.ts). */
export function loadFolder(dir: string): { weights: TinyWeights; tok: Tokenizer; world: World } {
  const b = fs.readFileSync(path.join(dir, "model.bin"));
  return {
    weights: parseModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer),
    tok: new Tokenizer(JSON.parse(fs.readFileSync(path.join(dir, "tokenizer.json"), "utf8")) as TokenizerFile),
    world: JSON.parse(fs.readFileSync(path.join(dir, "world.json"), "utf8")) as World,
  };
}

export const f32 = (b64: string): Float32Array => {
  const b = Buffer.from(b64, "base64");
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

export type Seg = [string, string];

/** A generated conversation (segments, as in the .jsonl files) as the app's Conversation. */
export function toConversation(segs: Seg[]): Conversation {
  const turns: Turn[] = [];
  for (const [kind, text] of segs.slice(1)) {
    if (kind === "user" || kind === "plan" || kind === "answer") turns.push({ role: kind, text });
    else if (kind === "call") {
      const i = text.indexOf("{");
      turns.push({ role: "call", call: { tool: text.slice(0, i), args: JSON.parse(text.slice(i)) as Record<string, unknown> } });
    } else if (kind === "result") turns.push({ role: "result", result: JSON.parse(text) as unknown });
  }
  return { tools: segs[0][1].split(" "), turns };
}
