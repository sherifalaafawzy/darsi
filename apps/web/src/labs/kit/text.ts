/**
 * Text helpers for the language labs, in English and Arabic. Matching ignores case and Arabic diacritics, tatweel and
 * the common letter variants (أ إ آ → ا, ى → ي, ة → ه); what learners see keeps the spelling they typed.
 */
const AR_MARKS = /[ً-ٰٟـ]/g;

export const matchKey = (word: string) =>
  word.normalize("NFKC").toLowerCase().replace(AR_MARKS, "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");

/** Words in order, as they were written (letters, digits, apostrophes). */
export const words = (text: string) => text.normalize("NFKC").match(/[\p{L}\p{M}\p{N}'’]+/gu) ?? [];

/** Sentences split on . ! ? ؟ and new lines. */
export const sentences = (text: string) => text.split(/[.!?؟\n]+/).map((s) => s.trim()).filter(Boolean);

export const isArabic = (text: string) => /[؀-ۿ]/.test(text);
