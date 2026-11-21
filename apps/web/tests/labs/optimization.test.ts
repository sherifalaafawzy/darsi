// @vitest-environment node
import * as lp from "../../src/labs/apps/lp/model";
import { simplex } from "../../src/labs/apps/diet/simplex";
import * as diet from "../../src/labs/apps/diet/model";
import * as ks from "../../src/labs/apps/knapsack/model";
import * as asg from "../../src/labs/apps/assign/model";
import * as tt from "../../src/labs/apps/timetable/model";
import * as sd from "../../src/labs/apps/sudoku/model";
import * as rt from "../../src/labs/apps/routes/model";
import * as sp from "../../src/labs/apps/shortest/model";
import * as col from "../../src/labs/apps/colouring/model";
import * as an from "../../src/labs/apps/anneal/model";
import { EXAMPLES } from "../../src/labs/apps/modeller/model";
import { rng } from "../../src/labs/kit/rng";
import { runInNode } from "../code/node";

describe("a linear program, drawn", () => {
  it("shades the region with every limit as an edge, and finds the best corner", () => {
    const corners = lp.region(lp.LIMITS).map(([x, y]) => [lp.r1(x), lp.r1(y)]);
    for (const c of [[0, 0], [7, 0], [6, 2], [3, 5], [0, 6]]) expect(corners).toContainEqual(c);
    expect(corners).toHaveLength(5);
    const b = lp.best(lp.LIMITS, lp.PRICES.x, lp.PRICES.y);
    expect(b.at).toEqual([3, 5]); expect(b.value).toBe(290);
    expect(lp.tight(b.at, lp.LIMITS).sort()).toEqual(["hours", "land"]);
    expect(lp.best(lp.LIMITS, 50, 40).at).toEqual([6, 2]);
    expect(lp.best(lp.LIMITS, 60, 10).at).toEqual([7, 0]);
  });

  it("no plan on a fine grid beats the best corner, and the profit line is clipped to the box", () => {
    for (const [px, py] of [[30, 40], [50, 40], [10, 60], [45, 45]]) {
      const b = lp.best(lp.LIMITS, px, py);
      for (let x = 0; x <= 10; x += 0.1) for (let y = 0; y <= 10; y += 0.1) if (lp.fits([x, y], lp.LIMITS)) expect(lp.profit([x, y], px, py)).toBeLessThanOrEqual(b.value + 1e-6);
    }
    const line = lp.profitLine(30, 40, 290);
    expect(line).toHaveLength(2);
    for (const p of line) expect(30 * p[0] + 40 * p[1]).toBeCloseTo(290);
    expect(lp.profitLine(30, 40, 2000)).toEqual([]);
    expect(lp.region([...lp.LIMITS, { id: "land", a: -1, b: 0, max: -9 }])).toEqual([]); // x ≥ 9 and x + y ≤ 8: nothing fits
  });
});

describe("the simplex method", () => {
  it("solves Google's OR-Tools LP example (34 at x = 6, y = 4) and the first LP (4)", () => {
    // maximise 3x + 4y: x + 2y ≤ 14, 3x − y ≥ 0, x − y ≤ 2
    const a = simplex([-3, -4], [{ a: [1, 2], op: "<=", b: 14 }, { a: [3, -1], op: ">=", b: 0 }, { a: [1, -1], op: "<=", b: 2 }]);
    expect(a.status).toBe("optimal"); expect(-a.value).toBeCloseTo(34); expect(a.x[0]).toBeCloseTo(6); expect(a.x[1]).toBeCloseTo(4);
    // maximise 3x + y: 0 ≤ x ≤ 1, 0 ≤ y ≤ 2, x + y ≤ 2
    const b = simplex([-3, -1], [{ a: [1, 0], op: "<=", b: 1 }, { a: [0, 1], op: "<=", b: 2 }, { a: [1, 1], op: "<=", b: 2 }]);
    expect(-b.value).toBeCloseTo(4);
  });

  it("says when nothing fits or the cost has no bottom, and walks downhill corner by corner", () => {
    expect(simplex([1, 1], [{ a: [1, 1], op: "<=", b: 2 }, { a: [1, 1], op: ">=", b: 3 }]).status).toBe("infeasible");
    expect(simplex([-1, 0], [{ a: [0, 1], op: "<=", b: 2 }]).status).toBe("unbounded");
    const r = simplex([2, 3], [{ a: [1, 1], op: ">=", b: 4 }, { a: [1, 3], op: ">=", b: 6 }, { a: [1, 0], op: "=", b: 1 }]);
    expect(r.value).toBeCloseTo(2 + 3 * 3); // x = 1 forces y ≥ 3
    for (let i = 1; i < r.path.length; i++) expect(r.path[i].value).toBeLessThanOrEqual(r.path[i - 1].value + 1e-9);
  });
});

