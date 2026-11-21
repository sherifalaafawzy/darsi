import { describe, expect, it } from "vitest";
import { cleanRow, summarize } from "../src/summary";
import { lessonGraded } from "../src/courses";

describe("summarize", () => {
  it("adds up lessons, time, tracks and each competency's evidence and accuracy", () => {
    const s = summarize([
      { accuracy: 0.8, xp: 26, seconds: 300, completedAt: "2026-10-28T09:00:00Z", unitId: "ai-s1", track: "ai", competencies: ["S.TA.U", "S.HM.U"] },
      { accuracy: 0.5, xp: 20, seconds: 600, completedAt: "2026-10-30T09:00:00Z", unitId: "ai-s1", track: "ai", competencies: ["S.TA.U"] },
      { accuracy: 1, xp: 30, seconds: 999999, completedAt: "2026-10-31T09:00:00Z", unitId: "iot-s1", track: "iot", competencies: ["IOT.1"] },
    ], new Date("2026-11-01T12:00:00Z"));
    expect(s.lessonsDone).toBe(3);
    expect(s.graded).toBe(3);
    expect(s.xp).toBe(76);
    expect(s.avgAccuracy).toBeCloseTo(0.7667, 3);
    expect(s.seconds).toBe(300 + 600 + 86400); // one lesson left open all day counts as a day at most
    expect(s.competencies).toEqual({ "S.TA.U": 2, "S.HM.U": 1, "IOT.1": 1 });
    expect(s.compAcc).toEqual({ "S.TA.U": 1.3, "S.HM.U": 0.8, "IOT.1": 1 });
    expect(s.tracks).toEqual({ ai: { n: 2, acc: 1.3, sec: 900, g: 2 }, iot: { n: 1, acc: 1, sec: 86400, g: 1 } });
    expect(s.units).toEqual({ "ai-s1": 2, "iot-s1": 1 });
    expect(s.weeks).toEqual({ "2026-W44": 3 });
    expect(s.lastActive).toBe("2026-10-31T09:00:00Z");
  });
  it("is empty without lessons", () => {
    expect(summarize([])).toMatchObject({ lessonsDone: 0, graded: 0, avgAccuracy: 0, seconds: 0, lastActive: null, tracks: {}, weeks: {} });
  });

  // FC-06: a lesson with nothing marked right or wrong (a project, a capstone stage) records accuracy 1; it is done, not a score.
  it("counts an ungraded lesson as done, but never as a score or as competency evidence", () => {
    const s = summarize([
      { accuracy: 0.6, xp: 22, seconds: 300, completedAt: "2026-10-28T09:00:00Z", unitId: "ai-capstone", track: "ai", competencies: ["S.SD.A"] },
      { accuracy: 1, xp: 30, seconds: 900, completedAt: "2026-10-30T09:00:00Z", unitId: "ai-capstone", track: "ai", competencies: ["S.SD.A", "S.ET.A"], graded: false },
    ], new Date("2026-11-01T12:00:00Z"));
    expect(s).toMatchObject({ lessonsDone: 2, graded: 1, xp: 52, seconds: 1200, units: { "ai-capstone": 2 }, weeks: { "2026-W44": 2 } });
    expect(s.avgAccuracy).toBeCloseTo(0.6, 5);
    expect(s.tracks).toEqual({ ai: { n: 2, acc: 0.6, sec: 1200, g: 1 } });
    expect(s.competencies).toEqual({ "S.SD.A": 1 });
    expect(s.compAcc).toEqual({ "S.SD.A": 0.6 });
  });
  it("with only ungraded lessons, nothing is graded: no accuracy to show", () => {
    const s = summarize([{ accuracy: 1, xp: 30, seconds: 60, completedAt: "2026-10-30T09:00:00Z", unitId: "ai-capstone", track: "ai", competencies: ["S.SD.A"], graded: false }]);
    expect(s).toMatchObject({ lessonsDone: 1, graded: 0, avgAccuracy: 0, competencies: {}, compAcc: {} });
  });
  it("marks a row ungraded only from the published lesson, never from the phone", () => {
    const meta = { unitId: "ai-capstone", track: "ai", competencies: ["S.SD.A"] };
    expect(cleanRow({ accuracy: 1, xp: 30, seconds: 60, completedAt: "x", graded: false }, meta)).not.toHaveProperty("graded");
    expect(cleanRow({ accuracy: 1, xp: 30, seconds: 60, completedAt: "x" }, { ...meta, graded: false })).toMatchObject({ graded: false });
    expect(cleanRow({ accuracy: 1, xp: 30, seconds: 60, completedAt: "x" }, { ...meta, graded: true })).not.toHaveProperty("graded");
  });
  it("a lesson is graded when one of its steps is marked right or wrong", () => {
    expect(lessonGraded({ steps: [{ type: "reading" }, { type: "choice" }] })).toBe(true);
    expect(lessonGraded({ steps: [{ type: "reading" }, { type: "project" }, { type: "reflection" }] })).toBe(false);
    expect(lessonGraded({})).toBe(false);
  });
});
