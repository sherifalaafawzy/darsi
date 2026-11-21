/** Small pure helpers for the public pages: escaping, numbers and counted words in English and Arabic, durations. */

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** JSON inside <script type="application/ld+json">: nothing in it may close the tag. */
export const ldJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

/** A text in this language, else the English. Course text carries invisible isolates around code; they stay. */
export const pick = (t, lang) => String((t && (t[lang] ?? t.en)) ?? "").trim();
export const dirOf = (lang) => (lang === "ar" ? "rtl" : "ltr");
/** Numbers as the app shows them: Arabic-Indic digits on Arabic pages. */
const NF = { en: new Intl.NumberFormat("en"), ar: new Intl.NumberFormat("ar-EG") };
export const num = (n, lang, opts) => (opts ? new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en", opts) : NF[lang] ?? NF.en).format(n);

const AR_RULES = new Intl.PluralRules("ar");
/**
 * A counted word. English: [one, other]. Arabic: { one, two, few, many, other } whole phrases with "#" for the number
 * (Arabic says "درس واحد", "درسان", "٥ دروس", "١٢ درسًا": the word changes with the count, and one and two take no digit).
 */
export function count(n, lang, forms) {
  // Either { en, ar } or this language's own forms.
  const f = Array.isArray(forms) || "other" in forms ? forms : forms[lang];
  if (lang === "ar") return (f[AR_RULES.select(n)] ?? f.other).replace("#", num(n, "ar"));
  return `${num(n, "en")} ${n === 1 ? f[0] : f[1]}`;
}

/** Minutes as "1 h 20 min" / "١ س ٢٠ د"-free words: hours and minutes spelled as the page language counts them. */
export function duration(minutes, lang, W) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), r = m % 60;
  const parts = [];
  if (h) parts.push(count(h, lang, W.hours));
  if (r || !h) parts.push(count(r, lang, W.minutes));
  return parts.join(lang === "ar" ? " و" : " ");
}
/** ISO 8601 duration for schema.org (PT1H20M). */
export const isoDuration = (minutes) => {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), r = m % 60;
  return `PT${h ? `${h}H` : ""}${r || !h ? `${r}M` : ""}`;
};
/** Seconds as m:ss in the page's digits (a video's length). */
export const clock = (seconds, lang) => {
  const s = Math.max(0, Math.round(seconds));
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return lang === "ar" ? text.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]) : text;
};

/** A list in a sentence: "a, b and c" / «أ، ب، ج». */
export function listOf(items, lang) {
  const a = items.filter(Boolean);
  // Arabic joins with و: «أ وب», «أ، وب، وج».
  if (lang === "ar") return a.length === 2 ? `${a[0]} و${a[1]}` : a.map((x, i) => (i ? `و${x}` : x)).join("، ");
  if (a.length <= 1) return a.join("");
  return `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
}

/** Cut to n characters at a word, with an ellipsis (meta descriptions). */
export function cut(s, n) {
  const chars = Array.from(String(s).replace(/\s+/g, " ").trim());
  if (chars.length <= n) return chars.join("");
  const head = chars.slice(0, n - 1).join("");
  const at = head.lastIndexOf(" ");
  return `${(at > n * 0.6 ? head.slice(0, at) : head).replace(/[،,;:.\s]+$/, "")}…`;
}

/**
 * Handwritten copy: escaped text with two marks, [words](address) for a link and **words** for emphasis.
 * Addresses are the site's own paths or https links; anything else is left as text.
 */
export function rich(text, { external = true } = {}) {
  let out = esc(text);
  out = out.replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]*)\)/g, (_, words, href) => {
    const off = href.startsWith("https://");
    return off && !external ? words : `<a href="${href}"${off ? ' rel="noopener"' : ""}>${words}</a>`;
  });
  return out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
/** The same copy as plain text (meta descriptions, JSON-LD answers, llms.txt). */
export const plain = (text) => String(text).replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]*)\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
