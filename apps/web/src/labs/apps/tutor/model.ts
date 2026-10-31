/**
 * The text tutor picks a Lesson Studio pack scene and lets the player draw it.
 *
 * The frames (Dijkstra's frontier, the truck's packing, a sort's swaps) were computed by the pack when the scene was
 * made. On the phone the pack's canvas renderer paints them: each moment is a pure function of time, so pressing play
 * is the animation. Darsi Tiny does not write the picture. It explains the scene's narration, which is the result of
 * a glossary call. Tiny only knows technology of this kind.
 */
import type { Conversation, Lang } from "../../../tinylm";
import draws from "./draws.json";

export const DRAW_DUR = draws.dur;

export interface PackScene {
  id: string;
  template: "canvas";
  narration: { en: string; ar: string };
  content: { elements: unknown[] };
}

const scenes = draws.scenes as Record<string, PackScene>;
export const sceneOf = (id: string): PackScene => {
  const s = scenes[id];
  if (!s) throw new Error(`tutor: no pack scene ${id}`);
  return s;
};

export interface Concept {
  id: string;
  /** What the glossary call copies, and the chip label. */
  term: { en: string; ar: string };
  line: { en: string; ar: string };
  terms: { en: string[]; ar: string[] };
}

const idea = (id: string, term: Concept["term"], terms: Concept["terms"]): Concept => {
  const n = sceneOf(id).narration;
  return { id, term, line: { en: n.en, ar: n.ar }, terms };
};

export const CONCEPTS: Concept[] = [
  idea("opt-dijkstra", { en: "shortest path", ar: "أقصر طريق" }, {
    en: ["dijkstra", "shortest path", "shortest way"],
    ar: ["ديكسترا", "أقصر طريق", "اقصر طريق"],
  }),
  idea("opt-greedy", { en: "knapsack", ar: "مسألة الحقيبة" }, {
    en: ["knapsack", "greedy", "pack the truck", "the truck"],
    ar: ["الحقيبة", "الجشعة", "الشاحنة"],
  }),
  idea("iot-temperature", { en: "sensor", ar: "الحساس" }, {
    en: ["temperature sensor", "sensor", "threshold", "the fan", "flicker"],
    ar: ["الحساس", "حساس", "المستشعر", "العتبة", "المروحة", "تذبذب"],
  }),
  idea("iot-adc", { en: "ADC", ar: "المحوّل التناظري" }, {
    en: ["analog to digital", "adc"],
    ar: ["المحوّل التناظري", "المحول التناظري"],
  }),
  idea("trace-loop", { en: "a loop", ar: "الحلقة" }, {
    en: ["for loop", "a loop", "python"],
    ar: ["حلقة", "بايثون"],
  }),
  idea("array-bubble", { en: "bubble sort", ar: "الترتيب الفقاعي" }, {
    en: ["bubble sort", "sorting"],
    ar: ["الترتيب الفقاعي", "ترتيب فقاعي"],
  }),
  idea("query-top", { en: "a query", ar: "الاستعلام" }, {
    en: ["sql", "query", "database"],
    ar: ["استعلام", "قاعدة البيانات"],
  }),
  idea("net-https", { en: "HTTPS", ar: "HTTPS" }, {
    en: ["https", "http", "packet", "wi-fi", "wifi"],
    ar: ["التشفير", "حزم", "الواي فاي"],
  }),
];

const AR_MARKS = /[ً-ٰٟـ]/g;
/** Lower case, Arabic diacritics stripped, one alef, so a typed question still matches. */
export function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(AR_MARKS, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}

function hit(hay: string, term: string): boolean {
  const t = norm(term);
  if (t.length < 3) return new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(hay);
  return hay.includes(t);
}

/** The pack scene named in the question, or null. The longest matching phrase wins. */
export function matchConcept(text: string, concepts: readonly Concept[] = CONCEPTS): Concept | null {
  const hay = norm(text);
  let best: { c: Concept; len: number } | null = null;
  for (const c of concepts) {
    for (const term of [...c.terms.en, ...c.terms.ar]) {
      if (!hit(hay, term)) continue;
      const len = norm(term).length;
      if (!best || len > best.len) best = { c, len };
    }
  }
  return best?.c ?? null;
}

export const langOf = (text: string): Lang => (/[؀-ۿ]/.test(text) ? "ar" : "en");

/**
 * A turn Tiny can finish: the app already looked the term up (the pack scene's narration is the result) and Tiny
 * writes the answer. The tools line is only glossary, so it stays on technology.
 */
export function seedAnswer(user: string, concept: Concept, lang: Lang): Conversation {
  return {
    tools: ["glossary"],
    turns: [
      { role: "user", text: user },
      { role: "plan", text: lang === "ar" ? "أبحث عن المصطلح، والتطبيق يرسم المشهد." : "Look the term up. The app draws the scene." },
      { role: "call", call: { tool: "glossary", args: { term: concept.term[lang] } } },
      { role: "result", result: { definition: concept.line[lang] } },
    ],
  };
}

/** Tiny's answer, or the scene's narration when it declines or writes nothing useful. */
export function preferAnswer(answer: string | undefined, line: string): string {
  const t = (answer ?? "").trim();
  if (t.length < 12 || /i can't|i cannot|لا أستطيع|لا استطيع/i.test(t)) return line;
  return t;
}
