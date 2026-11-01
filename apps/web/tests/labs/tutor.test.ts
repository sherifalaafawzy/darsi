import { describe, expect, it } from "vitest";
import { usableAnswer } from "../../src/labs/apps/tutor";
import { CONCEPTS, matchConcept, preferAnswer, sceneOf, seedAnswer } from "../../src/labs/apps/tutor/model";

describe("text tutor", () => {
  it("picks a pack scene from the longest phrase", () => {
    expect(matchConcept("How does bubble sort work?")?.id).toBe("array-bubble");
    expect(matchConcept("What is a shortest path?")?.id).toBe("opt-dijkstra");
    expect(matchConcept("اشرح الحساس")?.id).toBe("iot-temperature");
    expect(matchConcept("What is the weather in Kafi?")).toBeNull();
  });

  it("every idea is a canvas scene whose frames a pack can draw", () => {
    for (const c of CONCEPTS) {
      const scene = sceneOf(c.id);
      expect(scene.template).toBe("canvas");
      expect(scene.narration.en.length).toBeGreaterThan(20);
      expect(scene.narration.ar).not.toContain("·");
      const body = JSON.stringify(scene.content);
      expect(body).toMatch(/"type":"(graph|knapsack|signal|trace|array|query|packet)"/);
      expect(body).toContain('"anim"');
    }
  });

  it("hands Tiny a glossary result and keeps the lesson line when Tiny declines", () => {
    const c = matchConcept("Explain HTTPS")!;
    const seeded = seedAnswer("Explain HTTPS", c, "en");
    expect(seeded.tools).toEqual(["glossary"]);
    expect(seeded.turns.at(-1)).toMatchObject({ role: "result" });
    expect(preferAnswer("I can't do that.", c.line.en)).toBe(c.line.en);
    expect(preferAnswer(c.line.en, c.line.en)).toBe(c.line.en);
  });

  it("never shows fluent-looking nonsense over a known scene explanation", () => {
    const line = "A neuron multiplies its inputs by weights, adds a bias, and passes the sum through an activation.";
    expect(usableAnswer("A neuron uses weights and a bias before its activation gives the output.", line, "en")).toBe(true);
    expect(usableAnswer("A small circuit between a panel and a battery stops overcharging.", line, "en")).toBe(false);
    expect(usableAnswer("تضرب الخلية المدخلات في الأوزان وتجمع الانحياز.", line, "en")).toBe(false);
    const ar = "تضرب الخلية العصبية مدخلاتها في الأوزان، ثم تجمع الانحياز وتمرّر الناتج عبر دالة تنشيط.";
    expect(usableAnswer("تستخدم الخلية الأوزان والانحياز ثم دالة تنشيط لإنتاج النتيجة.", ar, "ar")).toBe(true);
  });
});
