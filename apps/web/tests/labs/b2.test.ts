import { build, CORPUS as WORDS, nearest } from "../../src/labs/apps/embeddings/model";
import { attend, SENTENCES } from "../../src/labs/apps/attention/model";
import { CORPUS as STORY, END, pick, PROMPTS, think, tokenize, train as trainLm } from "../../src/labs/apps/llm/model";
import { answer, DOCS, index, QUESTIONS, search, stem } from "../../src/labs/apps/rag/model";
import { accuracy as treeAccuracy, auto, DATA, entropy, gain, grow } from "../../src/labs/apps/tree/model";
import { knn, looAccuracy, mangoes } from "../../src/labs/apps/knn/model";
import { assign, houses, move, run, startStops, walk } from "../../src/labs/apps/kmeans/model";
import { episode, greedyPath, newQ, yard } from "../../src/labs/apps/rl/model";
import { best, cases, confusion, cost } from "../../src/labs/apps/threshold/model";
import { breakEven, ev, PAYOFF, SCORES, totals, WEIGHTS, winner } from "../../src/labs/apps/decision/model";
import { errorRate, leaves, missRate, train as trainBias } from "../../src/labs/apps/bias/model";
import { cosine, pca } from "../../src/labs/kit/vectors";
import { matchKey } from "../../src/labs/kit/text";
import { rng } from "../../src/labs/kit/rng";

describe("vectors", () => {
  it("cosine and PCA behave", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1); expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
    const xy = pca([[0, 0], [1, 1], [2, 2], [3, 3]], 1); // all on one line: one direction explains it
    expect(Math.abs(xy[3][0] - xy[0][0])).toBeCloseTo(Math.hypot(3, 3), 4);
  });
});

describe("word map", () => {
  it("puts words used alike next to each other, in both languages", () => {
    const en = build(WORDS.en), ar = build(WORDS.ar);
    expect(nearest(en, "mangoes", 1)[0].key).toBe("bananas");
    expect(nearest(en, "teacher", 3).map((n) => n.key)).toContain("pupil");
    expect(nearest(ar, matchKey("المانجو"), 1)[0].key).toBe(matchKey("الموز"));
    expect(nearest(ar, matchKey("المطر"), 1)[0].key).toBe(matchKey("الرياح"));
  });
});

describe("attention", () => {
  it("“it” attends to the dog when hungry and to the milk when fresh; shares add up to 1", () => {
    for (const lang of ["en", "ar"] as const) {
      const top = (id: string) => { const toks = SENTENCES[id][lang], a = attend(toks, toks.findIndex((x) => x.focus), 3); expect(a.weights.reduce((x, y) => x + y, 0)).toBeCloseTo(1); return toks[a.weights.indexOf(Math.max(...a.weights))].text; };
      expect(top("hungry")).toMatch(lang === "en" ? /dog/ : /الكلب/);
      expect(top("fresh")).toMatch(lang === "en" ? /milk/ : /الحليب/);
      expect(top("light")).toMatch(lang === "en" ? /sack/ : /الكيس/);
    }
  });
});

