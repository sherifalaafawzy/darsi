import { apply, curve, FNS, RANGE } from "../../src/labs/apps/activation/model";
import { MAX_PASSES, mistakes, preset as points, RATE as P_RATE, START as P_START, trainAll } from "../../src/labs/apps/perceptron/model";
import { best, data, grad, loss, MAX_STEPS, RATES, step } from "../../src/labs/apps/gradient/model";
import { backward, error, forward, START, train as trainNet, type W } from "../../src/labs/apps/backprop/model";
import { fit, mse, sample, verdict } from "../../src/labs/apps/overfit/model";
import { brighten, invert, level, N as PN, preset, shift } from "../../src/labs/apps/pixels/model";
import { at, convolve, CUSTOM, display, KERNELS, N as CN, picture, pool } from "../../src/labs/apps/convolution/model";
import { DAYS, decide, score } from "../../src/labs/apps/neuron/model";
import { accuracy, batch, draw, guess, isBlank, makeNet, normalize, RATE, SHAPES, starters } from "../../src/labs/apps/shapes/model";
import { argmax } from "../../src/labs/kit/math";
import { blank, line } from "../../src/labs/kit/raster";

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

/* What each lab's "Try this" promises, checked against its model. */
describe("what Try this promises", () => {
  it("neuron: a bias of −1 says no today; the forecast's weight at 0.9 gets all four days; step and sigmoid agree", () => {
    expect(decide([0.6, 0.5, 1], [1, 0, 0], 0, "sigmoid")).toBe(true);
    expect(decide([0.6, 0.5, 1], [1, 0, 0], -1, "sigmoid")).toBe(false);
    expect(score([1, 0.8, 0], -1, "sigmoid")).toBeLessThan(DAYS.length);
    expect(score([1, 0.9, 0], -1, "sigmoid")).toBe(DAYS.length);
    for (const [w, b] of [[[1, 0, 0], 0], [[1, 0.9, 0], -1], [[-2, 1.5, 0.3], 0.4]] as const)
      for (const d of DAYS) expect(decide(d.x, w, b, "step")).toBe(decide(d.x, w, b, "sigmoid"));
  });

  it("activation: only tanh ever answers below 0", () => {
    for (const f of FNS) expect(Math.min(...curve(f).map(([, y]) => y)) < 0).toBe(f === "tanh");
  });

  it("perceptron: the starting line is wrong, separable presets finish within the lab's passes, XOR never does", () => {
    for (const kind of ["easy", "close"] as const) {
      const pts = points(kind), r = trainAll(pts, P_RATE, MAX_PASSES, P_START);
      expect(mistakes(P_START, pts)).toBeGreaterThan(pts.length / 3); // something to learn: the line has to move
      expect(r.converged).toBe(true);
      expect(r.passes).toBeGreaterThan(1);
    }
    expect(trainAll(points("xor"), P_RATE, MAX_PASSES, P_START).converged).toBe(false);
  });

  it("gradient descent: good settles in under 100 steps, tiny is still off after the lab's steps, too big overshoots back and forth", () => {
    const pts = data(), b = best(pts), done = (l: { m: number; c: number }) => { const g = grad(l, pts); return Math.abs(g.dm) + Math.abs(g.dc) < 2e-4; };
    let l = { m: 0, c: 0 }, n = 0;
    while (!done(l) && n < 100) { l = step(l, pts, RATES.good); n++; }
    expect(n).toBeLessThan(100);
    l = { m: 0, c: 0 };
    for (let i = 0; i < MAX_STEPS; i++) l = step(l, pts, RATES.small);
    expect(done(l)).toBe(false);
    expect(Math.abs(l.c - b.c)).toBeGreaterThan(0.03); // still visibly above the best line at 0 hours
    l = { m: 0, c: 0 };
    const sides: number[] = [], errs: number[] = [];
    for (let i = 0; i < 6; i++) { l = step(l, pts, RATES.big); sides.push(Math.sign(l.m - b.m)); errs.push(loss(l, pts)); }
    expect(sides).toEqual([1, -1, 1, -1, 1, -1]); // jumps across the valley every step
    for (let i = 1; i < errs.length; i++) expect(errs[i]).toBeGreaterThan(errs[i - 1]); // higher each time
    expect(errs[0]).toBeLessThan(5); // not gone in one step: the lab shows several jumps
  });

  it("backprop: one fix raises the answer; a bigger step gets closer to 1 in 100 fixes; h₂'s weights shrink", () => {
    const x: [number, number] = [1, 0.5], { g } = backward(START, x, 1);
    expect(forward(trainNet(START, x, 1, 1, 1), x).y).toBeGreaterThan(forward(START, x).y);
    expect(forward(trainNet(START, x, 1, 3, 100), x).y).toBeGreaterThan(forward(trainNet(START, x, 1, 0.5, 100), x).y);
    for (const k of ["w21", "w22", "b2"] as const) expect(g[k]).toBeGreaterThan(0);
    for (const k of ["w11", "w12", "b1", "v1", "v2", "c"] as const) expect(g[k]).toBeLessThan(0);
  });

  it("overfitting: the verdict follows the errors (the lab's own data)", () => {
    const say = (deg: number, many: boolean, noise = 0.15) => {
      const train = sample(many ? 40 : 10, noise, 21), test = sample(30, noise, 99), f = fit(train, deg);
      return verdict(mse(f, train), mse(f, test), noise, deg, many);
    };
    expect(say(3, false)).toBe("good"); // the lab's start
    expect(say(9, false)).toBe("over");
    expect(say(9, true)).toBe("calm");
    expect(say(1, true)).toBe("under");
    expect(say(2, false)).toBe("under"); // a parabola can't follow the wave either
    expect(say(9, false, 0)).toBe("good"); // without noise there is nothing to memorise
  });

  it("shapes: a square looks like a circle to it, a plus sign like a line (it only knows its three shapes)", () => {
    const net = makeNet(), { X, T } = batch(starters());
    for (let n = 0; n < 600 && net.train(X, T, RATE) >= 0.02; n++);
    // Strokes as a finger draws them on the grid: full ink, and half ink on the four neighbours.
    const stroke = (...segs: [number, number, number, number][]) => {
      const img = blank(12); for (const [a, b, c, d] of segs) line(img, 12, a, b, c, d);
      const out = Float32Array.from(img);
      img.forEach((v, i) => { if (v < 1) return; const r = Math.floor(i / 12), c = i % 12; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 12 && cc >= 0 && cc < 12) out[rr * 12 + cc] = Math.max(out[rr * 12 + cc], 0.5); } });
      return out;
    };
    const square = guess(net, stroke([2, 2, 9, 2], [9, 2, 9, 9], [9, 9, 2, 9], [2, 9, 2, 2])), plus = guess(net, stroke([1.5, 5.5, 9.5, 5.5], [5.5, 1.5, 5.5, 9.5]));
    expect(SHAPES[argmax(square)]).toBe("circle"); expect(Math.max(...square)).toBeGreaterThan(0.8);
    expect(SHAPES[argmax(plus)]).toBe("line");
  });

  it("convolution: “My own” lights the right side of the roof; mirrored, the left side", () => {
    const img = picture();
    const roof = (k: number[]) => {
      const d = display(convolve(img, k));
      let left = 0, right = 0;
      for (let r = 5; r <= 11; r++) for (let c = 0; c < CN; c++) { if (c < 12) left += d[r * CN + c]; else right += d[r * CN + c]; }
      return { left, right };
    };
    const mirror = (k: number[]) => k.map((_, i) => k[Math.floor(i / 3) * 3 + 2 - (i % 3)]);
    const a = roof(CUSTOM), b = roof(mirror(CUSTOM));
    expect(a.right).toBeGreaterThan(1.5 * a.left);
    expect(b.left).toBeGreaterThan(1.5 * b.right);
  });
});
