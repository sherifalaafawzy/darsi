import { GRADED, pickList, type GradedStep, type Lesson, type Step } from "../content/types";

/** Answer payloads per step type. */
export type Answer =
  | { kind: "choice"; id: string }
  | { kind: "multi"; ids: string[] }
  | { kind: "truefalse"; value: boolean }
  | { kind: "match"; pairs: Record<string, string> } // left index → right index (as strings)
  | { kind: "order"; order: number[] } // original indices in the order the teacher placed them
  | { kind: "fill"; words: Record<number, string> }
  | { kind: "type"; text: string }
  | { kind: "hotspot"; found: string[] };

const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/[ً-ْـ]/g, "").replace(/\s+/g, " ");

/** Pure grading function — shared by the app and the tests. */
export function grade(step: GradedStep, a: Answer, lang: string): boolean {
  switch (step.type) {
    case "choice": case "image": return a.kind === "choice" && a.id === step.answer;
    case "multi": return a.kind === "multi" && a.ids.length === step.answers.length && step.answers.every((x) => a.ids.includes(x));
    case "truefalse": return a.kind === "truefalse" && a.value === step.answer;
    case "match": return a.kind === "match" && step.pairs.every((_, i) => a.pairs[String(i)] === String(i));
    case "order": return a.kind === "order" && a.order.every((v, i) => v === i);
    case "fill": { const ans = pickList(step.answers, lang); return a.kind === "fill" && ans.every((w, i) => a.words[i] === w); }
    case "type": return a.kind === "type" && pickList(step.accept, lang).concat(step.accept.en).some((x) => norm(x) === norm(a.text));
    case "hotspot": return a.kind === "hotspot" && step.spots.every((s) => a.found.includes(s.id));
  }
}

export const isGraded = (s: Step): s is GradedStep => GRADED.has(s.type);

/** Plays the lesson's steps, then re-queues graded questions answered wrong once ("Let's try that one again"). */
export class LessonRun {
  readonly queue: Step[];
  private retried = new Set<string>();
  results: Record<string, boolean> = {};
  index = 0;
  readonly startedAt = Date.now();
  constructor(readonly lesson: Lesson) { this.queue = [...lesson.steps]; }
  get current(): Step | undefined { return this.queue[this.index]; }
  get progress(): number { return Math.round((this.index / this.queue.length) * 100); }
  get isRetry(): boolean { return this.index >= this.lesson.steps.length; }
  record(step: GradedStep, correct: boolean) {
    if (!(step.id in this.results)) this.results[step.id] = correct; // first try counts for accuracy
    if (!correct && !this.retried.has(step.id)) { this.retried.add(step.id); this.queue.push(step); }
  }
  next() { this.index++; }
  get done() { return this.index >= this.queue.length; }
  summary() {
    const vals = Object.values(this.results);
    const accuracy = vals.length ? vals.filter(Boolean).length / vals.length : 1;
    return { accuracy, xp: 10 + Math.round(accuracy * 20), seconds: Math.round((Date.now() - this.startedAt) / 1000) };
  }
}

/** Fisher–Yates with a seed so the same lesson shuffles the same way during a session. */
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)), ((h >>> 0) % 10000) / 10000);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (a.length > 1 && a.every((x, i) => x === items[i])) [a[0], a[1]] = [a[1], a[0]]; // never present already-solved
  return a;
}