describe("inside an LLM", () => {
  it("scores only words seen after the context, with probabilities adding up to 1, and writes to the end", () => {
    const lm = trainLm(STORY.en), r = rng(3);
    const ctx = tokenize(lm, "The cat").map((t) => t.key);
    const st = think(lm, ctx);
    expect(st.cands.reduce((x, c) => x + c.p, 0)).toBeCloseTo(1);
    expect(st.cands.map((c) => c.key)).toEqual(expect.arrayContaining(["drinks", "sleeps", "plays"]));
    expect(st.attn.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
    for (const p of PROMPTS.ar) {
      const lmAr = trainLm(STORY.ar), c = tokenize(lmAr, p).map((t) => t.key);
      let w = "";
      for (let i = 0; i < 20 && w !== END; i++) { w = pick(think(lmAr, c).cands, r()); if (w !== END) c.push(w); }
      expect(w).toBe(END);
    }
    expect(think(lm, ctx, 0.05).cands[0].p).toBeGreaterThan(0.95); // cold: nearly always the top word
  });
});

describe("answers with sources", () => {
  it("finds the right document, quotes it, and declines what it doesn't know", () => {
    const ids = ["exams", "library", "bus", "lunch", "phones"];
    for (const lang of ["en", "ar"] as const) {
      const ix = index(DOCS[lang]);
      QUESTIONS[lang].slice(0, 5).forEach((q, i) => { expect(search(ix, q)[0].doc.id).toBe(ids[i]); expect(answer(ix, q)?.doc.id).toBe(ids[i]); });
      expect(answer(ix, QUESTIONS[lang][5])).toBeNull();
    }
    expect(stem("الامتحانات")).toBe(stem("امتحانات"));
    const edited = index(DOCS.en.map((d) => (d.id === "exams" ? { ...d, text: "Mid-year exams start on Monday 20 January." } : d)));
    expect(answer(edited, "When do the exams start?")?.quote).toMatch(/Monday 20 January/);
  });
});

describe("decision tree", () => {
  it("ID3 asks about the sky first and fits all 14 days", () => {
    expect(entropy(DATA)).toBeCloseTo(0.940, 3);
    expect(gain(DATA, "sky")).toBeCloseTo(0.247, 3);
    const root = grow(auto());
    expect(root.kind === "split" && root.attr).toBe("sky");
    expect(treeAccuracy(root)).toBe(1);
  });
});

describe("nearest neighbours", () => {
  it("k = 1 judges a training example by itself; a messy set favours a bigger k", () => {
    const pts = mangoes();
    expect(knn(pts, pts[0], 1).ripe).toBe(pts[0].ripe);
    expect(looAccuracy(pts, 5)).toBeGreaterThan(0.8);
    const messy = mangoes(true);
    expect(looAccuracy(messy, 7)).toBeGreaterThanOrEqual(looAccuracy(messy, 1));
  });
});

describe("k-means", () => {
  it("never makes the average walk longer, and settles", () => {
    const pts = houses();
    let stops = startStops(pts, 4, 3), a = assign(pts, stops), w = walk(pts, stops, a);
    for (let i = 0; i < 20; i++) { stops = move(pts, stops, a); a = assign(pts, stops); const nw = walk(pts, stops, a); expect(nw).toBeLessThanOrEqual(w + 1e-9); w = nw; }
    expect(run(pts, startStops(pts, 4, 3)).rounds).toBeLessThan(100);
  });
});

describe("learn by reward", () => {
  it("learns the shortest way to the charger", () => {
    const g = yard(), q = newQ(), r = rng(5);
    for (let e = 0; e < 300; e++) episode(g, q, r);
    const p = greedyPath(g, q);
    expect(p.reached).toBe(true);
    expect(p.path.length - 1).toBe(10);
  });
});

describe("thresholds", () => {
  it("trades misses for false alarms, and the best threshold depends on the job", () => {
    const cs = cases("smoke"), lo = confusion(cs, 0), hi = confusion(cs, 1);
    expect(lo.miss).toBe(0); expect(hi.falseAlarm).toBe(0);
    expect(lo.hit + lo.miss + lo.falseAlarm + lo.quiet).toBe(60);
    expect(best("smoke", cs)).toBeLessThan(best("spam", cases("spam")));
    expect(cost("smoke", confusion(cs, best("smoke", cs)))).toBeLessThanOrEqual(cost("smoke", confusion(cs, 0.5)));
  });
});

describe("decide with numbers", () => {
  it("weights change the winner; expected value flips at the break-even chance", () => {
    expect(winner(totals(SCORES, WEIGHTS))).toBe("museum");
    expect(winner(totals(SCORES, { cost: 5, learning: 0, travel: 0, safety: 0 }))).toBe("farm");
    expect(winner(totals(SCORES, { cost: 0, learning: 5, travel: 0, safety: 0 }))).toBe("science");
    expect(breakEven(PAYOFF)).toBeCloseTo(0.5);
    expect(ev(0.2, PAYOFF).outside).toBeGreaterThan(ev(0.2, PAYOFF).hall);
    expect(ev(0.8, PAYOFF).outside).toBeLessThan(ev(0.8, PAYOFF).hall);
  });
});

describe("bias in data", () => {
  it("few region-B photos: big errors in B hidden by a good overall score; balanced data closes the gap", () => {
    const testA = leaves(300, 0, 901), testB = leaves(300, 1, 902);
    const skewed = trainBias(leaves(200, 0.05, 77)), fair = trainBias(leaves(200, 0.5, 77));
    expect(errorRate(skewed, leaves(400, 0.05, 903))).toBeLessThan(0.06);
    expect(missRate(skewed, testB)).toBeGreaterThan(0.25);
    expect(missRate(fair, testB)).toBeLessThan(0.1);
    expect(Math.abs(errorRate(fair, testA) - errorRate(fair, testB))).toBeLessThan(0.05);
  });
});
