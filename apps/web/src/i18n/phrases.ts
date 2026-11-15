/**
 * Phrases: translations of content written in English and Arabic (Labs, the placement check, the home page) for the
 * languages platform admins add. Each file is public/content/phrases/<lang>/<area>.json, a map from the English text
 * to its translation, fetched with a plain request only by the screen that needs it, so a phone downloads only its own
 * language's words for the screens it opens (the service worker keeps them in "darsi-content"). No list of files ships
 * with the app: a language or area without a file answers 404 and shows in English.
 *
 * `L()` (i18n) looks a LocalText's English up here when the text has no copy in the page language; `useS()` (Labs)
 * translates a lab's whole string table the same way. A text without a translation shows in English.
 * Function strings ("(n, s) => `${n} of ${s}`") are keyed with numbered markers: "{0} of {1}".
 * `node apps/web/scripts/phrases.mjs` lists what each language is missing.
 */
import { useEffect, useState } from "react";
import { addPhrases, hasPhrases, useI18n } from "./index";

const loading = new Map<string, Promise<void>>();
/** English and Arabic content is written in place; only other languages have phrase files. */
const translatedIn = (lang: string) => lang !== "en" && lang !== "ar" && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(lang);

/** Loads one area's phrases for a language (once). Resolves without error when there are none, or offline. */
export function loadPhrases(lang: string, area: string): Promise<void> {
  if (!translatedIn(lang) || hasPhrases(lang, area)) return Promise.resolve();
  const key = `${lang}/${area}`;
  if (!loading.has(key)) {
    loading.set(key, fetch(`/content/phrases/${key}.json`)
      .then(async (r) => {
        const dict = r.ok && (r.headers.get("content-type") ?? "").includes("json") ? await r.json() as Record<string, string> : {};
        addPhrases(lang, area, dict);
      })
      // Offline and never saved: English for now, and try again next time.
      .catch(() => { loading.delete(key); }));
  }
  return loading.get(key)!;
}

/** Loads the page language's phrases for these areas; false until they are in (or have failed). */
export function usePhrases(...areas: string[]): boolean {
  const { lang } = useI18n();
  const key = areas.join(",");
  const need = translatedIn(lang) ? areas.filter((a) => !hasPhrases(lang, a)) : [];
  const [tried, setTried] = useState("");
  useEffect(() => {
    if (!need.length) return;
    let live = true;
    void Promise.all(need.map((a) => loadPhrases(lang, a))).then(() => { if (live) setTried(`${lang}:${key}`); });
    return () => { live = false; };
  }, [lang, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return need.length === 0 || tried === `${lang}:${key}`;
}
