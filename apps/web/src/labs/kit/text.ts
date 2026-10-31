/**
 * Text helpers for the language labs, in English and Arabic. Matching ignores case and Arabic diacritics, tatweel and
 * the common letter variants (أ إ آ → ا, ى → ي, ة → ه); what learners see keeps the spelling they typed.
 */
// Harakat U+064B–065F, the dagger alif U+0670 and tatweel U+0640 (written as escapes: Arabic in a character class displays reversed).
const AR_MARKS = /[\u064B-\u065F\u0670\u0640]/g;

export const matchKey = (word: string) =>
  word.normalize("NFKC").toLowerCase().replace(AR_MARKS, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");

/** Words in order, as they were written (letters, digits, apostrophes). */
export const words = (text: string) => text.normalize("NFKC").match(/[\p{L}\p{M}\p{N}'’]+/gu) ?? [];

/** Sentences split on . ! ? ؟ and new lines. */
export const sentences = (text: string) => text.split(/[.!?؟\n]+/).map((s) => s.trim()).filter(Boolean);

export const isArabic = (text: string) => /[؀-ۿ]/.test(text);