describe("school lunch at the least cost", () => {
  it("meets every need, and no half-portion lunch is cheaper", () => {
    for (const cap of [2, 3]) {
      const { lp: res, mix, tight } = diet.cheapest(cap);
      expect(res.status).toBe("optimal");
      expect(diet.meets(mix)).toBe(true);
      for (const f of diet.FOODS) expect(mix[f]).toBeLessThanOrEqual(cap + 1e-9);
      expect(tight.length).toBeGreaterThan(0);
      let best = Infinity;
      const steps = Array.from({ length: cap * 2 + 1 }, (_, i) => i / 2), m = { ...diet.EMPTY };
      const go = (k: number) => {
        if (k === diet.FOODS.length) { if (diet.meets(m)) best = Math.min(best, diet.cost(m)); return; }
        for (const v of steps) { m[diet.FOODS[k]] = v; go(k + 1); }
      };
      go(0);
      expect(res.value).toBeLessThanOrEqual(best + 1e-9);
      expect(res.value).toBeCloseTo(diet.cost(mix));
    }
  });

  it("the usual plate is short of iron and costs more than the cheapest", () => {
    expect(diet.short(diet.COMMON)).toEqual(["iron"]);
    expect(diet.cost(diet.COMMON)).toBeGreaterThan(diet.cheapest(3).lp.value);
    expect(diet.cheapest(3, new Set(["rice", "milk"])).lp.status).toBe("infeasible"); // no iron to be had
  });
});

describe("packing the truck", () => {
  const brute = (cap: number) => {
    let best = 0;
    for (let m = 0; m < 1 << ks.ITEMS.length; m++) {
      const pick = new Set(ks.ITEMS.filter((_, i) => m & (1 << i)).map((it) => it.id));
      if (ks.weight(ks.ITEMS, pick) <= cap) best = Math.max(best, ks.value(ks.ITEMS, pick));
    }
    return best;
  };
  it("dynamic programming finds the best load for every truck size", () => {
    for (let c = 0; c <= ks.MAX_CAPACITY; c++) {
      const b = ks.best(ks.ITEMS, c);
      expect(b.value, `room ${c}`).toBe(brute(c));
      expect(ks.weight(ks.ITEMS, b.pick)).toBeLessThanOrEqual(c);
      expect(ks.value(ks.ITEMS, b.pick)).toBe(b.value);
    }
  });
  it("greedy by value per kilo is wrong at 1,000 kg", () => {
    const g = ks.greedy(ks.ITEMS, ks.CAPACITY);
    expect(g.order[0]).toBe("solar");
    expect(ks.value(ks.ITEMS, g.pick)).toBe(60);
    expect(ks.best(ks.ITEMS, ks.CAPACITY).value).toBe(65);
    expect([...ks.best(ks.ITEMS, ks.CAPACITY).pick].sort()).toEqual(["books", "desks"]);
    expect(ks.greedyMisses(ks.ITEMS)).toContain(10);
    expect(ks.greedyMisses(ks.ITEMS).length).toBeLessThan(ks.MAX_CAPACITY / 2); // usually right, not always
  });
});

