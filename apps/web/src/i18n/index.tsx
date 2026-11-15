import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { dirFor } from "@darsi/design-system";
import en from "./en.json";
import ar from "./ar.json";
import { pick, type LanguageDef, type LocalText } from "../content/types";
import { BUILTIN_LANGUAGES, mergeLanguages } from "../content/languages";

/**
 * English and Arabic ship with the app. Languages platform admins add (/super/languages) arrive with the settings
 * (setLanguages) and their strings when someone picks one (addMessages); content/settings.tsx does both. A string a
 * language doesn't have shows in English.
 */
let languages: LanguageDef[] = BUILTIN_LANGUAGES;
const MESSAGES: Record<string, Record<string, string>> = { en, ar };
let version = 0;
const listeners = new Set<() => void>();
const changed = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;

/** The built-in languages plus the published ones (from content/settings.json). */
export function setLanguages(published: readonly LanguageDef[] | null | undefined) {
  const next = mergeLanguages(published);
  if (JSON.stringify(next) !== JSON.stringify(languages)) { languages = next; changed(); }
}
/** Every language people can pick, built-in first. */
export const useLanguages = () => { useSyncExternalStore(subscribe, getVersion); return languages; };
/** A language's settings. One not published (yet, or any more) takes its direction from its code. */
export const languageOf = (code: string): LanguageDef =>
  languages.find((l) => l.code === code) ?? { code, native: code, english: code, dir: dirFor(code), numerals: code };
export const hasMessages = (code: string) => code in MESSAGES;

/**
 * Adds UI strings: a published language's pack when someone picks it, and strings only a lazy chunk needs (the course
 * editor's cms.*) when that chunk loads, so learners never download them. Their keys are still type-checked: MessageKey
 * includes the editor's through a type-only import.
 */
export function addMessages(more: Record<string, Record<string, string>>) {
  for (const [lang, dict] of Object.entries(more)) MESSAGES[lang] = { ...MESSAGES[lang], ...dict };
  changed();
}

/**
 * Phrases (i18n/phrases.ts): content written in English and Arabic, translated for an added language, keyed by the
 * English text. Loaded per area (Labs, the placement check, the home page) when a screen needs it.
 */
const PHRASES: Record<string, Record<string, string>> = {};
const phraseAreas = new Set<string>();
export const hasPhrases = (lang: string, area: string) => phraseAreas.has(`${lang}/${area}`);
export function addPhrases(lang: string, area: string, dict: Record<string, string>) {
  PHRASES[lang] = { ...PHRASES[lang], ...dict };
  phraseAreas.add(`${lang}/${area}`);
  changed();
}
/** The translation of an English text into a language, if one was loaded. */
export const phrase = (lang: string, english: string): string | undefined => PHRASES[lang]?.[english];
/** Bumps whenever strings or phrases arrive (for caches of translated tables). */
export const stringsVersion = () => version;

/**
 * Staff screens' strings (admin, the course editor) in an added language: fetched when a staff chunk registers its area
 * and whenever the page language changes, from public/content/i18n-staff/<lang>/<area>.json (keyed like en.json).
 * English and Arabic ship inside those chunks; learners never load either.
 */
const staffAreas = new Set<string>();
const staffTried = new Set<string>();
let staffLang = "en";
function loadStaff(lang: string, area: string) {
  const key = `${lang}/${area}`;
  if (lang === "en" || lang === "ar" || staffTried.has(key) || !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(lang)) return;
  staffTried.add(key);
  fetch(`/content/i18n-staff/${key}.json`)
    .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() as Promise<Record<string, string>> : null))
    .then((d) => { if (d) addMessages({ [lang]: d }); })
    .catch(() => { staffTried.delete(key); });
}
/** Called by a staff chunk when it loads ("admin", "cms"). */
export function addStaffArea(area: string) { staffAreas.add(area); loadStaff(staffLang, area); }

/** Unicode isolate, the plain-text <bdi>: for names passed into t() so a Latin name can't reorder an Arabic sentence (or the reverse). */
export const isolate = (s: string) => `⁨${s}⁩`;
export type MessageKey = keyof typeof en | keyof typeof import("../cms/strings/en.json") | keyof typeof import("../admin/strings/en.json") | keyof typeof import("../upgrade/strings/en.json") | keyof typeof import("../tutor/strings/en.json") | keyof typeof import("../bugs/strings/en.json") | keyof typeof import("../tour/strings/en.json")
  // The app shell's (app/strings.ts) and the legal pages' and "Leave <organization>"'s (legal/strings.ts): registered at
  // startup by their modules, which a screen using them imports (their `k()` keeps that import in place).
  | keyof typeof import("../app/strings/en.json") | keyof typeof import("../legal/strings/en.json");

