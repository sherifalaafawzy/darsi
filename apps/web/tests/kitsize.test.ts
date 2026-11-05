// Download sizes: kits carry their files' sizes (the seed's kit helper and the editor record them), the validator checks
// them, and Downloads shows the learner's own language's size from the catalog.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { errorsOf, validateUnit } from "../src/content/validate";
import { downloadMB } from "../src/screens/Downloads";
import type { Unit } from "../src/content/types";
import { withKitUrls } from "../../../scripts/lib/kits.mjs";

const unit = JSON.parse(readFileSync(join(__dirname, "../../../content/retired/ai-1.json"), "utf8")) as Unit;
const sizes: Record<string, number> = {};
const sizeOf = (file: string) => (sizes[file] = file.includes("-ar.") ? 300 * 1024 : 100 * 1024);

describe("kit sizes", () => {
  it("the seed records each kit file's size by language and format, and the result still validates", () => {
    const published = withKitUrls(unit, (p: string) => `https://storage.test/${p}`, { sizeOf }) as Unit;
    const slides = published.lessons[0].kit.find((k) => k.kind === "slides")!;
    expect(slides.sizeKB).toEqual({ en: { pdf: 100, pptx: 100 }, ar: { pdf: 300, pptx: 300 } });
    expect(Object.keys(sizes).length).toBeGreaterThan(0);
    expect(errorsOf(validateUnit(published))).toEqual([]);
    // Without sizes (the e2e stand-in for Storage), kits carry none.
    expect((withKitUrls(unit, (p: string) => p) as Unit).lessons[0].kit[0]).not.toHaveProperty("sizeKB");
  });

  it("the validator refuses sizes that aren't numbers", () => {
    const bad = structuredClone(unit);
    bad.lessons[0].kit[0].sizeKB = { en: { pdf: -1 } };
    expect(errorsOf(validateUnit(bad)).map((e) => e.at.field)).toContain("sizeKB");
    bad.lessons[0].kit[0].sizeKB = { en: "big" } as never;
    expect(errorsOf(validateUnit(bad)).map((e) => e.at.field)).toContain("sizeKB");
  });

  it("Downloads shows the learner's language, then English, then the old single size", () => {
    const e = { sizeMB: 4.6, sizeByLang: { en: 3.4, ar: 4.6 } };
    expect(downloadMB(e, "ar")).toBe(4.6);
    expect(downloadMB(e, "en")).toBe(3.4);
    expect(downloadMB(e, "fr")).toBe(3.4); // files in other languages fall back to English
    expect(downloadMB({ sizeMB: 2 }, "ar")).toBe(2); // a catalog published before sizes per language
    expect(downloadMB(undefined, "en")).toBe(0);
  });
});
