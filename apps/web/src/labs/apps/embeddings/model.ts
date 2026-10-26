/**
 * Word map: each word becomes a list of numbers saying which other words it appears with (weighted by PPMI). Words
 * used in the same company get similar lists, so they sit close together when the lists are squashed onto a map.
 */
import { matchKey } from "../../kit/text";
import { cooccur, cosine, norm, pca, ppmi, vocab, type Vocab } from "../../kit/vectors";

export const CORPUS = {
  en: `The cat drinks milk at home.
The dog drinks water at home.
The cat sleeps on the bed at home.
The dog sleeps near the door at home.
The cat plays with the dog.
The goat eats grass on the farm.
The cow eats grass on the farm.
The cow gives milk on the farm.
The goat gives milk on the farm.
We eat sweet mangoes from the market.
We eat sweet bananas from the market.
We buy dates from the market.
We buy oranges from the market.
Mangoes are sweet fruit.
Bananas are sweet fruit.
Dates are sweet fruit.
Oranges are sweet fruit.
The teacher writes on the board in class.
The pupil writes with a pencil in class.
The teacher reads a book in class.
The pupil reads a book in class.
The pupil brings a pencil and a book to class.
The teacher helps the pupil in class.
The sun is hot in summer.
The rain is cold in winter.
The wind is strong in winter.
The sun shines in the sky in summer.
The rain falls from the sky in winter.
Clouds bring rain in winter.
The wind moves the clouds in the sky.`,
  ar: `تشرب القطة الحليب في البيت.
يشرب الكلب الماء في البيت.
تنام القطة على السرير في البيت.
ينام الكلب قرب الباب في البيت.
تلعب القطة مع الكلب.
تأكل العنزة العشب في المزرعة.
تأكل البقرة العشب في المزرعة.
تعطي البقرة الحليب في المزرعة.
تعطي العنزة الحليب في المزرعة.
نأكل المانجو الحلوة من السوق.
نأكل الموز الحلو من السوق.
نشتري التمر من السوق.
نشتري البرتقال من السوق.
المانجو فاكهة حلوة.
الموز فاكهة حلوة.
التمر فاكهة حلوة.
البرتقال فاكهة حلوة.
يكتب المعلم على السبورة في الصف.
يكتب التلميذ في الدفتر في الصف.
يقرأ المعلم الكتاب في الصف.
يقرأ التلميذ الكتاب في الصف.
يحمل التلميذ الدفتر مع الكتاب إلى الصف.
يساعد المعلم التلميذ في الصف.
الشمس حارة في الصيف.
المطر بارد في الشتاء.
الرياح قوية في الشتاء.
تشرق الشمس في السماء في الصيف.
ينزل المطر من السماء في الشتاء.
تجلب الغيوم المطر في الشتاء.
تحرّك الرياح الغيوم في السماء.`,
};

/** Small words that say little about meaning; left out of the map. */
export const STOP = new Set(
  ("the a an and is are was were be in on at with from to of we it near by for this that our their his her you they he she i has have do does " +
    "في على من إلى مع عن قرب هذا هذه هو هي نحن كان كانت ثم أو التي الذي").split(" ").map(matchKey),
);

export interface WordMap { v: Vocab; vectors: number[][]; xy: number[][] }

export function build(text: string): WordMap {
  const v = vocab(text, STOP, 2);
  const vectors = ppmi(cooccur(v)).map((r) => { const l = norm(r) || 1; return r.map((x) => x / l); });
  return { v, vectors, xy: pca(vectors, 2) };
}

/** The `k` words whose number lists point the most the same way as this word's. */
export function nearest(m: WordMap, key: string, k = 5) {
  const i = m.v.keys.indexOf(key);
  if (i < 0) return [];
  return m.v.keys.map((w, j) => ({ key: w, sim: j === i ? -2 : cosine(m.vectors[i], m.vectors[j]) })).sort((a, b) => b.sim - a.sim).slice(0, k);
}
