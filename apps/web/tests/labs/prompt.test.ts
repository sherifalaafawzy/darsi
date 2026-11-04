import { describe, expect, it } from "vitest";
import { INGREDIENTS, promptAnswer, type Lang } from "../../src/labs/apps/prompt/model";

const all: string[][] = Array.from({ length: 32 }, (_, m) => INGREDIENTS.filter((_, i) => (m >> i) & 1));
const langs: Lang[] = ["en", "ar"];

describe("prompt lab: the answer depends on which ingredients are on", () => {
  it("nothing on gives no answer; without a task the AI asks what to do", () => {
    for (const lang of langs) {
      expect(promptAnswer([], lang)).toBe("");
      expect(promptAnswer(["role"], lang)).not.toBe(promptAnswer(["ctx"], lang));
      for (const on of all.filter((o) => o.length && !o.includes("task"))) expect(promptAnswer(on, lang)).toMatch(/\?|؟/);
    }
  });

  it("with a task, every ingredient on its own changes the answer", () => {
    for (const lang of langs) for (const on of all.filter((o) => o.includes("task")))
      for (const k of INGREDIENTS.filter((k) => k !== "task" && !on.includes(k)))
        expect(promptAnswer([...on, k], lang), `${lang} ${on} +${k}`).not.toBe(promptAnswer(on, lang));
  });

  it("the same count of ingredients gives different answers (it's which, not how many)", () => {
    for (const lang of langs) expect(promptAnswer(["task", "role"], lang)).not.toBe(promptAnswer(["task", "ctx"], lang));
  });

  it("order of tapping doesn't matter", () => {
    for (const lang of langs) expect(promptAnswer(["fmt", "task", "role"], lang)).toBe(promptAnswer(["role", "task", "fmt"], lang));
  });

  it("Format numbers three questions of under 20 words; without it the answer is a paragraph", () => {
    for (const lang of langs) for (const on of all.filter((o) => o.includes("task"))) {
      const a = promptAnswer(on, lang);
      const lines = a.split("\n");
      if (on.includes("fmt")) {
        expect(lines).toHaveLength(3);
        lines.forEach((l, i) => {
          expect(l.startsWith(lang === "ar" ? `${"١٢٣"[i]}. ` : `${i + 1}. `)).toBe(true);
          expect(l.split(/\s+/).length - 1).toBeLessThan(20);
        });
      } else expect(lines).toHaveLength(1);
    }
  });

  it("Context removes the lab equipment; Role without Context still assumes it", () => {
    expect(promptAnswer(["role", "task"], "en")).toMatch(/burner/);
    expect(promptAnswer(["role", "task", "ctx"], "en")).not.toMatch(/burner|beaker|thermometer|slide/);
    expect(promptAnswer(["role", "task"], "ar")).toMatch(/موقد/);
    expect(promptAnswer(["role", "task", "ctx"], "ar")).not.toMatch(/موقد|ميزان حرارة|شريحة/);
  });

  it("Language uses everyday words instead of the hard terms", () => {
    expect(promptAnswer(["task"], "en")).toMatch(/precipitation/);
    expect(promptAnswer(["task", "lang"], "en")).not.toMatch(/precipitation|evaporation|condensation/);
    expect(promptAnswer(["task", "lang"], "ar")).not.toMatch(/الهطول|التبخّر|التكثّف/);
  });

  it("Arabic answers have no Latin letters, Western digits or '·'", () => {
    for (const on of all) {
      const a = promptAnswer(on, "ar");
      expect(a).not.toMatch(/[A-Za-z0-9·]/);
      expect(promptAnswer(on, "en")).not.toMatch(/·/);
    }
  });
});
