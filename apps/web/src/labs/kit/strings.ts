/**
 * Per-app strings. Each app keeps its own English and Arabic text inside its chunk (not in the app's main dictionaries),
 * so learners download a lab's words only when they open it. Arabic falls back to English key by key.
 *
 * Other languages translate the English table through phrases (i18n/phrases.ts): src/i18n/phrases/<lang>/lab-<id>.json
 * for the app and labs.json for the kit, loaded by labs/loader.tsx before the app shows. A function string is looked
 * up by what it returns for the markers {0}, {1}…; one that does more than fill in its arguments stays English.
 */
import { phrase, stringsVersion, useI18n } from "../../i18n";

export interface Strings<T> { en: T; ar: { [K in keyof T]?: T[K] } }

const MARK = /\{(\d)\}/g;
function translate(x: unknown, lang: string): unknown {
  if (typeof x === "string") return phrase(lang, x) ?? x;
  if (typeof x === "function") {
    const f = x as (...a: unknown[]) => unknown;
    let key: unknown;
    try { key = f(...Array.from({ length: f.length }, (_, i) => `{${i}}`)); } catch { return x; }
    const v = typeof key === "string" ? phrase(lang, key) : undefined;
    return v ? (...a: unknown[]) => v.replace(MARK, (m, i: string) => (+i < a.length ? String(a[+i]) : m)) : x;
  }
  if (Array.isArray(x)) return x.map((v) => translate(v, lang));
  if (x && typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype) {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, translate(v, lang)]));
  }
  return x;
}
const cache = new WeakMap<object, { key: string; value: unknown }>();
/** A lab's string table in the page language. */
export function translated<T extends object>(s: Strings<T>, lang: string): T {
  if (lang === "en") return s.en;
  if (lang === "ar") return { ...s.en, ...s.ar } as T;
  const key = `${lang}:${stringsVersion()}`;
  const hit = cache.get(s);
  if (hit?.key === key) return hit.value as T;
  const value = translate(s.en, lang) as T;
  cache.set(s, { key, value });
  return value;
}
export function useS<T extends object>(s: Strings<T>): T {
  const { lang } = useI18n();
  return translated(s, lang);
}

/** Words every lab uses (controls, outcomes). */
export const KIT = {
  en: {
    run: "Run", pause: "Pause", step: "One step", reset: "Start again", train: "Train", test: "Test", stop: "Stop",
    loss: "Error", epoch: "Round", accuracy: "Accuracy", takeaway: "Takeaway", tryIt: "Try it", tryThis: "Try this",
    drawHint: "Draw with your finger or mouse. Keyboard: arrows move, Space paints.", clear: "Clear", yes: "Yes", no: "No",
  },
  ar: {
    run: "شغّل", pause: "أوقف مؤقتًا", step: "خطوة واحدة", reset: "ابدأ من جديد", train: "درّب", test: "اختبر", stop: "أوقف",
    loss: "الخطأ", epoch: "الجولة", accuracy: "الدقة", takeaway: "الخلاصة", tryIt: "جرّب", tryThis: "جرّب هذا",
    drawHint: "ارسم بإصبعك أو بالفأرة. لوحة المفاتيح: الأسهم للتحريك، والمسافة للتلوين.", clear: "امسح", yes: "نعم", no: "لا",
  },
};
export const useKit = () => useS(KIT);
