import { DAYS, decide, score, weightedSum } from "../../src/labs/apps/neuron/model";
import { accuracy, epoch, field, makeData, makeNet } from "../../src/labs/apps/playground/model";
import { END, generate, isCopy, nextWords, show, train } from "../../src/labs/apps/minilm/model";
import { rng } from "../../src/labs/kit/rng";

describe("neuron", () => {
  it("computes a weighted sum and can be set to get every day right", () => {
    expect(weightedSum([1, 2, 3], [0.5, -1, 2], 1)).toBeCloseTo(0.5 - 2 + 6 + 1);
    expect(score([0.5, 3, 1], -2, "step")).toBe(DAYS.length); // a known solution
    expect(score([1, 0, 0], 0, "step")).toBeLessThan(DAYS.length); // the starting weights are not one
    expect(decide([0.9, 0.7, 1], [0.5, 3, 1], -2, "sigmoid")).toBe(true);
  });
});

describe("playground", () => {
  it("makes balanced datasets inside the square", () => {
    for (const kind of ["blobs", "circle", "xor", "spiral"] as const) {
      const d = makeData(kind, 160, 0.5);
      expect(d).toHaveLength(160);
      expect(d.filter((p) => p.label === 1)).toHaveLength(80);
      expect(d.every((p) => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1)).toBe(true);
    }
  });

  it("a network with a hidden layer learns the circle; with none it cannot", () => {
    const data = makeData("circle");
    const deep = makeNet({ layers: 1, neurons: 6, act: "tanh" }), flat = makeNet({ layers: 0, neurons: 1, act: "tanh" });
    const r = rng(3);
    for (let i = 0; i < 400; i++) { epoch(deep, data, 0.3, r); epoch(flat, data, 0.3, r); }
    expect(accuracy(deep, data)).toBeGreaterThan(0.95);
    expect(accuracy(flat, data)).toBeLessThan(0.75);
    const f = field(deep, 8);
    expect(f).toHaveLength(64);
    expect(f[3 * 8 + 3]).toBeLessThan(0.5); // centre: inside the circle (label 0)
    expect(f[0]).toBeGreaterThan(0.5); // corner: outside (label 1)
  });
});

describe("minilm", () => {
  const text = "The pupils open their books.\nThe pupils open the window.\nThe teacher opens the door.";
  it("counts which word follows which", () => {
    const m = train(text, 1);
    const afterPupils = nextWords(m, ["the", "pupils"]);
    expect(afterPupils).toEqual([{ word: "open", count: 2, p: 1 }]);
    const afterOpen = nextWords(m, ["open"]);
    expect(afterOpen.map((c) => c.word).sort()).toEqual(["the", "their"]);
    expect(afterOpen.reduce((a, c) => a + c.p, 0)).toBeCloseTo(1);
    expect(nextWords(m, []).find((c) => c.word === "the")?.count).toBe(3);
  });

  it("low temperature takes the most common word; generation stops at the end of a sentence", () => {
    const m = train("a b c.\na b c.\na b d.", 1);
    expect(nextWords(m, ["a", "b"], 0.05)[0]).toMatchObject({ word: "c" });
    expect(nextWords(m, ["a", "b"], 0.05)[0].p).toBeGreaterThan(0.99);
    const out = generate(m, 0.05, () => 0.5);
    expect(out).toEqual(["a", "b", "c"]);
    expect(isCopy(m, out)).toBe(true);
    expect(nextWords(m, ["a", "b", "c"])[0].word).toBe(END);
  });

  it("looks back two words when asked, and keeps the spelling learners typed", () => {
    const m = train("يفتح الطلابُ كتبهم.\nيفتح المعلم الباب.", 2);
    expect(nextWords(m, ["يفتح", "الطلاب"]).map((c) => c.word)).toEqual(["كتبهم"]);
    expect(show(m, ["يفتح", "الطلاب"])).toBe("يفتح الطلابُ");
  });
});
