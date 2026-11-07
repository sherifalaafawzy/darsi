import { describe, expect, it } from "vitest";
import { asksAgain, isFollowUp, usableAnswer } from "../../src/labs/apps/tutor";
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

  it("hears a plea to explain the last idea again, in both languages, and nothing else", () => {
    for (const q of ["I still don't understand. Explain it again.", "I still don’t understand", "Can you say it more simply?", "One more time, please"]) expect(asksAgain(q), q).toBe(true);
    for (const q of ["ما زلت لا أفهم. اشرح مرة أخرى.", "لم أفهم", "اشرحها بشكل أبسط", "زدني"]) expect(asksAgain(q), q).toBe(true);
    // A message that names an idea is a new question, whatever words it shares with a plea.
    for (const q of ["Help me understand HTTPS", "Can you give an example of a for loop?", "Tell me more about memory", "Explain bubble sort again", "Sort 4, 2, 5, 1 again"]) expect(asksAgain(q), q).toBe(false);
    for (const q of ["أريد أن أفهم HTTPS", "أعطني مثالًا عن HTTPS"]) expect(asksAgain(q), q).toBe(false);
    // "understand", "more" and "example" on their own are not pleas.
    expect(isFollowUp("Help me understand")).toBe(false);
    expect(isFollowUp("Give me an example")).toBe(false);
  });
});
