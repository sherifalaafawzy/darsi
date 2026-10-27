import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
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

/** Unicode isolate, the plain-text <bdi>: for names passed into t() so a Latin name can't reorder an Arabic sentence (or the reverse). */
export const isolate = (s: string) => `⁨${s}⁩`;
export type MessageKey = keyof typeof en | keyof typeof import("../cms/strings/en.json");

/** A number format for a locale, falling back to English for a tag the browser doesn't know. */
const numberFormat = (locale: string, opts?: Intl.NumberFormatOptions) => { try { return new Intl.NumberFormat(locale, opts); } catch { return new Intl.NumberFormat("en", opts); } };

interface I18n {
  lang: string;
  /** UI string with {var} interpolation; numbers are localised (Arabic-Indic digits for ar). */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Content string for the current language, falling back to English. */
  L: (text: LocalText | undefined) => string;
  num: (n: number, opts?: Intl.NumberFormatOptions) => string;
  dir: "ltr" | "rtl";
  /** The locale for Intl dates and numbers ("ar-EG" for Arabic). */
  locale: string;
}
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ lang, children }: { lang: string; children: ReactNode }) {
  const v = useSyncExternalStore(subscribe, getVersion);
  const meta = useMemo(() => languageOf(lang), [lang, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const num = useCallback((n: number, opts?: Intl.NumberFormatOptions) => numberFormat(meta.numerals, opts).format(n), [meta.numerals]);
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => {
    const s = MESSAGES[meta.code]?.[key] ?? MESSAGES.en[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => { const x = vars[k]; return typeof x === "number" ? num(x) : String(x ?? ""); }) : s;
  }, [meta.code, num, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = useCallback((text: LocalText | undefined) => pick(text, meta.code), [meta.code]);
  const value = useMemo(() => ({ lang: meta.code, t, L, num, dir: meta.dir, locale: meta.numerals }), [meta.code, meta.dir, meta.numerals, t, L, num]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
