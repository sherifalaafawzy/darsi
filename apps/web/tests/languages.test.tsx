import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { LanguageDef, Settings, VideoStep } from "../src/content/types";

// The settings file and language packs are the only things read from the network here.
const m = vi.hoisted(() => ({ settings: null as Settings | null, packs: {} as Record<string, Record<string, string>>, fetched: [] as string[] }));
vi.mock("../src/content/load", async (orig) => ({
  ...(await orig<typeof import("../src/content/load")>()),
  loadSettings: async () => m.settings, forgetSettings: () => {},
  loadLanguagePack: async (code: string, version: number) => { m.fetched.push(`${code}@${version}`); const p = m.packs[`${code}@${version}`]; if (!p) throw new Error("404"); return p; },
}));

const { I18nProvider, languageOf, setLanguages, useI18n, useLanguages } = await import("../src/i18n");
const { SettingsProvider, useLanguageReady } = await import("../src/content/settings");
const { checkTranslation, cleanMessages, mergeLanguages, placeholdersOf, validateLanguage } = await import("../src/content/languages");
const { captionsFor, kitUrl, videoSrc } = await import("../src/content/types");
const { rowsToMessages, sheetCsv, sheetRows } = await import("../src/cms/sheets");
const { familiesFor } = await import("../src/platform/fonts");

const fr: LanguageDef = { code: "fr", native: "Français", english: "French", dir: "ltr", numerals: "fr", version: 2 };
const fa: LanguageDef = { code: "fa", native: "فارسی", english: "Persian", dir: "rtl", numerals: "fa", version: 1 };
const wrap = (lang: string) => ({ children }: { children: ReactNode }) => <I18nProvider lang={lang}><SettingsProvider lang={lang}>{children}</SettingsProvider></I18nProvider>;

beforeEach(() => { m.settings = null; m.packs = {}; m.fetched = []; localStorage.clear(); });
afterEach(() => act(() => setLanguages([])));

describe("language rules", () => {
  it("lists English and Arabic first, then published languages by English name, never replacing a built-in", () => {
    const ar2 = { ...fa, code: "ar", english: "Not Arabic" };
    expect(mergeLanguages([fr, fa, ar2, { ...fr, code: "Bad Code" }]).map((l) => l.code)).toEqual(["en", "ar", "fr", "fa"]);
    expect(mergeLanguages([fr, fa])[1].english).toBe("Arabic");
  });

  it("checks a translation against the English: missing, placeholders that differ, unknown keys", () => {
    const en = { a: "Hello {name}", b: "{n} lessons", c: "Done" };
    const c = checkTranslation({ a: "Bonjour {name}", b: "leçons", old: "x", c: "  " }, en);
    expect(c).toMatchObject({ missing: ["c"], placeholders: ["b"], unknown: ["old"], done: 2, total: 3 });
    expect(placeholdersOf("{b} and {a}")).toEqual(["a", "b"]);
    expect(cleanMessages({ a: " Bonjour {name} ", old: "x", c: "" }, en)).toEqual({ a: "Bonjour {name}" });
  });

  it("refuses bad codes, built-in languages, missing names, an unknown direction and oversized packs", () => {
    expect(validateLanguage(fr, { a: "b" })).toEqual([]);
    expect(validateLanguage({ ...fr, code: "French" }, { a: "b" })).toContain("code");
    expect(validateLanguage({ ...fr, code: "ar" }, { a: "b" })).toContain("builtIn");
    expect(validateLanguage({ ...fr, native: " ", dir: "up" }, { a: "b" })).toEqual(expect.arrayContaining(["native", "dir"]));
    expect(validateLanguage(fr, {})).toContain("empty");
    expect(validateLanguage(fr, { a: "x".repeat(2001) })).toContain("tooLong");
    expect(validateLanguage(fr, { "bad key!": "x" })).toContain("messages");
  });
});

