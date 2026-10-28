/**
 * A tiny n-gram language model: it counts which word follows the previous one (or two) words in the training text,
 * and writes by drawing the next word from those counts. Real LLMs use neural networks and look much further back,
 * but they too are trained to predict the next piece of text.
 */
import { matchKey, sentences, words } from "../../kit/text";

export const START = "^", END = "$";

/** The starting training text: classroom sentences in each language. Learners can change it. */
export const CORPUS = {
  en: `The pupils open their books.
The pupils open the window.
The teacher opens the door.
The teacher writes on the board.
The pupils write in their notebooks.
The sun is hot today.
The rain is heavy today.
We read a story in class.
We read the lesson together.
The teacher reads a story.
The pupils ask good questions.
The teacher answers the questions.
We plant seeds in the school garden.
The seeds need water and sun.
The class goes to the garden.
After the lesson we play outside.`,
  ar: `يفتح الطلاب كتبهم.
يفتح الطلاب النافذة.
يفتح المعلم الباب.
يكتب المعلم على السبورة.
يكتب الطلاب في دفاترهم.
الشمس حارة اليوم.
المطر غزير اليوم.
نقرأ قصة في الصف.
نقرأ الدرس معًا.
يقرأ المعلم قصة.
يسأل الطلاب أسئلة جيدة.
يجيب المعلم عن الأسئلة.
نزرع البذور في حديقة المدرسة.
تحتاج البذور إلى الماء والشمس.
يذهب الصف إلى الحديقة.
بعد الدرس نلعب في الخارج.`,
};

export type Order = 1 | 2;
export interface Model {
  order: Order;
  /** context ("^ the") → next word key → count */
  counts: Map<string, Map<string, number>>;
  /** word key → how it was written the first time (what learners see) */
  surface: Map<string, string>;
  sentences: string[][];
}

const ctxKey = (prev: string[], order: Order) => prev.slice(-order).join(" ");

export function train(text: string, order: Order): Model {
  const counts = new Map<string, Map<string, number>>(), surface = new Map<string, string>(), all: string[][] = [];
  for (const s of sentences(text)) {
    const ws = words(s);
    if (!ws.length) continue;
    const keys = ws.map((w) => { const k = matchKey(w); if (!surface.has(k)) surface.set(k, w); return k; });
    all.push(keys);
    const seq = [...Array(order).fill(START), ...keys, END];
    for (let i = order; i < seq.length; i++) {
      const c = ctxKey(seq.slice(0, i), order);
      const m = counts.get(c) ?? new Map<string, number>();
      m.set(seq[i], (m.get(seq[i]) ?? 0) + 1);
      counts.set(c, m);
    }
  }
  return { order, counts, surface, sentences: all };
}

/** The next-word choices after `prev` (word keys), with temperature: low = almost always the most common word. */
export function nextWords(model: Model, prev: string[], temperature = 1): { word: string; count: number; p: number }[] {
  const ctx = ctxKey([...Array(model.order).fill(START), ...prev], model.order);
  const m = model.counts.get(ctx);
  if (!m) return [];
  const t = Math.max(0.05, temperature);
  const rows = [...m.entries()].map(([word, count]) => ({ word, count, w: Math.pow(count, 1 / t) }));
  const total = rows.reduce((a, r) => a + r.w, 0);
  return rows.map(({ word, count, w }) => ({ word, count, p: w / total })).sort((a, b) => b.p - a.p || a.word.localeCompare(b.word));
}

/** Draws one next word (`r` in [0, 1)); END means the sentence is finished. */
export function pick(choices: { word: string; p: number }[], r: number): string {
  let acc = 0;
  for (const c of choices) { acc += c.p; if (r < acc) return c.word; }
  return choices.at(-1)?.word ?? END;
}

export function generate(model: Model, temperature: number, rand: () => number, max = 14, prefix: string[] = []): string[] {
  const out = [...prefix];
  while (out.length < max) {
    const w = pick(nextWords(model, out, temperature), rand());
    if (w === END) break;
    out.push(w);
  }
  return out;
}

/** True when the generated words are exactly a training sentence: the model is copying, not composing. */
export const isCopy = (model: Model, keys: string[]) => model.sentences.some((s) => s.length === keys.length && s.every((w, i) => w === keys[i]));
export const show = (model: Model, keys: string[]) => keys.map((k) => model.surface.get(k) ?? k).join(" ");
export const vocabSize = (model: Model) => model.surface.size;
