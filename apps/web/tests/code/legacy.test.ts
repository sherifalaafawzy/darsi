import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { needsLegacySyntax, runtimeScript } from "../../src/content/runtimes";

describe("code runtimes on old Chrome", () => {
  it("keeps the modern script where ?. and ?? already parse", () => {
    expect(needsLegacySyntax()).toBe(false);
    expect(runtimeScript("/lib/python/v1/micropython.js")).toBe("/lib/python/v1/micropython.js");
    expect(runtimeScript("/lib/sql/v1/sql-wasm.js")).toBe("/lib/sql/v1/sql-wasm.js");
  });

  it("would ask for the transpiled copy", () => {
    const swap = (url: string) => url.replace(/\.js(?=$|\?)/, ".legacy.js");
    expect(swap("/lib/python/v1/micropython.js")).toBe("/lib/python/v1/micropython.legacy.js");
    expect(swap("/lib/sql/v1/sql-wasm.js")).toBe("/lib/sql/v1/sql-wasm.legacy.js");
  });

  it("keeps the sandbox worker free of syntax Chrome 61 cannot parse", () => {
    const src = readFileSync(join(__dirname, "../../src/code/sandbox.ts"), "utf8");
    const worker = src.slice(src.indexOf("const WORKER = `"), src.indexOf("const CSP"));
    const frame = src.slice(src.indexOf("const FRAME = `"), src.indexOf("type Msg"));
    for (const block of [worker, frame]) {
      expect(block).not.toMatch(/\?\./);
      expect(block).not.toMatch(/\?\?/);
    }
    expect(worker).not.toContain("globalThis.__mpHeapMax");
  });
});
