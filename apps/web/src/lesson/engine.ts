import { GRADED, pickList, type CodeLang, type GradedStep, type Lesson, type RobotBlock, type Step } from "../content/types";
import { runRobot } from "../content/robot";

/** Answer payloads per step type. */
export type Answer =
  | { kind: "choice"; id: string }
  | { kind: "multi"; ids: string[] }
  | { kind: "truefalse"; value: boolean }
  | { kind: "match"; pairs: Record<string, string> } // left index → right index (as strings)
  | { kind: "order"; order: number[] } // original indices in the order the teacher placed them
  | { kind: "fill"; words: Record<number, string> }
  | { kind: "type"; text: string }
  | { kind: "hotspot"; found: string[] }
  | { kind: "code"; passed: boolean } // the tests' verdict, from the sandbox
  | { kind: "parsons"; lines: string[] } // in the learner's order, each with its indent (4 spaces per level)
  | { kind: "codefill"; tokens: Record<number, string> }
  | { kind: "bug"; line: number }
  | { kind: "blocks"; program: RobotBlock[] };

/** A Parsons line in place: the same text and, in Python, the same indent. */
const sameLine = (want: string, got: string | undefined, lang: CodeLang) => got !== undefined && want.trim() === got.trim()
  && (lang !== "python" || want.length - want.trimStart().length === got.length - got.trimStart().length);
// Arabic keyboards type ٠–٩ (Persian ones ۰–۹), the Arabic decimal point, thousands separator and percent sign: "٨" is
// the answer 8 in any UI language, as in the code steps (code/harness.ts codeChar).
const ARABIC_NUM = /[٠-٬۰-۹]/g;
const ARABIC_SIGN: Record<string, string> = { "٪": "%", "٫": ".", "٬": "," };
const asciiNum = (c: string) => { const n = c.charCodeAt(0); return n <= 0x669 ? String(n - 0x660) : n >= 0x6f0 ? String(n - 0x6f0) : ARABIC_SIGN[c]; };
// Direction marks and isolates (around code in Arabic text, scripts/lib/isolates.mjs) are invisible: never part of an answer.
export const norm = (s: string) => s.normalize("NFKC").replace(/[‎‏⁦-⁩]/g, "").replace(ARABIC_NUM, asciiNum).trim().toLowerCase().replace(/[ً-ْـ]/g, "").replace(/\s+/g, " ");

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
    case "code": return a.kind === "code" && a.passed;
    case "parsons": return a.kind === "parsons" && a.lines.length === step.lines.length && step.lines.every((l, i) => sameLine(l, a.lines[i], step.lang));
    case "codefill": return a.kind === "codefill" && step.answers.every((w, i) => a.tokens[i] === w);
    case "bug": return a.kind === "bug" && a.line === step.line;
    case "blocks": return a.kind === "blocks" && a.program.length <= step.maxBlocks && runRobot(step.world, a.program).outcome === "goal";
  }
}

export const isGraded = (s: Step): s is GradedStep => GRADED.has(s.type);

/**
 * A lesson in progress, as kept on the phone (saveRun) so a reload, Back, or a tab the phone closed to save memory
 * picks it up where it was: the steps (the lesson's, then any re-queued questions), the place, the first-try results,
 * and the seconds spent. Finishing still means reaching the end; nothing here counts a lesson as done.
 */
export interface RunSnapshot { v: 1; ids: string[]; index: number; results: Record<string, boolean>; retried: string[]; seconds: number; at: number }

