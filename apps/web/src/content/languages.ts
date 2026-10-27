/**
 * Languages beyond English and Arabic, and the rules for their UI strings. Shared with the Cloud Functions
 * (functions/scripts/copy-shared.mjs copies it into functions/src/shared/), so the Languages page and publishLanguage
 * agree on what may be published.
 *
 * English and Arabic are built in: their strings ship with the app (src/i18n). A language platform admins add is a pack
 * of the same keys, published to content/i18n/{code}/v{n}.json; a key it lacks shows in English.
 */
import type { LanguageDef } from "./types";

export const BUILTIN_LANGUAGES: LanguageDef[] = [
  { code: "en", native: "English", english: "English", dir: "ltr", numerals: "en" },
  { code: "ar", native: "العربية", english: "Arabic", dir: "rtl", numerals: "ar-EG" },
];
export const BUILTIN_CODES = BUILTIN_LANGUAGES.map((l) => l.code);
/** A language code as Darsi stores it, lowercase: "fr", "fil", "pt-br", "zh-hans". */
export const LANG_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
/** Caps for one pack: the app has ~460 strings, the longest English one is a few hundred characters. */
export const MAX_MESSAGE = 2000;
export const MAX_KEYS = 3000;
const KEY = /^[a-z][\w.-]{0,79}$/i;

/** Every language in pickers: the built-in ones, then published ones by English name. A pack never replaces a built-in. */
export function mergeLanguages(published?: readonly LanguageDef[] | null): LanguageDef[] {
  const seen = new Set(BUILTIN_CODES);
  const extra = (published ?? []).filter((l) => l && typeof l.code === "string" && LANG_CODE.test(l.code) && !seen.has(l.code) && (seen.add(l.code), true));
  return [...BUILTIN_LANGUAGES, ...extra.sort((a, b) => a.english.localeCompare(b.english))];
}

/** The {placeholders} of a UI string, sorted. A translation keeps the same ones, or the number or name goes missing. */
export const placeholdersOf = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const samePlaceholders = (a: string, b: string) => placeholdersOf(a).join() === placeholdersOf(b).join();

export interface TranslationCheck {
  /** English keys with no translation yet (they show in English). */
  missing: string[];
  /** Keys whose {placeholders} differ from the English string. These block publishing. */
  placeholders: string[];
  /** Keys the app doesn't have (an old spreadsheet, a typo); they are left out when publishing. */
  unknown: string[];
  done: number;
  total: number;
}
/** How a translation stands against the English strings. */
export function checkTranslation(messages: Readonly<Record<string, string>>, en: Readonly<Record<string, string>>): TranslationCheck {
  const keys = Object.keys(en);
  const has = (k: string) => typeof messages[k] === "string" && messages[k].trim() !== "";
  const missing = keys.filter((k) => !has(k));
  const placeholders = keys.filter((k) => has(k) && !samePlaceholders(messages[k], en[k]));
  const unknown = Object.keys(messages).filter((k) => !(k in en));
  return { missing, placeholders, unknown, done: keys.length - missing.length, total: keys.length };
}

/** Only the keys the app knows, trimmed and non-empty: what gets published. */
export const cleanMessages = (messages: Readonly<Record<string, string>>, en: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(messages).filter(([k, v]) => k in en && typeof v === "string" && v.trim() !== "").map(([k, v]) => [k, v.trim()]));

export type LanguageProblem = "code" | "builtIn" | "native" | "english" | "dir" | "numerals" | "messages" | "tooLong" | "empty";
/**
 * What stops a language from being published (the Languages page and publishLanguage both run it). The server has no
 * copy of the English strings, so it checks shape and size; the page also checks placeholders against English.
 */
export function validateLanguage(def: unknown, messages: unknown): LanguageProblem[] {
  const out: LanguageProblem[] = [];
  const d = (typeof def === "object" && def !== null ? def : {}) as Partial<LanguageDef>;
  const str = (v: unknown, max = 60) => typeof v === "string" && v.trim() !== "" && v.length <= max;
  if (typeof d.code !== "string" || !LANG_CODE.test(d.code)) out.push("code");
  else if (BUILTIN_CODES.includes(d.code)) out.push("builtIn");
  if (!str(d.native)) out.push("native");
  if (!str(d.english)) out.push("english");
  if (d.dir !== "ltr" && d.dir !== "rtl") out.push("dir");
  if (!str(d.numerals, 35) || !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(String(d.numerals))) out.push("numerals");
  if (typeof messages !== "object" || messages === null || Array.isArray(messages)) out.push("messages");
  else {
    const entries = Object.entries(messages as Record<string, unknown>);
    if (!entries.length) out.push("empty");
    if (entries.length > MAX_KEYS || entries.some(([k, v]) => !KEY.test(k) || typeof v !== "string")) out.push("messages");
    else if (entries.some(([, v]) => (v as string).length > MAX_MESSAGE)) out.push("tooLong");
  }
  return out;
}