describe("teachers to classes", () => {
  it("first come, first served loses 10 points to the Hungarian method", () => {
    expect(asg.total(asg.SCORES, asg.firstCome(asg.SCORES))).toBe(29);
    const steps = asg.hungarian(asg.SCORES), done = steps[steps.length - 1];
    expect(done.kind).toBe("done");
    expect(asg.total(asg.SCORES, done.pairs)).toBe(39);
    expect(asg.bruteBest(asg.SCORES)).toBe(39);
    expect(steps.map((s) => s.kind)).toContain("cover");
  });
  it("matches trying every way on random tables", () => {
    const r = rng(5);
    for (let t = 0; t < 60; t++) {
      const n = 2 + r.int(5), scores = Array.from({ length: n }, () => Array.from({ length: n }, () => r.int(10)));
      const pairs = asg.hungarian(scores).at(-1)!.pairs;
      expect(new Set(pairs).size).toBe(n);
      expect(asg.total(scores, pairs)).toBe(asg.bruteBest(scores));
      for (const s of asg.hungarian(scores)) if (s.kind === "cover") expect(s.n).toBeLessThan(n);
    }
  });
});

describe("a school timetable", () => {
  it("propagation and search find a valid timetable, with dead ends on the way", () => {
    const rules = tt.rulesOf(tt.DEFAULT_RULES), t = tt.solve(tt.LESSONS, rules);
    expect(t.solution).not.toBeNull();
    expect(tt.valid(tt.LESSONS, rules, t.solution!)).toBe(true);
    expect(t.guesses).toBe(8); expect(t.undos).toBe(3);
    const plain = tt.solve(tt.LESSONS, rules, false);
    expect(tt.valid(tt.LESSONS, rules, plain.solution!)).toBe(true);
    expect(plain.guesses).toBeGreaterThan(10 * t.guesses);
    expect(t.steps.some((s) => s.kind === "prune")).toBe(true);
  });
  it("more rules can make it easier, or impossible", () => {
    const art = tt.solve(tt.LESSONS, tt.rulesOf([...tt.DEFAULT_RULES, "art"]));
    expect(tt.valid(tt.LESSONS, tt.rulesOf([...tt.DEFAULT_RULES, "art"]), art.solution!)).toBe(true);
    expect(art.guesses).toBeLessThan(8);
    const lab = tt.solve(tt.LESSONS, tt.rulesOf([...tt.DEFAULT_RULES, "lab"]));
    expect(lab.solution).toBeNull(); expect(lab.capped).toBe(false);
    expect(lab.steps.at(-1)!.kind).toBe("none");
    expect(tt.solve(tt.LESSONS, tt.rulesOf([...tt.DEFAULT_RULES, "lab"]), false).solution).toBeNull();
  });
  it("every domain only shrinks between a guess and its undo", () => {
    const t = tt.solve(tt.LESSONS, tt.rulesOf(tt.DEFAULT_RULES));
    for (let i = 1; i < t.steps.length; i++) {
      const a = t.steps[i - 1], b = t.steps[i];
      if (b.kind === "prune" || b.kind === "dead") b.d.forEach((x, j) => expect(x & ~a.d[j]).toBe(0));
    }
  });
});

