/**
 * A tiny stand-in for an LLM, with every stage visible: words → token ids → number lists (embeddings) → attention
 * over the text so far → a score for each possible next word → probabilities (softmax with temperature) → a pick.
 * The scores mix word-pair counts with how well each word fits the attention context.
 */
import { softmax } from "../../kit/math";
import { matchKey, sentences, words } from "../../kit/text";
import { cooccur, cosine, norm, pca, ppmi, vocab } from "../../kit/vectors";

export const END = "⏎";
export const CORPUS = {
  en: `The cat drinks milk.
The cat sleeps on the bed.
The dog drinks water.
The dog runs in the garden.
The cow eats grass on the farm.
The cow gives milk.
The teacher writes on the board.
The teacher reads a story to the class.
The pupils write in their notebooks.
The pupils read a story in class.
We eat bread for breakfast.
We eat rice for lunch.
We drink tea after lunch.
We drink water in the garden.
The rain falls in winter.
The sun shines in summer.
The wind blows in winter.
The children play in the garden after school.
The children go to school in the morning.
The bus takes the children to school.
In the morning the sun shines.
After school the children play football.
The cat plays in the garden.
The teacher drinks tea after class.`,
  ar: `تشرب القطة الحليب.
تنام القطة على السرير.
يشرب الكلب الماء.
يجري الكلب في الحديقة.
تأكل البقرة العشب في المزرعة.
تعطي البقرة الحليب.
يكتب المعلم على السبورة.
يقرأ المعلم قصة للصف.
يكتب التلاميذ في دفاترهم.
يقرأ التلاميذ قصة في الصف.
نأكل الخبز في الفطور.
نأكل الأرز في الغداء.
نشرب الشاي بعد الغداء.
نشرب الماء في الحديقة.
ينزل المطر في الشتاء.
تشرق الشمس في الصيف.
تهب الرياح في الشتاء.
يلعب الأطفال في الحديقة بعد المدرسة.
يذهب الأطفال إلى المدرسة في الصباح.
تأخذ الحافلة الأطفال إلى المدرسة.
في الصباح تشرق الشمس.
بعد المدرسة يلعب الأطفال الكرة.
تلعب القطة في الحديقة.
يشرب المعلم الشاي بعد الدرس.`,
};
export const PROMPTS = { en: ["The cat", "The teacher", "We eat", "The children"], ar: ["تشرب القطة", "يقرأ المعلم", "نأكل", "يلعب الأطفال"] };

type Counts = Map<string, Map<string, number>>;
export interface Lm { ids: Map<string, number>; surface: Map<string, string>; emb: Map<string, number[]>; uni: Map<string, number>; bi: Counts; tri: Counts }

const bump = (m: Counts, ctx: string, w: string) => { const c = m.get(ctx) ?? new Map<string, number>(); c.set(w, (c.get(w) ?? 0) + 1); m.set(ctx, c); };

export function train(text: string): Lm {
  const v = vocab(text, new Set(), 1);
  const ids = new Map(v.keys.map((k, i) => [k, i + 1]));
  ids.set(END, 0);
  const rows = ppmi(cooccur(v)).map((r) => { const l = norm(r) || 1; return r.map((x) => x / l); });
  const emb = new Map(pca(rows, 4).map((e, i) => { const l = norm(e) || 1; return [v.keys[i], e.map((x) => x / l)] as const; }));
  const uni = new Map<string, number>(), bi: Counts = new Map(), tri: Counts = new Map();
  for (const s of sentences(text)) {
    const seq = ["", "", ...words(s).map(matchKey), END];
    for (let i = 2; i < seq.length; i++) { uni.set(seq[i], (uni.get(seq[i]) ?? 0) + 1); bump(bi, seq[i - 1], seq[i]); bump(tri, `${seq[i - 2]} ${seq[i - 1]}`, seq[i]); }
  }
  return { ids, surface: v.surface, emb, uni, bi, tri };
}

export const tokenize = (lm: Lm, text: string) => words(text).map(matchKey).map((key) => ({ key, id: lm.ids.get(key) ?? -1 }));
export const show = (lm: Lm, key: string) => lm.surface.get(key) ?? key;

/** Word-pair (or triple) counts for what can follow; falls back to shorter contexts when it has never seen this one. */
function counts(lm: Lm, ctx: string[]): Map<string, number> {
  const a = ctx[ctx.length - 2] ?? "", b = ctx[ctx.length - 1] ?? "";
  return lm.tri.get(`${a} ${b}`) ?? lm.bi.get(b) ?? lm.uni;
}

export interface Step {
  /** Attention of the last token over every token so far. */
  attn: number[];
  /** The context: attention-weighted mix of the tokens' number lists. */
  context: number[];
  cands: { key: string; count: number; fit: number; score: number; p: number }[];
}

/** Everything the model computes to choose the next word. `useContext` is how much the attention context counts. */
export function think(lm: Lm, ctx: string[], temperature = 1, useContext = 1.5): Step {
  const vecs = ctx.map((k) => lm.emb.get(k) ?? [0, 0, 0, 0]);
  const last = vecs[vecs.length - 1] ?? [0, 0, 0, 0];
  const attn = vecs.length ? softmax(vecs.map((e) => cosine(last, e) * 4)) : [];
  const context = [0, 1, 2, 3].map((d) => vecs.reduce((s, e, j) => s + attn[j] * e[d], 0));
  const c = counts(lm, ctx), total = [...c.values()].reduce((a, b) => a + b, 0);
  const raw = [...c.entries()].map(([key, count]) => {
    const fit = key === END ? 0 : cosine(lm.emb.get(key) ?? [0, 0, 0, 0], context);
    return { key, count, fit, score: Math.log(count / total) + useContext * fit };
  });
  const ps = softmax(raw.map((r) => r.score), temperature);
  return { attn, context, cands: raw.map((r, i) => ({ ...r, p: ps[i] })).sort((x, y) => y.p - x.p) };
}

export function pick(cands: Step["cands"], r: number): string {
  let acc = 0;
  for (const c of cands) { acc += c.p; if (r < acc) return c.key; }
  return cands[cands.length - 1]?.key ?? END;
}