/** A number format for a locale, falling back to English for a tag the browser doesn't know. */
const numberFormat = (locale: string, opts?: Intl.NumberFormatOptions) => { try { return new Intl.NumberFormat(locale, opts); } catch { return new Intl.NumberFormat("en", opts); } };

/** A count's CLDR plural category in a language (cached). An unknown tag counts as English; a browser without
 *  Intl.PluralRules (Chrome before 63) gets "other", the plain key. */
const pluralRules = new Map<string, Intl.PluralRules | null>();
export function pluralOf(lang: string, n: number): string {
  if (!pluralRules.has(lang)) {
    let rules: Intl.PluralRules | null = null;
    try { rules = new Intl.PluralRules(lang); } catch { try { rules = new Intl.PluralRules("en"); } catch { rules = null; } }
    pluralRules.set(lang, rules);
  }
  return pluralRules.get(lang)?.select(n) ?? "other";
}
/**
 * A string from one dictionary. With a count (a number {n}), the count's plural form "<key>.<category>" (zero, one, two,
 * few or many) wins when the dictionary has it; the key itself is the "other" form. So Arabic says «صفحتان», «٣ صفحات»
 * and «١١ صفحة», and English "1 page", while a language without the forms keeps its one string.
 */
const lookup = (dict: Record<string, string> | undefined, lang: string, key: string, n: unknown) =>
  dict && ((typeof n === "number" && dict[`${key}.${pluralOf(lang, n)}`]) || dict[key]);

/**
 * Darsi's name in the UI strings, for an organization site without Darsi's identity (state/site.ts): it becomes the
 * organization's name, isolated so a Latin name can't reorder an Arabic sentence. "Darsi Tiny" («درسي الصغير») stays: it
 * is a model's name, which the labs and courses use too. So do the few strings where Darsi is named as the other party
 * (the branding panel's hints; the web address panel's "site." strings, which are about Darsi's identity; and the school
 * sign-in wizard's "sa." strings on the same admin tab, admin/sso-strings: Darsi's team, Darsi's servers, what Darsi
 * needs from the provider's console) or as a framework (KEEP_DARSI).
 */
const DARSI_NAME = /Darsi(?! Tiny)|درسي(?! الصغير)/g;
const KEEP_DARSI = new Set(["brand.hint", "brand.hintOther", "p.fw.darsi"]);
export const rebrand = (s: string, name: string) => s.replace(DARSI_NAME, () => isolate(name));

interface I18n {
  lang: string;
  /** UI string with {var} interpolation; numbers are localised (Arabic-Indic digits for ar). A number {n} picks the
   *  string's plural form ("<key>.one", "<key>.few"…) where the language has one. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Content string for the current language, falling back to English. */
  L: (text: LocalText | undefined) => string;
  num: (n: number, opts?: Intl.NumberFormatOptions) => string;
  dir: "ltr" | "rtl";
  /** The locale for Intl dates and numbers ("ar-EG" for Arabic). */
  locale: string;
}
const Ctx = createContext<I18n | null>(null);

/** `brand`: an organization's name to show in place of Darsi's (a site without Darsi's identity); none on Darsi's own. */
export function I18nProvider({ lang, brand, children }: { lang: string; brand?: string | null; children: ReactNode }) {
  const v = useSyncExternalStore(subscribe, getVersion);
  const meta = useMemo(() => languageOf(lang), [lang, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const num = useCallback((n: number, opts?: Intl.NumberFormatOptions) => numberFormat(meta.numerals, opts).format(n), [meta.numerals]);
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => {
    const own = lookup(MESSAGES[meta.code], meta.code, key, vars?.n);
    const raw = own ?? lookup(MESSAGES.en, "en", key, vars?.n) ?? key;
    // Before the variables go in, so a name a person typed is never changed.
    const s = brand && !KEEP_DARSI.has(key) && !key.startsWith("site.") && !key.startsWith("sa.") ? rebrand(raw, brand) : raw;
    const out = vars ? s.replace(/\{(\w+)\}/g, (_, k) => { const x = vars[k]; return typeof x === "number" ? num(x) : String(x ?? ""); }) : s;
    // A string a right-to-left language doesn't have yet shows in English, isolated left to right (LRI…PDI), so its
    // punctuation stays at its end: "Where do you teach?", not "?Where do you teach".
    return own === undefined && meta.dir === "rtl" ? `⁦${out}⁩` : out;
  }, [meta.code, meta.dir, num, v, brand]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = useCallback((text: LocalText | undefined) => {
    if (text && text[meta.code] === undefined && meta.code !== "en") { const p = PHRASES[meta.code]?.[text.en]; if (p) return p; }
    return pick(text, meta.code);
  }, [meta.code, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ lang: meta.code, t, L, num, dir: meta.dir, locale: meta.numerals }), [meta.code, meta.dir, meta.numerals, t, L, num]);
  useEffect(() => { staffLang = meta.code; staffAreas.forEach((a) => loadStaff(meta.code, a)); }, [meta.code]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
