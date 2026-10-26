/**
 * Ids and blank templates for the course editor.
 * Progress, notes and kit anchors are keyed by lesson id, so a lesson id is random and never reused: deleting a lesson
 * and adding another can't hand the new one someone's old progress. Org units always get generated ids ("u" + 8).
 */
import type { LocalText, Lesson, Step, Track, Unit } from "../content/types";

const ABC = "abcdefghijklmnopqrstuvwxyz0123456789";
const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ABC[b % 36]).join("");
export const newUnitId = () => `u${rand(8)}`;
export function newLessonId(unit: Pick<Unit, "id" | "lessons">) {
  const used = new Set(unit.lessons.map((l) => l.id));
  for (;;) { const id = `${unit.id}-${rand(4)}`; if (!used.has(id)) return id; }
}
/** "choice1", "choice2"… unique within the lesson (the lesson engine keys answers and retries by step id). */
export function newStepId(lesson: Pick<Lesson, "steps">, type: Step["type"]) {
  const used = new Set(lesson.steps.map((s) => s.id));
  for (let n = 1; ; n++) if (!used.has(`${type}${n}`)) return `${type}${n}`;
}
/** Next free option id: a, b, c… */
export const nextLetter = (ids: string[]) => [..."abcdefghijklmnopqrstuvwxyz"].find((c) => !ids.includes(c)) ?? `o${ids.length + 1}`;

const LT = (en = "", ar = ""): LocalText => ({ en, ar });

export const blankLesson = (id: string): Lesson => ({ id, title: LT(), minutes: 10, tryTomorrow: LT(), steps: [], slides: [], kit: [], competencies: [] });
export const blankUnit = (id: string, track: Track, level: number, title: LocalText): Unit =>
  ({ id, track, level, title, summary: LT(), lessons: [blankLesson(`${id}-${rand(4)}`)] });

/** A new step: the minimum shape for its type, so the editor can show it and the validator can say what's missing. */
export function blankStep(type: Step["type"], id: string): Step {
  switch (type) {
    case "choice": return { type, id, prompt: LT(), options: [{ id: "a", text: LT() }, { id: "b", text: LT() }], answer: "a" };
    case "multi": return { type, id, prompt: LT(), options: [{ id: "a", text: LT() }, { id: "b", text: LT() }, { id: "c", text: LT() }], answers: ["a"] };
    case "truefalse": return { type, id, prompt: LT(), answer: true };
    case "image": return { type, id, prompt: LT(), options: [{ id: "a", label: LT(), art: "lamp" }, { id: "b", label: LT(), art: "chat" }], answer: "a" };
    case "match": return { type, id, prompt: LT(), pairs: [{ left: LT(), right: LT() }, { left: LT(), right: LT() }] };
    case "order": return { type, id, prompt: LT(), steps: [LT(), LT(), LT()] };
    case "fill": return { type, id, prompt: LT(), sentence: { en: [] }, bank: { en: [] }, answers: { en: [] } };
    case "type": return { type, id, prompt: LT(), accept: { en: [] } };
    case "hotspot": return { type, id, prompt: LT(), mock: { from: "", body: LT(), link: LT() }, spots: [{ id: "s1", x: 5, y: 5, w: 90, h: 30, label: LT() }] };
    case "scenario": return { type, id, prompt: LT(), who: LT(), initial: LT(), situation: LT(),
      choices: [{ id: "a", label: LT(), tone: "good", consequence: LT() }, { id: "b", label: LT(), tone: "consider", consequence: LT() }] };
    case "reflect": return { type, id, prompt: LT() };
    case "video": return { type, id, prompt: LT("Watch", "شاهد"), title: LT(), src: null, duration: 120, sizeMB: 0, transcript: LT() };
    case "lab": return { type, id, prompt: LT("Try it", "جرّب"), tool: "prompt" };
    case "read": return { type, id, prompt: LT("Read", "اقرأ"), title: LT(), body: LT() };
    case "project": return { type, id, prompt: LT(), task: LT(), deliverable: LT(), rubric: [{ criterion: LT() }] };
  }
}

/** An imported unit for an org: fresh unit and lesson ids (step ids stay; they are only unique within a lesson). */
export function withNewIds(unit: Unit, id = newUnitId()): Unit {
  const out: Unit = { ...unit, id, lessons: [] };
  for (const l of unit.lessons) out.lessons.push({ ...l, id: newLessonId(out) });
  return out;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** "Sensors" → "Sensors (copy)" in English and Arabic; other languages keep their text. */
export const copyTitle = (t: LocalText): LocalText => ({ ...t, en: t.en && `${t.en} (copy)`, ...(t.ar ? { ar: `${t.ar} (نسخة)` } : {}) });
/** A lesson under a new id in `unit` (a copy never shares progress, notes or kit anchors with the original). */
export const copyLesson = (l: Lesson, unit: Pick<Unit, "id" | "lessons">): Lesson => ({ ...clone(l), id: newLessonId(unit) });
/** A step under a new id in `lesson`; a video's pause question follows its step's id. */
export function copyStep(s: Step, lesson: Pick<Lesson, "steps">): Step {
  const c = { ...clone(s), id: newStepId(lesson, s.type) } as Step;
  if (c.type === "video" && c.checkpoint) c.checkpoint = { ...c.checkpoint, question: { ...c.checkpoint.question, id: `${c.id}-q` } };
  return c;
}
