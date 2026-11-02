import { describe, expect, it } from "vitest";
import { summarize } from "../src/summary";

describe("summarize", () => {
  it("adds up lessons, time, tracks and each competency's evidence and accuracy", () => {
    const s = summarize([
      { accuracy: 0.8, xp: 26, seconds: 300, completedAt: "2026-10-28T09:00:00Z", unitId: "ai-s1", track: "ai", competencies: ["S.TA.U", "S.HM.U"] },
      { accuracy: 0.5, xp: 20, seconds: 600, completedAt: "2026-10-30T09:00:00Z", unitId: "ai-s1", track: "ai", competencies: ["S.TA.U"] },
      { accuracy: 1, xp: 30, seconds: 999999, completedAt: "2026-10-31T09:00:00Z", unitId: "iot-s1", track: "iot", competencies: ["IOT.1"] },
    ], new Date("2026-11-01T12:00:00Z"));
    expect(s.lessonsDone).toBe(3);
    expect(s.xp).toBe(76);
    expect(s.avgAccuracy).toBeCloseTo(0.7667, 3);
    expect(s.seconds).toBe(300 + 600 + 86400); // one lesson left open all day counts as a day at most
    expect(s.competencies).toEqual({ "S.TA.U": 2, "S.HM.U": 1, "IOT.1": 1 });
    expect(s.compAcc).toEqual({ "S.TA.U": 1.3, "S.HM.U": 0.8, "IOT.1": 1 });
    expect(s.tracks).toEqual({ ai: { n: 2, acc: 1.3, sec: 900 }, iot: { n: 1, acc: 1, sec: 86400 } });
    expect(s.units).toEqual({ "ai-s1": 2, "iot-s1": 1 });
    expect(s.weeks).toEqual({ "2026-W44": 3 });
    expect(s.lastActive).toBe("2026-10-31T09:00:00Z");
  });
  it("is empty without lessons", () => {
    expect(summarize([])).toMatchObject({ lessonsDone: 0, avgAccuracy: 0, seconds: 0, lastActive: null, tracks: {}, weeks: {} });
  });
});
