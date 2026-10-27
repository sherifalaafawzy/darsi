import { describe, expect, it } from "vitest";
import { languageEntry, packPath, withLanguage } from "../src/languages";
import { mergeLanguages, validateLanguage } from "../src/shared/languages";
import type { LanguageDef } from "../src/shared/types";

const fr: LanguageDef = { code: "fr", native: "Français", english: "French", dir: "ltr", numerals: "fr", version: 1 };

describe("published languages", () => {
  it("adds, replaces and removes a language in the settings list by code", () => {
    const fa = { ...fr, code: "fa", native: "فارسی", english: "Persian", dir: "rtl" as const };
    const two = withLanguage(withLanguage([], "fr", fr), "fa", fa);
    expect(two.map((l) => l.code)).toEqual(["fr", "fa"]);
    expect(withLanguage(two, "fr", { ...fr, version: 2 }).find((l) => l.code === "fr")?.version).toBe(2);
    expect(withLanguage(two, "fr", null).map((l) => l.code)).toEqual(["fa"]);
  });

  it("keeps only what pickers need in the settings entry, and versions the pack's path", () => {
    const entry = languageEntry({ ...fr, native: " Français ", messages: { a: "b" } } as Partial<LanguageDef>, 3);
    expect(entry).toEqual({ ...fr, version: 3 });
    expect(packPath("pt-br", 2)).toBe("content/i18n/pt-br/v2.json");
  });

  it("refuses what publishLanguage must never publish", () => {
    expect(validateLanguage(fr, { "common.back": "Retour" })).toEqual([]);
    expect(validateLanguage({ ...fr, code: "en" }, { a: "b" })).toEqual(["builtIn"]);
    expect(validateLanguage({ ...fr, code: "../x" }, { a: "b" })).toContain("code");
    expect(validateLanguage(fr, ["not", "a", "map"])).toContain("messages");
    expect(validateLanguage(fr, { a: 3 })).toContain("messages");
  });

  it("never lets a published entry replace English or Arabic", () => {
    expect(mergeLanguages([{ ...fr, code: "ar", english: "Fake" }])[1].english).toBe("Arabic");
  });
});
