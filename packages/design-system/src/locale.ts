const RTL = new Set(["ar", "fa", "ur", "ps", "he", "yi", "dv", "ckb", "sd", "ug"]);

/** Text direction for a BCP-47 language tag. */
export function dirFor(lang: string): "rtl" | "ltr" {
  return RTL.has(lang.toLowerCase().split("-")[0]) ? "rtl" : "ltr";
}

/** Sets lang, dir and theme on <html>. Call on start-up and whenever the teacher changes language or theme. */
export function applyLocale(lang: string, theme: "light" | "sunlight" = "light") {
  const el = document.documentElement;
  el.lang = lang; el.dir = dirFor(lang); el.dataset.theme = theme;
}

/** Locale-correct numbers (Arabic-Indic digits for ar-EG, ar-SA…). */
export const formatNumber = (n: number, lang: string, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(lang, opts).format(n);
export const formatPercent = (n: number, lang: string) => new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(n);
/** "2.4 MB" in the teacher's locale — always show sizes before a download. */
export const formatMB = (bytes: number, lang: string) => new Intl.NumberFormat(lang, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(bytes / 1e6);
