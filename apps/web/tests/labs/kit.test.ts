import { Net } from "../../src/labs/kit/nn";
import { rng } from "../../src/labs/kit/rng";
import { argmax, sample, softmax } from "../../src/labs/kit/math";
import { matchKey, sentences, words } from "../../src/labs/kit/text";

describe("rng", () => {
  it("is repeatable for a seed and spread over [0, 1)", () => {
    const a = rng(7), b = rng(7);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length - 0.5)).toBeLessThan(0.05);
  });
});

describe("Net", () => {
  it("backprop matches numerical gradients", () => {
    for (const [hidden, output] of [["tanh", "sigmoid"], ["relu", "softmax"], ["sigmoid", "linear"]] as const) {
      const net = new Net({ sizes: [3, 4, 2], hidden, output, seed: 3 });
      const X = [[0.2, -0.5, 0.9], [-0.7, 0.1, 0.3]];
      const T = output === "softmax" ? [[1, 0], [0, 1]] : output === "sigmoid" ? [[1, 0], [0, 1]] : [[0.3, -0.2], [0.5, 0.1]];
      const g = net.grads(X, T);
      const eps = 1e-6;
      for (const [l, i] of [[0, 0], [0, 5], [1, 3], [1, 7]]) {
        const w = net.W[l][i];
        net.W[l][i] = w + eps; const up = net.loss(X, T);
        net.W[l][i] = w - eps; const down = net.loss(X, T);
        net.W[l][i] = w;
        expect(g.gW[l][i]).toBeCloseTo((up - down) / (2 * eps), 5);
      }
      const bias = net.b[1][1];
      net.b[1][1] = bias + eps; const up = net.loss(X, T); net.b[1][1] = bias - eps; const down = net.loss(X, T); net.b[1][1] = bias;
      expect(g.gb[1][1]).toBeCloseTo((up - down) / (2 * eps), 5);
    }
  });

  it("learns XOR, which one neuron cannot", () => {
    const net = new Net({ sizes: [2, 4, 1], hidden: "tanh", output: "sigmoid", seed: 1 });
    const X = [[0, 0], [0, 1], [1, 0], [1, 1]], T = [[0], [1], [1], [0]];
    for (let i = 0; i < 3000; i++) net.train(X, T, 0.5);
    expect(X.map((x) => Math.round(net.predict(x)[0]))).toEqual([0, 1, 1, 0]);
    expect(net.loss(X, T)).toBeLessThan(0.1);
  });
});

describe("math", () => {
  it("softmax sums to 1 and sharpens with low temperature", () => {
    const p = softmax([1, 2, 3]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(softmax([1, 2, 3], 0.1)[2]).toBeGreaterThan(0.99);
    expect(argmax(p)).toBe(2);
    expect(sample([0.2, 0.5, 0.3], 0.1)).toBe(0);
    expect(sample([0.2, 0.5, 0.3], 0.69)).toBe(1);
    expect(sample([0.2, 0.5, 0.3], 0.71)).toBe(2);
  });
});

describe("text", () => {
  it("splits English and Arabic and matches without diacritics", () => {
    expect(words("The pupils' books, today!")).toEqual(["The", "pupils'", "books", "today"]);
    expect(words("يفتح الطلابُ كتبَهم")).toEqual(["يفتح", "الطلابُ", "كتبَهم"]);
    expect(matchKey("الطلابُ")).toBe(matchKey("الطلاب"));
    expect(matchKey("أحمد")).toBe(matchKey("احمد"));
    expect(sentences("One. Two? ثلاثة؟ أربعة")).toEqual(["One", "Two", "ثلاثة", "أربعة"]);
  });
});