describe("sudoku", () => {
  const ok = (n: number, v: number[]) => sd.units(n).every((u) => new Set(u.map((i) => v[i])).size === n) && v.every((x) => x >= 1 && x <= n);
  it("every puzzle has one answer, and propagation with search finds it", () => {
    for (const p of sd.PUZZLES) {
      const g = sd.parse(p);
      expect(g).toHaveLength(p.n * p.n);
      expect(sd.solutions(p.n, g), p.id).toBe(1);
      const r = sd.smart(p.n, g), last = r.frames.at(-1)!;
      expect(r.solved, p.id).toBe(true);
      expect(ok(p.n, last.v)).toBe(true);
      g.forEach((x, i) => { if (x) expect(last.v[i]).toBe(x); });
    }
  });
  it("counts guesses: none for propagation on easy puzzles, many for plain backtracking", () => {
    const by = (id: string) => sd.parse(sd.PUZZLES.find((p) => p.id === id)!);
    expect(sd.smart(9, by("easy")).guesses).toBe(0);
    expect(sd.plain(9, by("easy")).guesses).toBe(4208);
    const hard = sd.smart(9, by("hard"), false);
    expect(hard.frames.at(-1)!.kind).toBe("stuck");
    expect(sd.smart(9, by("hard")).guesses).toBe(4);
    const trap = sd.plain(9, by("trap"));
    expect(trap.capped).toBe(true); expect(trap.solved).toBe(false);
    expect(trap.guesses).toBe(100_000); // gives up after exactly the 100,000 guesses Try this and opt-s4-3 quote
    expect(sd.smart(9, by("trap")).guesses).toBe(0);
    const small = sd.plain(4, by("small"));
    expect(small.solved).toBe(true); expect(ok(4, small.grid)).toBe(true);
  });
  it("candidates only shrink while propagating", () => {
    const r = sd.smart(9, sd.parse(sd.PUZZLES[2]));
    for (let i = 1; i < r.frames.length; i++) {
      const a = r.frames[i - 1], b = r.frames[i];
      if (b.kind === "remove" || b.kind === "single" || b.kind === "hidden") b.c.forEach((m, j) => expect(m & ~a.c[j]).toBe(0));
    }
  });
});

describe("the school bus route", () => {
  const brute = (vs: rt.V[]) => {
    let best = Infinity;
    const rest = vs.map((_, i) => i).slice(1), perm = (a: number[], k: number) => {
      if (k === a.length) { best = Math.min(best, rt.length(vs, [0, ...a])); return; }
      for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; }
    };
    perm(rest, 0);
    return best;
  };
  it("Held–Karp finds the shortest route (checked by trying every order)", () => {
    for (let s = 1; s <= 8; s++) {
      const vs = rt.randomVillages(s, 6), b = rt.bestRoute(vs);
      expect(b.length).toBeCloseTo(brute(vs), 9);
      expect(rt.length(vs, b.route)).toBeCloseTo(b.length, 9);
      expect(new Set(b.route).size).toBe(vs.length);
    }
  });
  it("nearest neighbour, then 2-opt: 34.6 km down to the best, 28.6 km", () => {
    const nn = rt.nearest(rt.VILLAGES), route = nn.at(-1)!;
    expect(new Set(route).size).toBe(rt.VILLAGES.length);
    expect(rt.length(rt.VILLAGES, route)).toBeCloseTo(34.6, 1);
    const swaps = rt.twoOpt(rt.VILLAGES, route);
    expect(swaps).toHaveLength(3);
    for (let i = 1; i < swaps.length; i++) expect(swaps[i].length).toBeLessThan(swaps[i - 1].length);
    expect(swaps.at(-1)!.length).toBeCloseTo(rt.bestRoute(rt.VILLAGES).length, 9);
    expect(rt.bestRoute(rt.VILLAGES).length).toBeCloseTo(28.6, 1);
    // On other maps 2-opt can stop short of the best.
    const misses = [1, 2, 3, 4, 5, 6, 7, 8].filter((s) => { const vs = rt.randomVillages(s); const sw = rt.twoOpt(vs, rt.nearest(vs).at(-1)!); return (sw.at(-1)?.length ?? Infinity) > rt.bestRoute(vs).length + 1e-9; });
    expect(misses.length).toBeGreaterThan(0);
  });
});

