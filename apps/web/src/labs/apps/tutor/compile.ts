/**
 * Reads a typed question into the same scene JSON the scene model writes.
 * Names and numbers are copied from the question. A question with no picture in it returns null.
 */
import { parseScene, type SceneSpec } from "./expand";

const digits = (s: string) => s
  .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

const NAME = "[\\p{L}][\\p{L}]{1,23}";

/**
 * The question is trying to name a picture, but the numbers are not a scene we can draw.
 * "Sort 4,234" is one of these: a sort needs three to six numbers, each up to 99.
 */
export function pictureHint(text: string): "sort" | "bag" | "graph" | null {
  if (compileQuestion(text)) return null;
  const q = digits(text);
  if (!/\d/.test(q)) return null;
  if (/sort|bubble|رتب|ترتيب/i.test(q)) return "sort";
  if (/pack|truck|knapsack|حقيب|شاحن/i.test(q)) return "bag";
  if (new RegExp(`${NAME}\\s*(?:-|–|—|\\bto\\b|إلى)\\s*${NAME}`, "iu").test(q)) return "graph";
  return null;
}

/** A scene spec copied out of the question, or null when the question does not describe one. */
export function compileQuestion(text: string): SceneSpec | null {
  const embedded = parseScene(text);
  if (embedded) return embedded;
  const q = digits(text);
  return compileSort(q) ?? compileBag(q) ?? compileGraph(q);
}

function compileSort(q: string): SceneSpec | null {
  if (!/sort|bubble|رتب|ترتيب/i.test(q)) return null;
  const values = [...q.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n <= 99);
  if (values.length < 3 || values.length > 6) return null;
  return { kind: "sort", values };
}

function compileBag(q: string): SceneSpec | null {
  if (!/pack|truck|knapsack|حقيب|شاحن/i.test(q)) return null;
  const capM = /(?:capacity|حمولة|سعة)\s+(\d+)/i.exec(q);
  if (!capM) return null;
  const cap = Number(capM[1]);
  const items: [string, number, number][] = [];
  for (const m of q.matchAll(new RegExp(`(${NAME})\\s+(\\d+)\\s+(\\d+)`, "gu"))) {
    if (/capacity|حمولة|سعة/i.test(m[1])) continue;
    items.push([m[1], Number(m[2]), Number(m[3])]);
  }
  if (items.length < 2 || items.length > 5 || cap < 1 || cap > 99) return null;
  return { kind: "bag", items, cap };
}

function compileGraph(q: string): SceneSpec | null {
  const found: { a: string; b: string; w: number }[] = [];
  const re = new RegExp(`(${NAME})\\s*(?:-|–|—|\\bto\\b|إلى)\\s*(${NAME})\\s+(\\d+)`, "giu");
  for (const m of q.matchAll(re)) found.push({ a: m[1], b: m[2], w: Number(m[3]) });
  if (found.length < 2 || found.length > 10) return null;
  const nodes: string[] = [];
  const id = (name: string) => {
    const hit = nodes.findIndex((n) => n.toLowerCase() === name.toLowerCase());
    if (hit >= 0) return hit;
    nodes.push(name);
    return nodes.length - 1;
  };
  const edges = found.map((e) => [id(e.a), id(e.b), e.w] as [number, number, number]);
  if (nodes.length < 3 || nodes.length > 6) return null;
  if (edges.some(([, , w]) => w < 1 || w > 99)) return null;
  let from = 0, to = nodes.length - 1;
  const ends = /(?:\bfrom\b|من)\s+(\S+)\s+(?:\bto\b|إلى)\s+(\S+)/i.exec(q);
  if (ends) {
    const a = nodes.findIndex((n) => n.toLowerCase() === ends[1].toLowerCase());
    const b = nodes.findIndex((n) => n.toLowerCase() === ends[2].replace(/[.,،]/g, "").toLowerCase());
    if (a >= 0 && b >= 0 && a !== b) { from = a; to = b; }
  }
  return { kind: "graph", nodes, edges, from, to };
}
