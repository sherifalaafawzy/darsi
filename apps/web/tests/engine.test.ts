import { grade, LessonRun, shuffled } from "../src/lesson/engine";
import unit from "../../../content/retired/ai-1.json";
import type { Unit, GradedStep } from "../src/content/types";
import { isoWeek, streakWeeks, initialState } from "../src/state/store";

const u = unit as unknown as Unit;
const step = (id: string) => u.lessons[0].steps.find((s) => s.id === id) as GradedStep;

describe("grading", () => {
  it("choice", () => { expect(grade(step("q1"), { kind: "choice", id: "b" }, "en")).toBe(true); expect(grade(step("q1"), { kind: "choice", id: "a" }, "en")).toBe(false); });
  it("multi needs exactly the right set", () => {
    expect(grade(step("q2"), { kind: "multi", ids: ["d", "a", "b"] }, "en")).toBe(true);
    expect(grade(step("q2"), { kind: "multi", ids: ["a", "b"] }, "en")).toBe(false);
  });
  it("match", () => { expect(grade(step("q5"), { kind: "match", pairs: { 0: "0", 1: "1", 2: "2" } }, "en")).toBe(true); });
  it("type answers ignore case and Arabic diacritics", () => {
    const s = u.lessons[1].steps.find((x) => x.id === "q4") as GradedStep;
    expect(grade(s, { kind: "type", text: " Token " }, "en")).toBe(true);
    expect(grade(s, { kind: "type", text: "رُمُوز" }, "ar")).toBe(true);
  });
  it("fill uses the teacher's language", () => {
    const s = u.lessons[1].steps.find((x) => x.id === "q2") as GradedStep;
    expect(grade(s, { kind: "fill", words: { 0: "رمزًا", 1: "التالية" } }, "ar")).toBe(true);
  });
});

describe("LessonRun", () => {
  it("re-queues a wrong answer once and counts the first try for accuracy", () => {
    const run = new LessonRun(u.lessons[0]);
    const q = step("q1");
    run.record(q, false); run.record(q, true);
    expect(run.queue.filter((s) => s.id === "q1")).toHaveLength(2);
    expect(run.summary().accuracy).toBe(0);
  });
  it("shuffle never returns the solved order", () => { expect(shuffled([1, 2], "x")).not.toEqual([1, 2]); });
});

describe("teaching-week streak", () => {
  it("counts consecutive weeks meeting the goal and forgives the current week", () => {
    const now = new Date("2026-10-21");
    const last = new Date(now); last.setDate(now.getDate() - 7);
    const prev = new Date(now); prev.setDate(now.getDate() - 14);
    const s = { ...initialState, weeklyLessons: 4, weeks: { [isoWeek(last)]: 2, [isoWeek(prev)]: 3 } };
    expect(streakWeeks(s, now)).toBe(2);
  });
});

describe("content integrity", () => {
  it("every lesson has slides, a kit, and bilingual titles", () => {
    for (const l of u.lessons) { expect(l.slides.length).toBeGreaterThan(3); expect(l.kit.length).toBeGreaterThan(0); expect(l.title.ar).toBeTruthy(); }
  });
});