describe("the shortest way to school", () => {
  const floyd = (closed: Set<number>) => {
    const n = sp.VILLAGES.length, d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
    sp.ROADS.forEach((r, k) => { if (!closed.has(k)) { d[r.a][r.b] = Math.min(d[r.a][r.b], r.km); d[r.b][r.a] = d[r.a][r.b]; } });
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j]);
    return d[sp.HOME];
  };
  it("13 km by Tala, Kesi and Mina; 14 km by Rubi and Sana when the bridge floods", () => {
    const s = sp.run().at(-1)!;
    expect(s.dist[sp.SCHOOL]).toBe(13);
    expect(sp.routeTo(s, sp.SCHOOL).map((i) => sp.VILLAGES[i].id)).toEqual(["home", "tala", "kesi", "mina", "school"]);
    expect(sp.roadOf(3, 4)).toBe(sp.BRIDGE);
    const f = sp.run(new Set([sp.BRIDGE])).at(-1)!;
    expect(f.dist[sp.SCHOOL]).toBe(14);
    expect(sp.routeTo(f, sp.SCHOOL).map((i) => sp.VILLAGES[i].id)).toEqual(["home", "rubi", "sana", "school"]);
  });
  it("settled numbers never change and match every-pair shortest paths, whatever roads close", () => {
    const r = rng(9);
    for (let t = 0; t < 40; t++) {
      const closed = new Set(sp.ROADS.map((_, k) => k).filter(() => r() < 0.25));
      const states = sp.run(closed, sp.ROADS, sp.VILLAGES.length, null);
      const last = states.at(-1)!, want = floyd(closed);
      last.dist.forEach((d, i) => expect(d).toBe(want[i]));
      for (let i = 1; i < states.length; i++) states[i - 1].done.forEach((was, v) => { if (was) expect(states[i].dist[v]).toBe(states[i - 1].dist[v]); });
    }
  });
  it("lets a learner settle any of the smallest, and only those", () => {
    let s = sp.start(sp.VILLAGES.length);
    expect(sp.smallest(s)).toEqual([sp.HOME]);
    s = sp.settle(s, sp.HOME).state;
    expect(sp.waiting(s).map((i) => sp.VILLAGES[i].id).sort()).toEqual(["bora", "rubi", "tala"]);
    expect(sp.smallest(s).map((i) => sp.VILLAGES[i].id)).toEqual(["tala"]);
  });
});

describe("exam slots as colouring", () => {
  const es = col.edges(col.PUPILS);
  it("greedy in list order uses 4 slots, DSatur 3, and 3 is the fewest", () => {
    const g = col.greedy(es).at(-1)!.slots, d = col.dsatur(es).at(-1)!.slots, f = col.fewest(es);
    for (const s of [g, d, f.slots]) expect(col.clashes(es, s)).toEqual([]);
    expect(col.used(g)).toBe(4); expect(col.used(d)).toBe(3); expect(f.k).toBe(3);
    expect(col.biggestClique(es).map((i) => col.EXAMS[i])).toEqual(["maths", "arabic", "french"]);
  });
  it("finds the fewest slots on random clash maps (never fewer than a clique, never more than greedy)", () => {
    const r = rng(3);
    for (let t = 0; t < 40; t++) {
      const pupils = Array.from({ length: 6 }, () => ({ exams: [...new Set([r.int(8), r.int(8), r.int(8)])] }));
      const e = col.edges(pupils), f = col.fewest(e);
      expect(col.clashes(e, f.slots)).toEqual([]);
      expect(f.k).toBeGreaterThanOrEqual(Math.max(1, col.biggestClique(e).length));
      expect(f.k).toBeLessThanOrEqual(col.used(col.dsatur(e).at(-1)!.slots));
      // No proper colouring with k − 1 slots exists: try them all.
      if (f.k > 1) {
        const k = f.k - 1, slots = new Array(8).fill(0);
        const any = (v: number): boolean => v === 8 || Array.from({ length: k }, (_, s) => s + 1).some((s) => { slots[v] = s; const good = e.every(([a, b]) => a >= v + 1 || b >= v + 1 || slots[a] !== slots[b]) && any(v + 1); slots[v] = 0; return good; });
        expect(any(0)).toBe(false);
      }
    }
  });
});