/** Plays the lesson's steps, then re-queues graded questions answered wrong once ("Let's try that one again"). */
export class LessonRun {
  readonly queue: Step[];
  private retried = new Set<string>();
  results: Record<string, boolean> = {};
  index = 0;
  startedAt = Date.now();
  constructor(readonly lesson: Lesson) { this.queue = [...lesson.steps]; }
  snapshot(now = Date.now()): RunSnapshot {
    return { v: 1, ids: this.queue.map((s) => s.id), index: this.index, results: { ...this.results }, retried: [...this.retried], seconds: Math.max(0, Math.round((now - this.startedAt) / 1000)), at: now };
  }
  /**
   * The run a snapshot describes, or null when it doesn't fit this lesson any more (republished with other steps), is
   * unreadable, or has nothing to pick up (still on the first step).
   */
  static restore(lesson: Lesson, snap: unknown, now = Date.now()): LessonRun | null {
    if (!snap || typeof snap !== "object") return null;
    const s = snap as Partial<RunSnapshot>;
    const own = lesson.steps.map((x) => x.id);
    const graded = new Map(lesson.steps.filter(isGraded).map((x) => [x.id, x]));
    if (s.v !== 1 || !Array.isArray(s.ids) || !Array.isArray(s.retried) || !s.results || typeof s.results !== "object") return null;
    if (s.ids.length < own.length || own.some((id, i) => s.ids![i] !== id)) return null;
    const again = s.ids.slice(own.length);
    const retried = new Set(s.retried);
    if (retried.size !== again.length || new Set(again).size !== again.length || again.some((id) => !graded.has(id) || !retried.has(id))) return null;
    if (!Number.isInteger(s.index) || s.index! < 1 || s.index! >= s.ids.length) return null;
    const results = Object.entries(s.results);
    if (results.some(([id, ok]) => !graded.has(id) || typeof ok !== "boolean")) return null;
    const run = new LessonRun(lesson);
    for (const id of again) run.queue.push(graded.get(id)!);
    run.retried = retried;
    run.results = Object.fromEntries(results) as Record<string, boolean>;
    run.index = s.index!;
    run.startedAt = now - Math.min(Math.max(0, Number(s.seconds) || 0), 24 * 3600) * 1000;
    return run;
  }
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

/**
 * Lessons in progress on this phone: one small localStorage entry per person ("guest" or the account uid) and lesson,
 * read once when the lesson opens and written when an answer is checked or a step is left; never synced. A day old,
 * it is dropped. localStorage, not IndexedDB: the run is built synchronously when the lesson opens.
 */
const RUN_PREFIX = "darsi:run:";
export const RUN_MAX_AGE = 24 * 3600 * 1000;
const runKey = (scope: string, lessonId: string) => `${RUN_PREFIX}${scope}:${lessonId}`;
export function saveRun(scope: string, lessonId: string, snap: RunSnapshot): void {
  try { localStorage.setItem(runKey(scope, lessonId), JSON.stringify(snap)); } catch { /* storage full or blocked: this visit only */ }
}
export function clearRun(scope: string, lessonId: string): void {
  try { localStorage.removeItem(runKey(scope, lessonId)); } catch { /* blocked */ }
}
/** The snapshot of a lesson in progress, if one younger than a day is kept. Older ones of this person are dropped. */
export function loadRun(scope: string, lessonId: string, now = Date.now()): RunSnapshot | null {
  try {
    const mine = `${RUN_PREFIX}${scope}:`;
    let found: RunSnapshot | null = null;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(mine)) continue;
      let snap: RunSnapshot | null = null;
      try { snap = JSON.parse(localStorage.getItem(key) ?? "null") as RunSnapshot | null; } catch { /* unreadable */ }
      const fresh = !!snap && typeof snap.at === "number" && now - snap.at < RUN_MAX_AGE && snap.at <= now + 60_000;
      if (!fresh) localStorage.removeItem(key);
      else if (key === runKey(scope, lessonId)) found = snap;
    }
    return found;
  } catch { return null; }
}
/**
 * "Reset progress on this device": lessons in progress go too (every person's, when no scope is given). Signing out of
 * a shared phone (auth/AuthProvider) clears the account's own.
 */
export function clearRuns(scope?: string): void {
  try {
    const prefix = scope ? `${RUN_PREFIX}${scope}:` : RUN_PREFIX;
    for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key?.startsWith(prefix)) localStorage.removeItem(key); }
  } catch { /* blocked */ }
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

/**
 * A question's options for one attempt: the first time in the lesson's own shuffled order (the same on every visit);
 * on the retry ("Let's try that one again", after the answer was shown) in another order, so it can't be answered by
 * position.
 */
export function attemptOrder<T>(items: T[], id: string, attempt: number): T[] {
  const first = shuffled(items, id);
  if (!attempt || items.length < 2) return first;
  const again = shuffled(items, `${id}-${attempt}`);
  return again.every((x, i) => x === first[i]) ? [...again.slice(1), again[0]] : again;
}
