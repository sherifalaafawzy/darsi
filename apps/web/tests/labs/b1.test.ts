import { apply, curve, FNS, RANGE } from "../../src/labs/apps/activation/model";
import { mistakes, preset as points, trainAll } from "../../src/labs/apps/perceptron/model";
import { best, data, loss, step } from "../../src/labs/apps/gradient/model";
import { backward, error, forward, START, train as trainNet, type W } from "../../src/labs/apps/backprop/model";
import { fit, mse, sample } from "../../src/labs/apps/overfit/model";
import { brighten, invert, level, N as PN, preset, shift } from "../../src/labs/apps/pixels/model";
import { at, convolve, KERNELS, N as CN, picture, pool } from "../../src/labs/apps/convolution/model";
import { accuracy, batch, draw, isBlank, makeNet, normalize, RATE, SHAPES, starters } from "../../src/labs/apps/shapes/model";

describe("activation", () => {
  it("each function stays in its range and keeps its shape", () => {
    for (const f of FNS) for (const [, y] of curve(f)) {
      const [lo, hi] = RANGE[f];
      expect(y).toBeGreaterThanOrEqual(lo - 1e-9);
      if (hi !== null) expect(y).toBeLessThanOrEqual(hi + 1e-9);
    }
    expect(apply.step(-0.1)).toBe(0); expect(apply.step(0.1)).toBe(1);
    expect(apply.sigmoid(0)).toBeCloseTo(0.5); expect(apply.tanh(0)).toBeCloseTo(0);
    expect(apply.relu(-3)).toBe(0); expect(apply.relu(3)).toBe(3);
  });
});

describe("perceptron", () => {
  it("finds a line for separable points and never for XOR", () => {
    for (const kind of ["easy", "close"] as const) {
      const pts = points(kind), r = trainAll(pts, 0.2, 500);
      expect(r.converged).toBe(true);
      expect(mistakes(r.n, pts)).toBe(0);
    }
    const xor = points("xor"), r = trainAll(xor, 0.2, 200);
    expect(r.converged).toBe(false);
    expect(mistakes(r.n, xor)).toBeGreaterThan(0);
  });
});

describe("gradient descent", () => {
  const pts = data();
  const run = (rate: number, n = 200) => { let l = { m: 0, c: 0 }; for (let i = 0; i < n; i++) l = step(l, pts, rate); return l; };
  it("a good rate reaches the best line; a huge one blows up", () => {
    const b = best(pts), l = run(0.6);
    expect(l.m).toBeCloseTo(b.m, 2); expect(l.c).toBeCloseTo(b.c, 2);
    expect(loss(run(0.05, 20), pts)).toBeGreaterThan(loss(l, pts)); // too small: still far after 20 steps
    expect(loss(run(1.9, 60), pts)).toBeGreaterThan(loss({ m: 0, c: 0 }, pts)); // too big: worse than where it started
  });
});

describe("backprop", () => {
  it("its blame for every weight matches a numerical slope", () => {
    const x: [number, number] = [1, 0.5], t = 1, { g } = backward(START, x, t), h = 1e-6;
    for (const key of Object.keys(START) as (keyof W)[]) {
      const up = error(forward({ ...START, [key]: START[key] + h }, x).y, t), down = error(forward({ ...START, [key]: START[key] - h }, x).y, t);
      expect(g[key]).toBeCloseTo((up - down) / (2 * h), 6);
    }
  });
  it("learning lowers the error", () => {
    const x: [number, number] = [1, 0.5], before = error(forward(START, x).y, 1), after = error(forward(trainNet(START, x, 1, 1, 100), x).y, 1);
    expect(after).toBeLessThan(before / 2);
  });
});

describe("overfitting", () => {
  it("a curve through every point does worse on new points than a simple one", () => {
    const train = sample(8, 0.15, 3), test = sample(60, 0.15, 99);
    const wiggly = fit(train, train.length - 1), simple = fit(train, 3);
    expect(mse(wiggly, train)).toBeLessThan(1e-4); // goes through every training point
    expect(mse(wiggly, test)).toBeGreaterThan(mse(simple, test));
    expect(mse(fit(train, 1), train)).toBeGreaterThan(mse(simple, train)); // a straight line underfits
  });
});

describe("pixels", () => {
  it("edits are maths on the numbers", () => {
    const img = preset("house");
    expect(img.length).toBe(PN * PN);
    expect(invert(invert(img))).toEqual(img);
    expect(Math.max(...brighten(img, 2))).toBe(1);
    const moved = shift(img);
    for (let r = 0; r < PN; r++) { expect(moved[r * PN]).toBe(0); for (let c = 1; c < PN; c++) expect(moved[r * PN + c]).toBe(img[r * PN + c - 1]); }
    expect([level(0), level(0.5), level(1), level(3)]).toEqual([0, 5, 9, 9]);
  });
});

describe("convolution", () => {
  const img = picture();
  it("the identity filter changes nothing; blur keeps flat areas flat", () => {
    expect(convolve(img, [0, 0, 0, 0, 1, 0, 0, 0, 0])).toEqual(img);
    const flat = new Float32Array(CN * CN).fill(0.5), out = convolve(flat, KERNELS.blur);
    expect(out[5 * CN + 5]).toBeCloseTo(0.5); expect(out[0]).toBeCloseTo(0.5 * 4 / 9); // the corner sees 4 of 9 pixels
  });
  it("the upright-edge filter fires on a wall and stays quiet on flat ground", () => {
    const wall = new Float32Array(CN * CN).map((_, i) => (i % CN >= 12 ? 1 : 0));
    expect(Math.abs(at(wall, KERNELS.vertical, 10, 12))).toBeGreaterThan(3);
    expect(at(wall, KERNELS.vertical, 10, 4)).toBe(0);
    expect(at(wall, KERNELS.horizontal, 10, 12)).toBe(0);
  });
  it("pooling halves the size and keeps the strongest value", () => {
    const p = pool(img);
    expect(p.length).toBe((CN / 2) ** 2);
    expect(p[0]).toBe(Math.max(img[0], img[1], img[CN], img[CN + 1]));
  });
});

describe("shapes", () => {
  it("normalising moves and resizes a drawing but keeps it", () => {
    const d = draw("circle", 5), n = normalize(d);
    expect(isBlank(n)).toBe(false);
    expect(normalize(normalize(d)).reduce((a, v) => a + v, 0)).toBeCloseTo(n.reduce((a, v) => a + v, 0), 0);
    expect(isBlank(normalize(new Float32Array(144)))).toBe(true);
  });
  it("learns the starter drawings and recognises new ones", () => {
    const ex = starters(), net = makeNet(), { X, T } = batch(ex);
    let l = 1, n = 0;
    while (l >= 0.02 && n++ < 600) l = net.train(X, T, RATE);
    expect(l).toBeLessThan(0.02);
    expect(accuracy(net, ex)).toBe(1);
    const fresh = SHAPES.flatMap((shape, k) => Array.from({ length: 20 }, (_, i) => ({ shape, img: draw(shape, 77000 + k * 100 + i) })));
    expect(accuracy(net, fresh)).toBeGreaterThan(0.85);
  });
});
