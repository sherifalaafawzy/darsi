/**
 * The language packs kept in the repository (content/i18n/<code>.json, loaded by `npm run languages`): each must be
 * publishable (validateLanguage), keep every {placeholder} of the English, and follow the script's rules. A key added
 * to en.json later shows in English until it is translated, so coverage is checked loosely.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkTranslation, cleanMessages, validateLanguage } from "../src/content/languages";
import { PACK_EN, PACK_SOURCES } from "../src/i18n/translatable";

const DIR = join(__dirname, "../../../content/i18n");
const packs = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => ({ file: f, ...JSON.parse(readFileSync(join(DIR, f), "utf8")) }));
const messages = PACK_EN;

describe("language packs in content/i18n", () => {
  it("translates the same strings in the script as on the Languages page", () => {
    const script = readFileSync(join(__dirname, "../../../scripts/seed-languages.mjs"), "utf8");
    expect(JSON.parse(/const SOURCES = (\[[^\]]*\])/.exec(script)![1])).toEqual(PACK_SOURCES);
  });

  it("has the five added languages", () => {
    expect(packs.map((p) => p.code).sort()).toEqual(expect.arrayContaining(["de", "es", "fr", "pt", "ur"]));
  });

  for (const p of packs) {
    describe(p.code, () => {
      it("is named after its code and publishable", () => {
        expect(p.file).toBe(`${p.code}.json`);
        expect(validateLanguage(p, cleanMessages(p.messages, messages))).toEqual([]);
      });

      it("keeps the English placeholders and covers the app's strings", () => {
        const c = checkTranslation(p.messages, messages);
        expect(c.placeholders).toEqual([]);
        expect(c.unknown).toEqual([]);
        expect(c.done / c.total).toBeGreaterThan(0.95);
      });

      if (p.dir === "rtl") {
        it("never uses the middle dot, which reads as a zero in Arabic script", () => {
          expect(Object.entries(p.messages).filter(([, v]) => String(v).includes("·")).map(([k]) => k)).toEqual([]);
        });
      }

      if (p.code === "ur") {
        it("writes Urdu letters, not the Arabic ي and ك", () => {
          expect(Object.entries(p.messages).filter(([, v]) => /[يك]/.test(String(v))).map(([k]) => k)).toEqual([]);
        });
      }
    });
  }
});
