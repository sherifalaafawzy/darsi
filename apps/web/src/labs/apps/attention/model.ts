/**
 * Attention, the core of every LLM. Each word asks a question (its query), every word offers a label (its key); the
 * match is a dot product, softmax turns matches into shares that add up to 1, and the word's new meaning is the
 * share-weighted mix of the others. Real models learn the numbers; here we set them by hand to show the maths.
 */
import { softmax } from "../../kit/math";
import { dot } from "../../kit/vectors";

/** What each number in a word's meaning stands for. */
export const FEATURES = ["alive", "thing", "action", "quality"] as const;
export type Role = "noun" | "verb" | "pronoun" | "quality" | "small";
export interface Tok { text: string; role: Role; f: number[]; about?: [number, number]; focus?: true }

const t = (text: string, role: Role, f: number[] = [0, 0, 0, 0], about?: [number, number], focus?: true): Tok => ({ text, role, f, about, focus });
const ALIVE = [1, 0, 0, 0], THING = [0, 1, 0, 0], ACT = [0, 0, 1, 0], QUAL = [0, 0, 0, 1];

/** Pairs of sentences that differ in one word, which changes what "it" means. Arabic has its own word order. */
export const SENTENCES: Record<string, { en: Tok[]; ar: Tok[] }> = {
  hungry: {
    en: [t("The", "small"), t("dog", "noun", ALIVE), t("drank", "verb", ACT), t("the", "small"), t("milk", "noun", THING), t("because", "small"), t("it", "pronoun", undefined, undefined, true), t("was", "small"), t("hungry", "quality", QUAL, [1, 0])],
    ar: [t("شرب", "verb", ACT), t("الكلب", "noun", ALIVE), t("الحليب", "noun", THING), t("لأنه", "pronoun", undefined, undefined, true), t("كان", "small"), t("جائعًا", "quality", QUAL, [1, 0])],
  },
  fresh: {
    en: [t("The", "small"), t("dog", "noun", ALIVE), t("drank", "verb", ACT), t("the", "small"), t("milk", "noun", THING), t("because", "small"), t("it", "pronoun", undefined, undefined, true), t("was", "small"), t("fresh", "quality", QUAL, [0, 1])],
    ar: [t("شرب", "verb", ACT), t("الكلب", "noun", ALIVE), t("الحليب", "noun", THING), t("لأنه", "pronoun", undefined, undefined, true), t("كان", "small"), t("طازجًا", "quality", QUAL, [0, 1])],
  },
  strong: {
    en: [t("The", "small"), t("donkey", "noun", ALIVE), t("carried", "verb", ACT), t("the", "small"), t("sack", "noun", THING), t("because", "small"), t("it", "pronoun", undefined, undefined, true), t("was", "small"), t("strong", "quality", QUAL, [0.9, 0.1])],
    ar: [t("حمل", "verb", ACT), t("الحمار", "noun", ALIVE), t("الكيس", "noun", THING), t("لأنه", "pronoun", undefined, undefined, true), t("كان", "small"), t("قويًا", "quality", QUAL, [0.9, 0.1])],
  },
  light: {
    en: [t("The", "small"), t("donkey", "noun", ALIVE), t("carried", "verb", ACT), t("the", "small"), t("sack", "noun", THING), t("because", "small"), t("it", "pronoun", undefined, undefined, true), t("was", "small"), t("light", "quality", QUAL, [0.1, 0.9])],
    ar: [t("حمل", "verb", ACT), t("الحمار", "noun", ALIVE), t("الكيس", "noun", THING), t("لأنه", "pronoun", undefined, undefined, true), t("كان", "small"), t("خفيفًا", "quality", QUAL, [0.1, 0.9])],
  },
  reads: {
    en: [t("The", "small"), t("pupil", "noun", ALIVE), t("reads", "verb", ACT, undefined, true), t("the", "small"), t("story", "noun", THING), t("aloud", "small")],
    ar: [t("يقرأ", "verb", ACT, undefined, true), t("التلميذ", "noun", ALIVE), t("القصة", "noun", THING), t("بصوت", "small"), t("عالٍ", "small")],
  },
};

/** A word's question. A pronoun's comes from what the sentence says about it (the qualities after it). */
export function query(toks: Tok[], i: number): number[] {
  const w = toks[i];
  if (w.role === "verb") return [1, 1, 0, 0]; // who does it, and to what
  if (w.role === "noun") return [0, 0, 1, 1]; // what it does, what it is like
  if (w.role === "quality") return [w.about?.[0] ?? 0.5, w.about?.[1] ?? 0.5, 0, 0]; // what it describes
  if (w.role === "pronoun") {
    const later = toks.slice(i + 1).filter((x) => x.about);
    if (!later.length) return [0.5, 0.5, 0, 0];
    return [later.reduce((s, x) => s + x.about![0], 0) / later.length, later.reduce((s, x) => s + x.about![1], 0) / later.length, 0, 0];
  }
  return [0, 0, 0, 0];
}
/** A word's label is simply its meaning. */
export const key = (w: Tok) => w.f;

/** One word attending: its query, the match with every word, the shares (softmax) and the mix it takes away. */
export function attend(toks: Tok[], i: number, focus = 4) {
  const q = query(toks, i);
  const scores = toks.map((w) => dot(q, key(w)));
  const weights = softmax(scores.map((s) => s * focus));
  const mix = FEATURES.map((_, d) => toks.reduce((s, w, j) => s + weights[j] * w.f[d], 0));
  return { q, scores, weights, mix };
}
export const matrix = (toks: Tok[], focus = 4) => toks.map((_, i) => attend(toks, i, focus).weights);
