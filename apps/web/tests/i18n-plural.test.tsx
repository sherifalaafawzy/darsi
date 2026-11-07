// Counted words agree with their number in every language (t()'s plural forms: "<key>.one", "<key>.few"…, beside the key
// itself, which is the "other" form), and the app's Arabic UI strings are Modern Standard Arabic, not Egyptian colloquial
// (docs/curriculum/ar-lingo.md: MSA for the steps and buttons; Egyptian is for the videos and the capstones' course text).
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { addMessages, I18nProvider, pluralOf, setLanguages, useI18n } from "../src/i18n";

const t = (lang: string) => renderHook(() => useI18n(), { wrapper: ({ children }: { children: ReactNode }) => <I18nProvider lang={lang}>{children}</I18nProvider> }).result.current.t;

describe("plural forms", () => {
  it("knows each language's categories (Arabic has six)", () => {
    expect([0, 1, 2, 3, 10, 11, 99, 100, 102].map((n) => pluralOf("ar", n))).toEqual(["zero", "one", "two", "few", "few", "many", "many", "other", "other"]);
    expect([0, 1, 2].map((n) => pluralOf("en", n))).toEqual(["other", "one", "other"]);
    expect(pluralOf("not a language tag", 1)).toBe("one"); // counted as English
  });

  it("picks the count's form, and the key itself for the rest", () => {
    const en = t("en"), ar = t("ar");
    expect([1, 2].map((n) => en("kit.pages", { n }))).toEqual(["1 page", "2 pages"]);
    expect([1, 2, 3, 11, 100].map((n) => ar("kit.pages", { n }))).toEqual(["صفحة واحدة", "صفحتان", "٣ صفحات", "١١ صفحة", "١٠٠ صفحة"]);
    expect([1, 5].map((n) => en("imp.create", { n }))).toEqual(["Create 1 account", "Create 5 accounts"]);
    expect([1, 5, 12].map((n) => ar("imp.create", { n }))).toEqual(["إنشاء حساب واحد", "إنشاء الحسابات (٥)", "إنشاء الحسابات (١٢)"]);
    // A count given as text (already formatted) keeps the plain key.
    expect(en("kit.pages", { n: "1" })).toBe("1 pages");
  });

  it("phrases the words counter and the weekly goal so any number reads right", () => {
    expect(t("en")("common.words", { n: 1 })).toBe("Words: 1");
    expect(t("ar")("common.words", { n: 5 })).toBe("عدد الكلمات: ٥");
    expect(t("ar")("home.thisWeek", { done: 0, goal: 2 })).toBe("دروس هذا الأسبوع: ٠ من ٢");
  });

  it("uses an added language's own rules, and English (with English rules) for what it lacks", () => {
    act(() => {
      setLanguages([{ code: "fr", native: "Français", english: "French", dir: "ltr", numerals: "fr", version: 1 }]);
      addMessages({ fr: { "kit.pages": "{n} pages", "kit.pages.one": "{n} page", "imp.rows": "Personnes trouvées : {n}" } });
    });
    const fr = t("fr");
    expect([0, 1, 2].map((n) => fr("kit.pages", { n }))).toEqual(["0 page", "1 page", "2 pages"]); // French counts 0 as one
    expect(fr("imp.create", { n: 1 })).toBe("Create 1 account");
    // A language with only the plain string keeps it: English's own "one" form never leaks into it.
    expect(fr("imp.rows", { n: 1 })).toBe("Personnes trouvées : 1");
  });
});

describe("a right-to-left language's missing strings", () => {
  it("show in English isolated left to right (punctuation stays at the end); its own strings and LTR languages are untouched", () => {
    act(() => {
      setLanguages([
        { code: "fa", native: "فارسی", english: "Persian", dir: "rtl", numerals: "fa", version: 1 },
        { code: "fr", native: "Français", english: "French", dir: "ltr", numerals: "fr", version: 1 },
      ]);
      addMessages({ fa: { "common.continue": "ادامه" } });
    });
    const fa = t("fa");
    expect(fa("common.continue")).toBe("ادامه");
    expect(fa("onb.teach")).toBe("⁦Where do you teach?⁩");
    expect(fa("common.minutes", { n: 5 })).toBe("⁦۵ min⁩"); // the number still in the language's own digits
    expect(t("fr")("onb.teach")).toBe("Where do you teach?");
    expect(t("ar")("onb.teach")).not.toMatch(/[⁦⁩]/); // Arabic has its own
  });

  it("lay a lab out in English, left to right, in a language the labs don't speak", async () => {
    const { render } = await import("@testing-library/react");
    const { LabShell } = await import("../src/labs/kit/LabShell");
    const { meta } = await import("../src/labs/apps/password/meta");
    const shell = (lang: string) => render(<I18nProvider lang={lang}><LabShell meta={meta}>x</LabShell></I18nProvider>).container.querySelector("section")!;
    expect([shell("fa").getAttribute("dir"), shell("fa").getAttribute("lang")]).toEqual(["ltr", "en"]);
    expect(shell("ar").hasAttribute("dir")).toBe(false); // Arabic and English follow the page
    expect(shell("en").hasAttribute("lang")).toBe(false);
  });
});

describe("the Arabic UI strings", () => {
  // Words only Egyptian colloquial uses, whole words only («مش» is not «مشروع»).
  const COLLOQUIAL = ["مفيش", "عشان", "علشان", "دلوقتي", "إزاي", "ازاي", "لسه", "بتاع", "بتاعه", "بتاعك", "الموبايل", "موبايل", "الإيميل", "إيميل", "أدمن", "كورس", "الكورس", "الكورسات", "كورسات", "نتايج", "محدش", "أيوه", "برضه", "كده", "إيه", "اللي", "مش", "هيقدر", "دوّر", "ابعت", "اتبعت", "شيل", "عايز", "عاوز"];
  const word = new RegExp(String.raw`(?<![\p{L}\p{M}])(?:${COLLOQUIAL.join("|")})(?![\p{L}\p{M}])`, "u");
  const DICTS = ["i18n/ar.json", "admin/strings/ar.json", "cms/strings/ar.json", "tutor/strings/ar.json", "bugs/strings/ar.json", "tour/strings/ar.json", "upgrade/strings/ar.json"];

  it("are Modern Standard Arabic", () => {
    const found: string[] = [];
    for (const f of DICTS) {
      const dict = JSON.parse(readFileSync(join(__dirname, "../src", f), "utf8")) as Record<string, string>;
      for (const [k, v] of Object.entries(dict)) if (word.test(v)) found.push(`${f} ${k}: ${v}`);
    }
    expect(found).toEqual([]);
  });

  it("never put «·» between words (it reads as an Arabic zero)", () => {
    const found = DICTS.flatMap((f) => Object.entries(JSON.parse(readFileSync(join(__dirname, "../src", f), "utf8")) as Record<string, string>)
      .filter(([, v]) => v.includes("·")).map(([k]) => `${f} ${k}`));
    expect(found).toEqual([]);
  });
});