describe("languages at run time", () => {
  it("shows a published language's strings, with English for what it lacks, once its pack arrives", async () => {
    m.settings = { version: 1, tracks: [], languages: [fr] };
    m.packs["fr@2"] = { "common.continue": "Continuer" };
    const { result } = renderHook(() => ({ i18n: useI18n(), ready: useLanguageReady() }), { wrapper: wrap("fr") });
    expect(result.current.ready).toBe(false); // App shows its loading screen, not English
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.i18n.t("common.continue")).toBe("Continuer");
    expect(result.current.i18n.t("common.back")).toBe("Back");
    expect(result.current.i18n).toMatchObject({ lang: "fr", dir: "ltr", locale: "fr" });
    expect(localStorage.getItem("darsi:langPacks")).toBe(JSON.stringify({ fr: 2 }));
  });

  it("starts from the pack it remembers, before the settings come in", async () => {
    localStorage.setItem("darsi:langPacks", JSON.stringify({ fr: 1 }));
    m.packs["fr@1"] = { "common.back": "Retour" };
    const { result } = renderHook(() => useI18n(), { wrapper: wrap("fr") });
    await waitFor(() => expect(result.current.t("common.back")).toBe("Retour"));
    expect(m.fetched).toContain("fr@1");
  });

  it("shows English for a language nobody published (any more)", async () => {
    m.settings = { version: 1, tracks: [], languages: [] };
    const { result } = renderHook(() => ({ i18n: useI18n(), ready: useLanguageReady() }), { wrapper: wrap("xx") });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.i18n.t("common.back")).toBe("Back");
  });

  it("takes a language's direction from its code until its settings arrive, and lists published languages for the pickers", async () => {
    expect(languageOf("fa").dir).toBe("rtl");
    m.settings = { version: 1, tracks: [], languages: [fa] };
    m.packs["fa@1"] = { "common.back": "بازگشت" };
    const { result } = renderHook(() => ({ langs: useLanguages(), i18n: useI18n() }), { wrapper: wrap("fa") });
    await waitFor(() => expect(result.current.langs.map((l) => l.code)).toEqual(["en", "ar", "fa"]));
    await waitFor(() => expect(result.current.i18n.t("common.back")).toBe("بازگشت"));
    expect(result.current.i18n.dir).toBe("rtl");
  });

  it("keeps built-in languages free of any download", () => {
    render(<p>x</p>, { wrapper: wrap("ar") });
    expect(screen.getByText("x")).toBeTruthy();
    expect(m.fetched).toEqual([]);
  });
});

describe("files for languages without their own", () => {
  const step = (extra: Partial<VideoStep>): VideoStep => ({ type: "video", id: "v", prompt: { en: "W" }, title: { en: "V" }, src: "/media/x/video-{lang}.mp4", duration: 60, sizeMB: 1, transcript: { en: "t" }, ...extra });
  it("uses the English built-in kit and video for an added language (Hosting would answer a missing file with the app page)", () => {
    expect(kitUrl({ kind: "slides", title: { en: "S" }, pages: 1, formats: ["pdf"], base: "ai-1-1-slides" }, "fr", "pdf")).toBe("/kits/ai-1-1-slides-en.pdf");
    expect(kitUrl({ kind: "slides", title: { en: "S" }, pages: 1, formats: ["pdf"], base: "ai-1-1-slides" }, "ar", "pdf")).toBe("/kits/ai-1-1-slides-ar.pdf");
    expect(videoSrc(step({}), "fr")).toBe("/media/x/video-en.mp4");
  });
  it("plays uploaded files in the language when there are some, else English, with matching captions", () => {
    const s = step({ src: null, sources: { en: "https://x/en.mp4", fr: "https://x/fr.mp4" }, captions: { en: "https://x/en.vtt" } });
    expect(videoSrc(s, "fr")).toBe("https://x/fr.mp4");
    expect(captionsFor(s, "fr")).toEqual({ lang: "en", src: "https://x/en.vtt" });
    expect(captionsFor(step({}), "fr")).toBeNull();
  });
  it("caches the Arabic fonts only for Arabic-script languages", () => {
    expect(familiesFor("fa")).toContain("Noto Sans Arabic");
    expect(familiesFor("fr")).not.toContain("Noto Sans Arabic");
    expect(familiesFor("fr")).toContain("Baloo 2 Ext");
  });
});

describe("translation spreadsheets", () => {
  it("writes one row per English key and reads back the language's column", () => {
    const rows = sheetRows("fr", { a: "One", b: "Two {n}" }, { a: "واحد" }, { b: "Deux {n}" });
    expect(rows).toEqual([["key", "English", "Arabic", "fr"], ["a", "One", "واحد", ""], ["b", "Two {n}", "", "Deux {n}"]]);
    expect(rowsToMessages(rows, ["fr", "Français"])).toEqual({ messages: { b: "Deux {n}" }, rows: 2 });
    // A translator's own sheet: columns in another order, headed with the language's name.
    expect(rowsToMessages([["Français", "KEY"], ["Un", "a"], ["", "b"]], ["fr", "français"]).messages).toEqual({ a: "Un" });
  });
  it("writes CSV that Excel opens in UTF-8, with quotes where needed", async () => {
    const bytes = new Uint8Array(await sheetCsv([["key", "fr"], ["a", 'Dit "oui", puis\nnon']]).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // the byte-order mark (Blob.text() would hide it)
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('key,fr\r\na,"Dit ""oui"", puis\nnon"');
  });
});
