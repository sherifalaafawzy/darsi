/**
 * A green-list watermark for generated text, defence-against-cheating first but honest about its limits. The model has
 * a secret key. At each word slot the key splits that slot's choices into a "green" half and a "red" half; a
 * watermarked model quietly prefers green words. A detector with the key counts how many chosen words are green: lots
 * of green is a signal the text was machine-written. Editing the text flips some words back to red and the signal
 * fades. Pure and seeded, so the phone and the tests agree.
 */
import { rng } from "../../kit/rng";

export interface Choice { en: string; ar: string }
export interface Slot { choices: Choice[] }

/**
 * A short sentence with interchangeable words at each slot (a tiny stand-in for a model's vocabulary). Every choice
 * must fit every choice of the next slot: in Arabic the first slot's subjects are all feminine, like its verbs (تفتح),
 * and the fourth slot's are all third-person plural, like its verbs (يصلون); in English those are plural too.
 */
export const SLOTS: Slot[] = [
  { choices: [{ en: "The library", ar: "المكتبة" }, { en: "The club", ar: "الجمعية" }, { en: "Our school", ar: "مدرستنا" }, { en: "The hall", ar: "القاعة" }] },
  { choices: [{ en: "opens", ar: "تفتح" }, { en: "meets", ar: "تجتمع" }, { en: "starts", ar: "تبدأ" }, { en: "gathers", ar: "تلتقي" }] },
  { choices: [{ en: "early", ar: "مبكرًا" }, { en: "today", ar: "اليوم" }, { en: "soon", ar: "قريبًا" }, { en: "again", ar: "مجددًا" }] },
  { choices: [{ en: "and the parents", ar: "وأولياء الأمور" }, { en: "and the pupils", ar: "والتلاميذ" }, { en: "and the teachers", ar: "والمعلّمون" }, { en: "and friends", ar: "والأصدقاء" }] },
  { choices: [{ en: "arrive", ar: "يصلون" }, { en: "come", ar: "يأتون" }, { en: "gather", ar: "يجتمعون" }, { en: "wait", ar: "ينتظرون" }] },
  { choices: [{ en: "happily", ar: "بسعادة" }, { en: "quietly", ar: "بهدوء" }, { en: "together", ar: "معًا" }, { en: "on time", ar: "في الموعد" }] },
];

/** A 32-bit hash of a string, so the same key and word always land on the same side of the green/red split. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Is choice `c` of slot `i` green under this key? About half of each slot's choices are. */
export const isGreen = (key: number, slot: number, choice: number): boolean => (hash(`${key}:${slot}:${choice}`) & 1) === 0;
/** How many of a slot's choices are green (for an honest baseline: usually about half). */
export const greenCount = (key: number, slot: number) => SLOTS[slot].choices.filter((_, c) => isGreen(key, slot, c)).length;

/** Pick a word per slot. A watermarked model prefers a green choice; a plain one picks any choice. */
export function generate(key: number, watermark: boolean, seed: number): number[] {
  const r = rng(seed);
  return SLOTS.map((slot, i) => {
    const greens = slot.choices.map((_, c) => c).filter((c) => isGreen(key, i, c));
    const pool = watermark && greens.length ? greens : slot.choices.map((_, c) => c);
    return pool[r.int(pool.length)];
  });
}

/** Change `n` slots to a different random choice (editing or paraphrasing the text). */
export function edit(sel: number[], n: number, seed: number): number[] {
  const r = rng(seed), out = [...sel], order = SLOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = r.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  for (const i of order.slice(0, Math.min(n, SLOTS.length))) {
    const others = SLOTS[i].choices.map((_, c) => c).filter((c) => c !== out[i]);
    out[i] = others[r.int(others.length)];
  }
  return out;
}

export interface Score { green: number; slots: number; fraction: number; z: number; flagged: boolean }
/** The detector: count green words, and turn it into a z-score against the chance level (half green). */
export function detect(key: number, sel: number[]): Score {
  const green = sel.filter((c, i) => isGreen(key, i, c)).length;
  const n = sel.length, p = 0.5;
  const z = (green - n * p) / Math.sqrt(n * p * (1 - p));
  return { green, slots: n, fraction: green / n, z, flagged: z >= 1.5 };
}
export const words = (sel: number[], lang: "en" | "ar") => sel.map((c, i) => SLOTS[i].choices[c][lang]);
