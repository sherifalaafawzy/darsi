// scripts/copy-shared.d.mts types the build script (plain JavaScript) for the tests that import it. Nothing compiles
// the two together, so this keeps the declarations in step with what the script really exports.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as script from "../scripts/copy-shared.mjs";

const declared = [...readFileSync(join(__dirname, "../scripts/copy-shared.d.mts"), "utf8").matchAll(/^export declare (?:const|function) (\w+)/gm)].map((m) => m[1]).sort();

describe("copy-shared.d.mts", () => {
  it("declares every export of the script, and nothing else", () => {
    expect(declared).toEqual(Object.keys(script).sort());
  });

  it("gives each the kind the script has", () => {
    expect(Array.isArray(script.FILES) && script.FILES.every((f) => typeof f === "string")).toBe(true);
    expect(typeof script.HEADER).toBe("string");
    expect(script.transform('import { a } from "./types";')).toBe(`${script.HEADER}import { a } from "./types.js";`);
    expect(script.labIds().every((id) => typeof id === "string")).toBe(true);
    expect(script.labsFile(["neuron"])).toContain('["neuron"]');
  });
});
