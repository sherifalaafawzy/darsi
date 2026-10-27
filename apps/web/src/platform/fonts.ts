import { isNative } from ".";

/**
 * Fonts are not precached: that would put every script (~240 KB) on every phone. The browser fetches only the faces a
 * page uses (each face has a unicode-range, so an English page never touches the Arabic files), and Workbox keeps them in
 * "darsi-fonts". This fills that cache with the page language's faces as soon as the language is known, so a screen
 * first opened offline (a heading weight not seen yet, the first visit's own fonts) still has its font.
 */
const CACHE = "darsi-fonts";
/** The families each UI language uses. Arabic pages need Latin too: spaces, digits and Latin words come from it. */
const FAMILIES: Record<string, string[]> = {
  en: ["Noto Sans", "Baloo 2"],
  ar: ["Noto Sans", "Baloo 2", "Noto Sans Arabic", "Baloo Bhaijaan 2"],
};
/** Languages platform admins add: Arabic-script ones get the Arabic faces; the rest also get the extended-Latin headings (ş, ğ, ư…). Other scripts use the phone's fonts. */
const ARABIC_SCRIPT = new Set(["ar", "fa", "ur", "ps", "ckb", "sd", "ug"]);
export const familiesFor = (lang: string) => {
  const base = lang.toLowerCase().split("-")[0];
  return FAMILIES[base] ?? (ARABIC_SCRIPT.has(base) ? FAMILIES.ar : [...FAMILIES.en, "Baloo 2 Ext"]);
};

/** Absolute URLs of these families' font files, read from the page's own @font-face rules (Vite hashes the file names). */
export function fontUrls(families: string[], sheets: ArrayLike<CSSStyleSheet> = document.styleSheets): string[] {
  const urls = new Set<string>();
  for (const sheet of Array.from(sheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; } // a stylesheet from another origin
    for (const rule of Array.from(rules)) {
      if (rule.type !== 5) continue; // CSSRule.FONT_FACE_RULE
      const { style } = rule as CSSFontFaceRule;
      const src = /url\(\s*["']?([^"')]+)/.exec(style.getPropertyValue("src"));
      if (src && families.includes(style.getPropertyValue("font-family").replace(/["']/g, "").trim())) urls.add(new URL(src[1], sheet.href ?? location.href).href);
    }
  }
  return [...urls];
}

/**
 * Adds the language's font files to the fonts cache; files already there cost nothing. Only real fonts are kept: Hosting
 * answers a path that no longer exists with index.html and a 200, which must never be cached as a font.
 */
export async function cacheFonts(lang: string): Promise<void> {
  const cache = await caches.open(CACHE);
  await Promise.all(fontUrls(familiesFor(lang)).map(async (url) => {
    if (await cache.match(url)) return;
    const res = await fetch(url);
    if (res.ok && res.headers.get("content-type")?.startsWith("font/")) await cache.put(url, res);
  }));
}

/**
 * Keeps the fonts of the page's language (<html lang>, which applyLocale sets) cached: once after load, again whenever
 * the language changes, and when a phone that was offline reconnects. Web builds only: native shells ship the fonts.
 */
export function keepPageFonts() {
  if (!import.meta.env.PROD || isNative() || !("caches" in window) || !("serviceWorker" in navigator)) return;
  const html = document.documentElement;
  const started = new Set<string>(); // per language: running or done; a failure clears it so the next change retries
  const run = () => {
    const lang = html.lang;
    if (started.has(lang)) return;
    if (!navigator.onLine) { window.addEventListener("online", run, { once: true }); return; }
    started.add(lang);
    const work = () => { cacheFonts(lang).catch(() => started.delete(lang)); };
    if (typeof requestIdleCallback === "function") requestIdleCallback(work); else setTimeout(work, 1000); // Safari has no idle callback
  };
  const start = () => { new MutationObserver(run).observe(html, { attributes: true, attributeFilter: ["lang"] }); run(); };
  if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
}
