import { describe, expect, it } from "vitest";
import { approximateTokens, classify } from "@darsi/design-system";

// The classifier and tokens labs have no model of their own: these pin the claims their "Try this" steps make.
const EN = [{ examples: ["Meeting moved to Tuesday", "Exam timetable attached"] }, { examples: ["Your account will be closed click now", "You won a prize send your PIN"] }];
const AR = [{ examples: ["الاجتماع يوم الثلاثاء", "جدول الامتحانات مرفق"] }, { examples: ["حسابك سيغلق اضغط الآن", "ربحت جائزة أرسل رقمك السري"] }];

describe("classifier lab", () => {
  it("the starting test is phishing", () => {
    expect(classify("Click now to keep your account", EN).best).toBe(1);
    expect(classify("اضغط الآن للحفاظ على حسابك", AR).best).toBe(1);
  });
  it("a message with no known words is a 50% guess, until it is added as an example", () => {
    for (const [t, c] of [["Confirm the bank password today", EN], ["أكد كلمة سر البنك اليوم", AR]] as const) {
      expect(classify(t, c).confidence).toBe(0.5);
      expect(classify(t, [c[0], { examples: [...c[1].examples, t] }]).best).toBe(1);
    }
  });
  it("a phishing message with safe words is called safe", () => {
    for (const [t, c] of [["Click now to see the exam timetable", EN], ["اضغط الآن لترى جدول امتحانات يوم الثلاثاء", AR]] as const) {
      const r = classify(t, c);
      expect(r.best).toBe(0);
      expect(r.confidence).toBeGreaterThan(0.5);
    }
  });
});

describe("tokens lab", () => {
  it("short words are one token, long ones several, punctuation its own", () => {
    expect(approximateTokens("cat")).toHaveLength(1);
    expect(approximateTokens("photosynthesis").length).toBeGreaterThan(1);
    expect(approximateTokens("teach")).toHaveLength(1);
    expect(approximateTokens("teachers")).toHaveLength(2);
    expect(approximateTokens("cat, dog.")).toEqual(["cat", ",", "dog", "."]);
  });
});
