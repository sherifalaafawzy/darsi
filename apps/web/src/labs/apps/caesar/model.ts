/**
 * The Caesar cipher: replace each letter by the one k places further along the alphabet (English: 26 letters, Arabic:
 * 28). Only k possible keys, so it can be cracked by trying them all and keeping the one whose letter frequencies look
 * most like real language (the smallest chi-squared distance).
 */
export type Lang = "en" | "ar";
export const ALPHABET: Record<Lang, string[]> = { en: [..."abcdefghijklmnopqrstuvwxyz"], ar: [..."ابتثجحخدذرزسشصضطظعغفقكلمنهوي"] };
/** Typical letter frequencies (%), in alphabet order. Arabic: from large text collections, rounded. */
export const FREQ: Record<Lang, number[]> = {
  en: [8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1, 7.0, 0.15, 0.77, 4.0, 2.4, 6.7, 7.5, 1.9, 0.095, 6.0, 6.3, 9.1, 2.8, 0.98, 2.4, 0.15, 2.0, 0.074],
  ar: [12.5, 4.0, 3.9, 0.6, 1.4, 2.0, 0.9, 3.1, 0.8, 4.4, 0.5, 2.6, 1.1, 1.2, 0.6, 1.0, 0.2, 3.5, 0.4, 3.0, 2.7, 2.3, 10.8, 6.1, 5.7, 5.0, 5.9, 8.3],
};
const AR_FOLD: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي" };
/** Arabic letter variants fold to the 28 base letters; short-vowel marks are dropped. */
export const normalize = (text: string, lang: Lang) => (lang === "ar" ? [...text.replace(/[ً-ٰٟ]/g, "")].map((c) => AR_FOLD[c] ?? c).join("") : text);

export function shift(text: string, k: number, lang: Lang) {
  const abc = ALPHABET[lang], n = abc.length;
  return [...normalize(text, lang)].map((c) => {
    const lower = c.toLowerCase(), i = abc.indexOf(lower);
    if (i < 0) return c;
    const out = abc[(((i + k) % n) + n) % n];
    return c !== lower ? out.toUpperCase() : out;
  }).join("");
}

export function counts(text: string, lang: Lang) {
  const abc = ALPHABET[lang], c = new Array(abc.length).fill(0);
  for (const ch of normalize(text, lang).toLowerCase()) { const i = abc.indexOf(ch); if (i >= 0) c[i]++; }
  return c as number[];
}

/** How unlike normal language a text's letters are (chi-squared): lower is more language-like. */
export function unlikeness(text: string, lang: Lang) {
  const c = counts(text, lang), total = c.reduce((a, b) => a + b, 0) || 1, f = FREQ[lang], fs = f.reduce((a, b) => a + b, 0);
  return c.reduce((s, x, i) => { const e = (f[i] / fs) * total; return s + (x - e) ** 2 / Math.max(e, 0.01); }, 0);
}

/** Tries every key; best (most language-like) first. */
export function crack(cipher: string, lang: Lang) {
  return ALPHABET[lang].map((_, k) => { const plain = shift(cipher, -k, lang); return { k, plain, score: unlikeness(plain, lang) }; }).sort((a, b) => a.score - b.score);
}
