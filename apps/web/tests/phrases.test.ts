/**
 * Phrases (src/i18n/phrases.ts): translations of Labs, the placement check and the home page for the added languages,
 * keyed by the English. Each file must keep the English's markers ({0}, {n}, {languages}…) and the script rules, and
 * never translate what a lab computes on (checkData); useS and L must pick them up. `node scripts/phrases.mjs` reports
 * coverage and strings no longer used.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addPhrases, phrase } from "../src/i18n";
import { translated, type Strings } from "../src/labs/kit/strings";
// @ts-expect-error: a plain .mjs script without types
import { checkData } from "../scripts/phrases.mjs";

const DIR = join(__dirname, "../public/content/phrases");
const langs = existsSync(DIR) ? readdirSync(DIR).filter((d) => statSync(join(DIR, d)).isDirectory()) : [];
const RTL = new Set(["ur", "fa", "he", "ps"]);
const marks = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(" ");

describe("phrase files", () => {
  for (const lang of langs) {
    describe(lang, () => {
      const files = readdirSync(join(DIR, lang)).filter((f) => f.endsWith(".json"));
      it("are named after an area and map English to a translation", () => {
        for (const f of files) {
          expect(f).toMatch(/^(labs|landing|placement|lab-[\w-]+)\.json$/);
          const d = JSON.parse(readFileSync(join(DIR, lang, f), "utf8")) as Record<string, unknown>;
          for (const [k, v] of Object.entries(d)) { expect(typeof v, `${f}: ${k}`).toBe("string"); expect((v as string).trim(), `${f}: ${k}`).not.toBe(""); }
        }
      });
      it("keep the English markers", () => {
        const bad: string[] = [];
        for (const f of files) {
          const d = JSON.parse(readFileSync(join(DIR, lang, f), "utf8")) as Record<string, string>;
          for (const [k, v] of Object.entries(d)) if (marks(k) !== marks(v)) bad.push(`${f}: ${k} → ${v}`);
        }
        expect(bad).toEqual([]);
      });
      it("keep what a lab computes on in English (Darsi Tiny's requests, corpora, documents), and quote it as written", () => {
        expect((checkData(lang) as string[][]).map(([area, k, , q]) => `${area}: “${q}” in ${k.slice(0, 60)}`)).toEqual([]);
      }, 30_000);
      if (RTL.has(lang)) it("never use the middle dot, which reads as a zero in Arabic script", () => {
        const bad = files.flatMap((f) => Object.entries(JSON.parse(readFileSync(join(DIR, lang, f), "utf8")) as Record<string, string>).filter(([k, v]) => v.includes("·") && !k.includes("·")).map(([k]) => `${f}: ${k}`));
        expect(bad).toEqual([]);
      });
      if (lang === "ur") it("write Urdu letters, not the Arabic ي and ك", () => {
        const bad = files.flatMap((f) => Object.entries(JSON.parse(readFileSync(join(DIR, lang, f), "utf8")) as Record<string, string>).filter(([, v]) => /[يك]/.test(v)).map(([k]) => `${f}: ${k}`));
        expect(bad).toEqual([]);
      });
    });
  }
});

describe("useS with phrases", () => {
  const S: Strings<{ run: string; rounds: (n: string, of: string) => string; odd: (n: number) => string; list: string[]; nested: { a: string } }> = {
    en: { run: "Run", rounds: (n, of) => `Round ${n} of ${of}`, odd: (n) => (n === 1 ? "one try" : `${n} tries`), list: ["Red", "Blue"], nested: { a: "Hello" } },
    ar: { run: "شغّل" },
  };
  addPhrases("xx", "test", { Run: "Lancer", "Round {0} of {1}": "Tour {0} sur {1}", Red: "Rouge", Hello: "Bonjour" });

  it("translates strings, lists, nested tables and template functions; leaves the rest in English", () => {
    const s = translated(S, "xx");
    expect(s.run).toBe("Lancer");
    expect(s.rounds("2", "5")).toBe("Tour 2 sur 5");
    expect(s.odd(1)).toBe("one try");
    expect(s.list).toEqual(["Rouge", "Blue"]);
    expect(s.nested.a).toBe("Bonjour");
    expect(phrase("xx", "Run")).toBe("Lancer");
  });

  it("keeps English and Arabic as written", () => {
    expect(translated(S, "en")).toBe(S.en);
    expect(translated(S, "ar").run).toBe("شغّل");
    expect(translated(S, "ar").list).toEqual(["Red", "Blue"]);
  });
});
