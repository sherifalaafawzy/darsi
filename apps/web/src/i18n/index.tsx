import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import en from "./en.json";
import ar from "./ar.json";
import { pick, type LocalText } from "../content/types";

/** Add a language: drop a JSON file here, register it below, and add translations to content. */
export const LANGUAGES = [
  { code: "en", native: "English", english: "English", dir: "ltr" as const, numerals: "en" },
  { code: "ar", native: "العربية", english: "Arabic", dir: "rtl" as const, numerals: "ar-EG" },
];
const MESSAGES: Record<string, Record<string, string>> = { en, ar };

/**
 * Strings only a lazy chunk needs (the course editor's cms.*) are added when that chunk loads, so learners never
 * download them. Their keys are still type-checked: MessageKey includes them through a type-only import.
 */
export function addMessages(more: Record<string, Record<string, string>>) {
  for (const [lang, dict] of Object.entries(more)) MESSAGES[lang] = { ...MESSAGES[lang], ...dict };
}

/** Unicode isolate, the plain-text <bdi>: for names passed into t() so a Latin name can't reorder an Arabic sentence (or the reverse). */
export const isolate = (s: string) => `⁨${s}⁩`;
export type MessageKey = keyof typeof en | keyof typeof import("../cms/strings/en.json");

interface I18n {
  lang: string;
  /** UI string with {var} interpolation; numbers are localised (Arabic-Indic digits for ar). */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Content string for the current language, falling back to English. */
  L: (text: LocalText | undefined) => string;
  num: (n: number, opts?: Intl.NumberFormatOptions) => string;
  dir: "ltr" | "rtl";
}
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ lang, children }: { lang: string; children: ReactNode }) {
  const meta = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  const num = useCallback((n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(meta.numerals, opts).format(n), [meta.numerals]);
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => {
    const s = MESSAGES[meta.code]?.[key] ?? MESSAGES.en[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => { const v = vars[k]; return typeof v === "number" ? num(v) : String(v ?? ""); }) : s;
  }, [meta.code, num]);
  const L = useCallback((text: LocalText | undefined) => pick(text, meta.code), [meta.code]);
  const value = useMemo(() => ({ lang: meta.code, t, L, num, dir: meta.dir }), [meta.code, meta.dir, t, L, num]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
