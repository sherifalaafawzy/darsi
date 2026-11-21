// @vitest-environment node
// The dev server's list of unpublished courses (content/dev-catalog.json at the repository root, served by devUnits in
// vite.config.ts) is not the app's. Older scripts wrote a copy into public/content/, from where it was shipped and,
// being JSON, precached on every phone. The precache leaves it out by name, wherever a copy comes from.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(join(__dirname, "../vite.config.ts"), "utf8");
/** The strings of a `key: [ … ]` list on one line of the config. */
const list = (key: string) => {
  const line = new RegExp(`^\\s*${key}: \\[(.*)\\],\\s*$`, "m").exec(config);
  expect(line, `${key} in vite.config.ts`).toBeTruthy();
  return [...line![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

describe("the precache and the dev catalog", () => {
  it("would take it as any JSON file: only the ignore list keeps it out", () => {
    const [pattern] = list("globPatterns");
    expect(pattern).toMatch(/^\*\*\/\*\.\{[^}]*\bjson\b[^}]*\}$/);
  });

  it("leaves it out by the path it would have in the build", () => {
    const ignores = list("globIgnores");
    expect(ignores).toContain("content/dev-catalog.json");
    // The lists it joins are still there: the on-demand chunks come after the literals.
    expect(ignores).toEqual(expect.arrayContaining(["kits/**", "lib/**", "push-sw.js", "offline-sw.js"]));
    expect(config).toMatch(/globIgnores: \[[^\n]*\.\.\.ON_DEMAND\.map\(\(p\) => p\.glob\)\],/);
  });

  it("is still what the app asks the dev server for", () => {
    expect(readFileSync(join(__dirname, "../src/content/load.ts"), "utf8")).toContain('fetch("/content/dev-catalog.json")');
  });
});