describe("the seating plan", () => {
  it("costs pairs by steps and chatty neighbours by a penalty", () => {
    const plan = Array.from({ length: an.SEATS }, (_, i) => i);
    const at = an.seatsOf(plan);
    const want = an.PAIRS.reduce((s, [a, b, w]) => s + w * an.steps(at[a], at[b]), 0) + an.CHATTY.filter(([a, b]) => an.sideBySide(at[a], at[b])).length * an.PENALTY;
    expect(an.cost(plan)).toBe(want);
    expect(an.steps(0, 11)).toBe(5);
    expect(an.sideBySide(3, 4)).toBe(false); // the end of one row and the start of the next
  });
  it("hill climbing gets stuck; annealing finds the best plan far more often", () => {
    let hill = 0, anneal = 0;
    for (let s = 1; s <= 20; s++) {
      const h = an.solve(an.shuffled(s), s + 100, { t0: 0, iters: an.ITERS });
      expect(an.stuck(h.plan)).toBe(true);
      expect(h.worse).toBe(0);
      expect(h.cost).toBeGreaterThanOrEqual(an.BEST);
      const a = an.solve(an.shuffled(s), s + 100, { t0: 3, iters: an.ITERS });
      expect(a.worse).toBeGreaterThan(0);
      if (h.cost === an.BEST) hill++;
      if (a.cost === an.BEST) anneal++;
    }
    expect(anneal).toBeGreaterThanOrEqual(2 * hill);
    expect(an.temperature({ t0: 3, iters: 100 }, 100)).toBeCloseTo(0.03);
  });
});

describe("the CP-SAT modeller's programs (in the phone's MicroPython)", () => {
  const run = async (code: string) => { const [r] = await runInNode({ lang: "python", code }); expect(r.error).toBeUndefined(); return r.out.trim().split("\n"); };
  it("finds a timetable that keeps every rule", async () => {
    const out = await run(EXAMPLES.timetable);
    expect(out[0]).toBe("OPTIMAL");
    const rows = out.slice(1).map((l) => l.split(" : ")[1].split(", "));
    expect(rows).toHaveLength(3);
    for (const r of rows) expect([...r].sort()).toEqual(["art", "english", "maths", "science"]);
    for (let p = 0; p < 4; p++) expect(new Set(rows.map((r) => r[p])).size).toBe(3); // no teacher twice in a period
    for (const r of rows) expect(r.indexOf("science")).toBeLessThan(3);
    expect(rows[2][0]).toBe("maths");
    // Science only in periods 2 and 3, for three classes: impossible.
    const impossible = await run(EXAMPLES.timetable.replace("# 6A's maths test", "for c in classes:\n    model.add(period[c, \"science\"] >= 2)\n# 6A's maths test"));
    expect(impossible[0]).toBe("INFEASIBLE");
  });
  it("needs 3 exam slots, as the colouring lab says", async () => {
    const out = await run(EXAMPLES.exams);
    expect(out.slice(0, 2)).toEqual(["OPTIMAL", "slots used: 3"]);
    const slots = col.EXAMS.map((e) => Number(out.find((l) => l.startsWith(`${e} in slot`))!.split(" ").pop()));
    expect(col.clashes(col.edges(col.PUPILS), slots)).toEqual([]);
    expect((await run(EXAMPLES.exams.replace("model.minimize(last)", "model.minimize(last)\nmodel.add(last <= 2)")))[0]).toBe("INFEASIBLE");
  });
  it("packs the truck like dynamic programming: desks and books, 65 points", async () => {
    expect(await run(EXAMPLES.truck)).toEqual(["OPTIMAL", "points: 65", "take the desks - 500 kg", "take the books - 500 kg"]);
    expect((await run(EXAMPLES.truck.replace("capacity = 1000", "capacity = 1100")))[1]).toBe(`points: ${ks.best(ks.ITEMS, 11).value}`);
  });
});
